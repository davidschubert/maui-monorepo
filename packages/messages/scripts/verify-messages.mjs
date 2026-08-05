#!/usr/bin/env node
/**
 * BEWEIS: private Nachrichten (Stufe 1) — gegen eine ECHTE Appwrite.
 *
 * ── WAS DIESER LAUF PRÜFT, DAS EIN UNIT-TEST NICHT KANN ───────────────────
 * Die Regeln sind pur und in `tests/*.test.ts` festgenagelt. Hier geht es um
 * die Zusagen, die an der DATENBANK hängen — und um die EINE Zusage dieses
 * Konzepts, die man nicht durch Lesen des Codes belegen kann:
 *
 *  1. Die fünf Tabellen, ihre Spalten und ihre Indizes stehen (messages-001).
 *  2. Die Row-Permissions einer Konversation und einer Nachricht nennen GENAU
 *     die zwei Beteiligten — kein Mitglieder-Read, KEIN Moderations-Label.
 *     Das ist die Permission-Seite von Konzept § 2.2.
 *  3. Der eindeutige Schlüssel hält: dasselbe Paar bekommt in EINER Community
 *     genau eine Konversation, in einer ZWEITEN aber eine eigene.
 *  4. Die Sperr-Abfrage findet beide Richtungen in EINER Abfrage — und die
 *     `everywhere`-Zeile wirkt über die Community-Grenze hinweg (Davids
 *     Entscheidung 3). Genau diese Abfrage läuft bewusst ohne Mandanten-
 *     Filter; hier wird gezeigt, dass sie trotzdem nur über DIESES Paar
 *     Auskunft gibt.
 *  5. DIE ZENTRALE ZUSAGE: eine ungemeldete Nachricht gibt keinen Text her.
 *     `reportedAt` leer ⇒ die Moderations-Sicht ist leer, und die Liste der
 *     gemeldeten Nachrichten enthält sie nicht. Erst das Einfrieren macht den
 *     Beleg sichtbar — und ein zweites Einfrieren überschreibt ihn NICHT.
 *  6. Der Verlauf einer Konversation UND der Posteingang sind über ihre
 *     Indizes abfragbar — beim Posteingang ist das der ganze Grund, warum die
 *     Teilnehmer eine eigene Tabelle haben (Appwrite indiziert keine
 *     Array-Spalten).
 *
 * ── TEIL B: DIE ROUTEN, gegen einen LAUFENDEN Server ─────────────────────
 * Was oben an der Datenbank geprüft wird, sagt noch nichts über die Tür davor.
 * Mit `MESSAGES_PORT` läuft deshalb ein zweiter Teil, der den ECHTEN
 * Kundenpfad geht — zwei angemeldete Konten, echte Cookies, echte Routen:
 *
 *  8. Der OWNER-SCHALTER: wer ihn nicht hat, bekommt 403; ohne ihn ist der
 *     Posteingang zu (`messages_disabled`).
 *  9. TL0 WIRD ABGEWIESEN: ein Konto ohne Vertrauensstufe und ohne Rolle kann
 *     KEINE Konversation eröffnen — und erfährt den Grund NICHT
 *     (`recipient_unavailable`, derselbe Code wie bei einer Sperre).
 * 10. ANTWORTEN GEHT TROTZDEM: wer angeschrieben wurde, darf zurückschreiben
 *     (Konzept § 2.4, Folge 1) — sonst wäre der Kanal eine Einbahnstraße.
 * 11. DIE SPERRE VERHINDERT DAS SENDEN, beidseitig, und ihr Aufheben stellt es
 *     wieder her.
 * 12. DIE MELDUNG friert den Beleg ein, die Moderations-Route liefert IHN —
 *     und für eine UNGEMELDETE Nachricht 404 `not_reported`. Das ist die eine
 *     Zusage dieses Konzepts, die man nur live belegen kann.
 *
 * Aufruf (Env wie beim Migrations-Runner):
 *   node --env-file=apps/comments/.env packages/messages/scripts/verify-messages.mjs
 *   MESSAGES_PORT=3021 node --env-file=apps/comments/.env \
 *     packages/messages/scripts/verify-messages.mjs
 */
import { request } from 'node:http'
import { Client, ID, Permission, Query, Role, TablesDB, Users } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Env-Vars — mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

/** Teil B läuft nur mit laufendem Server (Port aus der Env). */
const PORT = Number(process.env.MESSAGES_PORT || 0)
const HOST = process.env.MESSAGES_HOST || 'localhost'

const CONVERSATIONS = 'conversations'
const MEMBERS = 'conversation_members'
const MESSAGES = 'messages'
const BLOCKS = 'message_blocks'
const SETTINGS = 'message_settings'

const RUN = Date.now()
const HERE = `vm-hier-${RUN}`
const ELSEWHERE = `vm-anders-${RUN}`
const ANNA = `vm-anna-${RUN}`
const BODO = `vm-bodo-${RUN}`
const CLARA = `vm-clara-${RUN}`

let passed = 0
let failed = 0
function check(label, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✔ ${label}`)
  }
  else {
    failed++
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Aufräum-Liste: der Beweis läuft gegen eine echte Instanz. */
const created = []
async function makeRow(tableId, data, permissions = []) {
  const row = await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data, permissions })
  created.push({ tableId, rowId: row.$id })
  return row
}

/** Die Permissions, die `conversationPermissions()` erzeugt. */
const pairPermissions = (a, b) => [Permission.read(Role.user(a)), Permission.read(Role.user(b))]

/** Der Schlüssel aus `conversationPairKey()` — sortiert, doppelpunktgetrennt. */
const pairKey = (...ids) => [...new Set(ids)].sort().join(':')


/** Nutzer, die dieser Lauf anlegt (Teil B) — werden am Ende gelöscht. */
const createdUsers = []

/**
 * node:http statt fetch — dieselbe Begründung wie in den übrigen
 * Beweis-Skripten: `fetch` verwirft einen eigenen Host-Header, und Nitro hört
 * im Dev-Betrieb auf localhost. Cookies reisen als roher Header.
 */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body)
    const req = request({
      host: HOST,
      port: PORT,
      path,
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* kein JSON — der Status trägt die Aussage */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Der fachliche Ablehnungsgrund aus dem Envelope (core/server/error.ts). */
const reasonOf = res => res.json?.reason ?? null

async function createAccount(tag, labels = []) {
  const email = `pn-${tag}-${RUN}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await users.create({ userId: ID.unique(), email, password, name: `PN ${tag}` })
  createdUsers.push(user.$id)
  if (labels.length) await users.updateLabels({ userId: user.$id, labels })
  const res = await call('/api/auth/login', { method: 'POST', body: { email, password } })
  if (res.status !== 200) throw new Error(`Login ${tag} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const cookie = (res.setCookie.find(c => c.startsWith('a_session_')) ?? '').split(';')[0]
  if (!cookie) throw new Error(`Kein Session-Cookie für ${tag}`)
  // Der Handle entsteht beim ersten Hinsehen (core/server/api/handles/me.get.ts)
  // — er ist die Adresse, unter der man hier angeschrieben wird.
  const handle = await call('/api/handles/me', { cookie })
  return { userId: user.$id, cookie, handle: handle.json?.handle ?? '' }
}

console.log(`\nBeweis private Nachrichten gegen ${endpoint} / ${projectId} / ${databaseId}\n`)

try {
  // ── 1. Schema ───────────────────────────────────────────────────────────
  console.log('1. Die fünf Tabellen aus messages-001')
  const schema = {}
  for (const tableId of [CONVERSATIONS, MEMBERS, MESSAGES, BLOCKS, SETTINGS]) {
    const table = await tablesDB.getTable({ databaseId, tableId }).catch(() => null)
    check(`Table ${tableId} existiert`, Boolean(table))
    if (!table) continue
    // Keine Table-Permissions: es gibt kein Publikum auf Tabellen-Ebene.
    check(`… ohne Table-Permissions (rowSecurity)`, (table.$permissions ?? []).length === 0 && table.rowSecurity === true,
      `${(table.$permissions ?? []).length} Permission(s) / rowSecurity=${table.rowSecurity}`)
    const { columns } = await tablesDB.listColumns({ databaseId, tableId })
    const { indexes } = await tablesDB.listIndexes({ databaseId, tableId })
    schema[tableId] = {
      columns: new Map(columns.map(c => [c.key, c])),
      indexes: new Map(indexes.map(i => [i.key, i])),
    }
    check(`… alle Spalten verfügbar`, columns.every(c => c.status === 'available'),
      columns.filter(c => c.status !== 'available').map(c => `${c.key}=${c.status}`).join(', '))
  }

  console.log('\n   Spalten und Indizes')
  const conv = schema[CONVERSATIONS]
  check('conversations.participants ist eine LISTE (Quelle der Row-Permissions)',
    conv?.columns.get('participants')?.array === true)
  check('conversations: Unique-Index (communityId, pairKey)',
    conv?.indexes.get('uq_community_pair')?.type === 'unique')
  check('conversations: Index für das dritte Rate-Budget',
    Boolean(conv?.indexes.get('idx_community_starter')))
  // Die Array-Spalte trägt bewusst KEINEN Index — Appwrite 1.9.6 kann das
  // nicht („Creating indexes on array attributes is not currently
  // supported"), und genau deshalb gibt es `conversation_members`.
  check('conversations: KEIN Index auf der Array-Spalte (Appwrite kann das nicht)',
    ![...(conv?.indexes.values() ?? [])].some(i => (i.attributes ?? i.columns ?? []).includes('participants')))

  const mem = schema[MEMBERS]
  check('conversation_members.unread ist ein SKALAR (atomar hochzählbar)',
    mem?.columns.get('unread')?.type === 'integer' && mem?.columns.get('unread')?.array !== true)
  check('… mit Untergrenze 0 als Netz unter dem Schreibweg', mem?.columns.get('unread')?.min === 0)
  check('conversation_members.readRounds ist ein Skalar (Zählmarke der Meldung)',
    mem?.columns.get('readRounds')?.type === 'integer' && mem?.columns.get('readRounds')?.array !== true)
  check('conversation_members.closed ist ein Schalter je Mensch',
    mem?.columns.get('closed')?.type === 'boolean')
  check('conversation_members.lastMessageAt spiegelt die Konversation (Sortierung)',
    Boolean(mem?.columns.get('lastMessageAt')))
  check('conversation_members: EINE Zeile je (Community, Konversation, Mensch)',
    mem?.indexes.get('uq_conversation_user')?.type === 'unique')
  check('conversation_members: der Posteingangs-Index (Filter UND Sortierung)',
    Boolean(mem?.indexes.get('idx_community_user')))
  check('conversation_members: Index für den Fanout beim Senden',
    Boolean(mem?.indexes.get('idx_conversation')))
  check('conversation_members: Index für die GDPR-Löschung', Boolean(mem?.indexes.get('idx_user')))

  const msg = schema[MESSAGES]
  check('messages.body ist MEDIUMTEXT (kein Zeilenbudget)',
    ['mediumtext', 'string'].includes(msg?.columns.get('body')?.type ?? ''), msg?.columns.get('body')?.type)
  check('messages.reportedBody existiert (der eingefrorene Beleg)', Boolean(msg?.columns.get('reportedBody')))
  check('messages.reportedAt existiert (Anker der 90-Tage-Frist)', Boolean(msg?.columns.get('reportedAt')))
  check('messages: Index (communityId, conversationId)', Boolean(msg?.indexes.get('idx_community_conversation')))
  check('messages: Index (communityId, reportedAt) für die Warteschlange', Boolean(msg?.indexes.get('idx_community_reported')))

  const blk = schema[BLOCKS]
  check('message_blocks: Unique je (Community, Sperrender, Gesperrter)',
    blk?.indexes.get('uq_community_pair')?.type === 'unique')
  check('message_blocks: Index (blockerId, blockedId) OHNE communityId',
    Boolean(blk?.indexes.get('idx_pair')))
  check('message_blocks: Index (blockedId) für die Gegenrichtung', Boolean(blk?.indexes.get('idx_blocked')))
  check('message_settings: EINE Zeile je Community', schema[SETTINGS]?.indexes.get('uq_community')?.type === 'unique')

  // ── 2. Row-Permissions: nur die zwei Beteiligten ────────────────────────
  console.log('\n2. Das Publikum einer Zeile sind ZWEI Menschen')
  const startedAt = new Date().toISOString()
  const conversation = await makeRow(CONVERSATIONS, {
    communityId: HERE,
    participants: [ANNA, BODO].sort(),
    pairKey: pairKey(ANNA, BODO),
    starterId: ANNA,
    answered: false,
    lastMessageAt: startedAt,
    lastMessagePreview: 'Hallo',
  }, pairPermissions(ANNA, BODO))

  // Die Teilnehmer-Zeilen — ohne Row-Permissions: sie tragen nur Zähler und
  // werden ausschließlich server-seitig gelesen.
  for (const [userId, unread] of [[ANNA, 0], [BODO, 1]]) {
    await makeRow(MEMBERS, {
      communityId: HERE, conversationId: conversation.$id, userId,
      unread, readRounds: 0, closed: false, lastMessageAt: startedAt,
    })
  }

  const perms = conversation.$permissions ?? []
  check('genau zwei Permissions', perms.length === 2, perms.join(' '))
  check('… beide sind READ auf je einen der Beteiligten',
    perms.every(p => p.startsWith('read("user:')), perms.join(' '))
  check('… KEIN update/delete für die Nutzer (Bearbeiten gibt es nicht)',
    !perms.some(p => p.startsWith('update(') || p.startsWith('delete(')), perms.join(' '))
  check('… KEIN Mitglieder-Read (das wäre das Gegenteil des Produkts)',
    !perms.some(p => p.includes('users') || p.includes('any')), perms.join(' '))
  check('… KEIN Moderations-Label (§ 2.2: die Moderation kommt nicht über die Zeile)',
    !perms.some(p => p.includes('label:mod') || p.includes('label:moderator') || p.includes('label:admin')), perms.join(' '))

  const message = await makeRow(MESSAGES, {
    communityId: HERE,
    conversationId: conversation.$id,
    authorId: ANNA,
    body: 'Ein privater Satz.',
    readAt: '',
    reportedBody: '',
    reportedAt: '',
  }, pairPermissions(ANNA, BODO))
  const msgPerms = message.$permissions ?? []
  check('eine Nachricht trägt dieselben zwei Permissions', msgPerms.length === 2
    && msgPerms.every(p => p.startsWith('read("user:')), msgPerms.join(' '))

  // ── 3. Der eindeutige Schlüssel ist tenant-RELATIV ──────────────────────
  console.log('\n3. Ein Paar, eine Konversation — je Community')
  let duplicateRejected = false
  try {
    await makeRow(CONVERSATIONS, {
      communityId: HERE,
      participants: [BODO, ANNA].sort(),
      pairKey: pairKey(BODO, ANNA),
      starterId: BODO,
      answered: false,
      lastMessageAt: '',
      lastMessagePreview: '',
    }, pairPermissions(ANNA, BODO))
  }
  catch (error) {
    duplicateRejected = error?.code === 409
  }
  check('dasselbe Paar in derselben Community wird ABGEWIESEN (409)', duplicateRejected)

  const elsewhereConv = await makeRow(CONVERSATIONS, {
    communityId: ELSEWHERE,
    participants: [ANNA, BODO].sort(),
    pairKey: pairKey(ANNA, BODO),
    starterId: ANNA,
    answered: false,
    lastMessageAt: '',
    lastMessagePreview: '',
  }, pairPermissions(ANNA, BODO))
  check('dasselbe Paar in einer ANDEREN Community bekommt eine eigene', Boolean(elsewhereConv.$id))

  // ── 4. Die Sperre ───────────────────────────────────────────────────────
  console.log('\n4. Die Sperre — beidseitig, und „überall" wirkt überall')
  await makeRow(BLOCKS, { communityId: HERE, blockerId: ANNA, blockedId: BODO, scope: 'community' })
  await makeRow(BLOCKS, { communityId: HERE, blockerId: CLARA, blockedId: ANNA, scope: 'everywhere' })

  // GENAU die Abfrage aus server/utils/messageBlocks.ts — ohne Mandanten-
  // Filter, dafür auf zwei feste User-Ids festgenagelt.
  const pairRows = await tablesDB.listRows({
    databaseId,
    tableId: BLOCKS,
    queries: [Query.equal('blockerId', [ANNA, BODO]), Query.equal('blockedId', [ANNA, BODO]), Query.limit(50)],
  })
  check('EINE Abfrage findet die Sperre in beide Richtungen', pairRows.rows.length === 1, `${pairRows.rows.length} Zeile(n)`)
  check('… und gibt über UNBETEILIGTE nichts preis',
    pairRows.rows.every(r => [ANNA, BODO].includes(r.blockerId) && [ANNA, BODO].includes(r.blockedId)))

  const everywhereRows = await tablesDB.listRows({
    databaseId,
    tableId: BLOCKS,
    queries: [Query.equal('blockerId', [ANNA, CLARA]), Query.equal('blockedId', [ANNA, CLARA]), Query.limit(50)],
  })
  const everywhere = everywhereRows.rows.find(r => r.scope === 'everywhere')
  check('die „überall"-Zeile ist ohne Mandanten-Filter auffindbar', Boolean(everywhere))
  check('… und trägt die Community, in der sie ausgesprochen wurde', everywhere?.communityId === HERE, everywhere?.communityId)

  let blockDuplicateRejected = false
  try {
    await makeRow(BLOCKS, { communityId: HERE, blockerId: ANNA, blockedId: BODO, scope: 'everywhere' })
  }
  catch (error) {
    blockDuplicateRejected = error?.code === 409
  }
  check('eine zweite Sperre desselben Paares wird ABGEWIESEN (409 = No-op)', blockDuplicateRejected)

  // ── 5. DIE ZENTRALE ZUSAGE ──────────────────────────────────────────────
  console.log('\n5. Keine ungemeldete Nachricht kommt über die Moderation heraus')

  // 5a. Die Warteschlange fragt ausschließlich nach EINGEFRORENEN Zeilen.
  const queueBefore = await tablesDB.listRows({
    databaseId,
    tableId: MESSAGES,
    queries: [Query.equal('communityId', HERE), Query.notEqual('reportedAt', ''), Query.limit(50)],
  })
  check('die ungemeldete Nachricht steht NICHT in der Warteschlange',
    !queueBefore.rows.some(r => r.$id === message.$id), `${queueBefore.rows.length} Zeile(n)`)

  // 5b. Die Einzelsicht liefert `reportedBody` — und der ist leer, solange
  //     nicht gemeldet wurde. Genau das ist `moderatorVisibleBody() === null`.
  const unreported = await tablesDB.getRow({ databaseId, tableId: MESSAGES, rowId: message.$id })
  check('… und ihr Beleg ist leer (die Moderation sieht NICHTS)',
    (unreported.reportedAt ?? '') === '' && (unreported.reportedBody ?? '') === '')
  check('… obwohl der lebende Text sehr wohl in der Zeile steht',
    unreported.body === 'Ein privater Satz.')

  // 5c. Das Einfrieren macht den Beleg sichtbar.
  const frozenAt = new Date().toISOString()
  await tablesDB.updateRow({
    databaseId, tableId: MESSAGES, rowId: message.$id,
    data: { reportedBody: unreported.body, reportedAt: frozenAt },
  })
  const queueAfter = await tablesDB.listRows({
    databaseId,
    tableId: MESSAGES,
    queries: [Query.equal('communityId', HERE), Query.notEqual('reportedAt', ''), Query.limit(50)],
  })
  check('nach der Meldung steht sie in der Warteschlange',
    queueAfter.rows.some(r => r.$id === message.$id))

  // 5d. Ein ZWEITES Einfrieren darf den Beleg nicht überschreiben — sonst
  //     machte eine spätere Meldung die erste wertlos. Die Regel dafür ist
  //     `shouldFreezeSnapshot`; hier wird gezeigt, dass der Beleg bei einer
  //     nachträglichen ÄNDERUNG des Textes stehen bleibt.
  await tablesDB.updateRow({
    databaseId, tableId: MESSAGES, rowId: message.$id, data: { body: 'Nachträglich geändert.' },
  })
  const afterEdit = await tablesDB.getRow({ databaseId, tableId: MESSAGES, rowId: message.$id })
  check('der Beleg überlebt eine nachträgliche Änderung des Textes',
    afterEdit.reportedBody === 'Ein privater Satz.' && afterEdit.body === 'Nachträglich geändert.')
  check('… und behält seinen ursprünglichen Zeitstempel', afterEdit.reportedAt === frozenAt)

  // ── 6. Der Verlauf ──────────────────────────────────────────────────────
  console.log('\n6. Der Verlauf einer Konversation')
  const thread = await tablesDB.listRows({
    databaseId,
    tableId: MESSAGES,
    queries: [
      Query.equal('communityId', HERE),
      Query.equal('conversationId', conversation.$id),
      Query.orderDesc('$createdAt'),
      Query.limit(50),
    ],
  })
  // Fände Appwrite den Index nicht, wäre das hier ein Fehler und keine leere
  // Liste — genau deshalb steht die Abfrage in diesem Beweis.
  check('die Verlaufs-Abfrage läuft (Index idx_community_conversation greift)', true)
  check('… und findet genau die eine Nachricht', thread.rows.length === 1, `${thread.rows.length} Zeile(n)`)

  // DER POSTEINGANG — die Abfrage, an der der erste Entwurf gescheitert ist:
  // Filter (mein Konto, nicht entfernt) UND Sortierung auf DERSELBEN Zeile.
  // Über eine Array-Spalte wäre sie gar nicht indizierbar gewesen.
  const inbox = await tablesDB.listRows({
    databaseId,
    tableId: MEMBERS,
    queries: [
      Query.equal('communityId', HERE),
      Query.equal('userId', BODO),
      Query.equal('closed', false),
      Query.orderDesc('lastMessageAt'),
      Query.limit(50),
    ],
  })
  check('die Posteingangs-Abfrage läuft (Index idx_community_user greift)', true)
  check('… und findet genau eine Konversation für Bodo', inbox.rows.length === 1, `${inbox.rows.length} Zeile(n)`)
  check('… mit seinem eigenen Ungelesen-Stand', inbox.rows[0]?.unread === 1, String(inbox.rows[0]?.unread))

  // Der Zähler ist ein SKALAR und damit ATOMAR — das ist der Gewinn der
  // eigenen Tabelle gegenüber der Array-Fassung.
  const bumped = await tablesDB.incrementRowColumn({
    databaseId, tableId: MEMBERS, rowId: inbox.rows[0].$id, column: 'unread', value: 1,
  })
  check('der Ungelesen-Zähler lässt sich atomar hochzählen', bumped.unread === 2, String(bumped.unread))

  // ── 7. Der Owner-Schalter ───────────────────────────────────────────────
  console.log('\n7. Der Owner-Schalter (Default AUS heißt: KEINE Zeile)')
  const before = await tablesDB.listRows({
    databaseId, tableId: SETTINGS, queries: [Query.equal('communityId', HERE), Query.limit(1)],
  })
  check('ohne Zeile gibt es nichts zu lesen — der Rückfall entscheidet', before.total === 0, `${before.total} Zeile(n)`)
  await makeRow(SETTINGS, { communityId: HERE, enabled: true })
  let settingsDuplicateRejected = false
  try {
    await makeRow(SETTINGS, { communityId: HERE, enabled: false })
  }
  catch (error) {
    settingsDuplicateRejected = error?.code === 409
  }
  check('eine zweite Zeile je Community wird ABGEWIESEN (409)', settingsDuplicateRejected)

  /* ═══ TEIL B: DIE ROUTEN ═══════════════════════════════════════════════ */

  /**
   * ZUERST AUFRÄUMEN, DANN WEITER — und das ist kein Ordnungssinn.
   *
   * Teil A legt Zeilen mit ERFUNDENEN Community-Ids an. In einer Pool-App
   * hielte der Mandanten-Filter sie von Teil B fern; in einer SILO-App fügt
   * die Datentür bewusst GAR KEINEN Filter an (dort ist das Projekt die
   * Grenze). Teil B sähe die Teil-A-Zeilen also als seine eigenen: der
   * Owner-Schalter stünde schon auf „an", und die Melde-Warteschlange trüge
   * einen Beleg, den dieser Lauf nie gemeldet hat.
   *
   * Beide Hälften sind für sich richtig — sie dürfen sich nur nicht sehen.
   */
  for (const { tableId, rowId } of created.splice(0).reverse()) {
    await tablesDB.deleteRow({ databaseId, tableId, rowId }).catch(() => null)
  }

  if (!PORT) {
    console.log('\n8.–12. Routen-Beweis ÜBERSPRUNGEN (kein MESSAGES_PORT gesetzt).')
    console.log('        Mit laufendem Server:  MESSAGES_PORT=3021 node --env-file=… <dieses Skript>')
  }
  else {
    // ANNA trägt das Betreiber-Label und hält damit ALL_CAPABILITIES (im Silo
    // ist das der reguläre Weg — dort gibt es keine Community-Rollen).
    // BODO trägt nichts: kein Label, keine Rolle, Vertrauensstufe 0.
    const anna = await createAccount('anna', ['admin'])
    const bodo = await createAccount('bodo')

    // ── 8. Der Owner-Schalter an der Route ────────────────────────────────
    console.log('\n8. Der Owner-Schalter (Route)')
    const closedInbox = await call('/api/messages', { cookie: anna.cookie })
    check('ausgeschaltet ⇒ der Posteingang ist zu (403 messages_disabled)',
      closedInbox.status === 403 && reasonOf(closedInbox) === 'messages_disabled',
      `${closedInbox.status}/${reasonOf(closedInbox)}`)

    const bodoSwitch = await call('/api/messages/settings', {
      method: 'PATCH', cookie: bodo.cookie, body: { enabled: true },
    })
    check('ein gewöhnliches Konto darf ihn NICHT umlegen (403)', bodoSwitch.status === 403, String(bodoSwitch.status))

    const annaSwitch = await call('/api/messages/settings', {
      method: 'PATCH', cookie: anna.cookie, body: { enabled: true },
    })
    check('wer `messages.manage` hält, schaltet ihn an', annaSwitch.status === 200 && annaSwitch.json?.enabled === true,
      `${annaSwitch.status}/${annaSwitch.text.slice(0, 80)}`)

    // ── 9. TL0 wird abgewiesen ────────────────────────────────────────────
    console.log('\n9. Wer eröffnen darf — und wer nicht')
    const bodoOpens = await call('/api/messages', {
      method: 'POST', cookie: bodo.cookie, body: { handle: anna.handle, body: 'Darf ich das?' },
    })
    check('Stufe 0 ohne Rolle kann KEINE Konversation eröffnen (403)', bodoOpens.status === 403, String(bodoOpens.status))
    check('… und erfährt den GRUND nicht (derselbe Code wie bei einer Sperre)',
      reasonOf(bodoOpens) === 'recipient_unavailable', String(reasonOf(bodoOpens)))

    const annaOpens = await call('/api/messages', {
      method: 'POST', cookie: anna.cookie, body: { handle: bodo.handle, body: 'Hallo Bodo.' },
    })
    check('wer das Recht hat, eröffnet', annaOpens.status === 200 && Boolean(annaOpens.json?.conversationId),
      `${annaOpens.status}/${annaOpens.text.slice(0, 120)}`)
    const conversationId = annaOpens.json?.conversationId ?? ''

    const unknown = await call('/api/messages', {
      method: 'POST', cookie: anna.cookie, body: { handle: `gibtesnicht${RUN}`.slice(0, 24), body: 'Hallo?' },
    })
    check('ein unbekannter Name endet wie eine Sperre (kein Verzeichnisdienst)',
      unknown.status === 403 && reasonOf(unknown) === 'recipient_unavailable',
      `${unknown.status}/${reasonOf(unknown)}`)

    // ── 10. Empfangen und antworten ab Stufe 0 ────────────────────────────
    console.log('\n10. Empfangen und Antworten gehen ab Stufe 0')
    const inbox = await call('/api/messages', { cookie: bodo.cookie })
    check('der Empfänger sieht die Konversation', inbox.status === 200 && inbox.json?.conversations?.length === 1,
      `${inbox.status}/${inbox.json?.conversations?.length}`)
    check('… mit einer ungelesenen Nachricht', inbox.json?.conversations?.[0]?.unread === 1,
      String(inbox.json?.conversations?.[0]?.unread))

    const thread = await call(`/api/messages/${conversationId}`, { cookie: bodo.cookie })
    check('… und darf den Verlauf lesen', thread.status === 200 && thread.json?.messages?.length === 1,
      `${thread.status}/${thread.json?.messages?.length}`)
    const annaMessageId = thread.json?.messages?.[0]?.id ?? ''

    const afterRead = await call('/api/messages', { cookie: bodo.cookie })
    check('das Öffnen setzt den Ungelesen-Zähler auf 0',
      afterRead.json?.conversations?.[0]?.unread === 0, String(afterRead.json?.conversations?.[0]?.unread))

    const bodoReplies = await call(`/api/messages/${conversationId}`, {
      method: 'POST', cookie: bodo.cookie, body: { body: 'Hallo Anna.' },
    })
    check('ANTWORTEN geht ohne Vertrauensstufe (§ 2.4, Folge 1)', bodoReplies.status === 200,
      `${bodoReplies.status}/${bodoReplies.text.slice(0, 120)}`)

    const stranger = await createAccount('clara')
    const peek = await call(`/api/messages/${conversationId}`, { cookie: stranger.cookie })
    check('ein Unbeteiligter bekommt 404 — nicht 403 (die Id bleibt unbestätigt)',
      peek.status === 404, String(peek.status))

    // ── 11. Die Sperre ────────────────────────────────────────────────────
    console.log('\n11. Die Sperre verhindert das Senden — beidseitig')
    const block = await call('/api/messages/blocks', {
      method: 'POST', cookie: bodo.cookie, body: { userId: anna.userId, everywhere: false },
    })
    check('sperren geht ohne Vertrauensstufe (Schutz hängt an nichts)', block.status === 200, String(block.status))

    const blockedSend = await call(`/api/messages/${conversationId}`, {
      method: 'POST', cookie: anna.cookie, body: { body: 'Und jetzt?' },
    })
    check('der GESPERRTE kann nicht mehr senden (403)', blockedSend.status === 403, String(blockedSend.status))
    check('… und erfährt den Grund nicht', reasonOf(blockedSend) === 'recipient_unavailable', String(reasonOf(blockedSend)))

    const blockedBack = await call(`/api/messages/${conversationId}`, {
      method: 'POST', cookie: bodo.cookie, body: { body: 'Ich auch nicht.' },
    })
    check('… und der SPERRENDE ebenso wenig (beidseitig)', blockedBack.status === 403, String(blockedBack.status))

    const blockList = await call('/api/messages/blocks', { cookie: bodo.cookie })
    check('meine Sperr-Liste zeigt sie', blockList.json?.blocks?.length === 1, String(blockList.json?.blocks?.length))
    const annaSeesNothing = await call('/api/messages/blocks', { cookie: anna.cookie })
    check('… und der Gesperrte sieht sie NICHT (§ 2.3)', annaSeesNothing.json?.blocks?.length === 0,
      String(annaSeesNothing.json?.blocks?.length))

    const unblock = await call(`/api/messages/blocks/${anna.userId}`, { method: 'DELETE', cookie: bodo.cookie })
    check('aufheben geht', unblock.status === 200, String(unblock.status))
    const sendAgain = await call(`/api/messages/${conversationId}`, {
      method: 'POST', cookie: anna.cookie, body: { body: 'Wieder da.' },
    })
    check('… und danach kommt die Nachricht wieder durch', sendAgain.status === 200, String(sendAgain.status))
    const secondMessageId = sendAgain.json?.messageId ?? ''

    // ── 12. Melden, Beleg, Moderations-Route ──────────────────────────────
    console.log('\n12. Die Moderation sieht NUR die gemeldete Nachricht')
    const beforeReport = await call(`/api/messages/moderation/${annaMessageId}`, { cookie: anna.cookie })
    check('eine UNGEMELDETE Nachricht gibt der Moderation nichts (404 not_reported)',
      beforeReport.status === 404 && reasonOf(beforeReport) === 'not_reported',
      `${beforeReport.status}/${reasonOf(beforeReport)}`)

    const report = await call('/api/reports', {
      method: 'POST', cookie: bodo.cookie,
      body: { targetType: 'message', targetId: annaMessageId, reason: 'harassment' },
    })
    check('melden geht', report.status === 200 || report.status === 201, `${report.status}/${report.text.slice(0, 120)}`)

    const moderated = await call(`/api/messages/moderation/${annaMessageId}`, { cookie: anna.cookie })
    check('danach liefert die EINE Moderations-Route den Beleg',
      moderated.status === 200 && moderated.json?.body === 'Hallo Bodo.',
      `${moderated.status}/${JSON.stringify(moderated.json?.body)}`)
    check('… mit beiden Beteiligten, aber OHNE Verlauf',
      moderated.json?.authorId === anna.userId && moderated.json?.recipientId === bodo.userId
      && !('messages' in (moderated.json ?? {})),
      JSON.stringify(Object.keys(moderated.json ?? {})))

    const stillHidden = await call(`/api/messages/moderation/${secondMessageId}`, { cookie: anna.cookie })
    check('die ZWEITE, ungemeldete Nachricht bleibt unsichtbar (404)',
      stillHidden.status === 404 && reasonOf(stillHidden) === 'not_reported',
      `${stillHidden.status}/${reasonOf(stillHidden)}`)

    const queue = await call('/api/messages/moderation', { cookie: anna.cookie })
    check('die Warteschlange enthält GENAU die gemeldete',
      queue.status === 200 && queue.json?.messages?.length === 1 && queue.json.messages[0].id === annaMessageId,
      `${queue.status}/${queue.json?.messages?.length}`)

    const bodoQueue = await call('/api/messages/moderation', { cookie: bodo.cookie })
    check('… und ein gewöhnliches Konto kommt gar nicht hinein (403)', bodoQueue.status === 403, String(bodoQueue.status))

    // Aufräumen: alles, was der Kundenpfad angelegt hat.
    for (const [tableId, queries] of [
      [MESSAGES, [Query.equal('conversationId', conversationId)]],
      [MEMBERS, [Query.equal('conversationId', conversationId)]],
      [CONVERSATIONS, [Query.equal('$id', conversationId)]],
      [BLOCKS, [Query.equal('blockerId', [anna.userId, bodo.userId])]],
      ['reports', [Query.equal('targetId', annaMessageId)]],
      ['community_handles', [Query.equal('userId', [anna.userId, bodo.userId, stranger.userId])]],
      [SETTINGS, [Query.equal('enabled', true)]],
    ]) {
      const { rows } = await tablesDB.listRows({ databaseId, tableId, queries: [...queries, Query.limit(100)] })
        .catch(() => ({ rows: [] }))
      for (const row of rows) await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id }).catch(() => null)
    }
  }
}
finally {
  // Der Beweis räumt hinter sich auf — er läuft gegen eine echte Instanz.
  for (const { tableId, rowId } of created.reverse()) {
    await tablesDB.deleteRow({ databaseId, tableId, rowId }).catch(() => null)
  }
  for (const userId of createdUsers) {
    await users.delete({ userId }).catch(() => null)
  }
}

console.log(`\n${failed === 0 ? '✔' : '✘'} ${passed}/${passed + failed} Prüfungen bestanden\n`)
process.exit(failed === 0 ? 0 : 1)

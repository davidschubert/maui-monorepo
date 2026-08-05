/**
 * Migration messages-001: die FÜNF Tabellen der privaten Nachrichten
 * (Konzept docs/plans/PRIVATE-NACHRICHTEN-KONZEPT.md § 4, Stufe 1).
 *
 * ── DIE ZEILEN GEHÖREN ZWEI MENSCHEN, SONST NIEMANDEM ─────────────────────
 * `conversations` und `messages` laufen mit `rowSecurity: true` und LEEREN
 * Table-Permissions: es gibt kein Publikum auf Tabellen-Ebene. Die Zeilen
 * bekommen beim Anlegen genau `read(user:A)` und `read(user:B)` und sonst
 * nichts — kein `update`, kein `delete` für die Nutzer (Bearbeiten gibt es
 * nicht, Löschen läuft über die Route) und AUSDRÜCKLICH KEIN
 * Moderations-Label.
 *
 * Das Fehlen des Moderations-Labels ist die Permission-Seite von Konzept
 * § 2.2: die Moderation kommt nicht über die ZEILE an den Inhalt, sondern
 * über genau eine Route, die eine offene Meldung verlangt — und die liefert
 * nur den eingefrorenen Beleg.
 *
 * `message_blocks` und `message_settings` bekommen ebenfalls keine
 * Row-Permissions: sie werden ausschließlich server-seitig gelesen und
 * geschrieben. Ohne Leser gibt es auch kein Realtime-Ereignis, und eine
 * Sperre, die in offene Fenster funkt, wäre genau die Auskunft, die § 2.3
 * ausschließt.
 *
 * ── WARUM DIE TEILNEHMER EINE EIGENE TABELLE HABEN ───────────────────────
 * Davids Entscheidung 6 (2026-08-04): das Datenmodell ist n:m-fähig, gebaut
 * wird v1 nur 1:1. Konzept § 8 nennt dafür ausdrücklich die
 * „Teilnehmer-Tabelle statt zweier Spalten" — `conversation_members`.
 *
 * ERZWUNGEN WURDE SIE VON APPWRITE, und das gehört ins Protokoll: der erste
 * Entwurf trug die Teilnehmer als ARRAY-Spalte auf der Konversation. Der
 * Migrationslauf gegen 1.9.6 bricht dort mit „Creating indexes on array
 * attributes is not currently supported" ab (live erwischt, 2026-08-05). Ohne
 * Index gäbe es für den Posteingang keine Abfrage, sondern einen vollen
 * Durchlauf.
 *
 * Der erzwungene Weg ist der bessere: der Ungelesen-Zähler ist jetzt ein
 * SKALAR je Mensch und damit atomar hochzählbar (`incrementRowColumn`) — in
 * der Array-Fassung musste er gelesen, verändert und zurückgeschrieben werden.
 *
 * Die Beschränkung auf genau zwei steht BEWUSST nicht hier, sondern an einer
 * Stelle im Code (`shared/conversations.ts`): ein Schema, das zwei Teilnehmer
 * erzwingt, verschöbe die Entscheidung dorthin, wo man sie nur mit einer
 * Migration zurücknehmen kann.
 *
 * ── DER EINDEUTIGE SCHLÜSSEL IST TENANT-RELATIV (Pool-Regel) ──────────────
 * `uq_community_pair` über (communityId, pairKey). Dasselbe Paar darf in zwei
 * Communities je eine Konversation haben — sie haben miteinander nichts zu
 * tun. Ein Unique-Index über die ARRAY-Spalte gäbe es nicht, deshalb der
 * abgeleitete `pairKey` (sortierte Teilnehmer, doppelpunktgetrennt).
 *
 * ── `body` UND `reportedBody` SIND MEDIUMTEXT ─────────────────────────────
 * Varchar hat in Appwrite/MariaDB ein 16.381-Zeichen-Limit UND ein
 * Zeilenbudget von ~65 KB, an dem der pages-Layer schon einmal hängen
 * geblieben ist (pages-002). Zwei Textfelder auf einer Zeile wären dort eng;
 * MEDIUMTEXT liegt off-row und kostet das Budget nicht.
 *
 * Idempotent (409 → skip). Index-Anlage NUR über die Fabrik (F19).
 *
 *   pnpm migrate --app <app> --layer messages
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const CONVERSATIONS = 'conversations'
const MEMBERS = 'conversation_members'
const MESSAGES = 'messages'
const BLOCKS = 'message_blocks'
const SETTINGS = 'message_settings'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration messages-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

/* ── conversations ───────────────────────────────────────────────────────── */

await step(`Table ${CONVERSATIONS}`, () => tablesDB.createTable({
  databaseId, tableId: CONVERSATIONS, name: 'Conversations',
  permissions: [], rowSecurity: true,
}))

{
  const cols = await existingColumnKeys(CONVERSATIONS)

  await columnStep(`Column ${CONVERSATIONS}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'communityId', size: 36, required: false, xdefault: '',
  }))
  // Die Teilnehmer — NIE abgefragt, nur gelesen (Kopf von
  // shared/types/message.ts). Die abfragbare Form ist `conversation_members`;
  // diese Spalte ist die Quelle der Row-Permissions beim Schreiben jeder
  // Nachricht und spart dort eine Abfrage. Array-Spalten kennen in Appwrite
  // keinen Default — deshalb ohne `xdefault`, die Route schreibt sie immer.
  await columnStep(`Column ${CONVERSATIONS}.participants`, 'participants', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'participants', size: 36, required: false, array: true,
  }))
  // Der abgeleitete Schlüssel, der den eindeutigen Index trägt. 255 statt 73:
  // er wächst mit der Teilnehmerzahl, und eine Gruppe von sechs Menschen soll
  // ihn nicht sprengen.
  await columnStep(`Column ${CONVERSATIONS}.pairKey`, 'pairKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'pairKey', size: 255, required: false, xdefault: '',
  }))
  await columnStep(`Column ${CONVERSATIONS}.starterId`, 'starterId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'starterId', size: 36, required: false, xdefault: '',
  }))
  // Das dritte Rate-Budget als SPALTE statt als Rechnung über alle
  // Nachrichten: „hat jemand anderes als der Eröffner geschrieben?"
  await columnStep(`Column ${CONVERSATIONS}.answered`, 'answered', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: CONVERSATIONS, key: 'answered', required: false, xdefault: false,
  }))
  await columnStep(`Column ${CONVERSATIONS}.lastMessageAt`, 'lastMessageAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'lastMessageAt', size: 32, required: false, xdefault: '',
  }))
  await columnStep(`Column ${CONVERSATIONS}.lastMessagePreview`, 'lastMessagePreview', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CONVERSATIONS, key: 'lastMessagePreview', size: 200, required: false, xdefault: '',
  }))

  await waitForColumns(CONVERSATIONS)

  // Blind schreiben, 409 heißt „jemand war schneller" — ohne diesen Index
  // entstünden bei zwei gleichzeitigen ersten Nachrichten zwei Konversationen
  // desselben Paares, und ab da läse jeder seine eigene Hälfte.
  await indexStep(`Unique-Index ${CONVERSATIONS}.uq_community_pair`, {
    tableId: CONVERSATIONS, key: 'uq_community_pair', type: TablesDBIndexType.Unique,
    columns: ['communityId', 'pairKey'],
  })
  // Das dritte Rate-Budget: „meine offenen, unbeantworteten Konversationen".
  await indexStep(`Index ${CONVERSATIONS}.idx_community_starter`, {
    tableId: CONVERSATIONS, key: 'idx_community_starter', type: TablesDBIndexType.Key,
    columns: ['communityId', 'starterId', 'answered'],
  })
}

/* ── conversation_members ────────────────────────────────────────────────── */

await step(`Table ${MEMBERS}`, () => tablesDB.createTable({
  databaseId, tableId: MEMBERS, name: 'Conversation Members',
  permissions: [], rowSecurity: true,
}))

{
  const cols = await existingColumnKeys(MEMBERS)

  await columnStep(`Column ${MEMBERS}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MEMBERS, key: 'communityId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${MEMBERS}.conversationId`, 'conversationId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MEMBERS, key: 'conversationId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${MEMBERS}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MEMBERS, key: 'userId', size: 36, required: false, xdefault: '',
  }))
  // `min: 0` ist das Netz unter dem Schreibweg (`decrement({ min: 0 })` gibt es
  // hier nicht — gelesen wird auf 0 GESETZT). Eine negative Anzahl Ungelesener
  // gibt es nicht; wer künftig doch eine schreibt, soll scheitern statt eine
  // Zahl zu hinterlassen, die niemand erklären kann.
  await columnStep(`Column ${MEMBERS}.unread`, 'unread', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: MEMBERS, key: 'unread', required: false, min: 0, xdefault: 0,
  }))
  // Die Zählmarke des Benachrichtigungs-Schlüssels (§ 4).
  await columnStep(`Column ${MEMBERS}.readRounds`, 'readRounds', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: MEMBERS, key: 'readRounds', required: false, min: 0, xdefault: 0,
  }))
  // „Für mich entfernt" (Davids Entscheidung 5). Gelöscht wird die Konversation
  // erst, wenn ALLE Teilnehmer-Zeilen das tragen.
  await columnStep(`Column ${MEMBERS}.closed`, 'closed', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: MEMBERS, key: 'closed', required: false, xdefault: false,
  }))
  // Spiegel von conversations.lastMessageAt — der Posteingang filtert und
  // sortiert auf DERSELBEN Zeile (Begründung im Typ-Kopf).
  await columnStep(`Column ${MEMBERS}.lastMessageAt`, 'lastMessageAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MEMBERS, key: 'lastMessageAt', size: 32, required: false, xdefault: '',
  }))

  await waitForColumns(MEMBERS)

  // EINE Zeile je (Konversation, Mensch) — blind schreiben, 409 heißt „gibt es
  // schon". Trägt zugleich die Abfrage „meine Zeile in dieser Konversation"
  // als Präfix.
  await indexStep(`Unique-Index ${MEMBERS}.uq_conversation_user`, {
    tableId: MEMBERS, key: 'uq_conversation_user', type: TablesDBIndexType.Unique,
    columns: ['communityId', 'conversationId', 'userId'],
  })
  // DER POSTEINGANG: „meine offenen Konversationen, neueste zuerst" — Filter
  // UND Sortierung in EINER Abfrage. Genau dafür steht `lastMessageAt` hier.
  await indexStep(`Index ${MEMBERS}.idx_community_user`, {
    tableId: MEMBERS, key: 'idx_community_user', type: TablesDBIndexType.Key,
    columns: ['communityId', 'userId', 'closed', 'lastMessageAt'],
  })
  // Die Gegenrichtung: „wer gehört zu dieser Konversation?" (Fanout beim
  // Senden, Aufräumen beim Löschen) — und die GDPR-Löschung fragt über
  // `userId` allein.
  await indexStep(`Index ${MEMBERS}.idx_conversation`, {
    tableId: MEMBERS, key: 'idx_conversation', type: TablesDBIndexType.Key,
    columns: ['conversationId'],
  })
  await indexStep(`Index ${MEMBERS}.idx_user`, {
    tableId: MEMBERS, key: 'idx_user', type: TablesDBIndexType.Key,
    columns: ['userId'],
  })
}

/* ── messages ────────────────────────────────────────────────────────────── */

await step(`Table ${MESSAGES}`, () => tablesDB.createTable({
  databaseId, tableId: MESSAGES, name: 'Private Messages',
  permissions: [], rowSecurity: true,
}))

{
  const cols = await existingColumnKeys(MESSAGES)

  await columnStep(`Column ${MESSAGES}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'communityId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${MESSAGES}.conversationId`, 'conversationId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'conversationId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${MESSAGES}.authorId`, 'authorId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'authorId', size: 36, required: false, xdefault: '',
  }))
  // MEDIUMTEXT (siehe Kopf). MariaDB erlaubt für TEXT-Spalten keinen Default.
  await columnStep(`Column ${MESSAGES}.body`, 'body', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: MESSAGES, key: 'body', required: false,
  }))
  await columnStep(`Column ${MESSAGES}.readAt`, 'readAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'readAt', size: 32, required: false, xdefault: '',
  }))
  // DER EINGEFRORENE BELEG (§ 2.2). Er steht in DIESEM Layer und nicht in
  // `reports`: so bleibt `moderation` domänen-agnostisch (A14) und die
  // Löschung hat genau EINE Stelle — die Bauart, an der `guest_authors`
  // gescheitert ist.
  await columnStep(`Column ${MESSAGES}.reportedBody`, 'reportedBody', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: MESSAGES, key: 'reportedBody', required: false,
  }))
  await columnStep(`Column ${MESSAGES}.reportedAt`, 'reportedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'reportedAt', size: 32, required: false, xdefault: '',
  }))

  await waitForColumns(MESSAGES)

  // Der Verlauf einer Konversation. `$createdAt` steht NICHT im Index:
  // Appwrite indiziert die internen Zeitstempel selbst, und eine eigene
  // Spalte daneben wäre eine zweite Wahrheit über dieselbe Tatsache.
  await indexStep(`Index ${MESSAGES}.idx_community_conversation`, {
    tableId: MESSAGES, key: 'idx_community_conversation', type: TablesDBIndexType.Key,
    columns: ['communityId', 'conversationId'],
  })
  // Die Moderations-Warteschlange fragt nach dem, was eingefroren ist —
  // und die GDPR-Löschung nach dem, was ein Mensch geschrieben hat.
  await indexStep(`Index ${MESSAGES}.idx_community_reported`, {
    tableId: MESSAGES, key: 'idx_community_reported', type: TablesDBIndexType.Key,
    columns: ['communityId', 'reportedAt'],
  })
  await indexStep(`Index ${MESSAGES}.idx_author`, {
    tableId: MESSAGES, key: 'idx_author', type: TablesDBIndexType.Key,
    columns: ['authorId'],
  })
}

/* ── message_blocks ──────────────────────────────────────────────────────── */

await step(`Table ${BLOCKS}`, () => tablesDB.createTable({
  databaseId, tableId: BLOCKS, name: 'Message Blocks',
  permissions: [], rowSecurity: true,
}))

{
  const cols = await existingColumnKeys(BLOCKS)

  await columnStep(`Column ${BLOCKS}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BLOCKS, key: 'communityId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${BLOCKS}.blockerId`, 'blockerId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BLOCKS, key: 'blockerId', size: 36, required: false, xdefault: '',
  }))
  await columnStep(`Column ${BLOCKS}.blockedId`, 'blockedId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BLOCKS, key: 'blockedId', size: 36, required: false, xdefault: '',
  }))
  // 'community' | 'everywhere' (Davids Entscheidung 3). Als Varchar statt Enum,
  // damit eine dritte Reichweite später additiv bleibt.
  await columnStep(`Column ${BLOCKS}.scope`, 'scope', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BLOCKS, key: 'scope', size: 16, required: false, xdefault: 'community',
  }))

  await waitForColumns(BLOCKS)

  // Eine Sperre je (Community, Sperrender, Gesperrter) — der zweite Klick auf
  // „blockieren" ist ein 409 und damit ein No-op.
  await indexStep(`Unique-Index ${BLOCKS}.uq_community_pair`, {
    tableId: BLOCKS, key: 'uq_community_pair', type: TablesDBIndexType.Unique,
    columns: ['communityId', 'blockerId', 'blockedId'],
  })
  // DIE Prüfung fragt beide Richtungen in EINER Abfrage (§ 2.3) und dabei
  // BEWUSST ohne Mandanten-Filter — die Reichweite `everywhere` ist per
  // Definition mandantenübergreifend (Begründung im Kopf von
  // server/utils/messageBlocks.ts). Dafür braucht es einen Index, der ohne
  // `communityId` beginnt.
  await indexStep(`Index ${BLOCKS}.idx_pair`, {
    tableId: BLOCKS, key: 'idx_pair', type: TablesDBIndexType.Key,
    columns: ['blockerId', 'blockedId'],
  })
  // Die Gegenrichtung derselben Abfrage + die GDPR-Löschung („wer hat mich
  // gesperrt?").
  await indexStep(`Index ${BLOCKS}.idx_blocked`, {
    tableId: BLOCKS, key: 'idx_blocked', type: TablesDBIndexType.Key,
    columns: ['blockedId'],
  })
}

/* ── message_settings ────────────────────────────────────────────────────── */

await step(`Table ${SETTINGS}`, () => tablesDB.createTable({
  databaseId, tableId: SETTINGS, name: 'Message Settings',
  permissions: [], rowSecurity: true,
}))

{
  const cols = await existingColumnKeys(SETTINGS)

  await columnStep(`Column ${SETTINGS}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SETTINGS, key: 'communityId', size: 36, required: false, xdefault: '',
  }))
  // Default AUS (Davids Entscheidung 4). Die Spalten-Voreinstellung ist hier
  // nur die halbe Miete: Bestandszeilen bekämen sie ohnehin nicht, und es gibt
  // von Anfang an gar keine Zeile. Der wirksame Vorgabewert steht deshalb im
  // Rückfall zur Laufzeit (shared/messageSettings.ts).
  await columnStep(`Column ${SETTINGS}.enabled`, 'enabled', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: SETTINGS, key: 'enabled', required: false, xdefault: false,
  }))

  await waitForColumns(SETTINGS)

  // EINE Zeile je Community — der Index ist die Mechanik, nicht die Kür:
  // geschrieben wird blind, ein 409 heißt „die Zeile gibt es schon".
  await indexStep(`Unique-Index ${SETTINGS}.uq_community`, {
    tableId: SETTINGS, key: 'uq_community', type: TablesDBIndexType.Unique,
    columns: ['communityId'],
  })
}

console.log('✔ Migration messages-001 fertig')

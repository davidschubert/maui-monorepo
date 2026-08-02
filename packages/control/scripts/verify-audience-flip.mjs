#!/usr/bin/env node
/**
 * C18 — SICHTBARKEIT JE COMMUNITY, LIVE-BEWEIS in BEIDE Richtungen.
 *
 * Die Frage, die dieses Skript beantwortet, ist nicht „ist das Feld
 * geschrieben?", sondern die einzige, die zählt: **sieht ein GAST die Inhalte
 * noch?** Dafür liest es mit einem echten Gast-Client (Endpoint + Projekt,
 * KEIN Key) gegen die laufende Appwrite-Instanz — genau der Weg, den ein
 * Fremder per Roh-REST gehen würde.
 *
 * Geprüft wird der BESTAND: die Zeilen entstehen VOR dem Umschalten. Genau das
 * war der C18-Befund — ein Schalter, der nur neue Zeilen betrifft, ist keine
 * Sichtbarkeitseinstellung, sondern eine Fußnote.
 *
 * Der Umzug benutzt die ECHTE Regel (`repermissionRow` aus
 * packages/core/shared/communityAudience.ts, per --experimental-strip-types
 * direkt aus dem Quelltext importiert) — keine Nachbildung, die auseinanderlaufen
 * kann. Was das Skript NICHT prüft, ist die HTTP-Route darum herum: die deckt
 * der Unit-Test ab, und ein laufender Dev-Server ist hier bewusst keine
 * Voraussetzung.
 *
 * Aufruf aus packages/control (dort löst node-appwrite auf), gegen die LOKALE
 * Pool-Instanz — die Zeilen leben im RUNTIME-Projekt, nicht im Control Plane:
 *
 *   node --experimental-strip-types --env-file=../../apps/platform/.env \
 *        scripts/verify-audience-flip.mjs
 *
 * Idempotent + selbst-aufräumend (fester Präfix, `finally`-Löschung). Läuft NUR
 * gegen die in der Env genannte Instanz — nie hartkodiert Prod.
 */
import { Client, ID, Permission, Query, Role, Storage, TablesDB } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { repermissionRow } from '../../core/shared/communityAudience.ts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
/** Betreiber-Sicht (Admin-Key): sieht alles, schreibt Permissions. */
const admin = new TablesDB(adminClient)
const adminStorage = new Storage(adminClient)
/** GAST-Sicht: kein Key, keine Session. Genau das, was ein Fremder hat. */
const guest = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId))

// Eine synthetische Community. Der Wert muss ein gültiges Appwrite-LABEL sein
// (alphanumerisch, ≤36) — deshalb ohne Bindestriche.
const COMMUNITY = `c18${Date.now()}`
const MARK = `c18target${Date.now()}`
const PUBLIC_READ = Permission.read(Role.any())
const MEMBERS_READ = Permission.read(Role.label(COMMUNITY))

const created = []
const createdFiles = []
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}

async function seed(tableId, data, permissions) {
  const row = await admin.createRow({ databaseId, tableId, rowId: ID.unique(), data, permissions })
  created.push({ tableId, id: row.$id })
  return row
}

/** Was ein GAST von unseren Test-Zeilen sieht (Roh-REST, ohne jede Sitzung). */
async function guestSees(tableId) {
  try {
    const res = await guest.listRows({
      databaseId, tableId,
      queries: [Query.equal('communityId', COMMUNITY), Query.limit(25)],
    })
    return res.rows.map(row => row.$id)
  }
  catch {
    // 401 ist die zweite mögliche richtige Antwort (Table ohne read-Permission
    // für Gäste). Für die Frage „sieht ein Gast etwas?" ist sie gleichwertig.
    return []
  }
}

/**
 * Der Bestands-Umzug — dieselbe pure Regel, die die Route benutzt.
 *
 * `bucket` spiegelt den gleichnamigen Registry-Eintrag aus core
 * (`registerAudienceRepermissionTable`): die DATEI bekommt dasselbe
 * Permission-Array wie ihre Row. Ohne diesen Zweig ist der Umzug eine halbe
 * Sache — genau der Audit-Befund vom 2026-08-02 (Event-Titelbilder).
 */
async function flip(tableId, target, bucket = null) {
  let changed = 0
  const res = await admin.listRows({
    databaseId, tableId,
    queries: [Query.equal('communityId', COMMUNITY), Query.limit(100)],
  })
  for (const row of res.rows) {
    const next = repermissionRow(row.$permissions, {
      publicRead: PUBLIC_READ, membersRead: MEMBERS_READ, target,
    })
    if (!next) continue
    await admin.updateRow({ databaseId, tableId, rowId: row.$id, permissions: next })
    if (bucket) {
      const fileId = row[bucket.fileIdKey]
      if (typeof fileId === 'string' && fileId) {
        await adminStorage.updateFile({ bucketId: bucket.bucketId, fileId, permissions: next })
      }
    }
    changed++
  }
  return changed
}

/**
 * Was ein GAST von einer DATEI sieht — Roh-HTTP gegen den Storage-Endpoint,
 * ohne Key und ohne Session. Genau die URL, die im `<img src>` steht.
 * 200 = abrufbar, alles andere = zu.
 */
async function guestCanFetchFile(bucketId, fileId) {
  const res = await fetch(`${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`)
  return res.status === 200
}

/** Kleinstes gültiges PNG (1×1, transparent) — der Bucket prüft Endung + Inhalt. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function permissionsOf(tableId, rowId) {
  const row = await admin.getRow({ databaseId, tableId, rowId })
  return row.$permissions
}

try {
  console.log(`C18 Sichtbarkeits-Umzug gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)
  console.log(`Test-Community ${COMMUNITY}\n`)

  // ── BESTAND anlegen (VOR dem Umschalten) ──────────────────────────────────
  // Drei Sorten, weil die dritte der eigentliche Prüfstein ist:
  //   sichtbar  — trägt read(any), muss mitziehen
  //   privat    — Autoren-Rechte ohne Leserecht (Entwurf/ausgeblendet), darf
  //               NIE aufgemacht werden
  //   moderativ — nur admin/moderator (Operator-Target), bleibt ebenfalls
  const visible = await seed('comments', {
    targetId: MARK, targetType: 'page', content: 'Öffentlicher Bestand', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: 'u-1', authorName: 'A', upvotes: 0, downvotes: 0, score: 0,
    status: 'active', communityId: COMMUNITY,
  }, [PUBLIC_READ, Permission.update(Role.user('u-1'))])

  const hidden = await seed('comments', {
    targetId: MARK, targetType: 'page', content: 'Ausgeblendet', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: 'u-2', authorName: 'B', upvotes: 0, downvotes: 0, score: 0,
    status: 'hidden', communityId: COMMUNITY,
  }, [Permission.update(Role.user('u-2'))])

  const moderative = await seed('comments', {
    targetId: MARK, targetType: 'page', content: 'Nur Moderation', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: 'u-3', authorName: 'C', upvotes: 0, downvotes: 0, score: 0,
    status: 'active', communityId: COMMUNITY,
  }, [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))])

  // ── Ausgangslage: öffentlich ──────────────────────────────────────────────
  const before = await guestSees('comments')
  check('öffentlich: Gast sieht die sichtbare Bestands-Zeile', before.includes(visible.$id))
  check('öffentlich: Gast sieht die ausgeblendete Zeile NICHT', !before.includes(hidden.$id))
  check('öffentlich: Gast sieht die Moderations-Zeile NICHT', !before.includes(moderative.$id))

  // ── Richtung 1: öffentlich → nur für Mitglieder ───────────────────────────
  const closedCount = await flip('comments', 'members')
  check('Umzug nach members fasst GENAU die veröffentlichte Zeile an', closedCount === 1, `(${closedCount})`)

  const afterClose = await guestSees('comments')
  check('geschlossen: Gast sieht NICHTS mehr — auch nicht den Bestand', afterClose.length === 0, `(${afterClose.length})`)

  const closedPerms = await permissionsOf('comments', visible.$id)
  check('geschlossen: die Zeile trägt read(label:<communityId>)', closedPerms.includes(MEMBERS_READ), closedPerms.join(','))
  check('geschlossen: read(any) ist WEG', !closedPerms.includes(PUBLIC_READ), closedPerms.join(','))
  check('geschlossen: die Autoren-Rechte sind unangetastet', closedPerms.includes(Permission.update(Role.user('u-1'))))

  const hiddenPerms = await permissionsOf('comments', hidden.$id)
  check('geschlossen: die ausgeblendete Zeile wurde NICHT aufgemacht', !hiddenPerms.includes(MEMBERS_READ) && !hiddenPerms.includes(PUBLIC_READ), hiddenPerms.join(','))
  const modPerms = await permissionsOf('comments', moderative.$id)
  check('geschlossen: die Moderations-Zeile bleibt unverändert', modPerms.includes(Permission.read(Role.label('admin'))) && !modPerms.includes(MEMBERS_READ))

  // Idempotenz: derselbe Lauf noch einmal darf NICHTS mehr anfassen.
  const again = await flip('comments', 'members')
  check('Umzug ist idempotent (zweiter Lauf ändert nichts)', again === 0, `(${again})`)

  // ── Richtung 2: zurück auf öffentlich ─────────────────────────────────────
  const openCount = await flip('comments', 'public')
  check('Umzug zurück nach public fasst GENAU eine Zeile an', openCount === 1, `(${openCount})`)

  const afterOpen = await guestSees('comments')
  check('wieder öffentlich: Gast sieht den Bestand erneut', afterOpen.includes(visible.$id))
  check('wieder öffentlich: die ausgeblendete Zeile bleibt unsichtbar', !afterOpen.includes(hidden.$id))
  check('wieder öffentlich: die Moderations-Zeile bleibt unsichtbar', !afterOpen.includes(moderative.$id))

  const reopened = await permissionsOf('comments', visible.$id)
  check('wieder öffentlich: exakt der Ausgangszustand der Permissions',
    reopened.slice().sort().join(',') === [PUBLIC_READ, Permission.update(Role.user('u-1'))].sort().join(','),
    reopened.join(','))

  // ── Dieselbe Frage für den Feed, falls der Layer migriert ist ─────────────
  const hasPosts = await admin.listRows({ databaseId, tableId: 'community_posts', queries: [Query.limit(1)] })
    .then(() => true).catch(() => false)
  if (hasPosts) {
    const post = await seed('community_posts', {
      type: 'text', title: 'Bestands-Beitrag', body: 'Text', status: 'published',
      authorId: 'u-1', authorName: 'A', publishedAt: new Date().toISOString(),
      scheduledAt: null, pollOptions: null, pollEndsAt: null,
      upvotes: 0, downvotes: 0, score: 0, communityId: COMMUNITY,
    }, [PUBLIC_READ])
    check('posts: Gast sieht den veröffentlichten Beitrag', (await guestSees('community_posts')).includes(post.$id))
    await flip('community_posts', 'members')
    check('posts: geschlossen ⇒ Gast sieht nichts', (await guestSees('community_posts')).length === 0)
    await flip('community_posts', 'public')
    check('posts: wieder offen ⇒ Gast sieht den Beitrag', (await guestSees('community_posts')).includes(post.$id))
  }
  else {
    console.log('↷ community_posts nicht vorhanden — übersprungen (kein platform-Projekt)')
  }

  // ── Und für die TITELBILDER: die Datei muss mitziehen ─────────────────────
  // DER BEFUND (2026-08-02): der Bucket `event-covers` war bucket-weit
  // read("any"). Der Umzug zog die Event-Row brav zu und meldete
  // `complete: true` — das Bild blieb per Roh-URL für jeden abrufbar. Ein
  // Zeilen-Beweis allein hätte das NIE gesehen; deshalb wird hier die Datei
  // selbst angefasst, vor und nach jedem Umschalten.
  const hasEvents = await admin.listRows({ databaseId, tableId: 'events', queries: [Query.limit(1)] })
    .then(() => true).catch(() => false)
  if (hasEvents) {
    const cover = await adminStorage.createFile({
      bucketId: 'event-covers',
      fileId: ID.unique(),
      file: InputFile.fromBuffer(ONE_PIXEL_PNG, 'c18-cover.png'),
      permissions: [PUBLIC_READ],
    })
    createdFiles.push({ bucketId: 'event-covers', id: cover.$id })

    const eventRow = await seed('events', {
      title: 'Bestands-Termin', description: 'Beweis', startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: null, location: null, url: null, capacity: null, attendeeCount: 0,
      status: 'published', organizerId: 'u-1', organizerName: 'A',
      coverFileId: cover.$id, locationType: null, replayUrl: null, address: null, locationNotes: null,
      upvotes: 0, downvotes: 0, score: 0, remindersSentAt: null,
      access: null, priceAmount: null, priceLookupKey: null,
      recurrence: '', seriesId: '', seriesIndex: 0, seriesUntil: null, seriesGeneratedUntil: null,
      communityId: COMMUNITY,
    }, [PUBLIC_READ])

    const coverBucket = { bucketId: 'event-covers', fileIdKey: 'coverFileId' }
    check('events: Gast sieht den veröffentlichten Termin', (await guestSees('events')).includes(eventRow.$id))
    check('events: Gast kann das Titelbild abrufen (Ausgangslage)', await guestCanFetchFile('event-covers', cover.$id))

    await flip('events', 'members', coverBucket)
    check('events: geschlossen ⇒ Gast sieht die Zeile nicht', (await guestSees('events')).length === 0)
    check('events: geschlossen ⇒ Gast kann das TITELBILD nicht mehr abrufen',
      !(await guestCanFetchFile('event-covers', cover.$id)))

    await flip('events', 'public', coverBucket)
    check('events: wieder offen ⇒ Gast sieht den Termin', (await guestSees('events')).includes(eventRow.$id))
    check('events: wieder offen ⇒ das Titelbild ist erneut abrufbar',
      await guestCanFetchFile('event-covers', cover.$id))
  }
  else {
    console.log('↷ events nicht vorhanden — übersprungen (Layer nicht migriert)')
  }
}
catch (error) {
  // LAUT scheitern. Ohne diesen Zweig würde `finally` mit process.exit() den
  // Fehler verschlucken und das Skript meldete „alles grün" — genau die Sorte
  // Beweis, die schlimmer ist als keiner.
  failed++
  console.error('\n✗ Abbruch mit Fehler:', error)
}
finally {
  for (const { tableId, id } of created) {
    await admin.deleteRow({ databaseId, tableId, rowId: id }).catch(() => {})
  }
  for (const { bucketId, id } of createdFiles) {
    await adminStorage.deleteFile({ bucketId, fileId: id }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen (${created.length} Test-Rows, ${createdFiles.length} Test-Datei(en) aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}

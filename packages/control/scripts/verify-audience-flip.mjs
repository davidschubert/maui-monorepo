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
 * ABGEDECKTE LAYER: comments · posts · events (inkl. Titelbild-Datei, F28) ·
 * media (Zeile UND Datei — seit dem Pool-Umzug 2026-08-02; `media` ist der
 * einzige Layer, der sich MIT `bucket` in der C18-Registry anmeldet).
 * BEWUSST NICHT dabei: `activities`, `notifications` und Presence sind
 * mitglieder-intern BY DESIGN und dürfen von einer öffentlichen Community NIE
 * aufgemacht werden — die Begründung steht in
 * packages/core/server/utils/audienceRepermission.ts. Ebenso `courses`
 * (nie öffentlich) und `pages` (Zeilen ohne Permissions).
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
import { Client, ID, Permission, Query, Role, Storage, TablesDB, Users } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { repermissionRow } from '../../core/shared/communityAudience.ts'
import { coverReadPermissions } from '../../events/shared/coverAudience.ts'

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
const adminUsers = new Users(adminClient)
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
const createdUsers = []
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

/**
 * Und was ein MITGLIED von einer Datei sieht (F28, 2026-08-02).
 *
 * Der Gast-Abruf allein reicht für Titelbilder NICHT: der Befund war ja gerade,
 * dass ein Entwurfs-Cover das MITGLIEDER-Publikum trug, während seine Zeile gar
 * kein Leserecht hatte. Ein Gast ist da draußen — jedes Mitglied der Community
 * aber drin. Deshalb ein echter Sitzungs-Client mit genau dem Label, das die
 * Community vergibt (`Role.label(<communityId>)`), also exakt die Rechte eines
 * gewöhnlichen Mitglieds: kein Key, keine Capability.
 */
let memberStorage = null
async function memberCanFetchFile(bucketId, fileId) {
  if (!memberStorage) return false
  return memberStorage.getFileView({ bucketId, fileId }).then(() => true).catch(() => false)
}

/**
 * Ein Mitglied der Test-Community anlegen (Konto + Label + Sitzung).
 *
 * Braucht `users.read`/`users.write`/`sessions.write` am Schlüssel. Fehlen sie,
 * bricht das Skript ab — bewusst: ohne Mitglieds-Sicht misst dieser Beweis
 * genau die Frage NICHT, für die es ihn gibt (der Gast-Abruf scheiterte auch
 * beim Befund schon).
 */
async function createMemberSession() {
  const user = await adminUsers.create({
    userId: ID.unique(),
    email: `c18-member-${Date.now()}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'C18 Mitglied',
  }).catch((error) => {
    throw new Error(`Mitglieds-Konto nicht anlegbar (Schlüssel braucht users.write/sessions.write): ${error?.message ?? error}`)
  })
  createdUsers.push(user.$id)
  await adminUsers.updateLabels({ userId: user.$id, labels: [COMMUNITY] })
  const session = await adminUsers.createSession({ userId: user.$id })
  memberStorage = new Storage(
    new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret),
  )
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

    /**
     * ── F28: VIER ZUSTÄNDE, ZWEI BETRACHTER ──────────────────────────────
     *
     * Der Abschnitt oben prüft den UMZUG (C18). Hier steht die andere Frage:
     * trägt eine Cover-Datei in JEDEM Zustand ihres Termins genau das Publikum
     * ihrer Zeile — auch dann, wenn das „niemand" ist?
     *
     * DER BEFUND, den das schließt: events-009 gab einem Cover ohne
     * Row-Leserecht (Entwurf) ersatzweise das MITGLIEDER-Publikum, damit die
     * Dashboard-Vorschau nicht ins Leere lief. Ein Gast-Abruf hätte das NIE
     * gesehen — der scheiterte auch vorher. Deshalb misst dieser Abschnitt
     * beides: anonym UND als eingeloggtes Mitglied mit dem Community-Label.
     *
     * Gerechnet wird mit der ECHTEN Regel (`coverReadPermissions` aus
     * packages/events/shared/coverAudience.ts, direkt importiert) — dieselbe
     * Zeile, die die Laufzeit benutzt. Eine Nachbildung könnte grün bleiben,
     * während die Laufzeit etwas anderes tut.
     */
    await createMemberSession()

    const draftCover = await adminStorage.createFile({
      bucketId: 'event-covers',
      fileId: ID.unique(),
      file: InputFile.fromBuffer(ONE_PIXEL_PNG, 'f28-cover.png'),
      permissions: [],
    })
    createdFiles.push({ bucketId: 'event-covers', id: draftCover.$id })

    const draftRow = await seed('events', {
      title: 'F28 Entwurf', description: 'Beweis', startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: null, location: null, url: null, capacity: null, attendeeCount: 0,
      status: 'draft', organizerId: 'u-1', organizerName: 'A',
      coverFileId: draftCover.$id, locationType: null, replayUrl: null, address: null, locationNotes: null,
      upvotes: 0, downvotes: 0, score: 0, remindersSentAt: null,
      access: null, priceAmount: null, priceLookupKey: null,
      recurrence: '', seriesId: '', seriesIndex: 0, seriesUntil: null, seriesGeneratedUntil: null,
      communityId: COMMUNITY,
    }, [])

    /** Zustandswechsel wie in der Laufzeit: Row setzen, Datei der Row angleichen. */
    async function setState(rowPermissions) {
      await admin.updateRow({ databaseId, tableId: 'events', rowId: draftRow.$id, permissions: rowPermissions })
      await adminStorage.updateFile({
        bucketId: 'event-covers', fileId: draftCover.$id,
        permissions: coverReadPermissions(rowPermissions),
      })
    }

    // Die Sitzung selbst muss beweisbar funktionieren — sonst wäre jedes
    // folgende „Mitglied sieht nichts" auch bei einem kaputten Client grün.
    check('F28 Gegenprobe: das Mitglied kann eine für es freigegebene Datei abrufen',
      await memberCanFetchFile('event-covers', cover.$id))

    // ── VORHER: die Regel aus events-009 (Entwurf fällt aufs Mitglieder-
    // Publikum zurück). Genau der Zustand, den F28 als zu offen befunden hat.
    await adminStorage.updateFile({
      bucketId: 'event-covers', fileId: draftCover.$id, permissions: [MEMBERS_READ],
    })
    check('F28 VORHER: Entwurfs-Cover mit Mitglieder-Rückfall — der Gast sieht es nicht',
      !(await guestCanFetchFile('event-covers', draftCover.$id)))
    check('F28 VORHER: …aber JEDES MITGLIED konnte es abrufen (der Befund)',
      await memberCanFetchFile('event-covers', draftCover.$id))

    // ── NACHHER, Zustand 1: Entwurf. Row ohne Leserecht ⇒ Datei ohne.
    await setState([])
    check('F28 Entwurf: der Gast sieht das Titelbild nicht',
      !(await guestCanFetchFile('event-covers', draftCover.$id)))
    check('F28 Entwurf: auch das MITGLIED sieht es nicht mehr',
      !(await memberCanFetchFile('event-covers', draftCover.$id)))
    check('F28 Entwurf: die Datei trägt exakt kein Leserecht',
      (await adminStorage.getFile({ bucketId: 'event-covers', fileId: draftCover.$id })).$permissions.length === 0)

    // ── Zustand 2: veröffentlicht in einer OFFENEN Community.
    await setState([PUBLIC_READ])
    check('F28 veröffentlicht (offen): der Gast sieht das Titelbild',
      await guestCanFetchFile('event-covers', draftCover.$id))
    check('F28 veröffentlicht (offen): das Mitglied auch',
      await memberCanFetchFile('event-covers', draftCover.$id))

    // ── Zustand 3: veröffentlicht in einer GESCHLOSSENEN Community.
    await setState([MEMBERS_READ])
    check('F28 veröffentlicht (nur Mitglieder): der Gast sieht es NICHT',
      !(await guestCanFetchFile('event-covers', draftCover.$id)))
    check('F28 veröffentlicht (nur Mitglieder): das Mitglied schon',
      await memberCanFetchFile('event-covers', draftCover.$id))

    // ── Zustand 4: ZURÜCKGEZOGEN. `withoutPublishedRead` nimmt das Leserecht
    // aus dem Array; die Schreibrechte des Autors bleiben stehen — und die
    // dürfen die Datei NICHT öffnen (die Regel filtert auf `read(`).
    await setState([Permission.update(Role.user('u-1'))])
    check('F28 zurückgezogen: der Gast sieht es nicht mehr',
      !(await guestCanFetchFile('event-covers', draftCover.$id)))
    check('F28 zurückgezogen: das Mitglied auch nicht',
      !(await memberCanFetchFile('event-covers', draftCover.$id)))

    // ── Zustand 5: ABGESAGT. Der Termin behält sein Publikum — die Zusagenden
    // müssen die Absage sehen, also bleibt auch das Bild abrufbar. Das ist der
    // Grund, warum die Regel die PERMISSIONS liest und nie `status`.
    await setState([PUBLIC_READ, Permission.update(Role.user('u-1'))])
    check('F28 abgesagt: das Publikum bleibt, also bleibt das Titelbild abrufbar',
      await guestCanFetchFile('event-covers', draftCover.$id))
  }
  else {
    console.log('↷ events nicht vorhanden — übersprungen (Layer nicht migriert)')
  }

  /**
   * ── DIE MEDIATHEK: derselbe Doppelschutz, anderer Bucket ─────────────────
   *
   * `media` ist der einzige Layer, der sich mit einem `bucket`-Eintrag in der
   * C18-Registry anmeldet (server/plugins/audience-repermission.ts) — sein
   * Leserecht liegt auf ZWEI Dingen, der Zeile UND der Datei. Bis zum
   * Pool-Umzug am 2026-08-02 war das ungeprüft, weil `media` in keiner
   * Pool-App montiert war; jetzt ist es der Layer mit dem größten Schaden bei
   * einem halben Umzug (ein Foto, das per Roh-URL abrufbar bleibt).
   *
   * Geprüft wird deshalb bei JEDEM Schritt beides: was der Gast in der LISTE
   * sieht und was er per Roh-URL aus dem Bucket HOLEN kann.
   */
  const hasMedia = await admin.listRows({ databaseId, tableId: 'media_items', queries: [Query.limit(1)] })
    .then(() => true).catch(() => false)
  if (hasMedia) {
    // Dieselbe Rechnung wie server/utils/mediaPermissions.ts: der
    // Verwaltungs-Read hängt IMMER dran und darf vom Umzug nie verloren gehen.
    const MANAGER_READ = Permission.read(Role.label('admin'))

    const photo = await adminStorage.createFile({
      bucketId: 'media',
      fileId: ID.unique(),
      file: InputFile.fromBuffer(ONE_PIXEL_PNG, 'c18-media.png'),
      permissions: [PUBLIC_READ, MANAGER_READ],
    })
    createdFiles.push({ bucketId: 'media', id: photo.$id })

    const mediaRow = await seed('media_items', {
      title: 'Bestands-Bild', subtitle: '', alt: '', fileId: photo.$id,
      featured: false, published: true, sortOrder: 0, communityId: COMMUNITY,
    }, [PUBLIC_READ, MANAGER_READ])

    // Ein ENTWURF: er trägt gar keine Veröffentlichungs-Permission und darf
    // vom Umzug in KEINER Richtung angefasst werden.
    const draftPhoto = await adminStorage.createFile({
      bucketId: 'media',
      fileId: ID.unique(),
      file: InputFile.fromBuffer(ONE_PIXEL_PNG, 'c18-media-draft.png'),
      permissions: [MANAGER_READ],
    })
    createdFiles.push({ bucketId: 'media', id: draftPhoto.$id })
    const draftRow = await seed('media_items', {
      title: 'Entwurf', subtitle: '', alt: '', fileId: draftPhoto.$id,
      featured: false, published: false, sortOrder: 0, communityId: COMMUNITY,
    }, [MANAGER_READ])

    const mediaBucket = { bucketId: 'media', fileIdKey: 'fileId' }
    check('media: Gast sieht das veröffentlichte Bild in der Liste',
      (await guestSees('media_items')).includes(mediaRow.$id))
    check('media: Gast kann die Datei abrufen (Ausgangslage)',
      await guestCanFetchFile('media', photo.$id))
    check('media: die Entwurfs-Datei ist von vornherein zu',
      !(await guestCanFetchFile('media', draftPhoto.$id)))

    const mediaClosed = await flip('media_items', 'members', mediaBucket)
    check('media: der Umzug fasst GENAU die veröffentlichte Zeile an', mediaClosed === 1, `(${mediaClosed})`)
    check('media: geschlossen ⇒ Gast sieht die Zeile nicht',
      (await guestSees('media_items')).length === 0)
    check('media: geschlossen ⇒ Gast kann die DATEI nicht mehr abrufen',
      !(await guestCanFetchFile('media', photo.$id)))
    check('media: geschlossen ⇒ der Verwaltungs-Read ist erhalten geblieben',
      (await permissionsOf('media_items', mediaRow.$id)).includes(MANAGER_READ))
    check('media: der Entwurf wurde NICHT aufgemacht',
      !(await permissionsOf('media_items', draftRow.$id)).includes(MEMBERS_READ))

    await flip('media_items', 'public', mediaBucket)
    check('media: wieder offen ⇒ Gast sieht das Bild',
      (await guestSees('media_items')).includes(mediaRow.$id))
    check('media: wieder offen ⇒ die Datei ist erneut abrufbar',
      await guestCanFetchFile('media', photo.$id))
    check('media: wieder offen ⇒ die Entwurfs-Datei bleibt zu',
      !(await guestCanFetchFile('media', draftPhoto.$id)))
  }
  else {
    console.log('↷ media_items nicht vorhanden — übersprungen (Layer nicht migriert)')
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
  // Das Test-Mitglied samt Sitzung — sonst bleibt nach jedem Lauf ein Konto mit
  // einem Community-Label in der Instanz stehen.
  for (const userId of createdUsers) {
    await adminUsers.delete({ userId }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen (${created.length} Test-Rows, ${createdFiles.length} Test-Datei(en), ${createdUsers.length} Test-Konto/-Konten aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}

#!/usr/bin/env node
/**
 * activity im Pool — LIVE-DB-Isolationsbeweis + BESTANDS-MESSUNG (Muster:
 * comments/posts/events/courses `verify-pool-isolation.mjs`). Fällig geworden
 * mit dem Umzug von `activity` nach apps/platform (2026-08-02).
 *
 * Der Feed ist der Layer, bei dem die Isolation an ZWEI Stellen hängt, und
 * beide werden hier gemessen:
 *  1. Der SERVER-Weg: `/api/activity` liest über die Datentür, der
 *     communityId-Filter trennt die Ströme.
 *  2. Der REALTIME-Weg: `useActivityFeed` liest DIREKT gegen Appwrite. Dort
 *     greift keine Server-Tür — die harte Grenze sind die ROW-PERMISSIONS, die
 *     `recordActivity()` stempelt (`read(label:<communityId>)` im Pool statt
 *     `read("users")`). Genau das prüft Abschnitt 2 mit einem echten
 *     Sitzungs-Client, der nur das Label EINER Community trägt.
 *
 * Abschnitt 3 misst den BESTAND dieser Instanz: wie viele Feed-Zeilen tragen
 * keine communityId (und sind im Pool damit unsichtbar), und wie weit ist ihr
 * Leserecht. Das ist keine Prüfung mit Soll-Wert, sondern die Zahl, mit der
 * die Entscheidung „Alt-Zeilen wegwerfen" (Kopf von nuxt.config.ts)
 * nachgehalten wird — sie schlägt deshalb nie fehl.
 *
 * Aus packages/activity (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 *   node --env-file=<pool.env>               scripts/verify-pool-isolation.mjs
 *
 * Idempotent + selbst-aufräumend (auch im Fehlerfall). Läuft NUR gegen die in
 * der Env genannte Instanz — nie hartkodiert Prod.
 */
import { Client, ID, Permission, Query, Role, TablesDB, Users } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(adminClient)
const adminUsers = new Users(adminClient)

const TABLE = 'activities'
/** Labels müssen alphanumerisch sein (Appwrite) — deshalb ohne Bindestrich. */
const TA = 'isoactivityta'
const TB = 'isoactivitytb'
const RUN = Date.now()

const created = []
const createdUsers = []
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}

async function seed(communityId, type, permissions) {
  const row = await tablesDB.createRow({
    databaseId, tableId: TABLE, rowId: ID.unique(),
    data: {
      actorId: `u-${communityId}`, actorName: 'Test', type,
      objectType: 'comment', objectId: `iso-${RUN}-${communityId}`,
      link: '/', metadata: JSON.stringify({ run: RUN }), visibility: 'members',
      communityId,
    },
    permissions,
  })
  created.push(row.$id)
  return row
}

/**
 * Ein Mitglied EINER Community: Konto + genau ein Label + echte Sitzung.
 * Das ist der Betrachter, den der Realtime-Stream hat — kein Key, keine
 * Capability, nur `Role.label(<communityId>)`.
 */
async function memberOf(communityId) {
  const user = await adminUsers.create({
    userId: ID.unique(),
    email: `iso-activity-${communityId}-${RUN}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Mitglied ${communityId}`,
  })
  createdUsers.push(user.$id)
  await adminUsers.updateLabels({ userId: user.$id, labels: [communityId] })
  const session = await adminUsers.createSession({ userId: user.$id })
  return new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret))
}

try {
  console.log(`activity-Pool-Isolation gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  // ── 1. Der SERVER-Weg: die Liste der Route, gescopt ───────────────────────
  const rowA = await seed(TA, 'comment.created', [Permission.read(Role.label(TA))])
  const rowB = await seed(TB, 'post.published', [Permission.read(Role.label(TB))])

  const feedFor = tid => tablesDB.listRows({
    databaseId, tableId: TABLE,
    queries: [
      Query.contains('objectId', `iso-${RUN}`),
      Query.equal('communityId', tid),
      Query.orderDesc('$createdAt'),
      Query.limit(25),
    ],
  }).then(r => r.rows)

  const fA = await feedFor(TA)
  const fB = await feedFor(TB)
  check('Feed: A sieht genau 1 Eintrag', fA.length === 1, `(${fA.length})`)
  check('Feed: A sieht NUR eigene', fA.every(r => r.communityId === TA))
  check('Feed: B sieht genau 1 Eintrag', fB.length === 1, `(${fB.length})`)
  check('Feed: B sieht NUR eigene', fB.every(r => r.communityId === TB))

  const mixed = await tablesDB.listRows({
    databaseId, tableId: TABLE,
    queries: [Query.contains('objectId', `iso-${RUN}`), Query.limit(25)],
  })
  check('ohne Scope mischen sich beide Communities (Beweis, dass der Filter nötig ist)',
    mixed.rows.length === 2, `(${mixed.rows.length})`)

  // ── 2. Der REALTIME-Weg: die Row-Permissions sind die harte Grenze ────────
  // Ohne Server-Tür bleibt nur, was Appwrite selbst herausgibt. Ein Mitglied
  // von A trägt `label:A` — es darf die Zeile von B nicht bekommen, auch nicht
  // per Roh-REST und damit auch nicht über den geteilten WebSocket.
  const memberA = await memberOf(TA)
  const seenByA = await memberA.listRows({
    databaseId, tableId: TABLE,
    queries: [Query.contains('objectId', `iso-${RUN}`), Query.limit(25)],
  }).then(r => r.rows.map(row => row.$id)).catch(() => [])

  check('Realtime-Grenze: das Mitglied von A sieht seine eigene Zeile', seenByA.includes(rowA.$id))
  check('Realtime-Grenze: das Mitglied von A sieht die Zeile von B NICHT — auch ohne Filter',
    !seenByA.includes(rowB.$id), seenByA.join(','))

  // Gegenprobe zum ALTEN Publikum: eine Zeile mit `read("users")` (so entstand
  // der Feed VOR C1b) bekäme dasselbe Mitglied sehr wohl zu sehen — obwohl sie
  // einer fremden Community gehört. Das ist der Grund, warum recordActivity()
  // im Pool `Role.label` stempelt, und der Grund, warum Alt-Zeilen NICHT
  // nachträglich in einen Community-Feed geholt werden (Abschnitt 3).
  const legacyB = await seed(TB, 'comment.created', [Permission.read(Role.users())])
  const seenByALegacy = await memberA.listRows({
    databaseId, tableId: TABLE,
    queries: [Query.equal('$id', legacyB.$id), Query.limit(1)],
  }).then(r => r.rows.map(row => row.$id)).catch(() => [])
  check('Gegenprobe: eine Zeile mit dem ALTEN read("users") wäre für JEDEN Angemeldeten lesbar',
    seenByALegacy.includes(legacyB.$id),
    '(wäre sie es nicht, prüfte der Beweis oben nichts)')

  // ── 3. BESTANDS-MESSUNG dieser Instanz (kein Soll-Wert, nur die Zahl) ─────
  console.log('\n— Bestand: Feed-Zeilen ohne communityId (im Pool unsichtbar) —')
  let scanned = 0, unstamped = 0, unstampedWide = 0
  const byType = new Map()
  for (let offset = 0; offset < 10_000; offset += 100) {
    const page = await tablesDB.listRows({
      databaseId, tableId: TABLE, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of page.rows) {
      if (created.includes(row.$id)) continue
      scanned++
      if (typeof row.communityId === 'string' && row.communityId !== '') continue
      unstamped++
      byType.set(row.type, (byType.get(row.type) ?? 0) + 1)
      if (row.$permissions.includes(Permission.read(Role.users()))) unstampedWide++
    }
    if (page.rows.length < 100) break
  }
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(', ')
  console.log(`  ${scanned} Zeilen geprüft · ${unstamped} ohne communityId · davon ${unstampedWide} mit read("users")`)
  if (unstamped > 0) {
    console.log(`  Typen: ${types || '—'}`)
    console.log('  → Im Pool bleiben diese Zeilen unsichtbar (fail-closed). Bewusst so:')
    console.log('    Kopf von packages/activity/nuxt.config.ts.')
  }
}
catch (error) {
  // LAUT scheitern — sonst verschluckt `finally` mit process.exit() den Fehler
  // und das Skript meldet „alles grün".
  failed++
  console.error('\n✗ Abbruch mit Fehler:', error)
}
finally {
  for (const id of created) {
    await tablesDB.deleteRow({ databaseId, tableId: TABLE, rowId: id }).catch(() => {})
  }
  for (const userId of createdUsers) {
    await adminUsers.delete({ userId }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen `
    + `(${created.length} Test-Zeilen, ${createdUsers.length} Test-Konto/-Konten aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}

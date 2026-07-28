/**
 * Migration courses-002: `tenantId` auf allen vier courses-Tabellen.
 *
 * WARUM: courses geht durch die mandantensichere Datentür (core tenantDb) und
 * zieht damit in den Pool ein (Entscheidung 15, DECISION-LOG — nach dem
 * Events-Vorbild, events-006). Die Tür filtert und stempelt über die
 * tenantId-Spalte — ohne Spalte keine Tür (Muster posts-004/events-006).
 *
 * Rein ADDITIV und ruhend: '' / fehlend = Silo-/Einzelbetrieb (comments-App
 * unverändert — dort gibt es keinen Tenant-Kontext, die Tür scopet nicht).
 * Im Pool stempelt die Tür den Mandanten und filtert darauf. BESTAND ohne
 * tenantId wird im Pool nicht gefunden (fail-closed, dieselbe Regel wie
 * posts-004/events-006/rowBelongsToTenant); auf der Pool-Instanz existieren
 * heute keine courses-Rows, ein Backfill wäre Theater.
 *
 * UNIQUE-INDIZES — zwei Sorten, zwei Entscheidungen:
 *
 *  a) `courses.uq_slug` (slug) ZIEHT UM auf `uq_tenant_slug`
 *     (tenantId + slug). Der Schlüssel ist tenant-RELATIV: ein Slug ist ein
 *     von Menschen gewählter Text, und zwei Communities dürfen beide einen
 *     Kurs 'grundkurs' haben. Ohne Umzug wäre der ERSTE Mandant, der einen
 *     Slug belegt, für alle anderen ein 409 — genau der Fehler, den
 *     pages-004 (uq_slug_locale → +tenantId) und comments-015 (uq_tenant_host)
 *     schon geheilt haben. Reihenfolge wie pages-004: erst den tenant-aware
 *     Ersatz anlegen und auf 'available' warten, DANN den alten löschen —
 *     nie ein Fenster ohne Eindeutigkeitsschutz.
 *
 *  b) `enrollments.uq_course_user` (courseId+userId) und
 *     `lesson_progress.uq_lesson_user` (lessonId+userId) BLEIBEN ohne
 *     tenantId. Zitat der Events-Begründung (006-events-tenant.ts):
 *     „`eventId` ist eine global eindeutige Row-Id — anders als host
 *     (comments-015) oder slug (pages-004) kann derselbe Schlüssel nie in
 *     zwei Mandanten kollidieren. Dieselbe Entscheidung wie posts-004
 *     (uq_post_user)." Für courseId/lessonId gilt Wort für Wort dasselbe.
 *
 * Key-Indizes tragen die häufigsten Tür-Abfragen, führend der Mandant:
 *   courses:         status (Katalog-Liste)             → idx_tenant_status
 *   lessons:         courseId+order (Kurs-Gliederung)   → idx_tenant_course_order
 *   enrollments:     courseId+userId (eigene Buchung)   → idx_tenant_enrollment
 *   lesson_progress: courseId+userId (Fortschritt)      → idx_tenant_progress
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer courses
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'

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
async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    // Query.limit ist hier PFLICHT (Falle aus events-006): sobald eine Tabelle
    // >25 Spalten trägt, würde der listColumns-Default (25) die neue Spalte nie
    // zeigen — der Poll liefe in den Timeout, obwohl sie längst 'available' ist.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${tableId}.${key}" wurde nicht verfügbar`)
}
async function waitForIndex(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    const { indexes } = await tablesDB.listIndexes({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    const index = (indexes as unknown as { key: string, status: string }[]).find(i => i.key === key)
    if (index?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Index "${tableId}.${key}" wurde nicht 'available'`)
}

console.log(`Migration courses-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const TARGETS: { table: string, index: string, columns: string[] }[] = [
  { table: 'courses', index: 'idx_tenant_status', columns: ['tenantId', 'status'] },
  { table: 'lessons', index: 'idx_tenant_course_order', columns: ['tenantId', 'courseId', 'order'] },
  { table: 'enrollments', index: 'idx_tenant_enrollment', columns: ['tenantId', 'courseId', 'userId'] },
  { table: 'lesson_progress', index: 'idx_tenant_progress', columns: ['tenantId', 'courseId', 'userId'] },
]

for (const { table, index, columns } of TARGETS) {
  await step(`Column ${table}.tenantId`, () => tablesDB.createVarcharColumn({
    databaseId, tableId: table, key: 'tenantId', size: 36, required: false, xdefault: '',
  }))
  await waitForColumn(table, 'tenantId')
  await step(`Index ${table}.${index}`, () => tablesDB.createIndex({
    databaseId, tableId: table, key: index, type: TablesDBIndexType.Key, columns,
  }))
}

// Slug-Eindeutigkeit pro MANDANT (siehe Kopf, Fall a) — erst der Ersatz UND
// sein 'available', dann der alte Index. Anders herum klaffte ein Fenster ohne
// Eindeutigkeitsschutz.
await step('Unique-Index courses.uq_tenant_slug', () => tablesDB.createIndex({
  databaseId, tableId: 'courses', key: 'uq_tenant_slug',
  type: TablesDBIndexType.Unique, columns: ['tenantId', 'slug'],
}))
// Auch im „existiert bereits"-Fall abwarten: ein noch 'processing'-Ersatz
// schützt nichts, und der nächste Schritt ist destruktiv.
await waitForIndex('courses', 'uq_tenant_slug')

// destruktiv-ok: der alte, NICHT-tenant-aware Unique-Index verschwindet erst,
// NACHDEM der Ersatz verfügbar ist. Daten bleiben unberührt, nur die Constraint
// wird korrekt ersetzt (Muster pages-004).
//
// Kein vorheriges listIndexes als Wächter: dessen Antwort kann aus Appwrites
// Metadaten-Cache stammen und einen längst gelöschten Index noch zeigen (lokal
// genau so beobachtet). deleteIndex selbst ist in 1.9.6 idempotent — ein
// fehlender Index ergibt KEIN 404 —, deshalb ist der Aufruf allein der
// verlässliche Weg und die Meldung bewusst zustands-neutral formuliert.
await tablesDB.deleteIndex({ databaseId, tableId: 'courses', key: 'uq_slug' })
  .catch((error) => { if (!hasCode(error, 404)) throw error })
console.log('✔ alter Unique-Index courses.uq_slug ist weg (gelöscht bzw. schon vorher entfernt)')

console.log('✔ Migration courses-002 fertig')

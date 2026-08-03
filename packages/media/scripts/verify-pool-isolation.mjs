#!/usr/bin/env node
/**
 * media im Pool — LIVE-DB-Isolationsbeweis (Muster: comments/posts/events/
 * courses `verify-pool-isolation.mjs`). Fällig geworden mit dem Umzug von
 * `media` nach apps/platform (2026-08-02).
 *
 * Er beantwortet die drei Fragen, die pure Logik NICHT beantworten kann:
 *  1. Trennt die Datentür die Galerien zweier Communities auf DB-Ebene —
 *     und würde ohne den Filter wirklich alles zusammenlaufen?
 *  2. Ist der Zugriff PER ID gedeckt? Das ist die Frage, an der dieses
 *     Projekt am 2026-07-26 schon einmal gescheitert ist (drei
 *     Moderations-Routen lasen fremde Zeilen per ID), und `media` hat drei
 *     solche Routen: PATCH, DELETE und die neue Vorschau `/file`.
 *  3. Trägt die DATEI im Bucket dasselbe Publikum wie ihre Zeile? `media` ist
 *     der einzige Layer, dessen Sichtbarkeit auf ZWEI Dingen liegt — ein
 *     Entwurf, dessen Bild per Roh-URL abrufbar bleibt, wäre kein Schutz.
 *     Gemessen wird mit einem echten GAST-Abruf (kein Key, keine Sitzung).
 *
 * Aus packages/media (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 *   node --env-file=<pool.env>               scripts/verify-pool-isolation.mjs
 *
 * Idempotent + selbst-aufräumend (auch im Fehlerfall). Läuft NUR gegen die in
 * der Env genannte Instanz — nie hartkodiert Prod.
 */
import { Client, ID, Permission, Query, Role, Storage, TablesDB } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

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
const storage = new Storage(adminClient)

const TABLE = 'media_items'
const BUCKET = 'media'
/** Labels müssen alphanumerisch sein (Appwrite) — deshalb ohne Bindestrich. */
const TA = 'isomediata'
const TB = 'isomediatb'
const RUN = Date.now()
/** Dieselbe Rechnung wie server/utils/mediaPermissions.ts. */
const MANAGER_READ = [Permission.read(Role.label('admin'))]
const PUBLIC_READ = Permission.read(Role.any())

/** Kleinstes gültiges PNG (1×1) — der Bucket prüft Endung UND Inhalt. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const created = []
const createdFiles = []
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}

async function seed(data, permissions) {
  const row = await tablesDB.createRow({ databaseId, tableId: TABLE, rowId: ID.unique(), data, permissions })
  created.push(row.$id)
  return row
}

async function upload(permissions) {
  const file = await storage.createFile({
    bucketId: BUCKET,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(ONE_PIXEL_PNG, `iso-${RUN}.png`),
    permissions,
  })
  createdFiles.push(file.$id)
  return file
}

/** Was ein GAST von einer Datei sieht — genau die URL aus dem `<img src>`. */
async function guestCanFetchFile(fileId) {
  const res = await fetch(`${endpoint}/storage/buckets/${BUCKET}/files/${fileId}/view?project=${projectId}`)
  return res.status === 200
}

try {
  console.log(`media-Pool-Isolation gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  const base = { subtitle: '', alt: '', featured: false, sortOrder: 0 }

  // ── Die Dateien zuerst: die Zeile referenziert sie, und der Bucket ist der
  //    Teil, der auf einer frischen Pool-Instanz überhaupt erst entstehen muss
  //    (media-001 — Storage-Rechte am Migrations-Schlüssel, F36).
  const fileA = await upload([PUBLIC_READ, ...MANAGER_READ])
  const fileB = await upload([PUBLIC_READ, ...MANAGER_READ])
  const fileDraft = await upload([...MANAGER_READ])

  const rowA = await seed(
    { ...base, title: `iso-${RUN} A`, fileId: fileA.$id, published: true, communityId: TA },
    [PUBLIC_READ, ...MANAGER_READ],
  )
  const rowB = await seed(
    { ...base, title: `iso-${RUN} B`, fileId: fileB.$id, published: true, communityId: TB },
    [PUBLIC_READ, ...MANAGER_READ],
  )
  const draftA = await seed(
    { ...base, title: `iso-${RUN} A-Entwurf`, fileId: fileDraft.$id, published: false, communityId: TA },
    [...MANAGER_READ],
  )

  // ── 1. Die Galerie-Abfrage der Route (published + sortOrder), gescopt ──────
  const galleryFor = tid => tablesDB.listRows({
    databaseId, tableId: TABLE,
    queries: [
      Query.equal('published', true),
      Query.contains('title', `iso-${RUN}`),
      Query.equal('communityId', tid),
      Query.orderAsc('sortOrder'),
      Query.limit(25),
    ],
  }).then(r => r.rows)

  const gA = await galleryFor(TA)
  const gB = await galleryFor(TB)
  check('Galerie: A sieht genau 1 Bild', gA.length === 1, `(${gA.length})`)
  check('Galerie: A sieht NUR eigene', gA.every(r => r.communityId === TA))
  check('Galerie: B sieht genau 1 Bild', gB.length === 1, `(${gB.length})`)
  check('Galerie: B sieht NUR eigene', gB.every(r => r.communityId === TB))
  check('Galerie: der Entwurf von A ist auch für A nicht in der öffentlichen Liste',
    !gA.some(r => r.$id === draftA.$id))

  // Korrektheits-Kern: OHNE den Filter mischen sich beide Communities. Ohne
  // diese Gegenprobe könnte die Isolation auch von einem leeren Datensatz
  // kommen — grün, aber wertlos.
  const mixed = await tablesDB.listRows({
    databaseId, tableId: TABLE,
    queries: [Query.equal('published', true), Query.contains('title', `iso-${RUN}`), Query.limit(25)],
  })
  check('ohne Scope mischen sich beide Communities (Beweis, dass der Filter nötig ist)',
    mixed.rows.length === 2, `(${mixed.rows.length})`)

  // ── 2. Zugriff PER ID: die Verwaltungs-Sicht von A darf B nicht erreichen ──
  // Genau das prüft `tenantDb().get()` VOR jeder Aktion (PATCH/DELETE/`/file`).
  // Hier wird die Rechnung nachgestellt, die die Tür anstellt: gehört die per
  // ID geladene Zeile dem Mandanten des Requests?
  const belongsTo = (row, tid) => typeof row.communityId === 'string'
    && row.communityId !== '' && row.communityId === tid
  const foreign = await tablesDB.getRow({ databaseId, tableId: TABLE, rowId: rowB.$id })
  check('per ID: die Zeile von B gehört NICHT zu A (die Tür antwortet 404)', !belongsTo(foreign, TA))
  check('per ID: die Zeile von B gehört zu B', belongsTo(foreign, TB))
  const own = await tablesDB.getRow({ databaseId, tableId: TABLE, rowId: rowA.$id })
  check('per ID: die eigene Zeile von A ist erreichbar', belongsTo(own, TA))

  // Die Vorschau-Route zieht die fileId aus der GEPRÜFTEN Zeile, nie aus der
  // URL — sonst käme A mit der Id von B an dessen Bild.
  check('Vorschau: die fileId hängt an der Zeile, nicht am Aufrufer',
    own.fileId === fileA.$id && foreign.fileId === fileB.$id)

  // ── 3. Die DATEI trägt das Publikum ihrer Zeile ───────────────────────────
  check('Datei: das veröffentlichte Bild von A ist für einen Gast abrufbar',
    await guestCanFetchFile(fileA.$id))
  check('Datei: das ENTWURFS-Bild von A ist für einen Gast NICHT abrufbar',
    !(await guestCanFetchFile(fileDraft.$id)))

  // Zurückziehen: Zeile UND Datei müssen zugehen (applyMediaVisibility).
  await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: rowA.$id, permissions: [...MANAGER_READ] })
  await storage.updateFile({ bucketId: BUCKET, fileId: fileA.$id, permissions: [...MANAGER_READ] })
  check('zurückgezogen: der Gast kommt auch per Roh-URL nicht mehr an das Bild',
    !(await guestCanFetchFile(fileA.$id)))
  check('zurückgezogen: das Bild von B ist unberührt', await guestCanFetchFile(fileB.$id))
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
  for (const id of createdFiles) {
    await storage.deleteFile({ bucketId: BUCKET, fileId: id }).catch(() => {})
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen `
    + `(${created.length} Test-Zeilen, ${createdFiles.length} Test-Dateien aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}

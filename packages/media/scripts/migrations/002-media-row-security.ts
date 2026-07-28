/**
 * Migration media-002: Row-/File-Level-Sichtbarkeit für die Medien-Galerie
 * (Audit-Befund B3).
 *
 * media-001 legte `media_items` mit permissions [read(any)] + rowSecurity=false
 * und den Bucket `media` mit [read(any)] + fileSecurity=false an. Der EINZIGE
 * Schutz für Entwürfe war der `published`-Filter der GET-Route — wer die
 * Appwrite-REST-API direkt fragt, bekam alle unveröffentlichten Einträge samt
 * fileId und das Bild dazu.
 *
 * Diese Migration zieht das Muster des events-Layers nach (rowSecurity=true,
 * read(any) erst beim Veröffentlichen) und schließt die Datei-Seite gleich mit:
 * ein Schutz, den man mit der fileId umgehen kann, ist keiner.
 *
 *  (a) Table `media_items`: permissions [] + rowSecurity=true
 *  (b) Bucket `media`: permissions [] + fileSecurity=true (übrige Bucket-
 *      Einstellungen werden vorher gelesen und unverändert zurückgeschrieben —
 *      updateBucket setzt weggelassene Felder sonst auf API-Defaults)
 *  (c) Bestand nachziehen: veröffentlichte Rows UND ihre Dateien bekommen
 *      read(any) + Verwaltungs-Read, unveröffentlichte NUR den Verwaltungs-Read
 *  (d) Dateien ohne Row (Waisen früherer Fehlläufe) werden zugesperrt
 *
 * Keine neuen Columns ⇒ kein 'available'-Polling und keine Indizes nötig.
 * Idempotent: erneutes Ausführen schreibt nur, was abweicht (409 → skip).
 *
 *   pnpm migrate --app <app> --layer media
 */
import { Client, Compression, Permission, Query, Role, Storage, TablesDB, type Models } from 'node-appwrite'

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

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

const TABLE_ID = 'media_items'
const BUCKET_ID = 'media'
const PAGE = 100

/**
 * Gleiche Rechnung wie zur Laufzeit (server/utils/mediaPermissions.ts) —
 * bewusst dupliziert: Migrationen laufen als eigenständige Node-Skripte ohne
 * Nitro-Auto-Imports. Ändert sich die Regel, ändern sich beide Stellen.
 */
const MANAGER_READ = [Permission.read(Role.label('admin'))]
const permissionsFor = (published: boolean): string[] =>
  published ? [Permission.read(Role.any()), ...MANAGER_READ] : [...MANAGER_READ]

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

/** Das Bucket-Modell liefert `compression` als String, updateBucket will das Enum. */
function asCompression(value: string): Compression {
  return (Object.values(Compression) as string[]).includes(value)
    ? value as Compression
    : Compression.None
}

/** Mengengleichheit — Permission-Arrays haben keine garantierte Reihenfolge. */
function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(entry => set.has(entry))
}

interface MediaRow extends Models.Row {
  fileId: string
  published: boolean
}

console.log(`Migration media-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// (a) Table: kein Table-weites read(any) mehr, die Row entscheidet.
const table = await tablesDB.getTable({ databaseId, tableId: TABLE_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!table) {
  console.log(`↷ Table ${TABLE_ID} fehlt — media-001 zuerst ausführen`)
  process.exit(0)
}
if (table.rowSecurity && table.$permissions.length === 0) {
  console.log(`↷ Table ${TABLE_ID}: rowSecurity bereits aktiv`)
}
else {
  await step(`Table ${TABLE_ID}: rowSecurity=true, permissions=[]`, () => tablesDB.updateTable({
    databaseId,
    tableId: TABLE_ID,
    name: table.name,
    permissions: [],
    rowSecurity: true,
    enabled: table.enabled,
  }))
}

// (b) Bucket: fileSecurity statt Bucket-weitem read(any). Übrige Felder werden
// zurückgeschrieben — updateBucket setzt Weggelassenes auf API-Defaults.
const bucket = await storage.getBucket({ bucketId: BUCKET_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!bucket) {
  console.log(`↷ Bucket ${BUCKET_ID} fehlt — media-001 zuerst ausführen`)
}
else if (bucket.fileSecurity && bucket.$permissions.length === 0) {
  console.log(`↷ Bucket ${BUCKET_ID}: fileSecurity bereits aktiv`)
}
else {
  await step(`Bucket ${BUCKET_ID}: fileSecurity=true, permissions=[]`, () => storage.updateBucket({
    bucketId: BUCKET_ID,
    name: bucket.name,
    permissions: [],
    fileSecurity: true,
    enabled: bucket.enabled,
    maximumFileSize: bucket.maximumFileSize,
    allowedFileExtensions: bucket.allowedFileExtensions,
    compression: asCompression(bucket.compression),
    encryption: bucket.encryption,
    antivirus: bucket.antivirus,
    transformations: bucket.transformations,
  }))
}

// (c) Bestand nachziehen — Rows UND ihre Dateien.
let cursor: string | null = null
let rows = 0
let rowsFixed = 0
let filesFixed = 0
const knownFileIds = new Set<string>()

for (;;) {
  const page: Models.RowList<MediaRow> = await tablesDB.listRows<MediaRow>({
    databaseId,
    tableId: TABLE_ID,
    queries: [Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
  })
  if (page.rows.length === 0) break

  for (const row of page.rows) {
    rows++
    knownFileIds.add(row.fileId)
    const wanted = permissionsFor(row.published)

    if (!samePermissions(row.$permissions, wanted)) {
      await tablesDB.updateRow({ databaseId, tableId: TABLE_ID, rowId: row.$id, permissions: wanted })
      rowsFixed++
    }

    const file = await storage.getFile({ bucketId: BUCKET_ID, fileId: row.fileId }).catch((error) => {
      if (hasCode(error, 404)) return null
      throw error
    })
    if (!file) {
      console.warn(`⚠ Datei ${row.fileId} zu Eintrag ${row.$id} fehlt im Bucket — übersprungen`)
      continue
    }
    if (!samePermissions(file.$permissions, wanted)) {
      await storage.updateFile({ bucketId: BUCKET_ID, fileId: row.fileId, permissions: wanted })
      filesFixed++
    }
  }

  cursor = page.rows.at(-1)?.$id ?? null
  if (page.rows.length < PAGE) break
}
console.log(`✔ Bestand: ${rows} Einträge geprüft (${rowsFixed} Rows, ${filesFixed} Dateien angepasst)`)

// (d) Waisen im Bucket zusperren — eine Datei ohne Row ist über die App nicht
// erreichbar, mit read(any) aber weiterhin über die REST-API.
if (bucket) {
  let fileCursor: string | null = null
  let orphans = 0
  for (;;) {
    const page: Models.FileList = await storage.listFiles({
      bucketId: BUCKET_ID,
      queries: [Query.limit(PAGE), ...(fileCursor ? [Query.cursorAfter(fileCursor)] : [])],
    })
    if (page.files.length === 0) break
    for (const file of page.files) {
      if (knownFileIds.has(file.$id)) continue
      if (file.$permissions.length === 0) continue
      await storage.updateFile({ bucketId: BUCKET_ID, fileId: file.$id, permissions: [] })
      orphans++
    }
    fileCursor = page.files.at(-1)?.$id ?? null
    if (page.files.length < PAGE) break
  }
  console.log(`✔ Verwaiste Dateien zugesperrt: ${orphans}`)
}

console.log('✔ Migration media-002 fertig')

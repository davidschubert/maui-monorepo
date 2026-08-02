/**
 * Migration events-009: die TITELBILDER folgen ihrem Termin (Audit-Befund
 * vom 2026-08-02, C18-Lüge).
 *
 * events-002 legte den Bucket `event-covers` mit `permissions: [read("any")]`
 * und `fileSecurity: false` an. Damit hing das Leserecht am BUCKET, nicht an
 * der Datei — und der C18-Bestands-Umzug („nur für Mitglieder") zog zwar jede
 * Event-ROW auf `read(label:<communityId>)` und meldete `complete: true`,
 * während jedes Cover per Roh-URL für die ganze Welt abrufbar blieb. Ein
 * Schutz, den man mit der fileId umgehen kann, ist keiner (dieselbe Begründung
 * wie media-002, das die Galerie schon geschlossen hat).
 *
 *  (a) Bucket `event-covers`: permissions [] + fileSecurity=true. Die übrigen
 *      Bucket-Einstellungen werden vorher GELESEN und unverändert
 *      zurückgeschrieben — `updateBucket` setzt Weggelassenes sonst auf
 *      API-Defaults (in events-002 stünden dann Virenscan und Verschlüsselung
 *      still).
 *  (b) Bestand nachziehen: jede Datei bekommt die READ-Permissions IHRER Row.
 *      Trägt die Row keine (Entwurf), bekommt die Datei das Mitglieder-
 *      Publikum der Community — dieselbe Regel wie zur Laufzeit
 *      (server/utils/eventCovers.ts). Bewusst dupliziert: Migrationen laufen
 *      als eigenständige Node-Skripte ohne Nitro-Auto-Imports; ändert sich die
 *      Regel, ändern sich beide Stellen.
 *  (c) Dateien OHNE Row (Waisen aus fehlgeschlagenen Uploads) werden
 *      zugesperrt (`permissions: []`) — vorher waren sie öffentlich.
 *
 * FAIL-LOUD: Fehler werden gezählt und am Ende benannt; bleibt einer stehen,
 * endet der Lauf mit Exit-Code 1. Ein „fertig" auf einem halb umgezogenen
 * Bestand wäre die Sorte Beweis, die schlimmer ist als keiner.
 *
 * Keine neuen Columns ⇒ kein 'available'-Polling und keine Indizes.
 * Idempotent: ein zweiter Lauf schreibt nur, was abweicht.
 *
 *   pnpm migrate --app <app> --layer events
 *
 * ⚠️ REIHENFOLGE IN PROD: ERST den Code deployen, DANN migrieren (wie
 * media-002). Grund: nach der Migration vergibt nur der NEUE Code Datei-Rechte.
 * Läuft dann noch der alte, bekäme ein frisch hochgeladenes Cover gar keine —
 * die Event-Seite zeigte ein 404-Bild. Andersherum gibt es kein Fenster: mit
 * neuem Code vor der Migration werden die Rechte schon gestempelt, sie wirken
 * nur noch nicht.
 * Betroffen ist JEDE Instanz mit events (platform und comments).
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

const TABLE_ID = 'events'
const BUCKET_ID = 'event-covers'
const PAGE = 100

interface EventCoverRow extends Models.Row {
  coverFileId: string | null
  communityId?: string
}

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Das Bucket-Modell liefert `compression` als String, updateBucket will das Enum. */
function asCompression(value: string): Compression {
  return (Object.values(Compression) as string[]).includes(value) ? value as Compression : Compression.None
}

/** Mengengleichheit — Permission-Arrays haben keine garantierte Reihenfolge. */
function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(entry => set.has(entry))
}

/**
 * Gleiche Rechnung wie zur Laufzeit (server/utils/eventCovers.ts): die
 * READ-Einträge der Row; ohne solche (Entwurf) das Mitglieder-Publikum.
 * Im Silo (`communityId` leer) ist das `Role.users()` — dieselbe Zeile wie in
 * `tenantReadRolesFor`.
 */
function coverPermissionsFor(row: EventCoverRow): string[] {
  const reads = (row.$permissions ?? []).filter(permission => permission.startsWith('read('))
  if (reads.length > 0) return reads
  return row.communityId
    ? [Permission.read(Role.label(row.communityId))]
    : [Permission.read(Role.users())]
}

console.log(`Migration events-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

let failures = 0

// ── (a) Bucket: fileSecurity statt bucket-weitem read(any) ──────────────────
const bucket = await storage.getBucket({ bucketId: BUCKET_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!bucket) {
  console.log(`↷ Bucket ${BUCKET_ID} fehlt — events-002 zuerst ausführen. Nichts zu tun.`)
  process.exit(0)
}
if (bucket.fileSecurity && bucket.$permissions.length === 0) {
  console.log(`↷ Bucket ${BUCKET_ID}: fileSecurity bereits aktiv`)
}
else {
  await storage.updateBucket({
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
  })
  console.log(`✔ Bucket ${BUCKET_ID}: fileSecurity=true, permissions=[]`)
}

// ── (b) Bestand nachziehen: jede Datei bekommt die Rechte IHRER Row ─────────
let cursor: string | null = null
let rows = 0
let filesFixed = 0
const knownFileIds = new Set<string>()

for (;;) {
  const page: Models.RowList<EventCoverRow> = await tablesDB.listRows<EventCoverRow>({
    databaseId,
    tableId: TABLE_ID,
    queries: [Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
  })
  if (page.rows.length === 0) break

  for (const row of page.rows) {
    rows++
    if (!row.coverFileId) continue
    knownFileIds.add(row.coverFileId)

    const wanted = coverPermissionsFor(row)
    const file = await storage.getFile({ bucketId: BUCKET_ID, fileId: row.coverFileId }).catch((error) => {
      if (hasCode(error, 404)) return null
      throw error
    })
    if (!file) {
      console.warn(`⚠ Datei ${row.coverFileId} zu Event ${row.$id} fehlt im Bucket — übersprungen`)
      continue
    }
    if (samePermissions(file.$permissions, wanted)) continue
    try {
      await storage.updateFile({ bucketId: BUCKET_ID, fileId: row.coverFileId, permissions: wanted })
      filesFixed++
    }
    catch (error) {
      failures++
      console.error(`✗ Datei ${row.coverFileId} (Event ${row.$id}) konnte nicht umgezogen werden:`, error)
    }
  }

  cursor = page.rows.at(-1)?.$id ?? null
  if (page.rows.length < PAGE) break
}
console.log(`✔ ${rows} Event-Zeile(n) gelesen, ${filesFixed} Datei(en) umgezogen`)

// ── (c) Waisen zusperren ────────────────────────────────────────────────────
let orphans = 0
let fileCursor: string | null = null
for (;;) {
  const list = await storage.listFiles({
    bucketId: BUCKET_ID,
    queries: [Query.limit(PAGE), ...(fileCursor ? [Query.cursorAfter(fileCursor)] : [])],
  })
  if (list.files.length === 0) break

  for (const file of list.files) {
    if (knownFileIds.has(file.$id)) continue
    if (file.$permissions.length === 0) continue
    try {
      await storage.updateFile({ bucketId: BUCKET_ID, fileId: file.$id, permissions: [] })
      orphans++
    }
    catch (error) {
      failures++
      console.error(`✗ Waise ${file.$id} konnte nicht zugesperrt werden:`, error)
    }
  }

  fileCursor = list.files.at(-1)?.$id ?? null
  if (list.files.length < PAGE) break
}
console.log(`✔ ${orphans} verwaiste Datei(en) zugesperrt`)

if (failures > 0) {
  console.error(`✗ Migration events-009 UNVOLLSTÄNDIG — ${failures} Datei(en) stehen noch offen. Erneut ausführen.`)
  process.exit(1)
}
console.log('✔ Migration events-009 fertig — Titelbilder folgen ihrem Termin.')

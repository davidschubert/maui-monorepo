/**
 * Migration system-029: Table `community_handles` — der @name je Community.
 *
 * Warum im system-Layer und nicht bei posts: der Handle ist keine Eigenschaft
 * von Beiträgen. Kommentare und Beiträge brauchen dieselben Namen, und ein
 * `comments`, das dafür von `posts` abhängen müsste, wäre die Kreuz-
 * Abhängigkeit, die A14 verbietet. system läuft auf JEDER Instanz mit — Pool,
 * Control Plane und jede Einzel-Instanz —, und genau das braucht ein Handle:
 * auch die Silo-App will Erwähnungen. Vertrag + Typ:
 * packages/core/shared/types/handle.ts.
 *
 * ── DER EINDEUTIGE SCHLÜSSEL TRÄGT DEN MANDANTEN ──────────────────────────
 * `(communityId, handleLower)` — Davids Entscheidung 1: eindeutig JE
 * COMMUNITY, nicht instanzweit. Das ist zugleich die Pool-Unique-Regel aus
 * CLAUDE.md: ein Handle ist ein tenant-RELATIVER Schlüssel (wie Host und
 * Slug), im Gegensatz zu Row-Id-basierten Schlüsseln. Ohne `communityId`
 * hätte die erste Community entschieden, welche Namen in allen anderen noch
 * frei sind.
 *
 * VERGLICHEN WIRD KLEIN, ANGEZEIGT WIE GEWÄHLT: deshalb zwei Spalten.
 * `handleLower` trägt den Index (`@David` und `@david` kollidieren),
 * `handle` ist die Schreibweise, die der Mensch gewählt hat.
 *
 * ── ALTE NAMEN BLEIBEN STEHEN ─────────────────────────────────────────────
 * Eine Änderung legt eine NEUE Zeile an und setzt die alte auf
 * `status: 'former'` — sie wird NICHT gelöscht. Zwei Dinge auf einmal:
 * der alte Name bleibt belegt (derselbe Unique-Index sperrt ihn), UND eine
 * Erwähnung in einem zwei Jahre alten Beitrag zeigt weiterhin auf denselben
 * Menschen. Eine reine Sperrliste hätte nur das Erste gekonnt.
 * Folge fürs Lesen: eine Auflösung `handleLower → userId` darf den Status
 * NICHT filtern (sonst laufen alte Erwähnungen ins Leere); eine Auflösung
 * „wie heisst dieser Mensch JETZT" filtert auf 'active'.
 *
 * ── INDIZES ───────────────────────────────────────────────────────────────
 *  - `uq_community_handle` (unique, communityId+handleLower): die Vergabe
 *    schreibt blind, ein 409 heisst „schon vergeben". Bedient zugleich die
 *    häufigste Leseabfrage (Erwähnung auflösen) als Präfix.
 *  - `idx_community_user` (key, communityId+userId+status): „welchen Namen
 *    hat dieser Mensch hier" — die zweite und letzte Abfrage. `status` hängt
 *    hinten dran, damit 'active' ohne zweiten Zugriff herausfällt.
 * Ein dritter Index wäre Schreiblast ohne Leser.
 *
 * PERMISSIONS: keine Tabellen-Rechte, `rowSecurity: true` — die Zeilen tragen
 * ihr Publikum selbst (`read(label:<communityId>)` im Pool, `read(users)` im
 * Silo, gestempelt von der Datentür). Ein Handle ist kein Geheimnis, aber
 * `read(any)` wäre die Mitgliederliste jeder Community für jeden Besucher.
 *
 * Idempotent (409 → skip). Index-Anlage NUR über die Fabrik (F19).
 *
 *   pnpm migrate --app <app> --layer system
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const TABLE = 'community_handles'

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
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
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
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-029 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId: db,
  tableId: TABLE,
  name: 'Community Handles (@name)',
  // Keine Tabellen-Rechte: das Publikum steht an der Zeile (siehe Kopf).
  permissions: [],
  rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

// 36 = Länge einer Appwrite-Id; '' ist der gültige Wert im Silo/Single-Tenant.
await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))

await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))

// 24 = HANDLE_MAX_LENGTH (packages/core/shared/handles.ts). Absichtlich NICHT
// grosszügiger: die Spalte ist die letzte Sperre, wenn eine künftige Route
// die Prüfung vergisst.
for (const key of ['handle', 'handleLower']) {
  await columnStep(`Column ${TABLE}.${key}`, key, cols, () => tablesDB.createVarcharColumn({
    databaseId: db, tableId: TABLE, key, size: 24, required: false, xdefault: '',
  }))
}

// 'active' | 'former' — siehe Kopf. Kein Enum-Typ, weil ein späterer dritter
// Wert sonst eine Schema-Änderung statt einer Code-Änderung wäre.
await columnStep(`Column ${TABLE}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'status', size: 16, required: false, xdefault: 'active',
}))

// ISO-Zeitstempel; '' heisst „noch nie geändert" und verbraucht die
// Sperrfrist nicht (handleChangeAvailableAt gibt dafür null zurück).
await columnStep(`Column ${TABLE}.changedAt`, 'changedAt', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'changedAt', size: 32, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

// Die eigentliche Mechanik der Vergabe: blind anlegen, 409 heisst „vergeben".
// Sperrt aktive UND frühere Namen gleichermassen, weil beide Zeilen bleiben.
await indexStep(`Unique-Index ${TABLE}.uq_community_handle`, {
  tableId: TABLE, key: 'uq_community_handle', type: TablesDBIndexType.Unique,
  columns: ['communityId', 'handleLower'],
})

// „Welchen Namen hat dieser Mensch hier?" — die zweite und letzte Abfrage.
await indexStep(`Index ${TABLE}.idx_community_user`, {
  tableId: TABLE, key: 'idx_community_user', type: TablesDBIndexType.Key,
  columns: ['communityId', 'userId', 'status'],
})

console.log('✔ Migration system-029 fertig')

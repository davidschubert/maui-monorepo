/**
 * Migration pages-002: `pages.body` VARCHAR(14000) → MEDIUMTEXT.
 *
 * Warum: VARCHAR zählt voll ins MariaDB-Zeilenbudget (~65 KB/Zeile ÷ 4 B/
 * Zeichen) — echte Rechtstexte (Datenschutz!) sprengen 14.000 Zeichen locker.
 * MEDIUMTEXT liegt off-row (nur ein Pointer zählt) → praktisch kein Limit
 * mehr; die App begrenzt weiterhin per Zod (MAX_PAGE_BODY, SSR-Schutz).
 *
 * Appwrite kann Spaltentypen nicht in-place ändern → Tanz MIT Datenerhalt:
 *   1. Temp-Spalte body_tmp (mediumtext) anlegen
 *   2. body → body_tmp kopieren (alle Rows)
 *   3. body (varchar) löschen
 *   4. body als mediumtext neu anlegen
 *   5. body_tmp → body zurückkopieren
 *   6. body_tmp löschen
 * Idempotent/wiederaufnehmbar: jeder Schritt prüft den Ist-Zustand — ein
 * Abbruch mittendrin wird beim Re-Run sauber fortgesetzt (Daten stehen dann
 * in body_tmp). Aufruf über den Runner: pnpm migrate --app <app> --layer pages
 */
import { Client, Query, TablesDB } from 'node-appwrite'

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
const TABLE = 'pages'

interface ColumnInfo { key: string, type: string, status: string, size?: number }

async function getColumns(): Promise<ColumnInfo[]> {
  const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId: TABLE })
  return columns as unknown as ColumnInfo[]
}
function findCol(cols: ColumnInfo[], key: string): ColumnInfo | undefined {
  return cols.find(c => c.key === key)
}
// mediumtext-Spalten haben keinen size-Parameter; varchar schon
function isMediumtext(col: ColumnInfo): boolean {
  return col.type === 'mediumtext' || (col.type !== 'varchar' && col.size === undefined)
}
async function waitAvailable(key: string) {
  for (let i = 0; i < 60; i++) {
    const col = findCol(await getColumns(), key)
    if (col?.status === 'available') return
    if (col?.status === 'failed' || col?.status === 'stuck') throw new Error(`Spalte ${key}: Status ${col.status}`)
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Spalte ${key} wurde nicht verfügbar`)
}
async function waitGone(key: string) {
  for (let i = 0; i < 60; i++) {
    if (!findCol(await getColumns(), key)) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Spalte ${key} wurde nicht gelöscht`)
}
async function createMediumtext(key: string) {
  try {
    await tablesDB.createMediumtextColumn({ databaseId: databaseId!, tableId: TABLE, key, required: false, xdefault: '' })
  }
  catch {
    // Manche MariaDB-Setups erlauben kein DEFAULT auf TEXT — ohne Default erneut
    await tablesDB.createMediumtextColumn({ databaseId: databaseId!, tableId: TABLE, key, required: false })
  }
  await waitAvailable(key)
}
/** from → to kopieren (nur Rows, in denen `to` leer und `from` gefüllt ist — re-run-sicher). */
async function copyColumn(from: string, to: string) {
  let copied = 0
  for (let offset = 0; ; offset += 100) {
    const { rows } = await tablesDB.listRows<Record<string, unknown> & { $id: string }>({
      databaseId: databaseId!, tableId: TABLE, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of rows) {
      const source = (row[from] as string | null) ?? ''
      const target = (row[to] as string | null) ?? ''
      if (source !== '' && target === '') {
        await tablesDB.updateRow({ databaseId: databaseId!, tableId: TABLE, rowId: row.$id, data: { [to]: source } })
        copied++
      }
    }
    if (rows.length < 100) break
  }
  console.log(`  ↳ ${copied} Rows ${from} → ${to} kopiert`)
}

console.log(`Migration pages-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

let cols = await getColumns()
const body = findCol(cols, 'body')
const tmp = findCol(cols, 'body_tmp')

if (body && isMediumtext(body) && !tmp) {
  console.log('↷ pages.body ist bereits mediumtext — nichts zu tun')
}
else {
  // 1+2: Daten in die Temp-Spalte retten (nur nötig, solange body noch varchar ist)
  if (body && !isMediumtext(body)) {
    if (!tmp) {
      console.log('✔ Temp-Spalte body_tmp (mediumtext) anlegen')
      await createMediumtext('body_tmp')
    }
    console.log('✔ Inhalte body → body_tmp sichern')
    await copyColumn('body', 'body_tmp')
    // 3: alte varchar-Spalte weg
    console.log('✔ body (varchar) löschen')
    await tablesDB.deleteColumn({ databaseId, tableId: TABLE, key: 'body' })
    await waitGone('body')
  }
  // 4: body als mediumtext (neu) — auch der Wiederaufnahme-Pfad landet hier
  cols = await getColumns()
  if (!findCol(cols, 'body')) {
    console.log('✔ body als mediumtext neu anlegen')
    await createMediumtext('body')
  }
  // 5+6: zurückkopieren + aufräumen
  if (findCol(await getColumns(), 'body_tmp')) {
    console.log('✔ Inhalte body_tmp → body zurückkopieren')
    await copyColumn('body_tmp', 'body')
    console.log('✔ body_tmp löschen')
    await tablesDB.deleteColumn({ databaseId, tableId: TABLE, key: 'body_tmp' })
  }
}

console.log('✔ Migration pages-002 fertig')

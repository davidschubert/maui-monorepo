/**
 * Migration control-029: E8 Etappe 3, Phase 1 — `tenants` → `communities`,
 * `tenant_plans` → `community_plans` (ERWEITERN, noch nicht löschen).
 *
 * Davids Entscheidung (UMBENENNUNG-AUF-COMMUNITY.md): jede Sache heißt im
 * Code wie in der Oberfläche — die Kunden-Objekte sind Communities. Appwrite
 * kann nicht umbenennen ⇒ Muster control-022/023: neue Tabelle, Zeilen MIT
 * ihrer Row-Id kopieren (die $id IST die communityId — sie steckt in jedem
 * Site-Label und in jeder communityId-Spalte der Runtime-Projekte; eine neue
 * Id würde Kundendaten lautlos verwaisen), Code umstellen, alte Tabelle
 * später löschen (control-030, nach den Isolationsbeweisen).
 *
 * GENERISCH statt abgetippt: Spalten UND Indizes werden aus der QUELLE
 * gespiegelt (listColumns/listIndexes) — die Quelle ist die Wahrheit, ein
 * Transkriptionsfehler ist strukturell unmöglich. Nur die drei Typen der
 * tenants-Welt (varchar/boolean/datetime) kommen vor; ein vierter bricht laut.
 *
 * UPSERT statt Skip: zwischen diesem Lauf und dem Code-Deploy schreibt der
 * alte Code weiter in `tenants` (z. B. ein Checkout verankert
 * stripeCustomerId). Der Lauf wird deshalb NACH dem Deploy WIEDERHOLT und
 * überschreibt dann jede Ziel-Zeile mit dem Quell-Stand — Drift kann nicht
 * überleben. Erst danach (und nach den Beweisen) fällt die Quelle.
 *
 *   pnpm migrate --app control --layer control
 */
import { Client, Query, TablesDB, type TablesDBIndexType, type Models } from 'node-appwrite'

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

async function waitForTable(tableId: string) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available') && indexes.every(i => i.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`"${tableId}" wurde nicht vollständig verfügbar`)
}

interface AnyColumn { key: string, type: string, required: boolean, size?: number, default?: unknown }

async function mirrorTable(source: string, target: string, targetName: string) {
  console.log(`— ${source} → ${target} —`)
  const src = await tablesDB.listColumns({ databaseId: db, tableId: source, queries: [Query.limit(200)] }).catch((error) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (!src) {
    console.log(`↷ Quelle ${source} existiert nicht — übersprungen`)
    return
  }

  await step(`Table ${target}`, () => tablesDB.createTable({
    databaseId: db, tableId: target, name: targetName, permissions: [], rowSecurity: false,
  }))

  for (const raw of src.columns as unknown as AnyColumn[]) {
    const base = { databaseId: db, tableId: target, key: raw.key, required: raw.required }
    // Appwrite meldet Strings je nach Version als 'string' ODER 'varchar'
    // (lokal 1.9.6: 'varchar' — am 2026-07-31 fail-loud erwischt).
    if (raw.type === 'string' || raw.type === 'varchar') {
      await step(`Column ${target}.${raw.key}`, () => tablesDB.createVarcharColumn({
        ...base, size: raw.size ?? 255,
        ...(raw.required ? {} : { xdefault: (raw.default as string | null) ?? undefined }),
      }))
    }
    else if (raw.type === 'boolean') {
      await step(`Column ${target}.${raw.key}`, () => tablesDB.createBooleanColumn({
        ...base,
        ...(raw.required ? {} : { xdefault: (raw.default as boolean | null) ?? undefined }),
      }))
    }
    else if (raw.type === 'datetime') {
      await step(`Column ${target}.${raw.key}`, () => tablesDB.createDatetimeColumn(base))
    }
    else {
      throw new Error(`Unerwarteter Spaltentyp "${raw.type}" (${source}.${raw.key}) — Migration erweitern statt raten.`)
    }
  }
  await waitForTable(target)

  // Zeilen MIT ihrer Row-Id — Upsert: existierende Ziel-Zeilen werden mit dem
  // Quell-Stand ÜBERSCHRIEBEN (Drift-Nachlauf nach dem Deploy).
  const columnKeys = (src.columns as unknown as AnyColumn[]).map(c => c.key)
  let copied = 0
  let updated = 0
  for (let offset = 0; ; offset += 100) {
    const page = await tablesDB.listRows<Models.Row & Record<string, unknown>>({
      databaseId: db, tableId: source, queries: [Query.limit(100), Query.offset(offset)],
    })
    for (const row of page.rows) {
      const data = Object.fromEntries(columnKeys.map(key => [key, row[key] ?? null]))
      try {
        await tablesDB.createRow({ databaseId: db, tableId: target, rowId: row.$id, data })
        copied++
      }
      catch (error) {
        if (!hasCode(error, 409)) throw error
        await tablesDB.updateRow({ databaseId: db, tableId: target, rowId: row.$id, data })
        updated++
      }
    }
    if (page.rows.length < 100) break
  }
  console.log(`✔ Zeilen: ${copied} kopiert, ${updated} aktualisiert`)

  // Indizes NACH der vollständigen Kopie (Unique auf leeren Werten kollidiert
  // sonst — Regel aus courses-002/pages-004).
  const { indexes } = await tablesDB.listIndexes({ databaseId: db, tableId: source })
  for (const index of indexes) {
    await step(`Index ${target}.${index.key}`, () => tablesDB.createIndex({
      databaseId: db, tableId: target, key: index.key,
      type: index.type as TablesDBIndexType, columns: index.columns,
    }))
  }
  await waitForTable(target)

  // Gegenprobe fail-loud: jede Quell-Id muss im Ziel stehen.
  const srcRows = await tablesDB.listRows({ databaseId: db, tableId: source, queries: [Query.limit(1000)] })
  const dstRows = await tablesDB.listRows({ databaseId: db, tableId: target, queries: [Query.limit(1000)] })
  const missing = srcRows.rows.filter(row => !dstRows.rows.some(d => d.$id === row.$id))
  if (missing.length > 0) {
    throw new Error(`Kopie unvollständig — fehlende Ids in ${target}: ${missing.map(r => r.$id).join(', ')}`)
  }
  console.log(`✔ Gegenprobe: ${srcRows.total} Quell-Zeile(n), alle Ids erhalten`)
}

console.log(`Migration control-029 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)
await mirrorTable('tenants', 'communities', 'Communities')
await mirrorTable('tenant_plans', 'community_plans', 'Community Plans')
console.log('✔ Migration control-029 fertig — ADDITIV; tenants/tenant_plans fallen erst mit control-030 (nach Beweisen).')

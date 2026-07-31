/**
 * Migration posts-004: `tenantId` auf allen drei posts-Tabellen.
 *
 * WARUM: posts geht durch die mandantensichere Datentür (core tenantDb) und
 * zieht damit in den Pool ein (Demo-Community braucht den Feed). Die Tür
 * filtert und stempelt über die tenantId-Spalte — ohne Spalte keine Tür,
 * und Ausnahmen von der Tür sind die Stelle, an der die Regel stirbt
 * (gelernt bei comments-014).
 *
 * Rein ADDITIV und ruhend: '' / fehlend = Silo-/Einzelbetrieb (comments-App
 * unverändert). Im Pool stempelt die Tür den Mandanten und filtert darauf.
 * BESTAND ohne tenantId wird im Pool nicht gefunden (fail-closed — dieselbe
 * Regel wie überall); auf der Pool-Instanz existieren heute keine posts-Rows,
 * ein Backfill wäre Theater.
 *
 * Indizes tragen die häufigsten Tür-Abfragen, führend der Mandant:
 *   community_posts: status+publishedAt (Feed) → idx_tenant_feed
 *   post_votes/poll_votes: postId+userId (eigene Stimme) → idx_tenant_vote
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer posts
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { indexStep } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration posts-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const TARGETS: { table: string, index: string, columns: string[] }[] = [
  { table: 'community_posts', index: 'idx_tenant_feed', columns: ['tenantId', 'status', 'publishedAt'] },
  { table: 'post_votes', index: 'idx_tenant_vote', columns: ['tenantId', 'postId', 'userId'] },
  { table: 'poll_votes', index: 'idx_tenant_vote', columns: ['tenantId', 'postId', 'userId'] },
]

for (const { table, index, columns } of TARGETS) {
  await step(`Column ${table}.tenantId`, () => tablesDB.createVarcharColumn({
    databaseId, tableId: table, key: 'tenantId', size: 36, required: false, xdefault: '',
  }))
  await waitForColumn(table, 'tenantId')
  await indexStep(`Index ${table}.${index}`, () => tablesDB.createIndex({
    databaseId, tableId: table, key: index, type: TablesDBIndexType.Key, columns,
  }))
}

console.log('✔ Migration posts-004 fertig')

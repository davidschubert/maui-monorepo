/**
 * Migration posts-002: create-Permission für eingeloggte User auf
 * community_posts nachziehen — 001 legte die Table zunächst ohne an
 * (SessionClient-createRow lief in Appwrite-401). Idempotent: setzt den
 * Zielzustand absolut. poll_votes bleibt bewusst OHNE User-Permissions
 * (Votes schreibt ausschließlich der Server, Plan P3/P6).
 */
import { Client, Permission, Role, TablesDB } from 'node-appwrite'

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

console.log(`Migration posts-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await tablesDB.updateTable({
  databaseId,
  tableId: 'community_posts',
  name: 'Community Posts',
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
})
console.log('✔ community_posts: Table-Permissions = [create(users)] (rowSecurity bleibt an)')

console.log('✔ Migration posts-002 fertig')

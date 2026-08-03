import { readFileSync } from 'node:fs'
import { Client, TablesDB, Query } from 'node-appwrite'
const env = Object.fromEntries(readFileSync('apps/control/.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = new TablesDB(new Client().setEndpoint(env.NUXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(env.NUXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(env.NUXT_APPWRITE_KEY))
for (const tableId of ['abuse_reports', 'invite_codes', 'invite_requests', 'workspace_invites', 'community_invites']) {
  const rows = await db.listRows({ databaseId: 'main', tableId, queries: [Query.limit(100)] }).catch(e => ({ rows: [`ERR ${e.message}`] }))
  const hits = rows.rows.filter(r => typeof r === 'object' && JSON.stringify(r).includes('m13'))
  console.log(`${tableId}: ${rows.rows.length} Zeilen gesamt, ${hits.length} mit "m13"`)
  for (const h of hits.slice(0, 12)) console.log(`   ${h.$id} ${h.host ?? h.email ?? h.code ?? ''}`)
}

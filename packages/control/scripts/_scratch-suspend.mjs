import { readFileSync } from 'node:fs'
import { Client, TablesDB } from 'node-appwrite'
const env = Object.fromEntries(readFileSync('apps/control/.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const client = new Client().setEndpoint(env.NUXT_PUBLIC_APPWRITE_ENDPOINT).setProject(env.NUXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(env.NUXT_APPWRITE_KEY)
const db = new TablesDB(client)
const rowId = '6a61bc9d003472dee335' // kunde-a.localhost
const value = process.argv[2] ?? ''
const row = await db.updateRow({ databaseId: 'main', tableId: 'communities', rowId, data: { suspension: value } })
console.log('suspension =', JSON.stringify(row.suspension), 'host =', row.host)

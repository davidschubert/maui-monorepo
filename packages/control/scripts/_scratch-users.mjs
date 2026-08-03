import { readFileSync } from 'node:fs'
import { Client, Users, Query } from 'node-appwrite'
const env = Object.fromEntries(readFileSync(process.argv[2], 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const client = new Client().setEndpoint(env.NUXT_PUBLIC_APPWRITE_ENDPOINT).setProject(env.NUXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(env.NUXT_APPWRITE_KEY)
const users = new Users(client)
const res = await users.list({ queries: [Query.limit(25)] })
for (const u of res.users) console.log(JSON.stringify({ id: u.$id, email: u.email, name: u.name, labels: u.labels }))
console.log('total', res.total)

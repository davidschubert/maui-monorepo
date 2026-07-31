/**
 * Wegwerf-Testkonto + Einladungs-Code für den lokalen Wizard-Durchlauf.
 *
 * NUR LOKAL: legt einen Pool-User mit bekanntem Passwort und einen Code an,
 * damit man den Setup-Flow im Browser wie ein Kunde durchgehen kann. Beides
 * lässt sich mit `--clean` restlos entfernen.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/seed-local-tester.mjs [--clean]
 */
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const clean = process.argv.includes('--clean')
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const EMAIL = 'wizard-tester@example.test'
const PASSWORD = 'WizardTester-2026!'
const CODE = 'PUKA-LOCAL-TEST'

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const users = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const codeHash = createHash('sha256').update(CODE, 'utf8').digest('hex')

async function findCode() {
  const { rows } = await control.listRows({
    databaseId, tableId: 'invite_codes',
    queries: [Query.equal('codeHash', codeHash), Query.limit(1)],
  })
  return rows[0] ?? null
}

async function findUser() {
  const { users: found } = await users.list({ queries: [Query.equal('email', EMAIL), Query.limit(1)] })
  return found[0] ?? null
}

if (clean) {
  const user = await findUser()
  if (user) {
    // Communities dieses Testers mitnehmen, sonst bleiben Rows liegen.
    const { rows: members } = await control.listRows({
      databaseId, tableId: 'community_members',
      queries: [Query.equal('runtimeUserId', user.$id), Query.limit(25)],
    })
    for (const member of members) {
      await control.deleteRow({ databaseId, tableId: 'tenants', rowId: member.communityId }).catch(() => {})
      await control.deleteRow({ databaseId, tableId: 'community_members', rowId: member.$id }).catch(() => {})
      console.log(`✔ Community ${member.communityId} entfernt`)
    }
    const { rows: workspaces } = await control.listRows({
      databaseId, tableId: 'workspaces',
      queries: [Query.equal('ownerEmail', EMAIL), Query.limit(25)],
    })
    for (const workspace of workspaces) {
      await control.deleteRow({ databaseId, tableId: 'workspaces', rowId: workspace.$id }).catch(() => {})
    }
    await users.delete({ userId: user.$id })
    console.log('✔ Testkonto entfernt')
  }
  const code = await findCode()
  if (code) {
    await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: code.$id })
    console.log('✔ Code entfernt')
  }
  process.exit(0)
}

const existing = await findUser()
if (existing) {
  console.log('↷ Testkonto existiert bereits')
}
else {
  await users.create({ userId: ID.unique(), email: EMAIL, password: PASSWORD, name: 'Wizard Tester' })
  console.log('✔ Testkonto angelegt')
}

const code = await findCode()
if (code) {
  // Frisch machen: der Durchlauf soll nicht an einem verbrauchten Code scheitern.
  await control.updateRow({ databaseId, tableId: 'invite_codes', rowId: code.$id, data: { uses: 0, status: 'active' } })
  console.log('↷ Code existierte, Zähler zurückgesetzt')
}
else {
  await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: { codeHash, label: 'Lokaler Wizard-Test', maxUses: 0, uses: 0, expiresAt: null, status: 'active' },
  })
  console.log('✔ Code angelegt')
}

console.log(`\n  E-Mail:   ${EMAIL}\n  Passwort: ${PASSWORD}\n  Code:     ${CODE}\n`)
console.log('  Aufräumen: dasselbe Kommando mit --clean\n')

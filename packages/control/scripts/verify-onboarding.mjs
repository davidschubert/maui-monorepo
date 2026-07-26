/**
 * Beweis für O2 — die Provisionierungs-Route des Control Plane.
 *
 * Fährt den echten Weg der Platform-App gegen einen laufenden Studio-Server:
 * Pool-User anlegen → Session → JWT → POST /api/control/onboarding/site. Prüft
 * den Happy Path UND die Abwehr (kein Secret, falsches Secret, kaputtes JWT,
 * fremder Host, zweite Community in der Testphase, Retry-Idempotenz).
 *
 * Räumt am Ende ALLES weg, was es angelegt hat (Tenants, Mitgliedschaften,
 * Workspace, Codes, Pool-User) — auch wenn ein Test fehlschlägt.
 *
 * Aufruf (Studio-Dev-Server muss laufen):
 *   node --env-file=apps/control/.env packages/control/scripts/verify-onboarding.mjs
 *
 * Env zusätzlich:
 *   STUDIO_URL          Default http://localhost:3004
 *   POOL_ENDPOINT/KEY   Default: dieselbe Instanz, Key aus NUXT_APPWRITE_KEY
 */
import { Client, ID, TablesDB, Users } from 'node-appwrite'

const STUDIO_URL = (process.env.STUDIO_URL || 'http://localhost:3004').replace(/\/+$/, '')
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const secret = process.env.NUXT_CONTROL_ONBOARDING_SECRET
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY || controlKey

if (!endpoint || !controlProject || !databaseId || !controlKey || !secret) {
  console.error('✗ Env unvollständig — mit --env-file=apps/control/.env aufrufen (und NUXT_CONTROL_ONBOARDING_SECRET setzen).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { tenants: [], members: [], workspaces: [], codes: [], users: [] }

function check(label, condition, detail = '') {
  if (condition) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Ein Pool-User + frischer JWT (genau wie ihn die Platform-App mintet). */
async function createPoolUserWithJwt(tag) {
  const email = `o2-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `O2 ${tag}` })
  cleanup.users.push(user.$id)

  // Session wie beim Login (Admin-Client), dann JWT aus der Session.
  const admin = new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey)
  const { Account } = await import('node-appwrite')
  const session = await new Account(admin).createEmailPasswordSession({ email, password })
  const sessionClient = new Client().setEndpoint(endpoint).setProject(poolProject).setSession(session.secret)
  const { jwt } = await new Account(sessionClient).createJWT()
  return { userId: user.$id, email, jwt }
}

async function issueCode(maxUses = 5) {
  // Direkt in die Tabelle: die Betreiber-Route braucht eine Admin-SESSION,
  // die dieses Skript nicht hat. Der Hash-Weg ist identisch (sha256 upper).
  const code = `MAUI-O2TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const { createHash } = await import('node:crypto')
  const row = await control.createRow({
    databaseId,
    tableId: 'invite_codes',
    rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'O2-Beweis', maxUses, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return { code, id: row.$id }
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${STUDIO_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) }
  catch { /* Fehlerseiten sind HTML */ }
  return { status: response.status, json, text }
}

const withSecret = { 'x-maui-onboarding-secret': secret }

try {
  console.log(`\nO2-Beweis gegen ${STUDIO_URL} (Control ${controlProject}, Pool ${poolProject})\n`)

  const owner = await createPoolUserWithJwt('owner')
  const stranger = await createPoolUserWithJwt('stranger')
  const invite = await issueCode()
  const slug = `o2-${Date.now().toString(36)}`

  const payload = {
    jwt: owner.jwt,
    site: {
      name: 'Jungle Zipline',
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'creator',
      goal: 'relationships',
      description: 'Menschen, die gern in Bäumen hängen.',
      vibe: 'fresh',
      inviteCode: invite.code,
      locale: 'de',
    },
  }

  console.log('1. Abwehr')
  check('ohne Secret → 401', (await post('/api/control/onboarding/site', payload)).status === 401)
  const wrongSecret = await post('/api/control/onboarding/site', payload, { 'x-maui-onboarding-secret': 'falsch' })
  check('falsches Secret → 401', wrongSecret.status === 401, `war ${wrongSecret.status}`)
  const badJwt = await post('/api/control/onboarding/site', { ...payload, jwt: 'kaputt' }, withSecret)
  check('kaputtes JWT → 401', badJwt.status === 401, `war ${badJwt.status}`)
  const badCode = await post('/api/control/onboarding/site', { ...payload, site: { ...payload.site, inviteCode: 'MAUI-XXXX-XXXX' } }, withSecret)
  check('unbekannter Code → 403', badCode.status === 403, `war ${badCode.status}`)
  const reserved = await post('/api/control/onboarding/site', { ...payload, site: { ...payload.site, slug: 'login' } }, withSecret)
  check('reservierter Slug (login) → 400', reserved.status === 400, `war ${reserved.status}`)
  const extra = await post('/api/control/onboarding/site', { ...payload, site: { ...payload.site, plan: 'business' } }, withSecret)
  check('geschmuggeltes plan-Feld → 400', extra.status === 400, `war ${extra.status}`)

  console.log('\n2. Anlage')
  const created = await post('/api/control/onboarding/site', payload, withSecret)
  check('201/200 mit siteId', created.status === 200 && !!created.json?.siteId, `${created.status} ${created.text.slice(0, 160)}`)
  if (created.json?.siteId) cleanup.tenants.push(created.json.siteId)
  check('Host = <slug>.pukalani.app', created.json?.host === `${slug}.pukalani.app`, created.json?.host)
  check('Plan pro (Testphase)', created.json?.plan === 'pro', created.json?.plan)
  const daysLeft = created.json?.trialEndsAt
    ? Math.round((Date.parse(created.json.trialEndsAt) - Date.now()) / 86_400_000)
    : null
  check('Testphase endet in 14 Tagen', daysLeft === 14, `${daysLeft}`)
  check('reused = false', created.json?.reused === false)

  const tenant = created.json?.siteId
    ? await control.getRow({ databaseId, tableId: 'tenants', rowId: created.json.siteId })
    : null
  check('Row: mode pool + Projekt des Nutzers', tenant?.mode === 'pool' && tenant?.projectId === poolProject, `${tenant?.mode}/${tenant?.projectId}`)
  check('Row: audience members (privat als Default)', tenant?.audience === 'members', String(tenant?.audience))
  check('Row: Vibe fresh → spring/bright', tenant?.theme === 'spring' && tenant?.variant === 'bright', `${tenant?.theme}/${tenant?.variant}`)
  check('Row: Profil enthält die Antworten', (() => {
    try {
      const p = JSON.parse(tenant?.profile || '{}')
      return p.category === 'creator' && p.goal === 'relationships' && p.description?.startsWith('Menschen')
    }
    catch { return false }
  })())
  check('Row: Workspace verknüpft', !!tenant?.workspaceId)
  check('Row: Code-Spur gesetzt', tenant?.inviteCodeId === invite.id)
  if (tenant?.workspaceId) cleanup.workspaces.push(tenant.workspaceId)

  const members = await control.listRows({ databaseId, tableId: 'site_members' })
  const ownerRow = members.rows.find(row => row.siteId === created.json?.siteId)
  check('Owner-Mitgliedschaft angelegt', ownerRow?.role === 'owner' && ownerRow?.runtimeUserId === owner.userId, ownerRow?.role)
  if (ownerRow) cleanup.members.push(ownerRow.$id)

  const codeAfter = await control.getRow({ databaseId, tableId: 'invite_codes', rowId: invite.id })
  check('Code einmal verbraucht', codeAfter.uses === 1, `uses=${codeAfter.uses}`)

  console.log('\n3. Idempotenz + Grenzen')
  const retry = await post('/api/control/onboarding/site', payload, withSecret)
  check('Retry gibt dieselbe Site zurück', retry.json?.siteId === created.json?.siteId && retry.json?.reused === true, JSON.stringify(retry.json))
  const codeAfterRetry = await control.getRow({ databaseId, tableId: 'invite_codes', rowId: invite.id })
  check('Retry kostet den Code NICHT erneut', codeAfterRetry.uses === 1, `uses=${codeAfterRetry.uses}`)

  const second = await post('/api/control/onboarding/site', { ...payload, site: { ...payload.site, slug: `${slug}-zwei` } }, withSecret)
  check('zweite Community in der Testphase → 403', second.status === 403, `war ${second.status}`)
  if (second.json?.siteId) cleanup.tenants.push(second.json.siteId)

  const takeover = await post('/api/control/onboarding/site', { ...payload, jwt: stranger.jwt }, withSecret)
  check('fremder Nutzer auf belegtem Host → 409 (keine Übernahme)', takeover.status === 409, `war ${takeover.status}`)

  console.log('\n4. Vorprüfung')
  const precheck = await post('/api/control/onboarding/precheck', { code: invite.code, slug: `frei-${Date.now().toString(36)}` }, withSecret)
  check('gültiger Code + freier Slug', precheck.json?.codeValid === true && precheck.json?.slugAvailable === true, JSON.stringify(precheck.json))
  const precheck2 = await post('/api/control/onboarding/precheck', { slug }, withSecret)
  check('belegter Slug wird als belegt gemeldet', precheck2.json?.slugAvailable === false, JSON.stringify(precheck2.json))
  const precheck3 = await post('/api/control/onboarding/precheck', { code: 'MAUI-NOPE-NOPE' }, withSecret)
  check('unbekannter Code → codeValid false, KEIN Grund nach außen', precheck3.json?.codeValid === false && precheck3.json?.reason === undefined, JSON.stringify(precheck3.json))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n5. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'site_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'tenants', rowId: id }).catch(() => {})
  for (const id of cleanup.workspaces) await control.deleteRow({ databaseId, tableId: 'workspaces', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'tenants' })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

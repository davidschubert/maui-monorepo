#!/usr/bin/env node
/**
 * N5a — Events-Verwaltung gehört dem Site-Owner, nicht dem globalen Label.
 *
 * LIVE-Beweis über die ECHTE API (Muster events/verify-pool-isolation +
 * onboarding/verify-site-authz) gegen den laufenden Platform-Dev-Server:
 *
 *   1. Ein site_members-OWNER auf kunde-a OHNE jedes Operator-Label darf
 *      seine Events verwalten: manage/POST/PATCH/cover/series/DELETE.
 *   2. Genau dieser User bleibt auf kunde-b draußen (403) — die Rolle klebt
 *      an ihrer Community und reist nicht mit.
 *   3. Ein eingeloggter Fremder ohne Rolle → 403, ein Gast → 401.
 *   4. Ein Operator mit globalem admin-Label kommt weiter überall durch
 *      (Break-Glass) — und das Protokoll meldet es (site.operator_access).
 *
 * Der Silo-Gegenbeweis (apps/comments, kein Mandanten-Kontext) läuft mit
 * --silo: dort MUSS weiterhin das globale Label gelten.
 *
 * node:http über ::1, weil fetch den Host-Header verwirft und Nitro auf
 * [::1] hört. Setzt die Tenant-Pläne temporär auf 'pro' (events ist ab Plan
 * pro; Resolver-Cache 30 s → Warte-Schleife) und stellt sie am Ende her;
 * räumt Events, Mitgliedschaft und Test-User auch im Fehlerfall weg.
 *
 * Aus packages/events (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-site-authz.mjs
 *   node --env-file=../../apps/comments/.env scripts/verify-site-authz.mjs --silo
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const SILO = process.argv.includes('--silo')
const PORT = Number(SILO ? process.env.COMMENTS_PORT || 3144 : process.env.PLATFORM_PORT || 3143)
const HOST_A = process.env.TENANT_A_HOST || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_B_HOST || 'kunde-b.localhost'
const SILO_HOST = process.env.SILO_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const poolKey = process.env.NUXT_APPWRITE_KEY
const controlEndpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
const controlProject = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
const controlDb = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
const controlKey = process.env.NUXT_PLATFORM_CONTROL_KEY

if (!endpoint || !poolProject || !databaseId || !poolKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/platform/.env aufrufen.')
  process.exit(1)
}
if (!SILO && (!controlEndpoint || !controlProject || !controlDb || !controlKey)) {
  console.error('✗ NUXT_PLATFORM_CONTROL_* fehlt — der Pool-Lauf braucht den Control-Plane-Zugang.')
  process.exit(1)
}

const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const control = SILO
  ? null
  : new TablesDB(new Client().setEndpoint(controlEndpoint).setProject(controlProject).setKey(controlKey))

let pass = 0
let fail = 0
const cleanup = { users: [], events: [], members: [], planRestore: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Fehlerseite */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createUser(tag, labels = []) {
  const email = `n5-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `N5 ${tag}` })
  cleanup.users.push(user.$id)
  if (labels.length) await poolUsers.updateLabels({ userId: user.$id, labels })
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  const cookie = res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  return cookie
}

async function waitFor(label, fn, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await fn()) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  console.error(`  ✗ Timeout: ${label}`)
  return false
}

const startAt = () => new Date(Date.now() + 7 * 86_400_000).toISOString()

/** Die sieben Verwaltungs-Routen in einem Durchlauf. */
async function manageRoundtrip(host, cookie, tag) {
  const out = {}
  out.manage = await call(host, '/api/events/manage', { cookie })
  const created = await call(host, '/api/events', {
    method: 'POST', cookie,
    body: { title: `N5 ${tag} ${Date.now()}`, description: 'N5-Beweis.', startAt: startAt(), status: 'draft' },
  })
  out.create = created
  const id = created.json?.$id
  if (id) cleanup.events.push(id)
  out.id = id
  if (id) {
    out.patch = await call(host, `/api/events/${id}`, { method: 'PATCH', cookie, body: { title: `N5 ${tag} bearbeitet` } })
    out.coverDelete = await call(host, `/api/events/${id}/cover`, { method: 'DELETE', cookie })
    out.series = await call(host, `/api/events/${id}/series`, { method: 'DELETE', cookie })
    out.cancel = await call(host, `/api/events/${id}`, { method: 'DELETE', cookie })
  }
  return out
}

try {
  if (SILO) {
    console.log(`\nN5a Silo-Gegenprobe gegen http://[::1]:${PORT} (Host ${SILO_HOST}, kein Mandant)\n`)

    console.log('1. Operator mit globalem admin-Label')
    const operator = await createUser('silo-op', ['admin'])
    const opCookie = await login(SILO_HOST, operator)
    const op = await manageRoundtrip(SILO_HOST, opCookie, 'silo-op')
    check('manage → 200', op.manage.status === 200, `Status ${op.manage.status}`)
    check('POST /api/events → 201', op.create.status === 201, `Status ${op.create.status} ${op.create.text.slice(0, 160)}`)
    check('PATCH → 200', op.patch?.status === 200, `Status ${op.patch?.status}`)
    check('DELETE (Soft-Cancel) → 200', op.cancel?.status === 200, `Status ${op.cancel?.status}`)

    console.log('\n2. User OHNE Label (im Silo gibt es keine Site-Rolle, die hilft)')
    const plain = await createUser('silo-plain')
    const plainCookie = await login(SILO_HOST, plain)
    const list = await call(SILO_HOST, '/api/events/manage', { cookie: plainCookie })
    check('manage → 403', list.status === 403, `Status ${list.status}`)
    const post = await call(SILO_HOST, '/api/events', {
      method: 'POST', cookie: plainCookie,
      body: { title: 'darf nicht', description: 'x', startAt: startAt(), status: 'draft' },
    })
    check('POST /api/events → 403', post.status === 403, `Status ${post.status}`)

    console.log('\n3. Gast')
    const guest = await call(SILO_HOST, '/api/events/manage')
    check('manage ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  }
  else {
    console.log(`\nN5a Site-Autorisierung gegen http://[::1]:${PORT} (Pool ${poolProject})\n`)

    const tenants = await control.listRows({
      databaseId: controlDb, tableId: 'tenants',
      queries: [Query.equal('host', [HOST_A, HOST_B]), Query.limit(5)],
    })
    const tenantA = tenants.rows.find(r => r.host === HOST_A)
    const tenantB = tenants.rows.find(r => r.host === HOST_B)
    if (!tenantA || !tenantB) {
      console.error(`✗ Lokale Tenants ${HOST_A}/${HOST_B} nicht gefunden — zuerst seeden.`)
      process.exit(1)
    }

    console.log('0. Vorbereitung (events ist ab Plan pro — Pläne temporär heben)')
    cleanup.planRestore.push({ id: tenantA.$id, plan: tenantA.plan ?? null }, { id: tenantB.$id, plan: tenantB.plan ?? null })
    await control.updateRow({ databaseId: controlDb, tableId: 'tenants', rowId: tenantA.$id, data: { plan: 'pro' } })
    await control.updateRow({ databaseId: controlDb, tableId: 'tenants', rowId: tenantB.$id, data: { plan: 'pro' } })
    check('Plan pro auf beiden Tenants sichtbar (Resolver-Cache 30 s)', await waitFor('Plan-Upgrade', async () => {
      const [a, b] = await Promise.all([call(HOST_A, '/api/events'), call(HOST_B, '/api/events')])
      return a.status === 200 && b.status === 200
    }))

    // Der Owner: Mitglied von kunde-a, KEIN Operator-Label.
    const owner = await createUser('owner')
    const member = await control.createRow({
      databaseId: controlDb, tableId: 'site_members', rowId: ID.unique(),
      data: {
        siteId: tenantA.$id,
        runtimeProjectId: tenantA.projectId,
        runtimeUserId: owner.userId,
        role: 'owner',
        status: 'active',
      },
    })
    cleanup.members.push(member.$id)
    const ownerAfter = await poolUsers.get({ userId: owner.userId })
    check('Owner trägt KEIN Operator-Label', !(ownerAfter.labels ?? []).some(l => l === 'admin' || l === 'moderator'), JSON.stringify(ownerAfter.labels))

    const ownerCookie = await login(HOST_A, owner)

    console.log('\n1. Site-Owner verwaltet seine Events — ohne globales Label')
    const a = await manageRoundtrip(HOST_A, ownerCookie, 'owner-a')
    check('GET /api/events/manage → 200', a.manage.status === 200, `Status ${a.manage.status} ${a.manage.text.slice(0, 160)}`)
    check('POST /api/events → 201', a.create.status === 201, `Status ${a.create.status} ${a.create.text.slice(0, 160)}`)
    check('PATCH /api/events/:id → 200', a.patch?.status === 200, `Status ${a.patch?.status}`)
    check('DELETE /api/events/:id/cover → 200 (kein Cover, idempotent)', a.coverDelete?.status === 200, `Status ${a.coverDelete?.status}`)
    check('DELETE /api/events/:id/series → 409 statt 403 (autorisiert, nur kein Serien-Master)', a.series?.status === 409, `Status ${a.series?.status}`)
    check('DELETE /api/events/:id → 200 (Soft-Cancel)', a.cancel?.status === 200, `Status ${a.cancel?.status}`)
    const raw = a.id ? await pool.getRow({ databaseId, tableId: 'events', rowId: a.id }).catch(() => null) : null
    check('Datentür hat tenantId von A gestempelt', raw?.tenantId === tenantA.tenantId, `tenantId=${raw?.tenantId}`)

    console.log('\n2. Dieselbe Person auf der NACHBAR-Community')
    const bManage = await call(HOST_B, '/api/events/manage', { cookie: ownerCookie })
    check('GET /api/events/manage auf kunde-b → 403', bManage.status === 403, `Status ${bManage.status}`)
    const bCreate = await call(HOST_B, '/api/events', {
      method: 'POST', cookie: ownerCookie,
      body: { title: 'Übergriff', description: 'x', startAt: startAt(), status: 'draft' },
    })
    check('POST /api/events auf kunde-b → 403', bCreate.status === 403, `Status ${bCreate.status}`)
    if (bCreate.json?.$id) cleanup.events.push(bCreate.json.$id)
    const bPatch = await call(HOST_B, `/api/events/${a.id}`, { method: 'PATCH', cookie: ownerCookie, body: { title: 'Übernahme' } })
    check('PATCH des A-Events von kunde-b aus → 403 (Autorisierung vor der Tür)', bPatch.status === 403, `Status ${bPatch.status}`)

    console.log('\n3. Fremder und Gast')
    const stranger = await createUser('stranger')
    const strangerCookie = await login(HOST_A, stranger)
    const sManage = await call(HOST_A, '/api/events/manage', { cookie: strangerCookie })
    check('eingeloggt, aber ohne Rolle → 403', sManage.status === 403, `Status ${sManage.status}`)
    const sCreate = await call(HOST_A, '/api/events', {
      method: 'POST', cookie: strangerCookie,
      body: { title: 'darf nicht', description: 'x', startAt: startAt(), status: 'draft' },
    })
    check('POST ohne Rolle → 403', sCreate.status === 403, `Status ${sCreate.status}`)
    if (sCreate.json?.$id) cleanup.events.push(sCreate.json.$id)
    const guest = await call(HOST_A, '/api/events/manage')
    check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)

    console.log('\n4. Operator-Break-Glass (globales admin-Label, keine Mitgliedschaft)')
    const operator = await createUser('operator', ['admin'])
    const opCookie = await login(HOST_A, operator)
    const opA = await manageRoundtrip(HOST_A, opCookie, 'operator-a')
    check('manage auf kunde-a → 200', opA.manage.status === 200, `Status ${opA.manage.status}`)
    check('POST auf kunde-a → 201', opA.create.status === 201, `Status ${opA.create.status}`)
    check('PATCH auf kunde-a → 200', opA.patch?.status === 200, `Status ${opA.patch?.status}`)
    check('DELETE auf kunde-a → 200', opA.cancel?.status === 200, `Status ${opA.cancel?.status}`)
    const opB = await call(HOST_B, '/api/events/manage', { cookie: opCookie })
    check('manage auf kunde-b → 200 (Support-Zugang bleibt)', opB.status === 200, `Status ${opB.status}`)
    console.log('  ℹ Break-Glass-Protokoll: im Dev-Server-Log muss "site.operator_access" mit capability=events.manage stehen')
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n5. Aufräumen')
  for (const id of cleanup.events) await pool.deleteRow({ databaseId, tableId: 'events', rowId: id }).catch(() => {})
  for (const id of cleanup.members) await control?.deleteRow({ databaseId: controlDb, tableId: 'site_members', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  for (const { id, plan } of cleanup.planRestore) {
    await control?.updateRow({ databaseId: controlDb, tableId: 'tenants', rowId: id, data: { plan } }).catch(() => {})
  }
  console.log(`  ✔ aufgeräumt (${cleanup.events.length} Event(s), ${cleanup.members.length} Mitgliedschaft(en), ${cleanup.users.length} User, Pläne zurückgesetzt)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

#!/usr/bin/env node
/**
 * events im Pool — LIVE-Isolationsbeweis über die ECHTE API (Muster
 * comments/posts verify-pool-isolation + onboarding/verify-site-authz).
 *
 * Fährt den echten Kundenpfad gegen den laufenden Platform-Dev-Server
 * (Default Port 3131) mit Host-Headern der beiden LOKALEN Tenants
 * kunde-a.localhost / kunde-b.localhost:
 *
 *   1. Produkt-Gate: events ist ab Plan pro — auf Plan basic antwortet
 *      die Liste 404 (Katalog maui.tenancy.products).
 *   2. Event bei A über POST /api/events anlegen (Datentür stempelt
 *      tenantId — per Admin-SDK nachgeprüft).
 *   3. Liste bei B → das A-Event fehlt; Liste bei A → enthält es (Gast).
 *   4. Detail per ID von B → 404 (Tür-get belegt Zugehörigkeit, obwohl die
 *      Row read(any) trägt); von A → 200.
 *   5. Operator-Pfad: /api/events/manage und PATCH mit Admin-Session auf
 *      Host B sehen/treffen das A-Event NICHT (die Tür ist beim
 *      Admin-Client die EINZIGE Grenze).
 *
 * node:http über ::1, weil fetch den Host-Header verwirft und Nitro auf
 * [::1] hört. Setzt die Tenant-Pläne temporär auf 'pro' (Resolver-Cache
 * 30 s → Warte-Schleife) und stellt sie am Ende wieder her; räumt Event
 * und Test-User auch im Fehlerfall weg.
 *
 * Aus packages/events (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3131)
const HOST_A = process.env.TENANT_A_HOST || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_B_HOST || 'kunde-b.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const poolKey = process.env.NUXT_APPWRITE_KEY
const controlEndpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
const controlProject = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
const controlDb = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
const controlKey = process.env.NUXT_PLATFORM_CONTROL_KEY

if (!endpoint || !poolProject || !databaseId || !poolKey || !controlEndpoint || !controlProject || !controlDb || !controlKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/platform/.env aufrufen.')
  process.exit(1)
}

const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const control = new TablesDB(new Client().setEndpoint(controlEndpoint).setProject(controlProject).setKey(controlKey))

let pass = 0
let fail = 0
const cleanup = { users: [], events: [], planRestore: [] } // planRestore: {id, plan}

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

async function tenantRowByHost(host) {
  const res = await control.listRows({
    databaseId: controlDb, tableId: 'tenants',
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  return res.rows[0] ?? null
}

/** Plan setzen und auf den Resolver-Cache (30 s) warten, bis die API ihn sieht. */
async function setPlan(row, plan) {
  await control.updateRow({ databaseId: controlDb, tableId: 'tenants', rowId: row.$id, data: { plan } })
}

async function waitFor(label, fn, timeoutMs = 45_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await fn()) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  console.error(`  ✗ Timeout: ${label}`)
  return false
}

try {
  console.log(`\nevents-Pool-Isolation gegen http://[::1]:${PORT} (Pool ${poolProject})\n`)

  const tenantA = await tenantRowByHost(HOST_A)
  const tenantB = await tenantRowByHost(HOST_B)
  if (!tenantA || !tenantB) {
    console.error(`✗ Lokale Tenants ${HOST_A}/${HOST_B} nicht gefunden — zuerst seeden.`)
    process.exit(1)
  }

  console.log('1. Produkt-Gate (events = ab Plan pro)')
  // Beide Tenants stehen lokal auf plan null (= basic) → Liste muss 404 sein.
  // Warte-Schleife: der Host-Resolver cacht 30 s — ein direkt vorher
  // beendeter Lauf kann 'pro' noch im Cache haben.
  const gatedClosed = await waitFor('Produkt-Gate zu (Plan basic → 404)', async () => {
    const res = await call(HOST_A, '/api/events')
    return res.status === 404
  })
  check('Plan basic → /api/events antwortet 404 (Produkt existiert nicht)', gatedClosed)

  // Pläne temporär auf 'pro' heben (Restore im finally)
  cleanup.planRestore.push({ id: tenantA.$id, plan: tenantA.plan ?? null }, { id: tenantB.$id, plan: tenantB.plan ?? null })
  await setPlan(tenantA, 'pro')
  await setPlan(tenantB, 'pro')
  const planLive = await waitFor('Plan-Upgrade sichtbar (Resolver-Cache 30 s)', async () => {
    const [a, b] = await Promise.all([call(HOST_A, '/api/events'), call(HOST_B, '/api/events')])
    return a.status === 200 && b.status === 200
  })
  check('Plan pro → /api/events antwortet 200 (beide Tenants)', planLive)

  console.log('\n2. Event bei A anlegen (echte API, Datentür stempelt den Mandanten)')
  const email = `events-iso-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const admin = await poolUsers.create({ userId: ID.unique(), email, password, name: 'Events-Iso Admin' })
  cleanup.users.push(admin.$id)
  await poolUsers.updateLabels({ userId: admin.$id, labels: ['admin'] })

  const login = await call(HOST_A, '/api/auth/login', { method: 'POST', body: { email, password } })
  const cookie = login.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  check('Login auf Host A', login.status === 200 && !!cookie, `Status ${login.status}`)

  const startAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const createdRes = await call(HOST_A, '/api/events', {
    method: 'POST', cookie,
    body: { title: `Iso-Beweis ${Date.now()}`, description: 'Gehört Kunde A.', startAt, status: 'published' },
  })
  const eventId = createdRes.json?.$id
  check('POST /api/events auf A → 201', createdRes.status === 201 && !!eventId, `Status ${createdRes.status} ${createdRes.text.slice(0, 160)}`)
  if (eventId) cleanup.events.push(eventId)

  // TenantContext.tenantId = tenants.tenantId (Scope-Wert der Datenzeilen);
  // tenants.$id ist die communityId (Label-Schlüssel) — zwei Schlüssel, ein Tenant.
  const rawRow = eventId ? await pool.getRow({ databaseId, tableId: 'events', rowId: eventId }).catch(() => null) : null
  check('Tür hat tenantId von A gestempelt (nie vom Aufrufer)', rawRow?.tenantId === tenantA.tenantId, `tenantId=${rawRow?.tenantId}, erwartet ${tenantA.tenantId}`)

  console.log('\n3. Listen-Isolation (Gast-Sicht)')
  const listA = await call(HOST_A, '/api/events')
  const listB = await call(HOST_B, '/api/events')
  const inA = (listA.json?.rows ?? []).some(r => r.$id === eventId)
  const inB = (listB.json?.rows ?? []).some(r => r.$id === eventId)
  check('A sieht sein Event in der Liste', listA.status === 200 && inA, `Status ${listA.status}`)
  check('B sieht das A-Event NICHT', listB.status === 200 && !inB, `Status ${listB.status}`)

  console.log('\n4. Detail per ID (read(any)-Härtefall)')
  const detailA = await call(HOST_A, `/api/events/${eventId}`)
  const detailB = await call(HOST_B, `/api/events/${eventId}`)
  check('A liest sein Event per ID (200)', detailA.status === 200, `Status ${detailA.status}`)
  check('B bekommt per ID 404 (trotz read(any)-Row)', detailB.status === 404, `Status ${detailB.status}`)
  const icsB = await call(HOST_B, `/api/events/${eventId}/ics`)
  check('B bekommt auch den ICS-Export nicht (404)', icsB.status === 404, `Status ${icsB.status}`)

  console.log('\n5. Operator-Pfad (Admin-Client — die Tür ist die einzige Grenze)')
  const manageB = await call(HOST_B, '/api/events/manage', { cookie })
  const manageHasA = (manageB.json?.rows ?? []).some(r => r.$id === eventId)
  check('manage-Liste auf B enthält das A-Event NICHT', manageB.status === 200 && !manageHasA, `Status ${manageB.status}`)
  const patchB = await call(HOST_B, `/api/events/${eventId}`, { method: 'PATCH', cookie, body: { title: 'Übernahme' } })
  check('PATCH per ID von Host B → 404 (Operator-get belegt Zugehörigkeit)', patchB.status === 404, `Status ${patchB.status}`)
  const cancelB = await call(HOST_B, `/api/events/${eventId}`, { method: 'DELETE', cookie })
  check('DELETE (Soft-Cancel) von Host B → 404', cancelB.status === 404, `Status ${cancelB.status}`)
  const manageA = await call(HOST_A, '/api/events/manage', { cookie })
  const manageAHas = (manageA.json?.rows ?? []).some(r => r.$id === eventId)
  check('manage-Liste auf A enthält es (Gegenprobe)', manageA.status === 200 && manageAHas, `Status ${manageA.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n6. Aufräumen')
  for (const id of cleanup.events) {
    await pool.deleteRow({ databaseId, tableId: 'events', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  for (const { id, plan } of cleanup.planRestore) {
    await control.updateRow({ databaseId: controlDb, tableId: 'tenants', rowId: id, data: { plan } }).catch(() => {})
  }
  console.log(`  ✔ aufgeräumt (${cleanup.events.length} Event(s), ${cleanup.users.length} User, Pläne zurückgesetzt)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

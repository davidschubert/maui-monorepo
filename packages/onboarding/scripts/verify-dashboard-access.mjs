/**
 * Beweis für N1 — Site-Rollen öffnen das Kunden-Dashboard (Pool-Audit
 * 2026-07-27, wichtigster offener Befund).
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server (Port 3141)
 * + das laufende Control Plane (Port 3004, für den Registrierungs-Schalter):
 * zwei Communities anlegen, dann prüfen:
 *   - Owner (User OHNE Operator-Label, nur community_members-owner) → /dashboard
 *     SSR 200 mit GEFILTERTER Nav (Produkte ja, Operator-Module nein)
 *   - derselbe User auf der ANDEREN Community (keine Mitgliedschaft) → 403
 *   - User ganz ohne Rolle → 403 (wie heute)
 *   - Gast ohne Session → Redirect auf /login (wie heute)
 *   - Operator mit admin-Label → unverändert VOLLER Zugang (inkl. System-Nav)
 *   - der S1-Registrierungs-Schalter ist für den Owner erreichbar
 *     (/dashboard/settings/community SSR 200) und PATCH /api/community/registration
 *     funktioniert end-to-end (Control Plane schreibt, Wert kommt zurück)
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-dashboard-access.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3141)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

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

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [], workspaces: [] }

function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, accept } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Seite */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Seiten-SSR wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
function page(host, path, cookie) {
  return call(host, path, { cookie, accept: 'text/html' })
}

async function createPoolUser(tag) {
  const email = `n1-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `N1 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

/** Anmelden auf einem beliebigen Host → Session-Cookie für DIESEN Host. */
async function login(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode(tag) {
  const code = `MAUI-N1${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'N1-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(account, cookie, slug, name) {
  const code = await issueCode(slug.slice(0, 4).toUpperCase())
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'N1-Beweis: Site-Rollen öffnen das Dashboard.',
      vibe: 'fresh',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (created.status !== 200 || !created.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(created.json.communityId)
  const tenantRow = await control.getRow({ databaseId, tableId: 'communities', rowId: created.json.communityId }).catch(() => null)
  if (tenantRow?.workspaceId) cleanup.workspaces.push(tenantRow.workspaceId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', created.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: created.json.communityId, host: created.json.host }
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/** Nav-Marker im SSR-HTML: Ziel-Pfade der Sidebar (localePath, en = ohne Prefix). */
function hasNav(html, path) {
  return html.includes(`"${path}"`) || html.includes(`href="${path}"`)
}

try {
  console.log(`\nN1-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const nobody = await createPoolUser('nobody')
  const neighbor = await createPoolUser('neighbor')
  const operator = await createPoolUser('operator')
  await poolUsers.updateLabels({ userId: operator.userId, labels: ['admin'] })

  const ownerControlCookie = await login(CONTROL_HOST, owner)
  const neighborControlCookie = await login(CONTROL_HOST, neighbor)
  const stamp = Date.now().toString(36)

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(owner, ownerControlCookie, `n1-kunde-a-${stamp}`, 'N1 Kunde A')
  const siteB = await createCommunity(neighbor, neighborControlCookie, `n1-kunde-b-${stamp}`, 'N1 Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  check('kunde-a antwortet', await waitForHost(siteA.host))
  check('kunde-b antwortet', await waitForHost(siteB.host))

  console.log('\n2. Owner (OHNE Operator-Label) erreicht SEIN Dashboard — SSR')
  const ownerCookieA = await login(siteA.host, owner)
  const dashA = await page(siteA.host, '/dashboard', ownerCookieA)
  check('/dashboard → 200', dashA.status === 200, `Status ${dashA.status}`)
  check('Payload spiegelt die Rolle (pukalani-community-role → owner)', dashA.text.includes('pukalani-community-role') && dashA.text.includes('owner'))
  // Nav-Filterung auf einer Seite OHNE Operator-Links im Body (die Overview-
  // Karten verlinken selbst /dashboard/users) — die Sidebar rendert im Layout.
  const settingsA = await page(siteA.host, '/dashboard/settings', ownerCookieA)
  check('/dashboard/settings → 200', settingsA.status === 200, `Status ${settingsA.status}`)
  check('Nav zeigt Produkte: Seiten (/dashboard/pages)', hasNav(settingsA.text, '/dashboard/pages'))
  check('Nav zeigt Produkte: Kommentare (/dashboard/comments)', hasNav(settingsA.text, '/dashboard/comments'))
  check('Nav OHNE Operator-Modul System (/dashboard/system)', !hasNav(settingsA.text, '/dashboard/system'))
  check('Nav OHNE Operator-Modul Admin (/dashboard/admin)', !hasNav(settingsA.text, '/dashboard/admin'))
  check('Nav OHNE People (/dashboard/users)', !hasNav(settingsA.text, '/dashboard/users'))
  check('Nav OHNE Storage (/dashboard/storage)', !hasNav(settingsA.text, '/dashboard/storage'))

  console.log('\n3. Derselbe User auf kunde-b (KEINE Mitgliedschaft) → wie ein Fremder')
  const ownerCookieB = await login(siteB.host, owner)
  const dashB = await page(siteB.host, '/dashboard', ownerCookieB)
  check('/dashboard auf kunde-b → 403', dashB.status === 403, `Status ${dashB.status}`)

  console.log('\n4. User ganz ohne Rolle → wie heute abgewiesen')
  const nobodyCookieA = await login(siteA.host, nobody)
  const dashNobody = await page(siteA.host, '/dashboard', nobodyCookieA)
  check('/dashboard → 403', dashNobody.status === 403, `Status ${dashNobody.status}`)

  console.log('\n5. Gast ohne Session → Redirect zum Login (wie heute)')
  const dashGuest = await page(siteA.host, '/dashboard')
  check('302 → /login', dashGuest.status === 302 && String(dashGuest.headers.location || '').includes('/login'),
    `Status ${dashGuest.status} → ${dashGuest.headers.location}`)

  console.log('\n6. Operator mit admin-Label → unverändert voller Zugang (Break-Glass)')
  const operatorCookieA = await login(siteA.host, operator)
  const dashOperator = await page(siteA.host, '/dashboard', operatorCookieA)
  check('/dashboard → 200', dashOperator.status === 200, `Status ${dashOperator.status}`)
  check('Nav MIT System (/dashboard/system)', hasNav(dashOperator.text, '/dashboard/system'))
  check('Nav MIT People (/dashboard/users)', hasNav(dashOperator.text, '/dashboard/users'))

  console.log('\n7. S1-Registrierungs-Schalter: für den Owner erreichbar + PATCH end-to-end')
  const communityPage = await page(siteA.host, '/dashboard/settings/community', ownerCookieA)
  check('Settings → Community SSR 200', communityPage.status === 200, `Status ${communityPage.status}`)
  check('Schalter im Markup (data-community-registration)', communityPage.text.includes('data-community-registration'))

  const closeIt = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: ownerCookieA, body: { openRegistration: false },
  })
  check('PATCH openRegistration=false → 200', closeIt.status === 200 && closeIt.json?.openRegistration === false,
    `Status ${closeIt.status} ${closeIt.text.slice(0, 160)}`)
  const tenantAfter = await control.getRow({ databaseId, tableId: 'communities', rowId: siteA.communityId })
  check('Control Plane trägt den Wert (tenants.openRegistration=false)', tenantAfter.openRegistration === false,
    JSON.stringify(tenantAfter.openRegistration))
  const reopen = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: ownerCookieA, body: { openRegistration: true },
  })
  check('PATCH zurück auf true → 200', reopen.status === 200 && reopen.json?.openRegistration === true, `Status ${reopen.status}`)

  const nobodyPatch = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: nobodyCookieA, body: { openRegistration: false },
  })
  check('User ohne Rolle darf NICHT schalten → 403', nobodyPatch.status === 403, `Status ${nobodyPatch.status}`)

  console.log('\n8. Server-Autorität unverändert: Operator-Daten-Routen bleiben für den Owner zu')
  for (const path of ['/api/admin/config', '/api/admin/users', '/api/admin/audit']) {
    const res = await call(siteA.host, path, { cookie: ownerCookieA })
    check(`${path} → 403 für den Site-Owner`, res.status === 403, `Status ${res.status}`)
  }

  console.log('\n9. Eigene Rolle per API (Client-Refresh-Pfad nach Login)')
  const roleRes = await call(siteA.host, '/api/community/role', { cookie: ownerCookieA })
  check('GET /api/community/role → owner', roleRes.status === 200 && roleRes.json?.role === 'owner', JSON.stringify(roleRes.json))
  const roleNobody = await call(siteA.host, '/api/community/role', { cookie: nobodyCookieA })
  check('GET /api/community/role ohne Mitgliedschaft → null', roleNobody.status === 200 && roleNobody.json?.role === null, JSON.stringify(roleNobody.json))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n10. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.workspaces) await control.deleteRow({ databaseId, tableId: 'workspaces', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

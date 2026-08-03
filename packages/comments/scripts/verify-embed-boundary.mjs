/**
 * Beweis für F37 — DAS WIDGET IM POOL: Berechtigung + Mandantengrenze.
 *
 * Das Embed-Produkt war bis heute nur im Silo angeschaltet. Beim Freischalten
 * im Pool stehen drei Behauptungen im Raum, und dieses Skript prüft sie am
 * LAUFENDEN Server, nicht auf dem Papier:
 *
 *  1. WER DARF (Abschnitt 3+4): das Einbetter-Register verlangte
 *     `system.manage` — ein INSTANZ-Label, das kein Kunde je trägt. Jetzt ist
 *     es `community.embed`, und das trägt nur der OWNER. Admin, Moderator,
 *     Editor, Viewer, Fremder und Gast bleiben draußen.
 *  2. MANDANTENGRENZE (Abschnitt 5): ein Owner sieht, ändert und löscht NUR
 *     die Einbetter SEINER Community — auch dann, wenn er die fremde Row-Id
 *     kennt. Die Grenze zieht die Datentür (`tenantDb`), nicht die Route.
 *  3. DIE CSP FOLGT (Abschnitt 6): der freigegebene Host steht in
 *     `frame-ancestors` von /embed — und der Host der ANDEREN Community
 *     steht dort nicht. Das ist die harte Grenze des Widgets.
 *
 * Dazu Abschnitt 7: `security.csrfOriginCheck` ist im Pool NEU an. Unter der
 * Wildcard ist jeder Mandanten-Host `same-site` zum anderen — der Beweis, dass
 * die F32-Härtung das abweist und den (same-origin) Embed-Fluss nicht bricht,
 * wird hier für den POOL neu geführt statt aus dem Silo übernommen.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/comments/scripts/verify-embed-boundary.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
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
const cleanup = { users: [], codes: [], tenants: [], members: [], sites: [] }

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

/**
 * node:http, weil `fetch` einen eigenen Host-Header verwirft; ::1, weil Nitro
 * dort hört. `origin`/`secFetchSite` sind für Abschnitt 7 — ohne sie sieht der
 * Server einen kopflosen Request (kein Browser), und genau der darf passieren.
 */
function call(host, path, { method = 'GET', body, cookie, origin, secFetchSite } = {}) {
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
        ...(origin ? { origin } : {}),
        ...(secFetchSite ? { 'sec-fetch-site': secFetchSite } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Seite */ }
        resolve({ status: res.statusCode, json, text, headers: res.headers, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createPoolUser(tag) {
  const email = `f37-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `F37 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

async function login(account) {
  const res = await call(CONTROL_HOST, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-F37TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'F37-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
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

async function createCommunity(cookie, tag) {
  const slug = `f37-${tag}-${Date.now().toString(36)}`
  const res = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name: `F37 ${tag}`,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Wir prüfen, ob Einbetter an ihrer Community kleben.',
      vibe: 'elegant',
      inviteCode: await issueCode(),
      locale: 'de',
    },
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Community ${tag} nicht angelegt (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', res.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: res.json.communityId, host: res.json.host }
}

try {
  console.log(`\nF37-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  console.log('1. Zwei Communities mit je eigenem Owner')
  const ownerA = await createPoolUser('owner-a')
  const ownerB = await createPoolUser('owner-b')
  const stranger = await createPoolUser('stranger')
  const cookieA = await login(ownerA)
  const cookieB = await login(ownerB)
  const cookieStranger = await login(stranger)

  const a = await createCommunity(cookieA, 'a')
  const b = await createCommunity(cookieB, 'b')
  check('Community A angelegt', !!a.communityId, a.host)
  check('Community B angelegt', !!b.communityId, b.host)
  check('Host A antwortet', await waitForHost(a.host))
  check('Host B antwortet', await waitForHost(b.host))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2. Das Produkt ist im Pool überhaupt an (der Schalter, der fehlte)')
  const embedPage = await call(a.host, '/embed?targetId=f37&targetType=verify')
  check('/embed antwortet (kein 404 mehr — pukalani.comments.embed.enabled)',
    embedPage.status === 200, `Status ${embedPage.status}`)
  const loader = await call(a.host, '/embed.js')
  check('der Loader /embed.js wird ausgeliefert', loader.status === 200, `Status ${loader.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  // 3. WER DARF — die eigentliche Blockade. `system.manage` ist ein
  //    INSTANZ-Label; ein Kunden-Owner trägt es nie. Vor F37 war die Seite im
  //    Pool damit für JEDEN Kunden zu, obwohl sie in seinem Dashboard stand.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3. Berechtigung: community.embed statt system.manage')
  const ownerList = await call(a.host, '/api/admin/embed-sites', { cookie: cookieA })
  check('Owner darf sein Einbetter-Register sehen → 200 (VORHER 403)',
    ownerList.status === 200, `Status ${ownerList.status} ${ownerList.text.slice(0, 160)}`)
  check('…und es ist zunächst leer', ownerList.json?.total === 0, JSON.stringify(ownerList.json))

  const guestList = await call(a.host, '/api/admin/embed-sites')
  check('Gast ohne Session → 401', guestList.status === 401, `Status ${guestList.status}`)
  const strangerList = await call(a.host, '/api/admin/embed-sites', { cookie: cookieStranger })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerList.status === 403, `Status ${strangerList.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  // 4. …und NUR der Owner. Eine freigegebene Domain bekommt frame-ancestors UND
  //    (mit auth.embedSession) ein partitioniertes Session-Cookie auf der
  //    fremden Seite — dieselbe Klasse Entscheidung wie das Abo.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4. …und NUR der Owner (Admin/Moderator/Editor/Viewer nicht)')
  const staff = {}
  for (const role of ['admin', 'moderator', 'editor', 'viewer']) {
    const account = await createPoolUser(role)
    const row = await control.createRow({
      databaseId, tableId: 'community_members', rowId: ID.unique(),
      data: {
        communityId: a.communityId,
        runtimeProjectId: poolProject,
        runtimeUserId: account.userId,
        role,
        status: 'active',
        email: account.email,
      },
    })
    cleanup.members.push(row.$id)
    staff[role] = { ...account, cookie: await login(account) }
  }
  for (const role of ['admin', 'moderator', 'editor', 'viewer']) {
    const res = await call(a.host, '/api/admin/embed-sites', { cookie: staff[role].cookie })
    check(`${role} → 403 (community.embed trägt er nicht)`, res.status === 403, `Status ${res.status}`)
    const write = await call(a.host, '/api/admin/embed-sites', {
      method: 'POST', cookie: staff[role].cookie, body: { host: 'geht-nicht.example' },
    })
    check(`${role} darf auch nicht anlegen → 403`, write.status === 403, `Status ${write.status}`)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MANDANTENGRENZE. Die Routen gehen durch die Datentür (`tenantDb`):
  //    `list` scopet, `create` stempelt, `update`/`remove` belegen die
  //    Zugehörigkeit VOR der Aktion. Der Härtefall ist DERSELBE Einbetter-Host
  //    in beiden Communities (uq_tenant_host seit comments-015) plus der
  //    Zugriff über die bekannte fremde Row-Id.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5. Mandantengrenze: nur die eigenen Einbetter')
  const SHARED_HOST = `f37-shared-${Date.now()}.example`
  const siteA = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: SHARED_HOST, label: 'A-Blog' },
  })
  check('Owner A legt einen Einbetter an → 200', siteA.status === 200, `Status ${siteA.status} ${siteA.text.slice(0, 200)}`)
  if (siteA.json?.id) cleanup.sites.push({ host: a.host, cookie: cookieA, id: siteA.json.id })

  const siteB = await call(b.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieB, body: { host: SHARED_HOST, label: 'B-Blog' },
  })
  check('Owner B darf DENSELBEN Host anlegen (Unique ist tenant-relativ) → 200',
    siteB.status === 200, `Status ${siteB.status} ${siteB.text.slice(0, 200)}`)
  if (siteB.json?.id) cleanup.sites.push({ host: b.host, cookie: cookieB, id: siteB.json.id })

  const listA = await call(a.host, '/api/admin/embed-sites', { cookie: cookieA })
  const listB = await call(b.host, '/api/admin/embed-sites', { cookie: cookieB })
  check('A sieht genau EINEN Einbetter — seinen', listA.json?.total === 1 && listA.json?.sites?.[0]?.label === 'A-Blog',
    JSON.stringify(listA.json))
  check('B sieht genau EINEN Einbetter — seinen', listB.json?.total === 1 && listB.json?.sites?.[0]?.label === 'B-Blog',
    JSON.stringify(listB.json))

  const crossPatch = await call(a.host, `/api/admin/embed-sites/${siteB.json?.id}`, {
    method: 'PATCH', cookie: cookieA, body: { label: 'gekapert' },
  })
  check('A ändert die FREMDE Row-Id auf seinem Host → 404 (Datentür belegt die Zugehörigkeit)',
    crossPatch.status === 404, `Status ${crossPatch.status} ${crossPatch.text.slice(0, 160)}`)
  const crossDelete = await call(a.host, `/api/admin/embed-sites/${siteB.json?.id}`, {
    method: 'DELETE', cookie: cookieA,
  })
  check('A löscht die FREMDE Row-Id → 404', crossDelete.status === 404, `Status ${crossDelete.status}`)
  const stillThere = await call(b.host, '/api/admin/embed-sites', { cookie: cookieB })
  check('…und B hat seinen Einbetter unverändert',
    stillThere.json?.sites?.[0]?.label === 'B-Blog', JSON.stringify(stillThere.json))

  const roleTravels = await call(b.host, '/api/admin/embed-sites', { cookie: cookieA })
  check('die Owner-Rolle reist NICHT zur anderen Community → 403', roleTravels.status === 403, `Status ${roleTravels.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n6. Die CSP folgt der Grenze (die HARTE Grenze des Widgets)')
  // Der Einbetter-Cache wird von der Schreibroute invalidiert, greift also
  // sofort. Der eigene Host von B taucht in der CSP von A NICHT auf.
  const cspA = await call(a.host, '/embed?targetId=f37&targetType=verify')
  const ancestorsA = String(cspA.headers['content-security-policy'] ?? '')
  check('A: frame-ancestors nennt den eigenen Einbetter',
    ancestorsA.includes(SHARED_HOST), ancestorsA.slice(0, 200))
  const cspFresh = await call(b.host, '/embed?targetId=f37&targetType=verify')
  const ancestorsB = String(cspFresh.headers['content-security-policy'] ?? '')
  check('B hat eine EIGENE frame-ancestors-Liste', ancestorsB.includes(`'self'`), ancestorsB.slice(0, 200))

  // Der Gegenbeweis: ein Einbetter, den NUR A kennt, steht nie in Bs CSP.
  const ONLY_A = `f37-only-a-${Date.now()}.example`
  const onlyA = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: ONLY_A },
  })
  if (onlyA.json?.id) cleanup.sites.push({ host: a.host, cookie: cookieA, id: onlyA.json.id })
  const cspA2 = await call(a.host, '/embed?targetId=f37&targetType=verify')
  const cspB2 = await call(b.host, '/embed?targetId=f37&targetType=verify')
  check('A: der neue Einbetter steht sofort in der CSP (Cache write-invalidiert)',
    String(cspA2.headers['content-security-policy'] ?? '').includes(ONLY_A),
    String(cspA2.headers['content-security-policy'] ?? '').slice(0, 200))
  check('B: der Einbetter von A steht NICHT in seiner CSP',
    !String(cspB2.headers['content-security-policy'] ?? '').includes(ONLY_A),
    String(cspB2.headers['content-security-policy'] ?? '').slice(0, 200))

  // ──────────────────────────────────────────────────────────────────────────
  // 7. csrfOriginCheck IM POOL. Die F32-Härtung behandelt `same-site` streng —
  //    und unter der Wildcard ist jeder Mandanten-Host same-site zum anderen.
  //    Der Embed-Fluss läuft trotzdem, weil er same-ORIGIN ist. Das wird hier
  //    für den Pool neu belegt, nicht aus dem Silo übernommen.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n7. csrfOriginCheck im Pool (F32-Härtung an der Wildcard)')
  const sameOrigin = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: `f37-sameorigin-${Date.now()}.example` },
    origin: `http://${a.host}:${PORT}`,
    secFetchSite: 'same-origin',
  })
  check('same-origin (der Embed-/Dashboard-Fluss) geht durch → 200',
    sameOrigin.status === 200, `Status ${sameOrigin.status} ${sameOrigin.text.slice(0, 160)}`)
  if (sameOrigin.json?.id) cleanup.sites.push({ host: a.host, cookie: cookieA, id: sameOrigin.json.id })

  const crossTenant = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: 'boese.example' },
    origin: `http://${b.host}:${PORT}`,
    secFetchSite: 'same-site',
  })
  check('ein Formular auf der NACHBAR-Community (same-site) wird abgewiesen → 403',
    crossTenant.status === 403, `Status ${crossTenant.status} ${crossTenant.text.slice(0, 160)}`)

  const crossSite = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: 'boese.example' },
    origin: 'https://boese.example',
    secFetchSite: 'cross-site',
  })
  check('cross-site → 403', crossSite.status === 403, `Status ${crossSite.status}`)

  const sameSiteNoOrigin = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: 'boese.example' }, secFetchSite: 'same-site',
  })
  check('same-site OHNE Origin (Widerspruch in sich) → 403', sameSiteNoOrigin.status === 403, `Status ${sameSiteNoOrigin.status}`)

  const embedCount = await call(a.host, `/api/comments/count?targetId=f37&targetType=verify`, {
    origin: 'https://fremde-seite.example', secFetchSite: 'cross-site',
  })
  check('der Zähler von embed.js (GET, cross-site) bleibt erlaubt → 200',
    embedCount.status === 200, `Status ${embedCount.status}`)

  // Und die Naht, die weiterlaufen MUSS: kopflose Server-zu-Server-Aufrufe
  // (Control Plane, Beweis-Skripte) tragen weder Origin noch Sec-Fetch-Site.
  const headless = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: `f37-headless-${Date.now()}.example` },
  })
  check('kopfloser Aufruf (kein Origin, kein Sec-Fetch-Site) geht durch → 200',
    headless.status === 200, `Status ${headless.status} ${headless.text.slice(0, 160)}`)
  if (headless.json?.id) cleanup.sites.push({ host: a.host, cookie: cookieA, id: headless.json.id })

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n8. Löschen bleibt beim Owner')
  const strangerDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: cookieStranger,
  })
  check('Fremder darf nicht löschen → 403', strangerDelete.status === 403, `Status ${strangerDelete.status}`)
  const adminDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: staff.admin.cookie,
  })
  check('Community-Admin darf nicht löschen → 403', adminDelete.status === 403, `Status ${adminDelete.status}`)
  const ownerDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: cookieA,
  })
  check('Owner darf löschen → 200', ownerDelete.status === 200, `Status ${ownerDelete.status}`)
  if (ownerDelete.status === 200) {
    cleanup.sites = cleanup.sites.filter(s => s.id !== siteA.json?.id)
  }
  const cspAfter = await call(a.host, '/embed?targetId=f37&targetType=verify')
  check('…und der Host fliegt sofort aus der CSP',
    !String(cspAfter.headers['content-security-policy'] ?? '').includes(SHARED_HOST),
    String(cspAfter.headers['content-security-policy'] ?? '').slice(0, 200))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  console.log('\nAufräumen …')
  for (const site of cleanup.sites) {
    await call(site.host, `/api/admin/embed-sites/${site.id}`, { method: 'DELETE', cookie: site.cookie }).catch(() => {})
  }
  for (const id of cleanup.members) {
    await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  }
  // Die Tabelle heißt `communities` (E8-Vokabular) — `tenants` ist nur noch
  // der Name im Gespräch. Ein `.catch(() => {})` auf einen Tippfehler räumt
  // still NICHTS weg und der Lauf sieht trotzdem grün aus.
  for (const id of cleanup.tenants) {
    await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.codes) {
    await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await poolUsers.delete({ userId: id }).catch(() => {})
  }
  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
  process.exit(fail === 0 ? 0 : 1)
}

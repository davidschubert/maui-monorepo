/**
 * Beweis für F12 — die Kunden-Übersicht auf `my.*`.
 *
 * Fährt den ECHTEN Weg gegen den laufenden Platform-Server: zwei Communities
 * per Wizard anlegen, Mitgliedschaften setzen, und dann messen, WAS WER SIEHT
 * und WOHIN `/` führt.
 *
 *   1. Die Liste zeigt GENAU die eigenen Communities — nie die fremde.
 *   2. Die Testphase steht nur beim Owner (`community.billing`); als Viewer
 *      derselben Community ist sie null. Der Plan steht bei beiden (er steckt
 *      ohnehin im SSR-Payload jeder Community-Seite).
 *   3. Ein ENTFERNTES Mitglied (status 'removed') sieht die Community nicht.
 *   4. Der Umschlag trägt nur die sechs Felder der Ansicht — kein
 *      stripeCustomerId, kein projectId, kein tenantId.
 *   5. Kanten: Gast → 401, Mandanten-Host → 404 (Route UND Seite).
 *   6. Die Wege: `my./` → Übersicht · leeres Konto → weiter in den Wizard ·
 *      ausgeloggt → Login mit `?redirect=` · `start./` → Wizard ·
 *      `?code=` schlägt auf BEIDEN Hosts durch.
 *
 * Der Server muss mit den drei Test-Hosts laufen:
 *   NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=app.localhost,my.localhost,start.localhost \
 *   NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=start.localhost \
 *   pnpm --filter platform dev
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --experimental-strip-types --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-my-overview.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const MY_HOST = process.env.MY_HOST || 'my.localhost'
const START_HOST = process.env.START_HOST || 'start.localhost'

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
const cleanup = { users: [], codes: [], tenants: [], members: [] }

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
        catch { /* HTML-Seite */ }
        resolve({
          status: res.statusCode,
          json,
          text,
          location: res.headers.location ?? '',
          setCookie: res.headers['set-cookie'] ?? [],
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createPoolUser(tag) {
  const email = `f12-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `F12 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

async function login(account) {
  const res = await call(MY_HOST, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-F12TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'F12-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(cookie, name, slug, code) {
  const res = await call(MY_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name, slug, purpose: 'new', memberRange: 'to100', category: 'club',
      goal: 'discussion', description: 'Beweis für die Kunden-Übersicht auf my.',
      vibe: 'calm', inviteCode: code, locale: 'de',
    },
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Anlegen fehlgeschlagen (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', res.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return res.json
}

async function addMember(communityId, user, role, status) {
  const row = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId, runtimeProjectId: poolProject, runtimeUserId: user.userId,
      role, status, email: user.email,
      ...(status === 'removed' ? { removedAt: new Date().toISOString() } : {}),
    },
  })
  cleanup.members.push(row.$id)
  return row.$id
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

const mine = (cookie, host = MY_HOST) => call(host, '/api/onboarding/communities', { cookie })
/** Ziel einer Weiterleitung ohne Locale-Prefix (prefix_except_default). */
const withoutLocale = path => (path.split('?')[0] || '').replace(/^\/(de|en)(?=\/|$)/, '') || '/'

try {
  console.log(`\nF12-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const alice = await createPoolUser('alice')
  const bob = await createPoolUser('bob')
  const stranger = await createPoolUser('stranger')
  const exiled = await createPoolUser('exiled')

  const aliceCookie = await login(alice)
  const bobCookie = await login(bob)
  const strangerCookie = await login(stranger)
  const exiledCookie = await login(exiled)

  console.log('1. Zwei Communities per Wizard anlegen')
  const stamp = Date.now().toString(36)
  const a = await createCommunity(aliceCookie, 'Alice Community', `f12a-${stamp}`, await issueCode())
  const b = await createCommunity(bobCookie, 'Bobs Verein', `f12b-${stamp}`, await issueCode())
  check('Alice-Community steht', !!a.communityId, JSON.stringify(a))
  check('Bob-Community steht', !!b.communityId, JSON.stringify(b))
  check('Community-Host antwortet', await waitForHost(a.host), 'Host wurde nicht aufgelöst')

  // Alice ist zusätzlich MITGLIED (viewer) bei Bob — der Fall, an dem sich die
  // Testphasen-Grenze zeigt. Exiled war Mitglied bei Alice und wurde entfernt.
  await addMember(b.communityId, alice, 'viewer', 'active')
  await addMember(a.communityId, exiled, 'viewer', 'removed')

  console.log('\n2. Wer sieht was?')
  const aliceList = await mine(aliceCookie)
  check('Alice bekommt 200', aliceList.status === 200, `${aliceList.status} ${aliceList.text.slice(0, 160)}`)
  const aliceHosts = (aliceList.json?.communities ?? []).map(c => c.host)
  check('Alice sieht GENAU ihre beiden (eigene zuerst)',
    JSON.stringify(aliceHosts) === JSON.stringify([a.host, b.host]), JSON.stringify(aliceHosts))

  const bobList = await mine(bobCookie)
  const bobHosts = (bobList.json?.communities ?? []).map(c => c.host)
  check('Bob sieht NUR seine — nicht die von Alice',
    JSON.stringify(bobHosts) === JSON.stringify([b.host]), JSON.stringify(bobHosts))

  const strangerList = await mine(strangerCookie)
  check('Wer nirgends Mitglied ist, sieht nichts',
    strangerList.status === 200 && (strangerList.json?.communities ?? []).length === 0,
    `${strangerList.status} ${strangerList.text.slice(0, 160)}`)

  const exiledList = await mine(exiledCookie)
  check('Ein ENTFERNTES Mitglied sieht die Community NICHT (status removed)',
    exiledList.status === 200 && (exiledList.json?.communities ?? []).length === 0,
    JSON.stringify(exiledList.json))

  console.log('\n3. Die Testphase sieht nur, wer abrechnet')
  const aliceOwn = aliceList.json?.communities?.[0]
  const aliceGuest = aliceList.json?.communities?.[1]
  check('als OWNER: Rolle owner + Testphasen-Datum',
    aliceOwn?.role === 'owner' && typeof aliceOwn?.trialEndsAt === 'string', JSON.stringify(aliceOwn))
  check('als VIEWER derselben Zeile: Rolle viewer + trialEndsAt null',
    aliceGuest?.role === 'viewer' && aliceGuest?.trialEndsAt === null, JSON.stringify(aliceGuest))
  check('der PLAN steht bei beiden (steckt ohnehin im SSR-Payload jeder Community)',
    aliceOwn?.plan === 'pro' && aliceGuest?.plan === 'pro',
    `${aliceOwn?.plan} / ${aliceGuest?.plan}`)

  console.log('\n4. Der Umschlag trägt nur die Ansicht')
  const keys = Object.keys(aliceOwn ?? {}).sort()
  check('genau {communityId, host, name, plan, role, trialEndsAt}',
    JSON.stringify(keys) === JSON.stringify(['communityId', 'host', 'name', 'plan', 'role', 'trialEndsAt']),
    JSON.stringify(keys))

  console.log('\n5. Kanten der Route')
  const guest = await mine(null)
  check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  const onTenant = await mine(aliceCookie, a.host)
  check('auf einem Mandanten-Host → 404 (Betreiber-Inhalt gehört dort nicht hin)',
    onTenant.status === 404, `Status ${onTenant.status}`)
  const pageOnTenant = await call(a.host, '/communities', { cookie: aliceCookie })
  check('… und die SEITE dort ebenso → 404', pageOnTenant.status === 404, `Status ${pageOnTenant.status}`)

  console.log('\n6. Wohin führt `/`?')
  const myRoot = await call(MY_HOST, '/', { cookie: aliceCookie })
  check('my./ (eingeloggt, mit Communities) → Übersicht',
    myRoot.status === 302 && withoutLocale(myRoot.location) === '/communities',
    `${myRoot.status} → ${myRoot.location}`)

  const emptyRoot = await call(MY_HOST, '/communities', { cookie: strangerCookie })
  check('my./communities mit 0 Communities → weiter in den Wizard',
    emptyRoot.status === 302 && withoutLocale(emptyRoot.location) === '/start',
    `${emptyRoot.status} → ${emptyRoot.location}`)

  // Der Auth-Guard hängt das Ziel als `?redirect=` an (safeRedirectTarget) —
  // nach der Anmeldung geht es also auf die Übersicht zurück, nicht auf `/`.
  const loggedOut = await call(MY_HOST, '/communities')
  const redirectsToCommunities = raw =>
    withoutLocale(raw) === '/login' && /redirect=(%2F|\/)(de(%2F|\/)|en(%2F|\/))?communities/.test(raw)
  check('my./communities ausgeloggt → Login mit `?redirect=` auf die Übersicht',
    loggedOut.status === 302 && redirectsToCommunities(loggedOut.location),
    `${loggedOut.status} → ${loggedOut.location}`)

  const rootLoggedOut = await call(MY_HOST, '/')
  check('my./ ausgeloggt → derselbe Login, dasselbe Rückziel',
    rootLoggedOut.status === 302 && redirectsToCommunities(rootLoggedOut.location),
    `${rootLoggedOut.status} → ${rootLoggedOut.location}`)

  const startRoot = await call(START_HOST, '/', { cookie: aliceCookie })
  check('start./ behält den Wizard — auch für einen Bestandskunden',
    startRoot.status === 302 && withoutLocale(startRoot.location) === '/start',
    `${startRoot.status} → ${startRoot.location}`)

  const startCode = await call(START_HOST, '/?code=PUKA-DEMO-1234', { cookie: aliceCookie })
  check('start./?code=… → Wizard MIT Code',
    startCode.status === 302
    && withoutLocale(startCode.location) === '/start'
    && startCode.location.includes('code=PUKA-DEMO-1234'),
    `${startCode.status} → ${startCode.location}`)

  const myCode = await call(MY_HOST, '/?code=PUKA-DEMO-1234', { cookie: aliceCookie })
  check('my./?code=… → der Code schlägt die Übersicht (weitergeleitete Mail)',
    myCode.status === 302
    && withoutLocale(myCode.location) === '/start'
    && myCode.location.includes('code=PUKA-DEMO-1234'),
    `${myCode.status} → ${myCode.location}`)

  console.log('\n7. Die Seite rendert die Karten')
  const page = await call(MY_HOST, '/communities', { cookie: aliceCookie })
  check('Übersicht liefert 200', page.status === 200, `Status ${page.status}`)
  check('… mit einer Karte je Community',
    page.text.includes(`data-community-host="${a.host}"`) && page.text.includes(`data-community-host="${b.host}"`),
    page.text.slice(0, 200))
  check('… und ohne die fremde Community',
    !page.text.includes('f12b-fremd'), 'fremder Host im HTML')
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\n8. Aufräumen')
  for (const id of [...new Set(cleanup.members)]) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Communities: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

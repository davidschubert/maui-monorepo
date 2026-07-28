/**
 * Beweis für O5 — Branding pro Mandant + Autorisierung je Community.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server:
 * registrieren/anmelden auf dem Kontroll-Host → Community per Wizard-Route
 * anlegen → dann auf dem Community-Host prüfen:
 *   - trägt die Site den gewählten Vibe? (Theme pro Mandant statt pro Projekt)
 *   - darf der Owner seine Seiten pflegen — OHNE globales Label?
 *   - bleibt ein Fremder draußen, obwohl er auf DERSELBEN Instanz eingeloggt ist?
 *   - reist eine Owner-Rolle NICHT auf eine andere Community mit?
 *   - hat der Owner das Site-Label bekommen (Naht 4, privates Lesen)?
 *   - sieht er die Kennzahlen SEINER Übersicht (C1) — und ein Fremder nicht?
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-site-authz.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const OTHER_TENANT_HOST = process.env.OTHER_TENANT_HOST || 'kunde-a.localhost'

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

async function createPoolUser(tag) {
  const email = `o5-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `O5 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

/** Anmelden auf dem Kontroll-Host → Session-Cookie. */
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
  const code = `MAUI-O5TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'O5-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

try {
  console.log(`\nO5-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const stranger = await createPoolUser('stranger')
  const code = await issueCode()
  const ownerCookie = await login(owner)
  const strangerCookie = await login(stranger)
  const slug = `o5-${Date.now().toString(36)}`

  console.log('1. Community anlegen (echter Wizard-Abschluss, Vibe „elegant")')
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      name: 'O5 Isolationsprobe',
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Wir prüfen, ob Rollen an ihrer Community kleben.',
      vibe: 'elegant',
      inviteCode: code,
      locale: 'de',
    },
  })
  check('angelegt', created.status === 200 && !!created.json?.siteId, `${created.status} ${created.text.slice(0, 200)}`)
  const siteId = created.json?.siteId
  const host = created.json?.host
  if (siteId) cleanup.tenants.push(siteId)

  const tenantRow = siteId ? await control.getRow({ databaseId, tableId: 'tenants', rowId: siteId }) : null
  if (tenantRow?.workspaceId) cleanup.workspaces.push(tenantRow.workspaceId)
  const members = await control.listRows({
    databaseId, tableId: 'site_members', queries: [Query.equal('siteId', siteId ?? 'x'), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))

  console.log('\n2. Branding pro Mandant')
  const themes = await waitForHost(host)
  check('Community-Host antwortet', !!themes, 'Host wurde nicht aufgelöst')
  check('Vibe „elegant" → Theme graphite', themes?.json?.settings?.defaultThemeId === 'graphite', JSON.stringify(themes?.json?.settings))
  check('Variante „ink" gesetzt', themes?.json?.settings?.defaultVariantId === 'ink', JSON.stringify(themes?.json?.settings))
  const otherThemes = await call(OTHER_TENANT_HOST, '/api/themes')
  check('ANDERE Community bleibt unverändert (kein Projekt-weites Umfärben)',
    otherThemes.json?.settings?.defaultThemeId !== 'graphite',
    JSON.stringify(otherThemes.json?.settings))

  console.log('\n3. Autorisierung je Community')
  const ownerPages = await call(host, '/api/pages', { cookie: ownerCookie })
  check('Owner darf seine Seiten verwalten (ohne globales Label)', ownerPages.status === 200, `Status ${ownerPages.status}`)
  const strangerPages = await call(host, '/api/pages', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerPages.status === 403, `Status ${strangerPages.status}`)
  const guestPages = await call(host, '/api/pages')
  check('Gast ohne Session → 401', guestPages.status === 401, `Status ${guestPages.status}`)
  const crossPages = await call(OTHER_TENANT_HOST, '/api/pages', { cookie: ownerCookie })
  check('Owner-Rolle reist NICHT zur anderen Community → 403', crossPages.status === 403, `Status ${crossPages.status}`)
  const ownerReports = await call(host, '/api/reports', { cookie: ownerCookie })
  check('Owner darf Meldungen sehen', ownerReports.status === 200, `Status ${ownerReports.status}`)
  const strangerReports = await call(OTHER_TENANT_HOST, '/api/reports', { cookie: strangerCookie })
  check('Fremder darf fremde Meldungen NICHT sehen', strangerReports.status === 403, `Status ${strangerReports.status}`)

  console.log('\n4. Site-Label (Naht 4: privates Lesen)')
  const ownerAfter = await poolUsers.get({ userId: owner.userId })
  check('Owner hat das Site-Label', (ownerAfter.labels ?? []).includes(siteId), JSON.stringify(ownerAfter.labels))
  const strangerAfter = await poolUsers.get({ userId: stranger.userId })
  check('Fremder hat es NICHT', !(strangerAfter.labels ?? []).includes(siteId), JSON.stringify(strangerAfter.labels))

  console.log('\n5. Handoff: in der Community ankommen — eingeloggt (Schritt 9)')
  // Session-Cookies sind host-only: die Anmeldung auf app.* gilt auf der
  // Subdomain nicht. Der Handoff ist die Brücke.
  const noCookieYet = await call(host, '/api/auth/me')
  check('ohne Handoff ist man auf der Community NICHT eingeloggt', noCookieYet.status === 401, `Status ${noCookieYet.status}`)

  const handoff = await call(CONTROL_HOST, '/api/onboarding/handoff', {
    method: 'POST', cookie: ownerCookie, body: { siteId },
  })
  check('Kontroll-Host siegelt ein Token', handoff.status === 200 && !!handoff.json?.token, `Status ${handoff.status}`)

  const exchange = await call(host, `/api/auth/site-session?token=${encodeURIComponent(handoff.json?.token ?? '')}&to=%2F`)
  const handoffCookie = exchange.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  check('Community-Host löst ein und leitet weiter', exchange.status === 302, `Status ${exchange.status}`)
  check('setzt sein eigenes Session-Cookie', !!handoffCookie, exchange.setCookie.join(' | ').slice(0, 120))

  const meOnTenant = handoffCookie ? await call(host, '/api/auth/me', { cookie: handoffCookie }) : { status: 0, json: null }
  check('danach ist man auf der Community eingeloggt', meOnTenant.status === 200 && meOnTenant.json?.email === owner.email, `Status ${meOnTenant.status}`)

  const badToken = await call(host, '/api/auth/site-session?token=kaputt')
  check('manipuliertes Token → 401, kein Cookie', badToken.status === 401 && !badToken.setCookie.some(c => c.startsWith('a_session_')), `Status ${badToken.status}`)

  const openRedirect = await call(host, `/api/auth/site-session?token=${encodeURIComponent(handoff.json?.token ?? '')}&to=https%3A%2F%2Fboese.example`)
  check('absolutes Weiterleitungsziel wird abgewiesen (kein Open Redirect)', openRedirect.status === 400, `Status ${openRedirect.status}`)

  console.log('\n6. Projekt-globale Betreiber-Routen bleiben für Kunden zu')
  for (const path of ['/api/admin/config', '/api/admin/users', '/api/admin/audit']) {
    const res = await call(host, path, { cookie: ownerCookie })
    check(`${path} → 403 für den Site-Owner`, res.status === 403, `Status ${res.status}`)
  }

  console.log('\n6b. Die Kennzahlen der Übersicht gehören dagegen dem Owner (C1)')
  const ownerStats = await call(host, '/api/admin/stats', { cookie: ownerCookie })
  check('/api/admin/stats → 200 (vorher 403: der Gate war label-only)', ownerStats.status === 200, `Status ${ownerStats.status}`)
  check('Nutzerzahl bleibt im Pool leer — Projekt-Nutzer ≠ Site-Mitglieder',
    ownerStats.json?.usersTotal === null, JSON.stringify(ownerStats.json))
  check('gemeldete Kommentare kommen mit (Owner trägt comments.moderate)',
    typeof ownerStats.json?.commentsReported === 'number', JSON.stringify(ownerStats.json))
  const ownerAnalytics = await call(host, '/api/admin/analytics?days=7', { cookie: ownerCookie })
  check('/api/admin/analytics → 200 mit 7 Tagespunkten',
    ownerAnalytics.status === 200 && ownerAnalytics.json?.points?.length === 7,
    `Status ${ownerAnalytics.status}`)
  check('Registrierungs-Reihe bleibt im Pool bewusst leer',
    ownerAnalytics.json?.usersInRange === null, JSON.stringify(ownerAnalytics.json?.usersInRange))
  const strangerStats = await call(host, '/api/admin/stats', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerStats.status === 403, `Status ${strangerStats.status}`)
  const guestStats = await call(host, '/api/admin/stats')
  check('Gast ohne Session → 401', guestStats.status === 401, `Status ${guestStats.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n7. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'site_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'tenants', rowId: id }).catch(() => {})
  for (const id of cleanup.workspaces) await control.deleteRow({ databaseId, tableId: 'workspaces', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'tenants', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

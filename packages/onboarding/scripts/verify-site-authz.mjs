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
 *   - kann er sein TEAM verwalten (Abschnitt 8, Audit-Befund S9): einladen,
 *     Rollen ändern, Zugang entziehen, Besitz übertragen — Admin ebenfalls,
 *     Moderator/Editor/Viewer NICHT, Fremder 403, Gast 401? Und halten die
 *     Schutzregeln (kein Selbst-Degradieren, Owner nur per Übergabe)? Zum
 *     Schluss der Kern von Davids Entscheidung 1: nach dem Entfernen steht der
 *     Kommentar des Entfernten weiter da, mit Namen und mit dem Zeichen
 *     „Ehemaliges Mitglied".
 *   - ist MITGLIEDSCHAFT ein Ereignis (Abschnitt 10, A5)? Offene Community:
 *     Beitritt beim ersten Schreibvorgang und bei der Anmeldung auf dem Host —
 *     ein bloßer BESUCH macht niemanden zum Mitglied. Entfernen: Label weg,
 *     read('members')-Inhalt (die Presence der anderen) nicht mehr lesbar, und
 *     beim nächsten Besuch kommt es NICHT zurück. Geschlossene Community: kein
 *     Auto-Beitritt, nur die Einladung führt hinein.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-site-authz.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Presences, Query, TablesDB, Users } from 'node-appwrite'

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
const cleanup = { users: [], codes: [], tenants: [], members: [], workspaces: [], invites: [], comments: [], presences: [] }

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
  // SEIT A5 (2026-07-29) bedeutet das Label „ist Mitglied dieser Community" —
  // abgeleitet aus einer site_members-Zeile MIT ZUGANG, nicht mehr aus „hat den
  // Host benutzt" (das war A4, und daran scheiterte „Zugang entziehen": das
  // Publikum kam beim nächsten Besuch zurück). Vergeben wird es von
  // server/middleware/site-label.ts an jedes Mitglied — ohne das sähe niemand
  // außer dem Owner Anwesende oder den Activity-Feed (beide hängen an
  // read(label(siteId))). Das Label ist ein LESE-PUBLIKUM, KEINE Rolle: es
  // gewährt keine einzige Capability (hasCapability kennt nur
  // 'admin'/'moderator') — die 403er aus Schritt 3 beweisen das direkt.
  const ownerAfter = await poolUsers.get({ userId: owner.userId })
  check('Owner hat das Site-Label (Gründung = Mitgliedschaft)',
    (ownerAfter.labels ?? []).includes(siteId), JSON.stringify(ownerAfter.labels))
  const strangerAfter = await poolUsers.get({ userId: stranger.userId })
  check('Fremder (eingeloggt, kein Mitglied) trägt es NICHT — Besuchen ist kein Beitritt',
    !(strangerAfter.labels ?? []).includes(siteId), JSON.stringify(strangerAfter.labels))
  check('…und bleibt auch sonst draußen: Label ≠ Rolle (Schritt 3: 403)',
    strangerPages.status === 403, `Status ${strangerPages.status}`)
  // Der Gegenbeweis: wer den Host NIE berührt hat, bekommt erst recht nichts.
  const outsider = await createPoolUser('outsider')
  await login(outsider) // nur auf dem KONTROLL-Host — dort gibt es keinen Mandanten
  const outsiderAfter = await poolUsers.get({ userId: outsider.userId })
  check('Wer den Host nie besucht hat, trägt das Label NICHT',
    !(outsiderAfter.labels ?? []).includes(siteId), JSON.stringify(outsiderAfter.labels))

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

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n8. Mitglieder-Verwaltung (S9: team.manage ist keine tote Capability mehr)')
  // Vier Testpersonen mit echten Mitgliedschaften. Bewusst FRISCHE Nutzer: der
  // Rollen-Resolver cacht 30 s, und für `stranger` steht schon ein „keine
  // Rolle" im Cache — ein neu angelegtes Mitglied wurde noch nie gefragt und
  // wird deshalb sofort gesehen.
  const staff = {}
  for (const role of ['admin', 'moderator', 'editor', 'viewer']) {
    const account = await createPoolUser(role)
    const row = await control.createRow({
      databaseId,
      tableId: 'site_members',
      rowId: ID.unique(),
      data: {
        siteId,
        runtimeProjectId: poolProject,
        runtimeUserId: account.userId,
        role,
        status: 'active',
        email: account.email,
      },
    })
    cleanup.members.push(row.$id)
    staff[role] = { ...account, memberId: row.$id, cookie: await login(account) }
  }

  console.log('  Lesen: wer darf die Mitgliederliste sehen?')
  const ownerList = await call(host, '/api/site/members', { cookie: ownerCookie })
  check('Owner → 200', ownerList.status === 200, `Status ${ownerList.status} ${ownerList.text.slice(0, 160)}`)
  check('…und findet sich selbst als Owner darin',
    (ownerList.json?.members ?? []).some(m => m.role === 'owner' && m.self === true),
    JSON.stringify(ownerList.json?.members ?? []).slice(0, 200))
  const adminList = await call(host, '/api/site/members', { cookie: staff.admin.cookie })
  check('Admin → 200', adminList.status === 200, `Status ${adminList.status}`)
  for (const role of ['moderator', 'editor', 'viewer']) {
    const res = await call(host, '/api/site/members', { cookie: staff[role].cookie })
    check(`${role} → 403 (team.manage fehlt ihm)`, res.status === 403, `Status ${res.status}`)
  }
  const strangerList = await call(host, '/api/site/members', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerList.status === 403, `Status ${strangerList.status}`)
  const guestList = await call(host, '/api/site/members')
  check('Gast ohne Session → 401', guestList.status === 401, `Status ${guestList.status}`)

  console.log('  Einladen: gleiche Grenze, eigener Endpunkt')
  const inviteBody = { email: `o5-invitee-${Date.now()}@example.test`, role: 'viewer' }
  const ownerInvite = await call(host, '/api/site/members', { method: 'POST', cookie: ownerCookie, body: inviteBody })
  // 503 = kein SMTP in dieser Umgebung. Das ist KEIN Autorisierungsfehler und
  // der Punkt dieses Abschnitts: 401/403 wären der Fehler.
  check('Owner darf einladen (200; 503 = Mailer aus)',
    ownerInvite.status === 200 || ownerInvite.status === 503, `Status ${ownerInvite.status} ${ownerInvite.text.slice(0, 160)}`)
  if (ownerInvite.status === 503) console.log('    ℹ Mailer aus (503) — Einladung wurde bewusst NICHT angelegt')
  if (ownerInvite.json?.inviteId) cleanup.invites.push(ownerInvite.json.inviteId)
  const adminInvite = await call(host, '/api/site/members', {
    method: 'POST', cookie: staff.admin.cookie, body: { email: `o5-invitee2-${Date.now()}@example.test`, role: 'editor' },
  })
  check('Admin darf einladen (200; 503 = Mailer aus)',
    adminInvite.status === 200 || adminInvite.status === 503, `Status ${adminInvite.status}`)
  if (adminInvite.json?.inviteId) cleanup.invites.push(adminInvite.json.inviteId)
  for (const role of ['moderator', 'editor', 'viewer']) {
    const res = await call(host, '/api/site/members', {
      method: 'POST', cookie: staff[role].cookie, body: { email: 'nope@example.test', role: 'viewer' },
    })
    check(`${role} darf NICHT einladen → 403`, res.status === 403, `Status ${res.status}`)
  }
  const guestInvite = await call(host, '/api/site/members', { method: 'POST', body: { email: 'nope@example.test', role: 'viewer' } })
  check('Gast darf nicht einladen → 401', guestInvite.status === 401, `Status ${guestInvite.status}`)
  const inviteAsOwnerRole = await call(host, '/api/site/members', {
    method: 'POST', cookie: ownerCookie, body: { email: 'nope@example.test', role: 'owner' },
  })
  check('als „owner" einladen ist verboten (Besitz nur per Übergabe)',
    inviteAsOwnerRole.status === 409 || inviteAsOwnerRole.status === 400,
    `Status ${inviteAsOwnerRole.status} ${inviteAsOwnerRole.text.slice(0, 120)}`)

  console.log('  Rolle ändern: Regeln greifen serverseitig')
  const promote = await call(host, `/api/site/members/${staff.viewer.memberId}`, {
    method: 'PATCH', cookie: staff.admin.cookie, body: { role: 'moderator' },
  })
  check('Admin darf eine Rolle ändern → 200', promote.status === 200, `Status ${promote.status} ${promote.text.slice(0, 160)}`)
  const viewerRow = await control.getRow({ databaseId, tableId: 'site_members', rowId: staff.viewer.memberId })
  check('…und die Zeile trägt die neue Rolle', viewerRow.role === 'moderator', `role=${viewerRow.role}`)
  const selfDemote = await call(host, `/api/site/members/${staff.admin.memberId}`, {
    method: 'PATCH', cookie: staff.admin.cookie, body: { role: 'viewer' },
  })
  check('Selbst-Degradierung → 409 self_demote',
    selfDemote.status === 409 && selfDemote.json?.reason === 'self_demote',
    `Status ${selfDemote.status} ${selfDemote.text.slice(0, 200)}`)
  const ownerMemberId = members.rows.find(row => row.role === 'owner')?.$id
  const touchOwner = await call(host, `/api/site/members/${ownerMemberId}`, {
    method: 'PATCH', cookie: staff.admin.cookie, body: { role: 'viewer' },
  })
  check('Admin kann den Owner nicht degradieren → 409 owner_protected',
    touchOwner.status === 409 && touchOwner.json?.reason === 'owner_protected',
    `Status ${touchOwner.status} ${touchOwner.text.slice(0, 200)}`)
  const makeOwner = await call(host, `/api/site/members/${staff.editor.memberId}`, {
    method: 'PATCH', cookie: ownerCookie, body: { role: 'owner' },
  })
  check('niemand wird per Rollen-Änderung Owner → 409 owner_protected',
    makeOwner.status === 409 && makeOwner.json?.reason === 'owner_protected',
    `Status ${makeOwner.status}`)
  const selfRemove = await call(host, `/api/site/members/${ownerMemberId}`, { method: 'DELETE', cookie: ownerCookie })
  check('Owner kann sich nicht selbst entfernen → 409 self_remove',
    selfRemove.status === 409 && selfRemove.json?.reason === 'self_remove',
    `Status ${selfRemove.status} ${selfRemove.text.slice(0, 200)}`)
  for (const role of ['moderator', 'editor']) {
    const res = await call(host, `/api/site/members/${staff.viewer.memberId}`, {
      method: 'PATCH', cookie: staff[role].cookie, body: { role: 'viewer' },
    })
    check(`${role} darf keine Rollen ändern → 403`, res.status === 403, `Status ${res.status}`)
  }

  console.log('  Entfernen entzieht den ZUGANG — Inhalte bleiben (Entscheidung 1)')
  // Der Editor schreibt einen Kommentar, BEVOR er entfernt wird. Danach muss der
  // Kommentar mit seinem Namen stehen und das Zeichen „Ehemaliges Mitglied"
  // tragen. Der Kommentar wird vorher NICHT gelesen — der Ehemaligen-Cache
  // (60 s, pro Autor) darf kein „ist kein Ehemaliger" gespeichert haben.
  const targetId = `o5-members-${Date.now()}`
  const posted = await call(host, '/api/comments', {
    method: 'POST',
    cookie: staff.editor.cookie,
    body: { targetId, targetType: 'verify', content: 'Ich war hier — und bleibe im Thread stehen.' },
  })
  check('Editor kann einen Kommentar schreiben', posted.status === 200 || posted.status === 201, `Status ${posted.status} ${posted.text.slice(0, 200)}`)
  const commentId = posted.json?.$id ?? posted.json?.comment?.$id
  if (commentId) cleanup.comments.push(commentId)

  const removeEditor = await call(host, `/api/site/members/${staff.editor.memberId}`, {
    method: 'DELETE', cookie: staff.admin.cookie,
  })
  check('Admin darf entfernen → 200', removeEditor.status === 200, `Status ${removeEditor.status} ${removeEditor.text.slice(0, 160)}`)
  const editorRow = await control.getRow({ databaseId, tableId: 'site_members', rowId: staff.editor.memberId })
  check('die Mitgliedschaft ist NICHT gelöscht, sondern status=removed',
    editorRow.status === 'removed' && !!editorRow.removedAt, JSON.stringify({ status: editorRow.status, removedAt: editorRow.removedAt }))

  const listAfter = await call(host, `/api/comments?targetId=${targetId}&targetType=verify`)
  const authorRow = (listAfter.json?.rows ?? []).find(row => row.$id === commentId)
  check('der Kommentar steht weiter da — mit Namen', !!authorRow?.authorName, JSON.stringify(authorRow ?? {}).slice(0, 200))
  check('…und trägt das Zeichen „Ehemaliges Mitglied" (gebündelter Lookup)',
    authorRow?.authorFormerMember === true, JSON.stringify(authorRow ?? {}).slice(0, 200))

  for (const role of ['moderator', 'viewer']) {
    const res = await call(host, `/api/site/members/${staff.admin.memberId}`, { method: 'DELETE', cookie: staff[role].cookie })
    check(`${role} darf niemanden entfernen → 403`, res.status === 403, `Status ${res.status}`)
  }
  const guestRemove = await call(host, `/api/site/members/${staff.admin.memberId}`, { method: 'DELETE' })
  check('Gast darf niemanden entfernen → 401', guestRemove.status === 401, `Status ${guestRemove.status}`)

  console.log('  Besitz übertragen: OWNER-Sache (site.transfer), nicht team.manage')
  const adminTransfer = await call(host, `/api/site/members/${staff.moderator.memberId}/transfer`, {
    method: 'POST', cookie: staff.admin.cookie,
  })
  check('Admin darf NICHT übertragen → 403', adminTransfer.status === 403, `Status ${adminTransfer.status}`)
  const ownerTransfer = await call(host, `/api/site/members/${staff.admin.memberId}/transfer`, {
    method: 'POST', cookie: ownerCookie,
  })
  check('Owner darf übertragen → 200', ownerTransfer.status === 200, `Status ${ownerTransfer.status} ${ownerTransfer.text.slice(0, 160)}`)
  const newOwner = await control.getRow({ databaseId, tableId: 'site_members', rowId: staff.admin.memberId })
  const oldOwner = ownerMemberId ? await control.getRow({ databaseId, tableId: 'site_members', rowId: ownerMemberId }) : null
  check('das Ziel ist jetzt Owner', newOwner.role === 'owner', `role=${newOwner.role}`)
  check('der Übertragende ist Admin — nicht draußen', oldOwner?.role === 'admin', `role=${oldOwner?.role}`)

  // ══════════════════════════════════════════════════════════════════════════
  // 10. MITGLIEDSCHAFT IST EIN EREIGNIS (A5, Davids Entscheidung 1, 2026-07-29)
  //
  // Der Befund davor: das Site-Label bedeutete „hat den Host eingeloggt
  // benutzt" (A4). Damit war „Zugang entziehen" ein Versprechen ohne Wirkung —
  // die Rolle war weg, das Lese-Publikum kam beim nächsten Besuch zurück.
  // Dieser Abschnitt prüft die drei Sätze, aus denen die Behebung besteht:
  //   a) OFFEN   → der Auslöser macht Mitglied (Zeile UND Label), ein BESUCH nicht.
  //   b) ENTZUG  → Label weg, read('members')-Inhalt nicht mehr lesbar,
  //                und beim nächsten Besuch kommt es NICHT zurück.
  //   c) GESCHLOSSEN → kein Auto-Beitritt; Mitglied wird man nur per Einladung.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n10. Beitritt als Ereignis (A5)')

  /** Mitgliedschafts-Zeile eines Runtime-Users auf dieser Site (jeden Status). */
  const memberRowOf = async (userId) => {
    const res = await control.listRows({
      databaseId,
      tableId: 'site_members',
      queries: [Query.equal('siteId', siteId ?? 'x'), Query.equal('runtimeUserId', userId), Query.limit(1)],
    })
    const row = res.rows[0] ?? null
    if (row && !cleanup.members.includes(row.$id)) cleanup.members.push(row.$id)
    return row
  }
  const labelsOf = async userId => (await poolUsers.get({ userId })).labels ?? []
  const hasLabel = async userId => (await labelsOf(userId)).includes(siteId)

  /** Presences-Client mit ECHTER Session — liest an unserem Code vorbei. */
  const presencesAs = async (userId) => {
    const session = await poolUsers.createSession({ userId })
    return new Presences(new Client().setEndpoint(endpoint).setProject(poolProject).setSession(session.secret))
  }
  const seesPresence = async (client, targetUserId) => {
    const res = await client.list({ queries: [Query.limit(200)], ttl: 0 }).catch(() => null)
    return (res?.presences ?? []).some(p => p.userId === targetUserId)
  }

  console.log('  a) offene Community: mitmachen macht Mitglied — zusehen nicht')
  const joiner = await createPoolUser('joiner')
  const joinerCookie = await login(joiner)
  const visited = await call(host, '/api/auth/me', { cookie: joinerCookie })
  check('eingeloggter Besuch der Community → 200', visited.status === 200, `Status ${visited.status}`)
  check('…aber KEINE Mitgliedschaft (ein Besuch ist kein Beitritt)',
    (await memberRowOf(joiner.userId)) === null)
  check('…und KEIN Site-Label (das war der A4-Fehler)', !(await hasLabel(joiner.userId)),
    JSON.stringify(await labelsOf(joiner.userId)))

  const contributed = await call(host, '/api/comments', {
    method: 'POST',
    cookie: joinerCookie,
    body: { targetId: `a5-join-${Date.now()}`, targetType: 'verify', content: 'Ich mache jetzt mit.' },
  })
  check('erster Kommentar → 200', contributed.status === 200 || contributed.status === 201,
    `Status ${contributed.status} ${contributed.text.slice(0, 200)}`)
  const joinerComment = contributed.json?.$id ?? contributed.json?.comment?.$id
  if (joinerComment) cleanup.comments.push(joinerComment)

  const joinerRow = await memberRowOf(joiner.userId)
  check('der Schreibvorgang hat eine Mitgliedschaft angelegt', !!joinerRow, JSON.stringify(joinerRow ?? {}))
  check('…mit der einfachen Rolle „viewer" und Zugang',
    joinerRow?.role === 'viewer' && joinerRow?.status === 'active',
    JSON.stringify({ role: joinerRow?.role, status: joinerRow?.status }))
  check('…und das Site-Label ist da (Presence/Members-Inhalte sichtbar)',
    await hasLabel(joiner.userId), JSON.stringify(await labelsOf(joiner.userId)))

  // Zweiter Auslöser: die ANMELDUNG auf dem Mandanten-Host. Hier steht das Label
  // schon VOR dem ersten Seitenaufruf — der Fall ohne Realtime-Nachlauf.
  const signupEmail = `a5-signup-${Date.now()}@example.test`
  const signedUp = await call(host, '/api/auth/signup', {
    method: 'POST',
    body: { email: signupEmail, password: `Pw-${ID.unique()}`, name: 'A5 Signup' },
  })
  if (signedUp.status === 200) {
    const found = await poolUsers.list({ queries: [Query.equal('email', signupEmail), Query.limit(1)] })
    const fresh = found.users[0]
    if (fresh) cleanup.users.push(fresh.$id)
    const freshRow = fresh ? await memberRowOf(fresh.$id) : null
    check('Anmeldung AUF dem Community-Host → sofort Mitglied', freshRow?.status === 'active',
      JSON.stringify(freshRow ?? {}))
    check('…und das Label steht vor dem ersten Seitenaufruf',
      fresh ? await hasLabel(fresh.$id) : false, JSON.stringify(fresh ? await labelsOf(fresh.$id) : []))
  }
  else {
    // Instanz-Registrierung aus (app_config) — kein Autorisierungsfehler, nur
    // eine Umgebung, in der dieser Auslöser nicht prüfbar ist.
    console.log(`    ℹ Signup-Auslöser übersprungen (Status ${signedUp.status} — Instanz-Registrierung aus)`)
  }

  console.log('  b) Entfernen nimmt das Lese-Publikum wirklich weg')
  // Gegenprobe VOR dem Entzug: der Beigetretene sieht die Presence eines anderen
  // Mitglieds. Geschrieben wird sie über unsere echte Route (read("label:<siteId>")).
  const beat = await call(host, '/api/presence/heartbeat', {
    method: 'POST', cookie: staff.moderator.cookie, body: { scope: `a5:${Date.now()}` },
  })
  check('Heartbeat eines Mitglieds → 200', beat.status === 200, `Status ${beat.status}`)
  cleanup.presences.push(staff.moderator.userId)
  const joinerPresences = await presencesAs(joiner.userId)
  check('vor dem Entzug SIEHT das Mitglied die Anwesenheit der anderen',
    await seesPresence(joinerPresences, staff.moderator.userId), 'Grenze sperrt eigene Leute aus!')

  const removeJoiner = await call(host, `/api/site/members/${joinerRow?.$id}`, {
    method: 'DELETE', cookie: ownerCookie,
  })
  check('Zugang entziehen → 200', removeJoiner.status === 200,
    `Status ${removeJoiner.status} ${removeJoiner.text.slice(0, 160)}`)
  check('die Zeile ist auf „removed" (nicht gelöscht)',
    (await memberRowOf(joiner.userId))?.status === 'removed')
  check('das Site-Label ist WEG', !(await hasLabel(joiner.userId)),
    JSON.stringify(await labelsOf(joiner.userId)))
  const joinerAfterRemoval = await presencesAs(joiner.userId)
  check('read("members")-Inhalt ist nicht mehr lesbar (Presence unsichtbar)',
    !(await seesPresence(joinerAfterRemoval, staff.moderator.userId)), 'Leseumfang blieb bestehen!')
  const stillMember = await presencesAs(staff.viewer.userId)
  check('…während ein Mitglied sie WEITERHIN sieht (keine kollektive Sperre)',
    await seesPresence(stillMember, staff.moderator.userId))

  // Der Kern von Davids Auftrag: „beim nächsten Besuch kommt es NICHT zurück."
  await call(host, '/api/auth/me', { cookie: joinerCookie })
  await call(host, '/', { cookie: joinerCookie })
  check('nächster eingeloggter Besuch holt das Label NICHT zurück',
    !(await hasLabel(joiner.userId)), JSON.stringify(await labelsOf(joiner.userId)))
  const writeAfterRemoval = await call(host, '/api/comments', {
    method: 'POST',
    cookie: joinerCookie,
    body: { targetId: `a5-back-${Date.now()}`, targetType: 'verify', content: 'Und jetzt?' },
  })
  if (writeAfterRemoval.json?.$id) cleanup.comments.push(writeAfterRemoval.json.$id)
  check('auch ein neuer Schreibvorgang macht den Entzug NICHT rückgängig',
    (await memberRowOf(joiner.userId))?.status === 'removed' && !(await hasLabel(joiner.userId)),
    JSON.stringify(await labelsOf(joiner.userId)))

  console.log('  c) geschlossene Community: nur per Einladung')
  const closing = await call(host, '/api/site/registration', {
    method: 'PATCH', cookie: ownerCookie, body: { openRegistration: false },
  })
  check('Registrierung schließen → 200', closing.status === 200 && closing.json?.openRegistration === false,
    `Status ${closing.status} ${closing.text.slice(0, 160)}`)

  const outsider2 = await createPoolUser('closed')
  const outsider2Cookie = await login(outsider2)
  const closedWrite = await call(host, '/api/comments', {
    method: 'POST',
    cookie: outsider2Cookie,
    body: { targetId: `a5-closed-${Date.now()}`, targetType: 'verify', content: 'Darf ich rein?' },
  })
  if (closedWrite.json?.$id) cleanup.comments.push(closedWrite.json.$id)
  check('geschlossene Community: KEINE Mitgliedschaft durch Mitmachen',
    (await memberRowOf(outsider2.userId)) === null)
  check('…und kein Site-Label', !(await hasLabel(outsider2.userId)),
    JSON.stringify(await labelsOf(outsider2.userId)))

  // Die Einladung ist der einzige Weg hinein — und sie funktioniert auch
  // geschlossen. Die Row wird direkt angelegt (wie die Team-Rows oben), weil der
  // Mail-Versand in dieser Umgebung nicht garantiert ist.
  const inviteRow = await control.createRow({
    databaseId,
    tableId: 'site_invites',
    rowId: ID.unique(),
    data: {
      siteId,
      email: outsider2.email,
      role: 'viewer',
      status: 'pending',
      tokenHash: createHash('sha256').update(`a5-${ID.unique()}`, 'utf8').digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      invitedBy: owner.userId,
    },
  })
  cleanup.invites.push(inviteRow.$id)
  const accepted = await call(host, '/api/site/members/accept', {
    method: 'POST', cookie: outsider2Cookie, body: { inviteId: inviteRow.$id },
  })
  check('Einladung annehmen → 200 (auch bei geschlossener Registrierung)',
    accepted.status === 200, `Status ${accepted.status} ${accepted.text.slice(0, 200)}`)
  check('…jetzt gibt es eine Mitgliedschaft mit Zugang',
    (await memberRowOf(outsider2.userId))?.status === 'active')
  check('…und das Label ist sofort da (kein 30-s-Blindflug)',
    await hasLabel(outsider2.userId), JSON.stringify(await labelsOf(outsider2.userId)))

  console.log('  d) Bestand aus der A4-Zeit: Label ohne Zeile wird zur Mitgliedschaft')
  // Der Zustand VOR A5, künstlich hergestellt: Label da (die alte Middleware hat
  // es beim Besuch vergeben), Mitgliedschaft nie entstanden. Diese Menschen
  // lesen, kommentieren und werden gesehen — sie dürfen den Zugang nicht
  // verlieren, nur weil die Regel sich geändert hat. Bewusst JETZT geprüft, wo
  // die Community GESCHLOSSEN ist: die Übernahme umgeht den Schalter, denn wer
  // schon drin war, wird nicht durch eine inzwischen geschlossene Tür ausgesperrt.
  const legacy = await createPoolUser('legacy')
  const legacyCookie = await login(legacy)
  await poolUsers.updateLabels({ userId: legacy.userId, labels: [siteId] })
  check('Ausgangslage: Label da, aber KEINE Mitgliedschaft',
    (await hasLabel(legacy.userId)) && (await memberRowOf(legacy.userId)) === null)

  const legacyVisit = await call(host, '/api/auth/me', { cookie: legacyCookie })
  check('ein Besuch genügt für die Übernahme → 200', legacyVisit.status === 200, `Status ${legacyVisit.status}`)
  const legacyRow = await memberRowOf(legacy.userId)
  check('jetzt gibt es eine Mitgliedschaft (viewer, aktiv) — auch geschlossen',
    legacyRow?.role === 'viewer' && legacyRow?.status === 'active', JSON.stringify(legacyRow ?? {}))
  check('…und das Label bleibt (kein Rückschritt für echte Nutzer)',
    await hasLabel(legacy.userId), JSON.stringify(await labelsOf(legacy.userId)))

  // Die Gegenprobe, die diesen Weg unmissbrauchbar macht: ein ENTZOGENER Zugang
  // wird NICHT übernommen — das hängengebliebene Label wird eingezogen. Bewusst
  // ein FRISCHER Nutzer: so ist auch der Rollen-Cache leer, und geprüft wird der
  // Selbstheilungs-Pfad (das Control Plane sagt 'removed'), nicht die
  // Kurzzeit-Notiz aus der Entfernen-Route.
  const ghost = await createPoolUser('ghost')
  const ghostCookie = await login(ghost)
  const ghostRow = await control.createRow({
    databaseId, tableId: 'site_members', rowId: ID.unique(),
    data: {
      siteId,
      runtimeProjectId: poolProject,
      runtimeUserId: ghost.userId,
      role: 'viewer',
      status: 'removed',
      email: ghost.email,
      removedAt: new Date().toISOString(),
    },
  })
  cleanup.members.push(ghostRow.$id)
  await poolUsers.updateLabels({ userId: ghost.userId, labels: [siteId] })
  const ghostVisit = await call(host, '/api/auth/me', { cookie: ghostCookie })
  check('entzogener Zugang + hängendes Label → 200', ghostVisit.status === 200, `Status ${ghostVisit.status}`)
  check('…das Label wird eingezogen, die Zeile NICHT wiederbelebt',
    !(await hasLabel(ghost.userId)) && (await memberRowOf(ghost.userId))?.status === 'removed',
    JSON.stringify(await labelsOf(ghost.userId)))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n11. Aufräumen')
  // Kommentare liegen im POOL-Projekt, nicht im Control Plane — eigene
  // Verbindung, eigene Datenbank-Id (in der Praxis dieselbe; Override per Env).
  if (cleanup.comments.length > 0) {
    const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
    const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
    for (const id of cleanup.comments) {
      await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'comments', rowId: id }).catch(() => {})
    }
  }
  if (cleanup.presences.length > 0) {
    const poolPresences = new Presences(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
    for (const id of cleanup.presences) await poolPresences.delete({ presenceId: id }).catch(() => {})
  }
  for (const id of cleanup.invites) await control.deleteRow({ databaseId, tableId: 'site_invites', rowId: id }).catch(() => {})
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

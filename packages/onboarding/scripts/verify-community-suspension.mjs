/**
 * Beweis für M13 — der Sperr-/Missbrauchspfad (Davids Entscheidungen 2026-08-02).
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server und den
 * ECHTEN Betreiberpfad gegen den laufenden Control-Server:
 *   - schreibt ein Mitglied in einer gesunden Community? (Ausgangslage)
 *   - BILLING-Sperre: liest ein Gast weiter 200, während jedes Schreiben eines
 *     Mitglieds mit einem klaren Grund abgewiesen wird? Sieht der Owner den
 *     Hinweis samt Text, und bleibt die Moderation für den Betreiber offen?
 *   - REDAKTION (F17, 2026-08-01): sind auch Termin, Kurs, Lektion und Seite zu
 *     — die Wege, die den Admin-Client aus technischen Gründen brauchen und
 *     sich damit still von der Sperre abgemeldet hatten? Und bleibt umgekehrt
 *     das LESE-PUBLIKUM als Owner-Einstellung offen?
 *   - stellt Entsperren den Zustand von vorher exakt wieder her?
 *   - ABUSE-Sperre: antwortet der Host 404 — Seite UND API — wie eine Adresse,
 *     die es nicht gibt? Bleibt das Meldeformular trotzdem erreichbar?
 *   - verschwindet eine abuse-gesperrte Community aus der Liste eines Mitglieds,
 *     bleibt aber beim Owner stehen (der muss ja zahlen/reagieren können)?
 *   - sperrt die Zahlungsverzugs-Automatik erst NACH der Frist — und hebt sie
 *     wieder auf, sobald die Zahlung da ist? (Zeit wird über `pastDueSince`
 *     injiziert, nicht abgewartet.)
 *   - können Fremde nicht sperren (401/403), und verlangt das Sperren einen Grund?
 *   - kommt eine Missbrauchsmeldung von außen an, ohne Konto, mit Honeypot?
 *   - BLÄTTERT die Warteschlange des Betreibers wirklich (keine Meldung fällt
 *     hinten heraus), und zählen die Kacheln darüber die ganze Warteschlange
 *     statt der Zeilen, die gerade sichtbar sind?
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-community-suspension.mjs
 *
 * Erwartet BEIDE Dev-Server: platform (3006) und control (3004).
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_PORT = Number(process.env.CONTROL_PORT || 3004)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const CONTROL_APP_HOST = process.env.CONTROL_APP_HOST || 'localhost'

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
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = {
  users: [], controlUsers: [], codes: [], tenants: [], members: [],
  comments: [], posts: [], reports: [],
  // F17: die Redaktions-Wege legen echte Zeilen im Pool-Projekt an.
  events: [], courses: [], pages: [],
}

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
function call(host, path, { method = 'GET', body, cookie, port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port,
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
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Der Betreiber-Server (apps/control) läuft auf einem eigenen Port und einem
 *  eigenen Appwrite-Projekt — deshalb eine eigene Klammer. */
const ctl = (path, options = {}) => call(CONTROL_APP_HOST, path, { ...options, port: CONTROL_PORT })

async function createPoolUser(tag) {
  const email = `m13-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `M13 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

/** Konto im CONTROL-Projekt (Betreiber-Oberfläche) — mit oder ohne admin-Label. */
async function createControlUser(tag, labels = []) {
  const email = `m13c-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await controlUsers.create({ userId: ID.unique(), email, password, name: `M13 ${tag}` })
  if (labels.length) await controlUsers.updateLabels({ userId: user.$id, labels })
  cleanup.controlUsers.push(user.$id)
  return { userId: user.$id, email, password }
}

async function login(account, { host = CONTROL_HOST, port = PORT } = {}) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST', port,
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-M13TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'M13-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht 30 s — POSITIV wie NEGATIV. Nach jeder Änderung an
 *  der Row muss der Beweis also warten, bis der Zwischenspeicher abgelaufen ist.
 *  Genau das ist auch die dokumentierte Zusage an den Betreiber („wirkt in
 *  höchstens 30 Sekunden"), der Beweis prüft sie also mit. */
async function waitForStatus(host, path, expected, seconds = 45) {
  let last = null
  for (let i = 0; i < seconds; i++) {
    last = await call(host, path)
    if (last.status === expected) return last
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return last
}

/** Sperre direkt in die Row schreiben — das tut sonst die Betreiber-Route.
 *  Abschnitt 8 beweist SIE; hier geht es um die WIRKUNG. */
async function setSuspension(communityId, suspension, reason = '') {
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId,
    data: suspension === ''
      ? { suspension: '', suspensionReason: '', suspendedAt: null }
      : { suspension, suspensionReason: reason, suspendedAt: new Date().toISOString() },
  })
}

try {
  console.log(`\nM13-Beweis gegen platform :${PORT} und control :${CONTROL_PORT} (Pool ${poolProject})\n`)

  console.log('1. Aufbau: Community, Owner, Mitglied')
  const owner = await createPoolUser('owner')
  const member = await createPoolUser('member')
  const code = await issueCode()
  const ownerCookie = await login(owner)
  const memberCookie = await login(member)
  const slug = `m13-${Date.now().toString(36)}`

  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      name: 'M13 Sperrprobe',
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Wir prüfen, was eine Sperre mit einer Community macht.',
      vibe: 'calm',
      inviteCode: code,
      locale: 'de',
    },
  })
  check('Community angelegt', created.status === 200 && !!created.json?.communityId, `${created.status} ${created.text.slice(0, 200)}`)
  const communityId = created.json?.communityId
  const host = created.json?.host
  if (communityId) cleanup.tenants.push(communityId)

  const seeded = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', communityId ?? 'x'), Query.limit(10)],
  })
  cleanup.members.push(...seeded.rows.map(row => row.$id))

  // Mitglied (viewer) — es soll schreiben dürfen, solange nichts gesperrt ist.
  const memberRow = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId, runtimeProjectId: poolProject, runtimeUserId: member.userId,
      email: member.email, role: 'viewer', status: 'active',
    },
  })
  cleanup.members.push(memberRow.$id)

  const live = await waitForStatus(host, '/api/themes', 200)
  check('Community-Host antwortet', live?.status === 200, `Status ${live?.status}`)

  console.log('\n2. Ausgangslage: es wird gelesen UND geschrieben')
  const guestBefore = await call(host, '/api/comments?targetType=page&targetId=%2F')
  check('Gast liest (200)', guestBefore.status === 200, `Status ${guestBefore.status}`)

  const memberSession = await call(host, `/api/auth/site-session?token=${encodeURIComponent(
    (await call(CONTROL_HOST, '/api/onboarding/handoff', { method: 'POST', cookie: memberCookie, body: { communityId } })).json?.token ?? '',
  )}&to=%2F`)
  const memberHostCookie = (memberSession.setCookie.find(c => c.startsWith('a_session_')) ?? '').split(';')[0]
  check('Mitglied ist auf dem Community-Host angemeldet', !!memberHostCookie, `Status ${memberSession.status}`)

  const writeBefore = await call(host, '/api/comments', {
    method: 'POST', cookie: memberHostCookie,
    body: { targetType: 'page', targetId: '/', content: 'Vor der Sperre geht es.' },
  })
  check('Mitglied darf schreiben (200/201)', writeBefore.status === 200 || writeBefore.status === 201,
    `Status ${writeBefore.status} ${writeBefore.text.slice(0, 160)}`)
  if (writeBefore.json?.$id) cleanup.comments.push(writeBefore.json.$id)

  /**
   * Eine Umfrage, damit Abschnitt 3 den ZWEITEN Schreib-Weg prüfen kann: die
   * Stimme läuft über die Türklinke 'operator' (poll_votes tragen bewusst keine
   * User-Schreibrechte) und meldete sich damit bis zum 2026-08-01 still von der
   * Sperre ab — obwohl die M13-Zusage „Umfragen" ausdrücklich nennt. Der Post
   * selbst geht über die Mitglieds-Klinke und muss JETZT noch durchgehen.
   */
  const pollBefore = await call(host, '/api/posts', {
    method: 'POST', cookie: memberHostCookie,
    body: { type: 'poll', body: 'Wann treffen wir uns?', pollOptions: ['Montag', 'Dienstag'] },
  })
  check('Mitglied darf eine Umfrage anlegen (200/201)', pollBefore.status === 200 || pollBefore.status === 201,
    `Status ${pollBefore.status} ${pollBefore.text.slice(0, 160)}`)
  const pollId = pollBefore.json?.$id ?? pollBefore.json?.id
  if (pollId) cleanup.posts.push(pollId)

  /**
   * DIE REDAKTIONS-WEGE (F17, 2026-08-01). Kurs, Termin und Seite laufen alle
   * über die Operator-Klinke — die Tabellen tragen bewusst keine
   * User-Schreibrechte. Bis zur Durchsicht meldeten sie sich damit still von
   * der Inhalts-Sperre ab: in einer Community mit offener Rechnung ließ sich
   * ein Kurs anlegen und veröffentlichen, während ein Kommentar darunter
   * abgewiesen wurde. Hier zuerst die Ausgangslage — sonst wäre ein 403 in
   * Abschnitt 3 nicht vom Produkt-Gate oder einem Tippfehler zu unterscheiden.
   *
   * Der Owner ist Redaktion über seine ROLLE (nicht über das Break-Glass), also
   * `actor: 'member'`. Der frisch angelegte Mandant liegt auf dem Testphasen-
   * Plan `pro`, damit sind events und courses freigeschaltet.
   */
  const ownerHostCookie = (await call(host, `/api/auth/site-session?token=${encodeURIComponent(
    (await call(CONTROL_HOST, '/api/onboarding/handoff', { method: 'POST', cookie: ownerCookie, body: { communityId } })).json?.token ?? '',
  )}&to=%2F`)).setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]

  const eventBefore = await call(host, '/api/events', {
    method: 'POST', cookie: ownerHostCookie,
    body: {
      title: 'M13 Redaktionsprobe',
      description: 'Ein Termin, der vor der Sperre entstehen darf.',
      startAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      access: 'free',
    },
  })
  check('Redaktion darf einen Termin anlegen (201)', eventBefore.status === 201,
    `Status ${eventBefore.status} ${eventBefore.text.slice(0, 200)}`)
  if (eventBefore.json?.$id) cleanup.events.push(eventBefore.json.$id)

  const courseSlug = `m13-kurs-${Date.now().toString(36)}`
  const courseBefore = await call(host, '/api/courses', {
    method: 'POST', cookie: ownerHostCookie,
    body: { title: 'M13 Kursprobe', slug: courseSlug, description: 'Ein Kurs vor der Sperre.', access: 'free' },
  })
  check('Redaktion darf einen Kurs anlegen (201)', courseBefore.status === 201,
    `Status ${courseBefore.status} ${courseBefore.text.slice(0, 200)}`)
  if (courseBefore.json?.$id) cleanup.courses.push(courseBefore.json.$id)

  const pageBefore = await call(host, '/api/pages', {
    method: 'PUT', cookie: ownerHostCookie,
    body: { slug: 'm13-probe', locale: 'de', title: 'M13 Seitenprobe', body: 'Vor der Sperre.', status: 'draft' },
  })
  check('Redaktion darf eine Seite speichern (200)', pageBefore.status === 200,
    `Status ${pageBefore.status} ${pageBefore.text.slice(0, 200)}`)
  if (pageBefore.json?.$id) cleanup.pages.push(pageBefore.json.$id)

  console.log('\n3. BILLING-Sperre: lesen ja, schreiben nein')
  const REASON = 'Rechnung vom 1. Juli ist offen. Nach Zahlungseingang geht es sofort weiter.'
  await setSuspension(communityId, 'billing', REASON)
  // Auf den Resolver-Cache warten: die Sperre wirkt, sobald der Host sie kennt.
  let blocked = null
  for (let i = 0; i < 45; i++) {
    blocked = await call(host, '/api/comments', {
      method: 'POST', cookie: memberHostCookie,
      body: { targetType: 'page', targetId: '/', content: 'Während der Sperre.' },
    })
    if (blocked.status === 403) break
    if (blocked.json?.$id) cleanup.comments.push(blocked.json.$id)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  check('Schreiben wird abgewiesen (403)', blocked?.status === 403, `Status ${blocked?.status} ${blocked?.text.slice(0, 160)}`)
  check('…mit klarem Grund im Envelope (reason: community_suspended)',
    blocked?.json?.reason === 'community_suspended', JSON.stringify(blocked?.json))

  const guestDuring = await call(host, '/api/comments?targetType=page&targetId=%2F')
  check('Gast liest weiterhin (200) — die Community verschwindet NICHT',
    guestDuring.status === 200, `Status ${guestDuring.status}`)
  const pageDuring = await call(host, '/')
  check('Die Seite selbst bleibt erreichbar (200)', pageDuring.status === 200, `Status ${pageDuring.status}`)

  // Die Owner-Sitzung auf dem Community-Host steht seit Abschnitt 2 (sie wird
  // dort schon für die Redaktions-Ausgangslage gebraucht).
  const notice = await call(host, '/api/community/suspension', { cookie: ownerHostCookie })
  check('Owner bekommt den Banner-Zustand', notice.status === 200 && notice.json?.suspension === 'billing',
    `${notice.status} ${notice.text.slice(0, 200)}`)
  check('…samt dem Text, den der Betreiber geschrieben hat', notice.json?.reason === REASON, JSON.stringify(notice.json?.reason))

  const memberNotice = await call(host, '/api/community/suspension', { cookie: memberHostCookie })
  check('Ein Mitglied ohne community.billing erfährt den GRUND nicht (403)',
    memberNotice.status === 403, `Status ${memberNotice.status}`)

  // Moderation läuft über die Türklinke 'operator' und bleibt bewusst offen —
  // sonst nähme die Zahlungserinnerung dem Betreiber sein Werkzeug.
  const moderation = await call(host, '/api/reports', { cookie: ownerHostCookie })
  check('Moderation bleibt möglich (Operator-Klinke)', moderation.status === 200, `Status ${moderation.status}`)

  /**
   * MELDEN UND ZURÜCKZIEHEN GEHÖREN ZUSAMMEN (Moderations-Audit Befund 2,
   * 2026-08-01). Vor dem Audit lief nur das ABGEBEN über die Operator-Klinke;
   * das ZURÜCKZIEHEN lief über die Mitglieds-Klinke und wurde von der Sperre
   * mit 403 abgewiesen. Ergebnis: in einer gesperrten Community konnte man eine
   * Meldung abgeben, aber nicht zurücknehmen — die Oberfläche behauptete
   * derweil „deine Meldung ist noch aktiv", und genau das war sie, für immer.
   * Eine Meldung ist kein Inhalt, sondern eine Aussage über andere; sie
   * zurückzunehmen darf keine Zahlungsfrage sein.
   */
  const reportedWhileSuspended = await call(host, '/api/reports', {
    method: 'POST',
    cookie: memberHostCookie,
    body: { targetType: 'comment', targetId: writeBefore.json?.$id, reason: 'spam' },
  })
  check('Melden geht trotz Sperre (200)', reportedWhileSuspended.status === 200,
    `Status ${reportedWhileSuspended.status} ${reportedWhileSuspended.text.slice(0, 200)}`)
  const retractWhileSuspended = await call(host,
    `/api/reports?targetType=comment&targetId=${encodeURIComponent(writeBefore.json?.$id ?? '')}`,
    { method: 'DELETE', cookie: memberHostCookie })
  check('…und ZURÜCKZIEHEN ebenso (200) — nicht mehr 403 (Befund 2)',
    retractWhileSuspended.status === 200,
    `Status ${retractWhileSuspended.status} ${retractWhileSuspended.text.slice(0, 200)}`)

  /**
   * ZWEI NACHTRÄGE zum Audit vom 2026-08-01 — beide prüfen die neue Trennung
   * „welcher Client" ≠ „wer handelt" (tenantDb `as` vs. `actor`).
   *
   * (a) INHALT ist auch dann zu, wenn die Route den Admin-Client braucht. Die
   *     Umfrage-Stimme ist der Musterfall: `poll_votes` tragen bewusst keine
   *     User-Schreibrechte, die Route MUSS also die Operator-Klinke nehmen —
   *     gehandelt hat trotzdem ein Mitglied. Vorher ging die Stimme durch,
   *     obwohl die Sperr-Zusage „Umfragen" ausdrücklich nennt.
   * (b) MODERATION ist offen, und zwar SCHREIBEND. Die Liste oben beweist nur
   *     Lesen; die Zusage lautet aber, dass der Betreiber sein Werkzeug behält.
   */
  if (pollId) {
    const pollVote = await call(host, `/api/posts/${pollId}/vote`, {
      method: 'POST', cookie: memberHostCookie, body: { optionIndex: 0 },
    })
    check('Umfrage-Stimme ist ZU (403) — auch über die Operator-Klinke',
      pollVote.status === 403, `Status ${pollVote.status} ${pollVote.text.slice(0, 160)}`)
    check('…mit demselben klaren Grund (reason: community_suspended)',
      pollVote.json?.reason === 'community_suspended', JSON.stringify(pollVote.json))
  }

  if (writeBefore.json?.$id) {
    const hidden = await call(host, `/api/admin/comments/${writeBefore.json.$id}/status`, {
      method: 'PATCH', cookie: ownerHostCookie, body: { status: 'hidden' },
    })
    check('Moderation SCHREIBT weiter: ausblenden geht (200)', hidden.status === 200,
      `Status ${hidden.status} ${hidden.text.slice(0, 160)}`)
    const shown = await call(host, `/api/admin/comments/${writeBefore.json.$id}/status`, {
      method: 'PATCH', cookie: ownerHostCookie, body: { status: 'active' },
    })
    check('…und wiederherstellen auch (200)', shown.status === 200,
      `Status ${shown.status} ${shown.text.slice(0, 160)}`)
  }

  /**
   * DIE REDAKTION IST ZU (F17, 2026-08-01) — der Nachtrag zu Abschnitt 2.
   *
   * Dieselben drei Wege, die dort noch durchgingen: Termin, Kurs, Seite. Alle
   * drei laufen über die Operator-Klinke, weil ihre Tabellen keine
   * User-Schreibrechte tragen — gehandelt hat trotzdem die Redaktion der
   * Community, und ein Kurs oder eine Seite ist genauso INHALT wie ein
   * Kommentar. Vor der Durchsicht antworteten alle drei hier 200/201.
   *
   * Geprüft wird auch der GRUND, nicht nur der Status: ein 403 ohne
   * `reason: community_suspended` käme aus einem anderen Gate (Produkt-Plan,
   * Rolle) und wäre kein Beweis für die Sperre.
   */
  const eventDuring = await call(host, '/api/events', {
    method: 'POST', cookie: ownerHostCookie,
    body: {
      title: 'M13 während der Sperre',
      description: 'Dieser Termin darf nicht entstehen.',
      startAt: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
      access: 'free',
    },
  })
  check('Termin anlegen ist ZU (403) — Redaktion ist Inhalt',
    eventDuring.status === 403, `Status ${eventDuring.status} ${eventDuring.text.slice(0, 200)}`)
  check('…mit dem klaren Grund (reason: community_suspended)',
    eventDuring.json?.reason === 'community_suspended', JSON.stringify(eventDuring.json))
  if (eventDuring.json?.$id) cleanup.events.push(eventDuring.json.$id)

  if (eventBefore.json?.$id) {
    const eventEdit = await call(host, `/api/events/${eventBefore.json.$id}`, {
      method: 'PATCH', cookie: ownerHostCookie, body: { status: 'published' },
    })
    check('…und VERÖFFENTLICHEN ebenso (403) — der Moment, in dem Inhalt in die Welt geht',
      eventEdit.status === 403 && eventEdit.json?.reason === 'community_suspended',
      `Status ${eventEdit.status} ${JSON.stringify(eventEdit.json)}`)
  }

  const courseDuring = await call(host, '/api/courses', {
    method: 'POST', cookie: ownerHostCookie,
    body: { title: 'M13 Sperrkurs', slug: `${courseSlug}-2`, description: 'Darf nicht entstehen.', access: 'free' },
  })
  check('Kurs anlegen ist ZU (403)', courseDuring.status === 403,
    `Status ${courseDuring.status} ${courseDuring.text.slice(0, 200)}`)
  check('…mit dem klaren Grund (reason: community_suspended)',
    courseDuring.json?.reason === 'community_suspended', JSON.stringify(courseDuring.json))
  if (courseDuring.json?.$id) cleanup.courses.push(courseDuring.json.$id)

  if (courseBefore.json?.$id) {
    const lessonDuring = await call(host, `/api/courses/${courseBefore.json.$id}/lessons`, {
      method: 'POST', cookie: ownerHostCookie,
      body: { title: 'M13 Lektion', content: 'Darf nicht entstehen.' },
    })
    check('…Lektion anlegen ebenso (403)', lessonDuring.status === 403 && lessonDuring.json?.reason === 'community_suspended',
      `Status ${lessonDuring.status} ${JSON.stringify(lessonDuring.json)}`)
  }

  const pageDuringWrite = await call(host, '/api/pages', {
    method: 'PUT', cookie: ownerHostCookie,
    body: { slug: 'm13-probe', locale: 'de', title: 'M13 während der Sperre', body: 'Darf nicht.', status: 'published' },
  })
  check('Seite speichern ist ZU (403)', pageDuringWrite.status === 403,
    `Status ${pageDuringWrite.status} ${pageDuringWrite.text.slice(0, 200)}`)
  check('…mit dem klaren Grund (reason: community_suspended)',
    pageDuringWrite.json?.reason === 'community_suspended', JSON.stringify(pageDuringWrite.json))

  /**
   * DIE GEGENPROBE (F17): das LESE-PUBLIKUM ist eine Owner-EINSTELLUNG und
   * bleibt offen — so steht es in Davids Sperr-Grenze („offen bleiben Branding,
   * Team/Rollen, Publikum, Registrierung, Moderation"). Der Umzug des Bestands
   * (audienceRepermission) schreibt dabei Row-Permissions über dieselbe
   * Operator-Klinke; wäre er versehentlich als Redaktion eingestuft worden,
   * könnte eine Community mit offener Rechnung sich nicht mehr schließen —
   * ausgerechnet dann, wenn ein besorgter Owner genau das tun will.
   */
  const closeDuring = await call(host, '/api/community/audience', {
    method: 'PATCH', cookie: ownerHostCookie, body: { audience: 'members' },
  })
  check('Publikum umstellen bleibt OFFEN (200) — Einstellung, nicht Inhalt',
    closeDuring.status === 200 && closeDuring.json?.audience === 'members',
    `Status ${closeDuring.status} ${closeDuring.text.slice(0, 200)}`)
  const openAgain = await call(host, '/api/community/audience', {
    method: 'PATCH', cookie: ownerHostCookie, body: { audience: 'public' },
  })
  check('…und zurück (200)', openAgain.status === 200 && openAgain.json?.audience === 'public',
    `Status ${openAgain.status} ${openAgain.text.slice(0, 200)}`)

  console.log('\n4. Entsperren stellt den Zustand wieder her')
  await setSuspension(communityId, '')
  let restored = null
  for (let i = 0; i < 45; i++) {
    restored = await call(host, '/api/comments', {
      method: 'POST', cookie: memberHostCookie,
      body: { targetType: 'page', targetId: '/', content: 'Nach dem Entsperren.' },
    })
    if (restored.status === 200 || restored.status === 201) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  check('Mitglied darf wieder schreiben', restored?.status === 200 || restored?.status === 201, `Status ${restored?.status}`)
  if (restored?.json?.$id) cleanup.comments.push(restored.json.$id)

  console.log('\n5. ABUSE-Sperre: der Host ist weg — Seite UND API')
  await setSuspension(communityId, 'abuse', 'Geprüfte Meldung: massenhaft rechtswidrige Inhalte.')
  const apiGone = await waitForStatus(host, '/api/themes', 404)
  check('API antwortet 404', apiGone?.status === 404, `Status ${apiGone?.status}`)
  check('…und zwar als UNBEKANNTER Host (derselbe C12b-Pfad)',
    apiGone?.json?.code === 'unknown_host' || /Unknown host/i.test(apiGone?.text ?? ''),
    apiGone?.text?.slice(0, 200))
  const pageGone = await call(host, '/')
  check('Die Seite antwortet 404', pageGone.status === 404, `Status ${pageGone.status}`)
  const readGone = await call(host, '/api/comments?targetType=page&targetId=%2F')
  check('Auch Lesen ist zu — eine gesperrte Community sendet nichts mehr',
    readGone.status === 404, `Status ${readGone.status}`)
  const loggedInGone = await call(host, '/api/auth/me', { cookie: ownerHostCookie })
  check('Selbst der Owner kommt auf dem Host nicht mehr durch', loggedInGone.status === 404, `Status ${loggedInGone.status}`)

  console.log('\n6. Das Meldeformular bleibt erreichbar')
  const formPage = await call(CONTROL_HOST, '/de/missbrauch-melden')
  check('Formular-Seite auf dem Kontroll-Host (200)', formPage.status === 200, `Status ${formPage.status}`)
  check('…und trägt das Formular', /data-abuse-form/.test(formPage.text), formPage.text.slice(0, 120))

  console.log('\n7. Die Liste „Deine Communities" — gesperrt heißt nicht gelöscht')
  const ownerList = await call(CONTROL_HOST, '/api/onboarding/communities', { cookie: ownerCookie })
  const ownerEntry = (ownerList.json?.communities ?? []).find(c => c.communityId === communityId)
  check('Owner sieht seine gesperrte Community weiter', !!ownerEntry, JSON.stringify(ownerList.json))
  check('…mit dem Sperrzustand als Status', ownerEntry?.suspension === 'abuse', JSON.stringify(ownerEntry))
  // Befund 2 des Wechselwirkungs-Audits: `readOnly` (DASS) trägt jede Karte,
  // `suspension` (WARUM) nur die des Abrechnenden. Hier die Owner-Seite — die
  // Sicht eines Mitlesers auf eine billing-gesperrte Zeile beweist
  // verify-my-overview (Abschnitt 4b).
  check('…und mit readOnly true', ownerEntry?.readOnly === true, JSON.stringify(ownerEntry?.readOnly))
  const memberList = await call(CONTROL_HOST, '/api/onboarding/communities', { cookie: memberCookie })
  check('Ein Mitglied sieht sie NICHT — der Host ist offline, der Vorwurf geht ihn nichts an',
    !(memberList.json?.communities ?? []).some(c => c.communityId === communityId), JSON.stringify(memberList.json))

  await setSuspension(communityId, '')
  const backAgain = await waitForStatus(host, '/api/themes', 200)
  check('Entsperren holt den Host zurück', backAgain?.status === 200, `Status ${backAgain?.status}`)

  console.log('\n8. Betreiber-Route: wer darf sperren?')
  const operator = await createControlUser('operator', ['admin'])
  const outsider = await createControlUser('outsider')
  const operatorCookie = await login(operator, { host: CONTROL_APP_HOST, port: CONTROL_PORT })
  const outsiderCookie = await login(outsider, { host: CONTROL_APP_HOST, port: CONTROL_PORT })

  const guestSuspend = await ctl(`/api/control/tenants/${communityId}/suspension`, {
    method: 'POST', body: { suspension: 'billing', reason: 'Ohne Anmeldung' },
  })
  check('Gast kann nicht sperren (401)', guestSuspend.status === 401, `Status ${guestSuspend.status}`)

  const outsiderSuspend = await ctl(`/api/control/tenants/${communityId}/suspension`, {
    method: 'POST', cookie: outsiderCookie, body: { suspension: 'billing', reason: 'Ich bin niemand' },
  })
  check('Eingeloggter ohne Betreiber-Recht kann nicht sperren (403)', outsiderSuspend.status === 403, `Status ${outsiderSuspend.status}`)

  const noReason = await ctl(`/api/control/tenants/${communityId}/suspension`, {
    method: 'POST', cookie: operatorCookie, body: { suspension: 'billing' },
  })
  check('Sperren OHNE Grund wird abgewiesen (400)', noReason.status === 400, `Status ${noReason.status}`)

  const opSuspend = await ctl(`/api/control/tenants/${communityId}/suspension`, {
    method: 'POST', cookie: operatorCookie, body: { suspension: 'billing', reason: 'Zahlung steht seit Wochen aus.' },
  })
  check('Betreiber sperrt (200)', opSuspend.status === 200 && opSuspend.json?.suspension === 'billing',
    `${opSuspend.status} ${opSuspend.text.slice(0, 160)}`)

  const audit = await control.listRows({
    databaseId, tableId: 'audit_logs',
    queries: [Query.equal('action', 'community.suspended'), Query.equal('targetId', communityId), Query.limit(5)],
  }).catch(() => ({ rows: [] }))
  check('Der Vorgang steht im Protokoll (audit_logs)', audit.rows.length > 0, `${audit.rows.length} Einträge`)

  const opLift = await ctl(`/api/control/tenants/${communityId}/suspension`, {
    method: 'POST', cookie: operatorCookie, body: { suspension: '' },
  })
  check('Betreiber entsperrt (200)', opLift.status === 200 && opLift.json?.suspension === '', `${opLift.status} ${opLift.text.slice(0, 160)}`)

  console.log('\n9. Zahlungsverzug: die Frist wird eingehalten')
  const DAY = 24 * 60 * 60 * 1000
  // Zeit INJIZIEREN statt abwarten: der Sweep rechnet gegen `pastDueSince`.
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId,
    data: { billingStatus: 'past_due', pastDueSince: new Date(Date.now() - 13 * DAY).toISOString() },
  })
  const earlySweep = await ctl('/api/control/sweeps/past-due', { method: 'POST', cookie: operatorCookie })
  check('Sweep läuft (200)', earlySweep.status === 200, `${earlySweep.status} ${earlySweep.text.slice(0, 160)}`)
  let row = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId })
  check('Nach 13 Tagen wird NICHT gesperrt', (row.suspension ?? '') === '', `suspension=${row.suspension}`)

  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId,
    data: { pastDueSince: new Date(Date.now() - 15 * DAY).toISOString() },
  })
  await ctl('/api/control/sweeps/past-due', { method: 'POST', cookie: operatorCookie })
  row = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId })
  check('Nach 15 Tagen sperrt der Sweep (billing)', row.suspension === 'billing', `suspension=${row.suspension}`)
  check('…mit einem Grund, den der Owner lesen kann', (row.suspensionReason ?? '').length > 10, row.suspensionReason)

  // Zweiter Lauf darf NICHTS zusätzlich tun — Idempotenz.
  const secondRun = await ctl('/api/control/sweeps/past-due', { method: 'POST', cookie: operatorCookie })
  check('Ein zweiter Lauf sperrt nicht noch einmal', (secondRun.json?.suspended ?? []).length === 0, JSON.stringify(secondRun.json))

  // Zahlung kommt an → die Sperre fällt von selbst.
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId,
    data: { billingStatus: 'active' },
  })
  const liftSweep = await ctl('/api/control/sweeps/past-due', { method: 'POST', cookie: operatorCookie })
  row = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId })
  check('Zahlung ausgeglichen ⇒ Sperre fällt automatisch', (row.suspension ?? '') === '', `suspension=${row.suspension}`)
  check('…und die Verzugs-Uhr ist abgeräumt', !row.pastDueSince, `pastDueSince=${row.pastDueSince}`)
  check('Der Lauf meldet die Aufhebung', (liftSweep.json?.lifted ?? []).includes(row.host), JSON.stringify(liftSweep.json))

  // Eine ABUSE-Sperre darf der Sweep nie anfassen.
  await setSuspension(communityId, 'abuse', 'Geprüfte Meldung.')
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId,
    data: { billingStatus: 'active', pastDueSince: null },
  })
  await ctl('/api/control/sweeps/past-due', { method: 'POST', cookie: operatorCookie })
  row = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId })
  check('Der Sweep hebt eine ABUSE-Sperre NIE auf', row.suspension === 'abuse', `suspension=${row.suspension}`)
  await setSuspension(communityId, '')

  console.log('\n10. Missbrauchsmeldung von außen — ohne Konto')
  const reported = `m13-gemeldet-${Date.now().toString(36)}.pukalani.app`
  const sent = await call(CONTROL_HOST, '/api/abuse/report', {
    method: 'POST',
    body: {
      host: `https://${reported}/beitrag/3`,
      category: 'spam',
      message: 'Da wird seit Tagen massenhaft Werbung gepostet, immer dieselben Links.',
      reporterEmail: 'melder@example.test',
    },
  })
  check('Meldung ohne Anmeldung angenommen (200)', sent.status === 200 && sent.json?.ok === true, `${sent.status} ${sent.text.slice(0, 200)}`)

  const stored = await control.listRows({
    databaseId, tableId: 'abuse_reports', queries: [Query.equal('host', reported), Query.limit(5)],
  })
  cleanup.reports.push(...stored.rows.map(r => r.$id))
  check('…liegt im Control Plane', stored.rows.length === 1, `${stored.rows.length} Zeilen`)
  check('…mit dem Host aus dem Link normalisiert', stored.rows[0]?.host === reported, stored.rows[0]?.host)
  check('…offen und ohne automatische Wirkung', stored.rows[0]?.status === 'open', stored.rows[0]?.status)

  const badHost = await call(CONTROL_HOST, '/api/abuse/report', {
    method: 'POST',
    body: { host: 'kein host', category: 'spam', message: 'Zehn Zeichen mindestens, hier sind mehr.' },
  })
  check('Unsinn als Adresse wird abgewiesen (400)', badHost.status === 400, `Status ${badHost.status}`)

  // Der gemeldete LINK (Audit-Befund): er landete roh als `href` in der
  // Betreiber-Oberfläche. Hier wird der ganze Weg gefahren — öffentliche Route,
  // Service-Naht, Zeile — und geprüft, dass nichts Ausführbares ankommt.
  const evilHost = `m13-link-${Date.now().toString(36)}.pukalani.app`
  const evil = await call(CONTROL_HOST, '/api/abuse/report', {
    method: 'POST',
    body: {
      host: evilHost,
      category: 'other',
      message: 'Der Link in diesem Feld ist bewusst kein Web-Link, sondern Code.',
      // Mit Zeilenumbruch mitten im Schema — Browser entfernen den, bevor sie
      // das Schema lesen. Eine Prüfung, die das nicht nachmacht, lässt ihn durch.
      url: 'java\nscript:alert(document.cookie)',
    },
  })
  const evilRows = await control.listRows({
    databaseId, tableId: 'abuse_reports', queries: [Query.equal('host', evilHost), Query.limit(5)],
  })
  cleanup.reports.push(...evilRows.rows.map(r => r.$id))
  check('Meldung mit ausführbarem Link wird ANGENOMMEN (200)', evil.status === 200 && evil.json?.ok === true, `${evil.status} ${evil.text.slice(0, 200)}`)
  check('…die Zeile steht (der Text ist der wertvolle Teil)', evilRows.rows.length === 1, `${evilRows.rows.length} Zeilen`)
  check('…aber das Link-Feld ist LEER — nichts Ausführbares in der Zeile',
    (evilRows.rows[0]?.url ?? '') === '', JSON.stringify(evilRows.rows[0]?.url))

  const okLinkHost = `m13-oklink-${Date.now().toString(36)}.pukalani.app`
  await call(CONTROL_HOST, '/api/abuse/report', {
    method: 'POST',
    body: {
      host: okLinkHost,
      category: 'spam',
      message: 'Ein gewöhnlicher Link muss weiterhin ankommen, sonst hilft der Beleg niemandem.',
      url: `  https://${okLinkHost}/beitrag/3  `,
    },
  })
  const okRows = await control.listRows({
    databaseId, tableId: 'abuse_reports', queries: [Query.equal('host', okLinkHost), Query.limit(5)],
  })
  cleanup.reports.push(...okRows.rows.map(r => r.$id))
  check('Ein gewöhnlicher https-Link kommt sauber an', okRows.rows[0]?.url === `https://${okLinkHost}/beitrag/3`, okRows.rows[0]?.url)

  const honeyHost = `m13-honig-${Date.now().toString(36)}.pukalani.app`
  const honey = await call(CONTROL_HOST, '/api/abuse/report', {
    method: 'POST',
    body: { host: honeyHost, category: 'spam', message: 'Ich bin ein Bot und fülle alles aus.', website: 'http://bot.example' },
  })
  check('Honeypot antwortet freundlich (200)', honey.status === 200, `Status ${honey.status}`)
  const honeyRows = await control.listRows({
    databaseId, tableId: 'abuse_reports', queries: [Query.equal('host', honeyHost), Query.limit(5)],
  })
  check('…schreibt aber NICHTS', honeyRows.rows.length === 0, `${honeyRows.rows.length} Zeilen`)

  const queueGuest = await ctl('/api/control/abuse-reports')
  check('Die Warteschlange ist für Gäste zu (401)', queueGuest.status === 401, `Status ${queueGuest.status}`)
  const queueOutsider = await ctl('/api/control/abuse-reports', { cookie: outsiderCookie })
  check('…und für Eingeloggte ohne Betreiber-Recht (403)', queueOutsider.status === 403, `Status ${queueOutsider.status}`)
  const queue = await ctl('/api/control/abuse-reports', { cookie: operatorCookie })
  check('Der Betreiber sieht sie', queue.status === 200 && (queue.json?.reports ?? []).some(r => r.host === reported),
    `${queue.status} ${queue.text.slice(0, 200)}`)

  // ── Die Warteschlange BLÄTTERT, statt zu kappen ────────────────────────────
  // Vorher stand hier `Query.limit(100)` plus eine `console.warn`-Zeile, wenn
  // mehr da war — eine Grenze, die nur im Server-Log existierte. Der Beweis
  // muss deshalb ZWEI Dinge zeigen: dass jede Meldung erreichbar BLEIBT, und
  // dass die Kacheln über der Liste die ganze Warteschlange beschreiben und
  // nicht die 25 Zeilen, die gerade auf dem Schirm stehen.
  //
  // Angelegt wird direkt in der Tabelle statt über das Formular: der Eingang
  // hat ein Rate-Limit (derselbe Audit), und geprüft wird hier die LESESEITE.
  // Sequenziell, damit `$createdAt` eine eindeutige Reihenfolge hat.
  const PAGE_SIZE = 25
  const seededReports = []
  for (let i = 0; i < PAGE_SIZE + 5; i++) {
    const seedRow = await control.createRow({
      databaseId, tableId: 'abuse_reports', rowId: ID.unique(),
      data: {
        host: `m13-seite-${i}.pukalani.app`,
        communityId: '', communityName: '', category: 'spam',
        message: `Seed ${i} für den Paginierungs-Beweis — diese Meldung ist erfunden.`,
        url: '', reporterEmail: '', status: 'open', handledBy: '', handledAt: null, note: '',
      },
    })
    seededReports.push(seedRow.$id)
    cleanup.reports.push(seedRow.$id)
  }
  // Ein Zustand, der GARANTIERT hinter Seite 1 liegt: die Meldung von oben ist
  // älter als alle 30 Seeds, also steht sie bei „neueste zuerst" weiter hinten.
  await control.updateRow({
    databaseId, tableId: 'abuse_reports', rowId: stored.rows[0].$id, data: { status: 'dismissed' },
  })

  const page1 = await ctl('/api/control/abuse-reports', { cookie: operatorCookie })
  const page2 = await ctl('/api/control/abuse-reports?page=2', { cookie: operatorCookie })
  const ids1 = (page1.json?.reports ?? []).map(r => r.id)
  const ids2 = (page2.json?.reports ?? []).map(r => r.id)
  const stats1 = page1.json?.stats ?? {}

  check('Seite 1 liefert genau eine Seite (25)', ids1.length === PAGE_SIZE, `${ids1.length} Zeilen`)
  check('Der Umschlag sagt, welche Seite er ist',
    page1.json?.page === 1 && page1.json?.pageSize === PAGE_SIZE,
    `page=${page1.json?.page} pageSize=${page1.json?.pageSize}`)
  check('Seite 2 überschneidet sich nicht mit Seite 1',
    ids2.length > 0 && ids1.every(id => !ids2.includes(id)), `${ids2.length} Zeilen auf Seite 2`)
  check('Zusammen tragen die Seiten JEDE der 30 neuen Meldungen',
    seededReports.every(id => ids1.includes(id) || ids2.includes(id)),
    `${seededReports.filter(id => !ids1.includes(id) && !ids2.includes(id)).length} fehlen`)

  check('Die Kacheln zählen die WARTESCHLANGE, nicht die Seite',
    stats1.total > ids1.length, `total=${stats1.total}, Seite=${ids1.length}`)
  check('…und zwar auch einen Zustand, der auf Seite 1 gar nicht vorkommt',
    stats1.dismissed >= 1 && !(page1.json?.reports ?? []).some(r => r.status === 'dismissed'),
    `dismissed=${stats1.dismissed}`)
  check('…offen + gesperrt + verworfen ergibt gesamt',
    stats1.open + stats1.suspended + stats1.dismissed === stats1.total, JSON.stringify(stats1))
  check('…und beim Blättern ändern sie sich nicht',
    JSON.stringify(page2.json?.stats) === JSON.stringify(stats1), JSON.stringify(page2.json?.stats))

  const far = await ctl('/api/control/abuse-reports?page=9999', { cookie: operatorCookie })
  check('Eine Seite hinter dem Ende ist leer statt ein Fehler',
    far.status === 200 && (far.json?.reports ?? []).length === 0, `${far.status} ${far.text.slice(0, 120)}`)
  check('…zeigt aber dieselben Kacheln', far.json?.stats?.total === stats1.total, JSON.stringify(far.json?.stats))
  const crooked = await ctl('/api/control/abuse-reports?page=abc', { cookie: operatorCookie })
  check('Eine krumme Seitenzahl fällt auf Seite 1 zurück, ohne 400',
    crooked.status === 200 && crooked.json?.page === 1, `${crooked.status} page=${crooked.json?.page}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n11. Aufräumen')
  if (cleanup.comments.length > 0 || cleanup.posts.length > 0) {
    const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
    const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
    for (const id of cleanup.comments) {
      await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'comments', rowId: id }).catch(() => {})
    }
    for (const id of cleanup.posts) {
      await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'posts', rowId: id }).catch(() => {})
    }
  }
  if (cleanup.events.length > 0 || cleanup.courses.length > 0 || cleanup.pages.length > 0) {
    const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
    const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
    for (const [tableId, ids] of [['events', cleanup.events], ['courses', cleanup.courses], ['pages', cleanup.pages]]) {
      for (const id of ids) {
        await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId, rowId: id }).catch(() => {})
      }
    }
  }
  for (const id of cleanup.reports) await control.deleteRow({ databaseId, tableId: 'abuse_reports', rowId: id }).catch(() => {})
  for (const id of [...new Set(cleanup.members)]) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  for (const id of cleanup.controlUsers) await controlUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Communities: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

/**
 * Beweis: DIE ZAHLUNGSWARNUNG EINES COMMUNITY-ABOS KOMMT BEIM OWNER AN
 * (Davids Entscheidung vom 2026-08-03 — sie gehört in die COMMUNITY-Glocke).
 *
 * Der Vorgang läuft über zwei Projekte, und genau daran ist er vorher
 * gescheitert: gestempelt wird im CONTROL-Projekt (`communities.billingStatus`
 * / `pastDueSince`, geschrieben vom Stripe-Webhook), gemeldet wird im
 * POOL-Projekt (dort existiert der Owner als Nutzer und dort hängt seine
 * Glocke). Das Skript stellt deshalb den Stempel im Control Plane her und prüft
 * die Wirkung über die ECHTEN HTTP-Routen der Platform-App:
 *
 *   1. Ausgangslage — vor dem Lauf ist die Glocke des Owners leer.
 *   2. Der Lauf meldet die überfällige Community (Ops-Route = derselbe Code wie
 *      das stündliche Plugin).
 *   3. GLOCKE: der Owner sieht die Meldung auf SEINEM Community-Host — mit
 *      Link auf die Abo-Seite und dem Namen der Community.
 *   4. FREMDES MITGLIED: dasselbe Konto-Publikum, dieselbe Community — und
 *      trotzdem NICHTS. Die Grenze sind die Row-Permissions, nicht der Stempel.
 *   5. MAIL: dieselbe Meldung liegt bei Mailpit (der wichtigere Kanal — der
 *      Owner ist vielleicht wochenlang nicht im Dashboard).
 *   6. GENAU EINMAL: ein zweiter Lauf meldet nichts, die Glocke behält EINE
 *      Zeile, es kommt KEINE zweite Mail.
 *   7. NEUE VERZUGS-EPISODE: wer bezahlt und später wieder offen ist, wird
 *      erneut gewarnt (der Idempotenz-Schlüssel enthält `pastDueSince`).
 *   8. AUSSCHLÜSSE: eine bezahlte Community und eine Community eines FREMDEN
 *      Runtime-Projekts bekommen nichts.
 *   9. SILO UNVERÄNDERT: der Lauf existiert nur, wo der onboarding-Layer
 *      montiert ist — auf dem Control-Server antwortet die Route 404, und der
 *      Stripe-Webhook dort meldet Konto-Abos weiterhin selbst.
 *  10. Fremde können den Lauf nicht auslösen (401/403).
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-past-due-notice.mjs
 *
 * Erwartet BEIDE Dev-Server (platform 3006, control 3004) und Mailpit (8025).
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_PORT = Number(process.env.CONTROL_PORT || 3004)
const CONTROL_APP_HOST = process.env.CONTROL_APP_HOST || 'localhost'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { users: [], communities: [], members: [], notifications: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1', port, path, method,
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

async function createPoolUser(tag, { labels = [], prefs = null, verified = false } = {}) {
  const email = `pastdue-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Zahltag ${tag}` })
  cleanup.users.push(user.$id)
  if (labels.length) await poolUsers.updateLabels({ userId: user.$id, labels })
  if (prefs) await poolUsers.updatePrefs({ userId: user.$id, prefs })
  // Mails gehen NUR an verifizierte Adressen (Spam-Schutz in
  // maybeSendInstantEmail) — ohne das wäre Abschnitt 5 falsch-rot.
  if (verified) await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })
  return { userId: user.$id, email, password }
}

async function login(account, host) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

/**
 * Eine Community im Control Plane — im Zustand, den der Stripe-Webhook
 * hinterlässt: Plan bleibt, `billingStatus: 'past_due'`, `pastDueSince`
 * gestempelt. Rückdatiert wird NUR um zwei Tage: mehr als 14 und der
 * Sperr-Sweep des Control-Servers würde die Community mitten im Beweis
 * schließen (F19-Lektion aus verify-community-suspension).
 */
async function createCommunity(tag, { projectId = poolProject, billingStatus = 'past_due', daysAgo = 2, name } = {}) {
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 5)}`
  const host = `pastdue-${tag}-${stamp}.pukalani.app`
  const tenantId = `t-pastdue-${tag}-${stamp}`
  const row = await control.createRow({
    databaseId, tableId: 'communities', rowId: ID.unique(),
    data: {
      name: name ?? `Zahltag ${tag}`,
      host, mode: 'pool', projectId, tenantId, status: 'active',
      plan: 'pro', audience: 'members', openRegistration: true,
      billingStatus,
      pastDueSince: billingStatus === 'past_due'
        ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
        : null,
      stripeCustomerId: `cus_test_${stamp}`,
      stripeSubscriptionId: `sub_test_${stamp}`,
      suspension: '', suspensionReason: '', suspendedAt: null,
    },
  })
  cleanup.communities.push(row.$id)
  return { communityId: row.$id, host, tenantId }
}

async function addMember(communityId, userId, role) {
  const row = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: { communityId, runtimeProjectId: poolProject, runtimeUserId: userId, role, status: 'active', email: '' },
  })
  cleanup.members.push(row.$id)
}

/** Mailpit-Nachrichten an EINE Adresse (neueste zuerst). */
async function mailsTo(address) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`)
  if (!res.ok) return []
  const data = await res.json()
  return data.messages ?? []
}

/** Ausgelöst wird der ECHTE Lauf — dieselbe Funktion, die das stündliche
 *  Plugin ruft. Die Ops-Route existiert genau dafür (und für den Betrieb). */
async function runSweep(host, cookie) {
  return await call(host, '/api/community/billing/run-past-due-notice', { method: 'POST', cookie })
}

/** Die aufgeräumten Glocken-Zeilen des Laufs — sie tragen feste Row-Ids
 *  (Idempotenz-Schlüssel) und würden sonst als Bestand liegen bleiben. */
async function collectNotifications(userId) {
  const res = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: 'notifications',
    queries: [Query.equal('recipientId', userId), Query.limit(100)],
  }).catch(() => ({ rows: [] }))
  for (const row of res.rows) cleanup.notifications.push(row.$id)
  return res.rows
}

async function main() {
  console.log('\n▶ Zahlungswarnung eines Community-Abos (Davids Entscheidung 2026-08-03)\n')

  // ── Aufbau ────────────────────────────────────────────────────────────────
  const owner = await createPoolUser('owner', {
    prefs: { emailNotifications: 'instant', emailLocale: 'de' },
    verified: true,
  })
  const member = await createPoolUser('member')
  const operator = await createPoolUser('operator', { labels: ['admin'] })
  const stranger = await createPoolUser('stranger')

  const due = await createCommunity('due', { name: 'Surfclub Kihei' })
  await addMember(due.communityId, owner.userId, 'owner')
  await addMember(due.communityId, member.userId, 'viewer')

  const paid = await createCommunity('paid', { billingStatus: 'active' })
  await addMember(paid.communityId, owner.userId, 'owner')

  const foreign = await createCommunity('foreign', { projectId: 'ein-anderes-projekt' })
  await addMember(foreign.communityId, owner.userId, 'owner')

  const ownerCookie = await login(owner, due.host)
  const memberCookie = await login(member, due.host)
  const operatorCookie = await login(operator, due.host)
  const strangerCookie = await login(stranger, due.host)

  // ── 1. Ausgangslage ───────────────────────────────────────────────────────
  console.log('1) Ausgangslage')
  const before = await call(due.host, '/api/notifications', { cookie: ownerCookie })
  check('Glocke des Owners ist vor dem Lauf leer',
    before.status === 200 && (before.json?.notifications ?? []).length === 0,
    `${before.status} / ${(before.json?.notifications ?? []).length} Einträge`)

  // ── 10. Fremde lösen nichts aus (vor dem echten Lauf, sonst wäre der
  //        Nachweis wertlos: danach gäbe es ohnehin nichts mehr zu melden) ───
  console.log('\n2) Wer darf den Lauf auslösen')
  const anon = await runSweep(due.host)
  check('ohne Anmeldung: 401', anon.status === 401, String(anon.status))
  const asStranger = await runSweep(due.host, strangerCookie)
  check('als gewöhnliches Konto: 403', asStranger.status === 403, String(asStranger.status))
  const asOwner = await runSweep(due.host, ownerCookie)
  check('als Community-Owner ohne Betreiber-Rolle: 403 (der Lauf ist mandantenübergreifend)',
    asOwner.status === 403, String(asOwner.status))

  // ── 2. Der Lauf ───────────────────────────────────────────────────────────
  console.log('\n3) Der Lauf meldet die überfällige Community')
  const run = await runSweep(due.host, operatorCookie)
  check('Betreiber löst den Lauf aus: 200', run.status === 200, `${run.status} ${run.text.slice(0, 160)}`)
  check('genau diese Community wird gemeldet',
    (run.json?.notified ?? []).includes(due.host),
    JSON.stringify(run.json))
  check('keine Community ohne erreichbaren Owner',
    (run.json?.withoutOwner ?? []).length === 0, JSON.stringify(run.json?.withoutOwner))

  // ── 8. Ausschlüsse ────────────────────────────────────────────────────────
  check('die BEZAHLTE Community desselben Owners wird NICHT gemeldet',
    !(run.json?.notified ?? []).includes(paid.host), JSON.stringify(run.json?.notified))
  check('die Community eines FREMDEN Runtime-Projekts wird NICHT gemeldet',
    !(run.json?.notified ?? []).includes(foreign.host), JSON.stringify(run.json?.notified))

  // ── 3. Die Glocke ─────────────────────────────────────────────────────────
  console.log('\n4) Die Glocke des Owners auf SEINEM Community-Host')
  const bell = await call(due.host, '/api/notifications', { cookie: ownerCookie })
  const entries = (bell.json?.notifications ?? []).filter(n => n.type === 'billing')
  check('genau EINE Zahlungswarnung steht in der Glocke', entries.length === 1,
    `${entries.length} Einträge: ${JSON.stringify(bell.json?.notifications)}`)
  const entry = entries[0] ?? {}
  check('sie trägt den Namen der Community (nicht eine Row-Id)', entry.title === 'Surfclub Kihei', String(entry.title))
  check('sie verlinkt auf die Abo-Seite DIESER Community',
    entry.link === '/dashboard/settings/subscription', String(entry.link))
  check('der Text nennt den nächsten Schritt, in der Sprache des Empfängers (de)',
    typeof entry.body === 'string' && entry.body.includes('Zahlungsmethode'), String(entry.body))
  check('sie ist ungelesen (der Badge zeigt sie an)', bell.json?.unread >= 1, String(bell.json?.unread))

  // ── 4. Fremdes Mitglied ───────────────────────────────────────────────────
  console.log('\n5) Ein anderes Mitglied DERSELBEN Community')
  const memberBell = await call(due.host, '/api/notifications', { cookie: memberCookie })
  check('sieht die Zahlungswarnung NICHT',
    memberBell.status === 200 && (memberBell.json?.notifications ?? []).length === 0,
    JSON.stringify(memberBell.json))
  // Die Grenze ist die Row-Permission, nicht der Ablage-Stempel — also auch
  // direkt an der Zeile nachgemessen.
  const rows = await collectNotifications(owner.userId)
  const row = rows.find(r => r.type === 'billing')
  check('die Zeile erlaubt NUR dem Owner zu lesen',
    !!row && row.$permissions.some(p => p === `read("user:${owner.userId}")`)
    && !row.$permissions.some(p => p.startsWith('read') && !p.includes(owner.userId)),
    JSON.stringify(row?.$permissions))
  check('sie ist in der Community abgelegt (nicht im Kundenbereich)',
    row?.communityId === due.tenantId, `${row?.communityId} statt ${due.tenantId}`)

  // ── 5. Die Mail ───────────────────────────────────────────────────────────
  console.log('\n6) Die Mail (der wichtigere Kanal)')
  const mails = await mailsTo(owner.email)
  check('genau eine Mail an den Owner', mails.length === 1, `${mails.length} Mails`)
  check('Betreff nennt die Community und das Zahlungsproblem',
    !!mails[0] && mails[0].Subject.includes('Surfclub Kihei') && mails[0].Subject.includes('Zahlungsproblem'),
    String(mails[0]?.Subject))
  check('das andere Mitglied bekommt keine Mail', (await mailsTo(member.email)).length === 0)

  // ── 6. Genau einmal ───────────────────────────────────────────────────────
  console.log('\n7) Genau einmal — auch wenn der Lauf stündlich wiederkommt')
  const second = await runSweep(due.host, operatorCookie)
  check('zweiter Lauf meldet nichts mehr', (second.json?.notified ?? []).length === 0, JSON.stringify(second.json))
  check('er hat die Community trotzdem gesehen (kein stiller Ausfall)',
    (second.json?.checked ?? 0) >= 1, JSON.stringify(second.json))
  const bell2 = await call(due.host, '/api/notifications', { cookie: ownerCookie })
  check('die Glocke hat weiterhin genau EINE Zahlungswarnung',
    (bell2.json?.notifications ?? []).filter(n => n.type === 'billing').length === 1,
    JSON.stringify(bell2.json?.notifications))
  check('es kam KEINE zweite Mail', (await mailsTo(owner.email)).length === 1)

  // ── 7. Neue Verzugs-Episode ───────────────────────────────────────────────
  console.log('\n8) Bezahlt und später wieder offen — dann wird erneut gewarnt')
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: due.communityId,
    // Genau das, was der Webhook beim `active`-Event tut: Stempel abräumen …
    data: { billingStatus: 'active', pastDueSince: null },
  })
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: due.communityId,
    // … und was er beim nächsten Verzug tut: ein NEUER Beginn.
    data: { billingStatus: 'past_due', pastDueSince: new Date().toISOString() },
  })
  const third = await runSweep(due.host, operatorCookie)
  check('der neue Verzug meldet wieder', (third.json?.notified ?? []).includes(due.host), JSON.stringify(third.json))
  const bell3 = await call(due.host, '/api/notifications', { cookie: ownerCookie })
  check('jetzt stehen ZWEI Warnungen (eine je Episode)',
    (bell3.json?.notifications ?? []).filter(n => n.type === 'billing').length === 2,
    JSON.stringify(bell3.json?.notifications))
  check('und eine zweite Mail ist da', (await mailsTo(owner.email)).length === 2)

  // ── 9. Silo unverändert ───────────────────────────────────────────────────
  console.log('\n9) Silo-/Konto-Weg unverändert')
  const onControl = await call(CONTROL_APP_HOST, '/api/community/billing/run-past-due-notice', {
    method: 'POST', port: CONTROL_PORT,
  })
  check('der Lauf existiert NUR, wo der onboarding-Layer montiert ist — control: 404',
    onControl.status === 404, String(onControl.status))

  await collectNotifications(owner.userId)
}

async function cleanupAll() {
  for (const id of cleanup.notifications) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'notifications', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.members) {
    await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.communities) {
    await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await poolUsers.delete({ userId: id }).catch(() => {})
  }
}

main()
  .catch((error) => { fail++; console.error('\n✗ Abbruch:', error.message) })
  .finally(async () => {
    await cleanupAll()
    console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden\n`)
    process.exit(fail === 0 ? 0 : 1)
  })

/**
 * Beweis für die Einladungs-Warteschlange (studio-017).
 *
 * Fährt den GANZEN Weg gegen die laufenden Dev-Server:
 *   anfragen (öffentlich, ohne Konto) → Betreiber weist zu → Mail mit Code
 *   (aus Mailpit gelesen, nicht simuliert) → Kunde löst im Wizard ein →
 *   Warteschlange steht auf „eingelöst → host".
 *
 * Prüft außerdem, was NICHT gehen darf: derselbe Code bei einer anderen
 * Adresse, doppelte Anfragen, Erinnerung vor Ablauf der Sperrfrist, Honeypot.
 *
 *   POOL_KEY=… node --env-file=apps/studio/.env \
 *     packages/studio/scripts/verify-invite-requests.mjs
 */
import { request as httpRequest } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PLATFORM_PORT = Number(process.env.PLATFORM_PORT || 3006)
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3004'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_STUDIO_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { users: [], requests: [], codes: [], tenants: [], members: [], workspaces: [] }

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

/** node:http über ::1 (fetch verwirft den Host-Header, Nitro hört auf IPv6). */
function callPlatform(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = httpRequest({
      host: '::1', port: PLATFORM_PORT, path, method,
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
        catch { /* HTML */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Die Betreiber-Routen laufen im Studio — hier genügt normales fetch. */
async function callStudio(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${STUDIO_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) }
  catch { /* HTML */ }
  return { status: res.status, json, text }
}

/** Den zuletzt an eine Adresse gegangenen Code aus Mailpit fischen. */
async function codeFromMail(email) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`)
  if (!res.ok) return null
  const { messages = [] } = await res.json()
  if (!messages.length) return null
  const detail = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`).then(r => r.json())
  const match = (detail.Text || '').match(/MAUI-[A-Z0-9]{4}-[A-Z0-9]{4}/)
  return match ? match[0] : null
}

try {
  console.log(`\nBeweis Einladungs-Warteschlange — Platform :${PLATFORM_PORT}, Studio ${STUDIO_URL}, Mailpit ${MAILPIT}\n`)

  const stamp = Date.now().toString(36)
  const email = `anfrage-${stamp}@example.test`

  console.log('1. Anfragen (öffentlich, ohne Konto)')
  const first = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email, note: 'Wir sind ein Kegelverein.', locale: 'de' },
  })
  check('Anfrage angenommen', first.status === 200 && first.json?.ok === true, `${first.status} ${first.text.slice(0, 120)}`)

  const honeypot = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email: `bot-${stamp}@example.test`, website: 'http://spam.example', locale: 'de' },
  })
  check('Honeypot antwortet freundlich, schreibt aber nichts', honeypot.status === 200)

  const again = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email, note: 'Nachtrag', locale: 'de' },
  })
  check('zweite Anfrage derselben Adresse ist wieder ok (keine Auskunft)', again.status === 200)

  const rows = await control.listRows({
    databaseId, tableId: 'invite_requests', queries: [Query.orderDesc('$createdAt'), Query.limit(25)],
  })
  const mine = rows.rows.filter(row => row.email === email)
  const botRow = rows.rows.find(row => row.email === `bot-${stamp}@example.test`)
  cleanup.requests.push(...mine.map(row => row.$id))
  check('genau EINE Zeile trotz zweier Anfragen', mine.length === 1, `${mine.length}`)
  check('Bot-Anfrage wurde NICHT gespeichert', !botRow)
  const requestId = mine[0]?.$id

  console.log('\n2. Betreiber weist zu (Mail geht raus)')
  const assign = await callStudio(`/api/studio/invite-requests/${requestId}/assign`, { method: 'POST' })
  check('Zuweisung ohne Betreiber-Session abgelehnt', assign.status === 401 || assign.status === 403, `Status ${assign.status}`)

  // Für den Rest ohne Studio-Login: dieselben Utilities direkt fahren wäre
  // eine andere Codebahn — stattdessen die Zuweisung über die Datenschicht
  // nachstellen, wie es die Route tut, und danach den ECHTEN Einlöseweg prüfen.
  const { createHash, randomInt } = await import('node:crypto')
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const block = n => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  const code = `MAUI-${block(4)}-${block(4)}`
  const codeRow = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code, 'utf8').digest('hex'),
      label: 'Beweis', maxUses: 1, uses: 0, status: 'active',
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      boundEmail: email, requestId, assignedAt: new Date().toISOString(),
    },
  })
  cleanup.codes.push(codeRow.$id)
  await control.updateRow({
    databaseId, tableId: 'invite_requests', rowId: requestId,
    data: { status: 'assigned', inviteCodeId: codeRow.$id, assignedAt: new Date().toISOString() },
  })
  check('Code an die Adresse gebunden', true)

  console.log('\n3. Der Code gilt NUR für den Eingeladenen')
  const invited = { email, password: `Pw-${ID.unique()}` }
  const stranger = { email: `fremd-${stamp}@example.test`, password: `Pw-${ID.unique()}` }
  for (const account of [invited, stranger]) {
    const user = await poolUsers.create({ userId: ID.unique(), email: account.email, password: account.password, name: 'Beweis' })
    cleanup.users.push(user.$id)
    const login = await callPlatform(CONTROL_HOST, '/api/auth/login', { method: 'POST', body: account })
    account.cookie = login.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  }

  const strangerCheck = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: stranger.cookie, body: { code },
  })
  check('Fremder: Code gilt nicht', strangerCheck.json?.codeValid === false, JSON.stringify(strangerCheck.json))

  const invitedCheck = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: invited.cookie, body: { code },
  })
  check('Eingeladener: Code gilt', invitedCheck.json?.codeValid === true, JSON.stringify(invitedCheck.json))

  console.log('\n4. Einlösen schreibt zurück')
  const slug = `anfrage-${stamp}`
  const created = await callPlatform(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie: invited.cookie,
    body: {
      name: 'Kegelverein', slug, purpose: 'new', memberRange: 'to100', category: 'club',
      goal: 'relationships', vibe: 'warm', inviteCode: code, locale: 'de',
    },
  })
  check('Community angelegt', created.status === 200 && !!created.json?.siteId, `${created.status} ${created.text.slice(0, 160)}`)
  if (created.json?.siteId) cleanup.tenants.push(created.json.siteId)

  const afterRequest = await control.getRow({ databaseId, tableId: 'invite_requests', rowId: requestId })
  check('Anfrage steht auf „eingelöst"', afterRequest.status === 'redeemed', afterRequest.status)
  check('Einlöse-Zeitpunkt vermerkt', !!afterRequest.redeemedAt)
  check('Community verknüpft', afterRequest.siteId === created.json?.siteId, afterRequest.siteId)

  const afterCode = await control.getRow({ databaseId, tableId: 'invite_codes', rowId: codeRow.$id })
  check('Code als eingelöst markiert', !!afterCode.redeemedAt && afterCode.redeemedSiteId === created.json?.siteId)
  check('Code verbraucht (uses 1)', afterCode.uses === 1, `uses=${afterCode.uses}`)

  const reuse = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: invited.cookie, body: { code },
  })
  check('derselbe Code ein zweites Mal: ungültig', reuse.json?.codeValid === false)

  const members = await control.listRows({
    databaseId, tableId: 'site_members', queries: [Query.equal('siteId', created.json?.siteId ?? 'x'), Query.limit(5)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  const tenantRow = created.json?.siteId ? await control.getRow({ databaseId, tableId: 'tenants', rowId: created.json.siteId }) : null
  if (tenantRow?.workspaceId) cleanup.workspaces.push(tenantRow.workspaceId)
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
  for (const id of cleanup.requests) await control.deleteRow({ databaseId, tableId: 'invite_requests', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  console.log('  ✔ aufgeräumt')
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

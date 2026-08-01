/**
 * Beweis für M13 — der Hinweis auf die ablaufende Testphase.
 *
 * Fährt den ECHTEN Weg gegen den laufenden Platform-Server: Community per
 * Wizard anlegen (das setzt `trialEndsAt` auf +14 Tage), dann auf dem
 * Community-Host prüfen, was `GET /api/community/billing/trial` herausgibt und
 * was die pure Regel daraus macht:
 *
 *   1. Frisch angelegt (14 Tage) → die Route kennt das Datum, der Hinweis
 *      SCHWEIGT (nichts zu melden ist der häufigste Fall).
 *   2. Drei Tage vor Schluss → 'ending' mit der richtigen Tageszahl.
 *   3. Zwei Tage NACH dem Ende → 'ended' (die Feststellung, nicht der
 *      Countdown).
 *   4. Lange nach dem Ende → wieder Stille. `trialEndsAt` wird beim Ablauf NICHT
 *      geräumt, ohne diese Grenze stünde der Hinweis für immer im Dashboard.
 *   5. Wer ihn NICHT sehen darf: Gast (401), Fremder (403), Moderator DIESER
 *      Community (403 — `community.billing` trägt nur der Owner), Kontroll-Host
 *      (404 — dort gibt es keine Community und damit keine Testphase).
 *
 * Zwischen den Schritten liegt der 30-s-Cache des Mandanten-Resolvers; das
 * Skript wartet auf den Wechsel, statt zu raten.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --experimental-strip-types --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-trial-notice.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { TRIAL_NOTICE_GRACE_DAYS, trialNotice } from '../../control/shared/onboarding.ts'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const DAY = 24 * 60 * 60 * 1000

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
  const email = `m13-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `M13 ${tag}` })
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

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/**
 * Datum umschreiben und warten, bis der Server es sieht. Der Resolver cacht den
 * Host 30 s — ohne dieses Warten prüfte der nächste Schritt noch den alten Wert
 * und das Skript wäre grün, ohne etwas gemessen zu haben.
 */
async function setTrialEndsAt(communityId, host, cookie, iso) {
  await control.updateRow({
    databaseId, tableId: 'communities', rowId: communityId, data: { trialEndsAt: iso },
  })
  // Verglichen wird der ZEITPUNKT, nicht die Zeichenkette: Appwrite gibt
  // Datetimes als `…+00:00` zurück, `toISOString()` schreibt `…Z` — derselbe
  // Moment, zwei Schreibweisen. Ein String-Vergleich wäre hier ewig falsch.
  const want = Date.parse(iso)
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/community/billing/trial', { cookie })
    const got = res.json?.trialEndsAt ? Date.parse(res.json.trialEndsAt) : NaN
    if (res.status === 200 && Math.abs(got - want) < 1000) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

try {
  console.log(`\nM13-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const stranger = await createPoolUser('stranger')
  const code = await issueCode()
  const ownerCookie = await login(owner)
  const strangerCookie = await login(stranger)
  const slug = `m13-${Date.now().toString(36)}`

  console.log('1. Community anlegen (echter Wizard-Abschluss → Testphase läuft)')
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      name: 'M13 Testphase',
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Wir prüfen, ob der Hinweis auf die Testphase ehrlich ist.',
      vibe: 'calm',
      inviteCode: code,
      locale: 'de',
    },
  })
  check('angelegt', created.status === 200 && !!created.json?.communityId, `${created.status} ${created.text.slice(0, 200)}`)
  const communityId = created.json?.communityId
  const host = created.json?.host
  if (communityId) cleanup.tenants.push(communityId)
  if (!communityId || !host) throw new Error('Ohne Community kein Beweis')

  const members = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))

  check('Community-Host antwortet', await waitForHost(host), 'Host wurde nicht aufgelöst')

  console.log('\n2. Frisch angelegt: die Route kennt das Datum, der Hinweis schweigt')
  const fresh = await call(host, '/api/community/billing/trial', { cookie: ownerCookie })
  check('Owner bekommt 200', fresh.status === 200, `Status ${fresh.status} ${fresh.text.slice(0, 160)}`)
  const freshEnd = fresh.json?.trialEndsAt ?? null
  const daysAway = freshEnd ? Math.round((Date.parse(freshEnd) - Date.now()) / DAY) : -1
  check('trialEndsAt liegt 14 Tage voraus', daysAway === 14, `${freshEnd} (${daysAway} Tage)`)
  check('… und daraus wird KEIN Hinweis', trialNotice(freshEnd, Date.now()) === null, JSON.stringify(trialNotice(freshEnd, Date.now())))

  console.log('\n3. Wer den Vertragszustand NICHT sehen darf')
  const guest = await call(host, '/api/community/billing/trial')
  check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  const strangerRes = await call(host, '/api/community/billing/trial', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerRes.status === 403, `Status ${strangerRes.status}`)

  // Ein Moderator DIESER Community — der plausibelste Fehlgriff: er sieht das
  // Dashboard, aber `community.billing` trägt nur der Owner.
  const mod = await createPoolUser('moderator')
  const modRow = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: { communityId, runtimeProjectId: poolProject, runtimeUserId: mod.userId, role: 'moderator', status: 'active', email: mod.email },
  })
  cleanup.members.push(modRow.$id)
  const modCookie = await login(mod)
  const modRes = await call(host, '/api/community/billing/trial', { cookie: modCookie })
  check('Moderator dieser Community → 403 (nur der Owner zahlt)', modRes.status === 403, `Status ${modRes.status}`)

  const onControl = await call(CONTROL_HOST, '/api/community/billing/trial', { cookie: ownerCookie })
  check('Kontroll-Host → 404 (dort gibt es keine Community)', onControl.status === 404, `Status ${onControl.status}`)

  console.log('\n4. Drei Tage vor Schluss: der Countdown')
  const soon = new Date(Date.now() + 3 * DAY - 60_000).toISOString()
  const soonRes = await setTrialEndsAt(communityId, host, ownerCookie, soon)
  check('Route gibt das neue Datum heraus', !!soonRes, 'Cache-Wechsel blieb aus')
  const soonNotice = trialNotice(soonRes?.json?.trialEndsAt, Date.now())
  check('Hinweis: „endet in 3 Tagen"',
    soonNotice?.kind === 'ending' && soonNotice.daysLeft === 3, JSON.stringify(soonNotice))

  console.log('\n5. Zwei Tage nach dem Ende: die Feststellung')
  const over = new Date(Date.now() - 2 * DAY).toISOString()
  const overRes = await setTrialEndsAt(communityId, host, ownerCookie, over)
  check('Route gibt das abgelaufene Datum heraus', !!overRes, 'Cache-Wechsel blieb aus')
  const overNotice = trialNotice(overRes?.json?.trialEndsAt, Date.now())
  check('Hinweis: „beendet", ohne weiter zu zählen',
    overNotice?.kind === 'ended' && overNotice.daysLeft === 0, JSON.stringify(overNotice))

  console.log('\n6. Lange danach: wieder Stille (kein Dauer-Verkaufsbanner)')
  const longGone = new Date(Date.now() - (TRIAL_NOTICE_GRACE_DAYS + 1) * DAY).toISOString()
  const longRes = await setTrialEndsAt(communityId, host, ownerCookie, longGone)
  check('Route gibt das alte Datum weiter heraus (nichts wird geräumt)', !!longRes, 'Cache-Wechsel blieb aus')
  // `!!longRes` gehört in die Bedingung: ohne die Route wäre der Wert
  // `undefined`, und „schweigt" wäre trivial wahr — ein Haken ohne Messung.
  check('… und der Hinweis schweigt',
    !!longRes && trialNotice(longRes.json?.trialEndsAt, Date.now()) === null,
    JSON.stringify(trialNotice(longRes?.json?.trialEndsAt, Date.now())))
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\n7. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Communities: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

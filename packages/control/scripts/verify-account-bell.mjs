/**
 * Beweis für die Glocke im Kundenbereich (C17).
 *
 * DIE FRAGE, DIE DIESER BEWEIS BEANTWORTET: seit C15 stempelt `notify()`
 * kontobezogene Meldungen mit `scope: 'account'` — aber konnte sie jemand
 * LESEN? Beide `account`-Absender (Stripe-Webhook im billing-Layer,
 * Early-Access-Anfragen im control-Layer) leben in `apps/control` und schreiben
 * in DIESES Appwrite-Projekt; die Empfänger sind Konten DIESES Projekts. Die
 * Glocke hing aber nur im blueprint-Layout, das apps/control nicht extended —
 * geschrieben, zugestellt, unsichtbar.
 *
 * Der Weg läuft von Ende zu Ende und benutzt echte Routen:
 *   öffentliches Anfrage-Formular (Platform, Kontroll-Host)
 *     → Control Plane schreibt die Meldung (`_account`)
 *     → Betreiber liest sie über /api/notifications
 *     → die Glocke steht im HTML von /workspace UND /dashboard
 *   und die Gegenprobe: ein FREMDER liest sie nicht, ein Gast sieht keine
 *   Glocke, und im POOL bleiben Community- und Konto-Ablage getrennt (die
 *   eigentliche Grenze — dort, wo es beide Welten gibt).
 *
 * EHRLICH ZUR REICHWEITE: der Stripe-Zweig wird NICHT über Stripe gefahren
 * (das bräuchte ein echtes Abo bei Stripe). Geprüft wird stattdessen zweierlei:
 * dass der Absender im Code den `account`-Stempel und den Link in den
 * Kundenbereich trägt, und dass eine so gestempelte Zeile den ganzen Leseweg
 * nimmt. Alles andere ist der echte Weg.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/control/scripts/verify-account-bell.mjs
 *
 * Braucht: lokale Appwrite, control-Dev-Server (:3004) und platform-Dev-Server
 * (:3006). POOL_KEY = NUXT_APPWRITE_KEY aus apps/platform/.env (das Pool-
 * Projekt ist ein anderes Projekt — der control-Key kommt dort nicht hinein).
 */
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'
import { Client, ID, Permission, Query, Role, TablesDB, Users } from 'node-appwrite'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolvePath(HERE, '../../..')

const CONTROL_PORT = Number(process.env.CONTROL_PORT || 3004)
const PLATFORM_PORT = Number(process.env.PLATFORM_PORT || 3006)
/** Kontroll-Host der Platform-App (lokal, s. NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). */
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
/** Ein Mandanten-Host des Pools (lokal geseedet). */
const TENANT_HOST = process.env.TENANT_HOST || 'kunde-a.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig — erwartet apps/control/.env plus POOL_KEY.')
  process.exit(1)
}

/** Der Sentinel aus core/shared/notificationScope.ts — hier absichtlich als
 *  Literal, damit der Beweis den Spaltenwert prüft und nicht die Konstante,
 *  die ihn erzeugt hat. */
const ACCOUNT = '_account'

const controlDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { controlUsers: [], poolUsers: [], controlRows: [], poolRows: [], requests: [] }

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
 * node:http über ::1 — Node's `fetch` verwirft einen eigenen Host-Header, und
 * genau der entscheidet hier über die Welt (Mandant vs. Kontroll-Host). Nitro
 * hört im Dev auf IPv6.
 */
function call(port, host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = httpRequest({
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
        catch { /* HTML */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const callControl = (path, options) => call(CONTROL_PORT, `localhost:${CONTROL_PORT}`, path, options)
const callPlatform = (host, path, options) => call(PLATFORM_PORT, host, path, options)

/** Anmelden und das Session-Cookie zurückgeben (leer = fehlgeschlagen). */
async function login(caller, account) {
  const res = await caller('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  return res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0] ?? ''
}

/** Eine Notification anlegen, GENAU wie notify() es tut (Empfänger-Permissions,
 *  tenantId als Ablage-Merkmal). */
async function seedNotification(db, recipientId, { type, title, tenantId }) {
  return await db.createRow({
    databaseId,
    tableId: 'notifications',
    rowId: ID.unique(),
    data: { recipientId, type, title, body: 'C17-Beweis', link: '/account/billing', read: false, tenantId },
    permissions: [Permission.read(Role.user(recipientId)), Permission.update(Role.user(recipientId))],
  })
}

/**
 * Titel der Meldungen, die die Leseroute für diese Session herausgibt.
 * `fetcher(path, options)` bestimmt Server UND Host — beim Pool entscheidet
 * genau der Host, welche Glocke antwortet.
 */
async function bellTitles(fetcher, cookie) {
  const res = await fetcher('/api/notifications', { cookie })
  return { status: res.status, titles: (res.json?.notifications ?? []).map(n => n.title), json: res.json }
}

/** Wartet, bis eine Bedingung eintritt (der Versand läuft nebenläufig). */
async function eventually(fn, attempts = 20, delay = 250) {
  for (let i = 0; i < attempts; i++) {
    const value = await fn()
    if (value) return value
    await new Promise(r => setTimeout(r, delay))
  }
  return null
}

try {
  console.log(`\nBeweis „Glocke im Kundenbereich" (C17) — control :${CONTROL_PORT}, platform :${PLATFORM_PORT}`)
  console.log(`Projekte: control=${controlProject} · pool=${poolProject}\n`)

  const stamp = Date.now().toString(36)

  // ──────────────────────────────────────────────────────────────────────────
  console.log('1. Wer schreibt kontobezogene Meldungen — und in welches Projekt?')

  const operator = { email: `c17-op-${stamp}@example.test`, password: `Pw-${ID.unique()}` }
  const stranger = { email: `c17-fremd-${stamp}@example.test`, password: `Pw-${ID.unique()}` }

  const operatorUser = await controlUsers.create({ userId: ID.unique(), email: operator.email, password: operator.password, name: 'C17 Betreiber' })
  cleanup.controlUsers.push(operatorUser.$id)
  await controlUsers.updateLabels({ userId: operatorUser.$id, labels: ['admin'] })
  operator.id = operatorUser.$id

  const strangerUser = await controlUsers.create({ userId: ID.unique(), email: stranger.email, password: stranger.password, name: 'C17 Fremder' })
  cleanup.controlUsers.push(strangerUser.$id)
  stranger.id = strangerUser.$id

  // Der ECHTE Weg: das öffentliche Formular liegt in der Platform-App auf dem
  // Kontroll-Host, das Anlegen gehört dem Control Plane (Service-Naht).
  const requestEmail = `c17-anfrage-${stamp}@example.test`
  const requested = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email: requestEmail, note: 'C17-Beweis', locale: 'de' },
  })
  check('öffentliche Early-Access-Anfrage angenommen', requested.status === 200 && requested.json?.ok === true,
    `${requested.status} ${requested.text.slice(0, 160)}`)

  const inviteRow = await eventually(async () => {
    const { rows } = await controlDb.listRows({
      databaseId, tableId: 'notifications',
      queries: [Query.equal('recipientId', operator.id), Query.equal('type', 'invite.request'), Query.limit(5)],
    })
    return rows[0] ?? null
  })
  check('Meldung liegt im CONTROL-Projekt beim Betreiber', !!inviteRow, 'keine Zeile gefunden')
  if (inviteRow) cleanup.controlRows.push(inviteRow.$id)
  check(`Ablage ist '${ACCOUNT}' (mandantenlos, nicht in einer Community)`, inviteRow?.tenantId === ACCOUNT,
    `tenantId='${inviteRow?.tenantId}'`)
  check('Titel trägt die anfragende Adresse (die Glocke setzt ihn als {name})',
    inviteRow?.title === requestEmail, `title='${inviteRow?.title}'`)
  check('Link zeigt auf die Betreiber-Oberfläche', inviteRow?.link === '/dashboard/invites', `link='${inviteRow?.link}'`)

  const strangerRows = await controlDb.listRows({
    databaseId, tableId: 'notifications',
    queries: [Query.equal('recipientId', stranger.id), Query.limit(5)],
  })
  check('ein Konto OHNE Betreiber-Label bekommt sie gar nicht', strangerRows.total === 0, `${strangerRows.total} Zeilen`)

  // Die Anfrage-Zeile selbst wieder wegräumen (uq_email).
  const requests = await controlDb.listRows({
    databaseId, tableId: 'invite_requests', queries: [Query.equal('email', requestEmail), Query.limit(5)],
  })
  cleanup.requests.push(...requests.rows.map(r => r.$id))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2. Der zweite Absender: Zahlungsproblem (Stripe-Webhook)')

  const webhookSource = readFileSync(resolvePath(REPO, 'packages/billing/server/api/stripe/webhook.post.ts'), 'utf8')
  check('Webhook stempelt `scope: \'account\'`', /scope:\s*'account'/.test(webhookSource))
  check('Webhook verlinkt in den Kundenbereich (/account/billing)', webhookSource.includes("link: '/account/billing'"))
  check('Empfänger ist ein Konto DIESES Projekts (row.userId)', /recipientId:\s*row\.userId/.test(webhookSource))

  // Eine so gestempelte Zeile — von hier ab läuft der echte Leseweg.
  const billingRow = await seedNotification(controlDb, operator.id, {
    type: 'billing', title: `c17-plan-${stamp}`, tenantId: ACCOUNT,
  })
  cleanup.controlRows.push(billingRow.$id)
  check('Zahlungs-Meldung liegt mandantenlos beim Kunden', billingRow.tenantId === ACCOUNT)

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3. Lesen über die echte Route')

  const anonymous = await callControl('/api/notifications')
  check('ohne Anmeldung: 401', anonymous.status === 401, `Status ${anonymous.status}`)

  operator.cookie = await login(callControl, operator)
  stranger.cookie = await login(callControl, stranger)
  check('Betreiber und Fremder sind angemeldet', !!operator.cookie && !!stranger.cookie)

  const own = await bellTitles(callControl, operator.cookie)
  check('Betreiber sieht die Anfrage', own.titles.includes(requestEmail), JSON.stringify(own.titles))
  check('Betreiber sieht das Zahlungsproblem', own.titles.includes(`c17-plan-${stamp}`), JSON.stringify(own.titles))
  check('Zähler der ungelesenen Meldungen stimmt', (own.json?.unread ?? 0) >= 2, `unread=${own.json?.unread}`)

  const foreign = await bellTitles(callControl, stranger.cookie)
  check('FREMDER sieht keine davon', foreign.status === 200
    && !foreign.titles.includes(requestEmail)
    && !foreign.titles.includes(`c17-plan-${stamp}`), JSON.stringify(foreign.titles))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4. Die Glocke hängt wirklich (HTML der beiden Shells)')

  const BELL = 'data-testid="notification-bell"'
  /** Ein HTTP 200 beweist keine funktionierende Seite — die Fehlerseite kommt
   *  ebenfalls mit 200 aus dem Dev-Server. Deshalb zusätzlich auf ihre
   *  Kennzeichen prüfen. */
  const isErrorPage = html => /statusCode":5\d\d/.test(html) || html.includes('data-testid="error-page"')

  const workspace = await callControl('/workspace', { cookie: operator.cookie })
  check('/workspace lädt ohne Fehlerseite', workspace.status === 200 && !isErrorPage(workspace.text), `Status ${workspace.status}`)
  check('/workspace zeigt die Glocke', workspace.text.includes(BELL))

  const dashboard = await callControl('/dashboard', { cookie: operator.cookie })
  check('/dashboard lädt ohne Fehlerseite', dashboard.status === 200 && !isErrorPage(dashboard.text), `Status ${dashboard.status}`)
  check('/dashboard zeigt die Glocke', dashboard.text.includes(BELL))

  const guest = await callControl('/')
  check('Gast sieht KEINE Glocke', !guest.text.includes(BELL))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5. Gegenprobe im POOL — die eigentliche Grenze')
  // Nur hier gibt es BEIDE Welten: Mandanten-Hosts und einen Kontroll-Host.
  // Im Control-Projekt gibt es keine Communities, dort ist die Glocke per
  // Definition „alles" (notificationAudienceFor → kind: 'all').

  const tenants = await controlDb.listRows({
    databaseId, tableId: 'tenants', queries: [Query.equal('host', TENANT_HOST), Query.limit(1)],
  })
  // Die Mandanten-Id ist die SPALTE `tenantId` (z. B. 't-kunde-a'), nicht die
  // Row-Id des Tenants — genau diese Verwechslung hat der Beweis beim ersten
  // Lauf aufgedeckt (die Community-Glocke blieb leer, weil die Zeile einen
  // fremden Stempel trug: die Tür ist auf der Mandanten-Seite fail-closed).
  const tenantId = tenants.rows[0]?.tenantId
  check(`Mandant ${TENANT_HOST} existiert lokal (tenantId=${tenantId})`, !!tenantId, 'kein Tenant — TENANT_HOST setzen')

  const member = { email: `c17-pool-${stamp}@example.test`, password: `Pw-${ID.unique()}` }
  const memberUser = await poolUsers.create({ userId: ID.unique(), email: member.email, password: member.password, name: 'C17 Mitglied' })
  cleanup.poolUsers.push(memberUser.$id)
  member.id = memberUser.$id

  const communityTitle = `c17-community-${stamp}`
  const accountTitle = `c17-konto-${stamp}`
  if (tenantId) {
    cleanup.poolRows.push((await seedNotification(poolDb, member.id, { type: 'reply', title: communityTitle, tenantId })).$id)
    cleanup.poolRows.push((await seedNotification(poolDb, member.id, { type: 'billing', title: accountTitle, tenantId: ACCOUNT })).$id)
  }

  // EINE Anmeldung, ZWEI Hosts — dieselbe Person, zwei Welten. Das Cookie
  // reisen wir selbst herum (node:http), Browser-Domain-Regeln sind hier
  // nicht die Frage.
  const onTenant = (path, options) => callPlatform(TENANT_HOST, path, options)
  const onAccountArea = (path, options) => callPlatform(CONTROL_HOST, path, options)
  member.cookie = await login(onTenant, member)
  check('Pool-Mitglied ist angemeldet', !!member.cookie)

  const community = await bellTitles(onTenant, member.cookie)
  check('Community-Glocke zeigt die Community-Meldung', community.titles.includes(communityTitle), JSON.stringify(community.titles))
  check('Community-Glocke zeigt die KONTO-Meldung NICHT', !community.titles.includes(accountTitle), JSON.stringify(community.titles))

  const accountArea = await bellTitles(onAccountArea, member.cookie)
  check('Kundenbereich zeigt die Konto-Meldung', accountArea.titles.includes(accountTitle), JSON.stringify(accountArea.titles))
  check('Kundenbereich zeigt die COMMUNITY-Meldung NICHT', !accountArea.titles.includes(communityTitle), JSON.stringify(accountArea.titles))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  console.log('\nAufräumen…')
  for (const id of cleanup.controlRows) {
    await controlDb.deleteRow({ databaseId, tableId: 'notifications', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.poolRows) {
    await poolDb.deleteRow({ databaseId, tableId: 'notifications', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.requests) {
    await controlDb.deleteRow({ databaseId, tableId: 'invite_requests', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.controlUsers) await controlUsers.delete({ userId: id }).catch(() => {})
  for (const id of cleanup.poolUsers) await poolUsers.delete({ userId: id }).catch(() => {})

  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
  process.exit(fail === 0 ? 0 : 1)
}

/**
 * Beweis: eigene Domains für SILO-Apps (control-036, 2026-08-07).
 *
 * Das Schwester-Skript zu `packages/onboarding/scripts/verify-custom-domain.mjs`
 * (Pool, 46/46). Es misst NICHT dieselben Dinge noch einmal — Validierung,
 * www-Paar, TXT-Nachweis und Zeige-Prüfung sind buchstäblich dieselben
 * Funktionen und dort schon bewiesen. Gemessen wird, was am Silo ANDERS ist:
 *
 *   TRÄGT HIER (echt gemessen, gegen laufende Server):
 *     · die HOST-ANNAHME der Silo-App: die eigene Domain wird bedient, die
 *       Pukalani-Adresse leitet dorthin um, ein FREMDER Host bleibt unberührt
 *     · 301 mit Pfad UND Query + `Cache-Control: no-store`, 308 für POST
 *     · dass eine WARTENDE Domain NICHT umgeleitet wird (die Bedingung, an der
 *       sonst die HTTP-01-Prüfung von Let's Encrypt scheitern würde)
 *     · dass `/.well-known/` und `/api/health` nie umgeleitet werden
 *     · FAIL-SOFT: ein zweiter Silo (portfolio) läuft gegen eine TOTE Naht und
 *       antwortet weiter auf seiner alten Adresse, ohne Umleitung
 *     · die Betreiber-Konsole: eintragen, prüfen, freischalten, entfernen —
 *       inklusive des Rückrufs in die Silo-App (`settle`) und der
 *       Appwrite-Web-Platform (F45) samt Origin-Gegenprobe
 *     · die Naht-Grenze: ohne Service-Secret existiert `settle` nicht (404),
 *       mit falschem Secret 401
 *
 *   TRÄGT ERST BEIM PORTFOLIO-UMZUG (Runbook):
 *     · ploi legt den Alias an und Let's Encrypt stellt aus
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 * DREI eigene Server, alle auf freien Ports (fremde Sitzungen auf 3004–3006
 * nicht anfassen — CLAUDE.md, „Tests"):
 *
 *   NUXT_CUSTOM_DOMAIN_DRY_RUN=1 NUXT_CUSTOM_DOMAIN_DNS_SERVERS=127.0.0.1:5355 \
 *     pnpm --filter control exec nuxi dev --port 3024
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3024 \
 *     NUXT_ONBOARDING_SERVICE_SECRET=<secret> \
 *     pnpm --filter comments exec nuxi dev --port 3026
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3999 \
 *     NUXT_ONBOARDING_SERVICE_SECRET=<secret> \
 *     pnpm --filter portfolio exec nuxi dev --port 3027
 *
 *   COMMENTS_KEY=… node --env-file=apps/control/.env \
 *     packages/control/scripts/verify-silo-domain.mjs
 *
 * Der DRITTE Server ist der ganze Witz des Fail-soft-Abschnitts: seine
 * Naht-URL zeigt auf einen TOTEN Port. Beide Silos bekommen eine gleich
 * geformte `websites`-Zeile mit aktiver Domain; der einzige Unterschied ist,
 * ob das Control Plane antwortet. Ein Fail-soft-Test ohne diese Gegenprobe
 * wäre immer grün.
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { startDnsStub } from '../../onboarding/scripts/lib/dnsStub.mjs'

const CONTROL_PORT = Number(process.env.CONTROL_PORT || 3024)
const SILO_PORT = Number(process.env.SILO_PORT || 3026)
const DEAD_SILO_PORT = Number(process.env.DEAD_SILO_PORT || 3027)
const DNS_STUB_PORT = Number(process.env.DNS_STUB_PORT || 5355)

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const secret = process.env.NUXT_CONTROL_ONBOARDING_SECRET
/** Projekt-Key der comments-App — für die Gegenprobe der Web-Platform (F45). */
const commentsKey = process.env.COMMENTS_KEY
const SILO_PROJECT = process.env.SILO_PROJECT || 'reddit-comments'
const DEAD_PROJECT = process.env.DEAD_PROJECT || 'portfolio-g4ml'

if (!endpoint || !controlProject || !databaseId || !controlKey || !secret) {
  console.error('✗ Env unvollständig — mit --env-file=apps/control/.env fahren.')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))

const WEBSITES = 'websites'
const stamp = Date.now().toString(36)
/** Die „Kundendomain" des Beweises. `.localhost` UND NICHT `.test`: Vite
 *  blockt im Dev-Server jeden unbekannten Host mit 403, und `.localhost` steht
 *  in seiner Erlaubnisliste (Pool-Beweis, 2026-08-07). */
const DOMAIN = `silo-${stamp}.localhost`
const SIBLING = `www.silo-${stamp}.localhost`
/** Ein Host, den diese Site NICHT kennt — er muss unberührt bleiben. */
const FOREIGN = `fremd-${stamp}.localhost`
const SERVER_IP = process.env.NUXT_CUSTOM_DOMAIN_SERVER_IPS?.split(',')[0]?.trim() || '49.13.211.173'

let pass = 0
let fail = 0
const cleanup = { websites: [], users: [], platforms: [], restore: [] }
const zone = {}
let dnsStub = null

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

/** node:http, weil `fetch` einen eigenen Host-Header verwirft; `::1`, weil
 *  Nitro dort hört (Vites HMR-Server sitzt auf IPv4). */
function call(port, host, path, { method = 'GET', body, cookie, headers = {} } = {}) {
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
        ...headers,
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({
          status: res.statusCode,
          location: res.headers.location ?? '',
          cacheControl: res.headers['cache-control'] ?? '',
          json,
          text,
          setCookie: res.headers['set-cookie'] ?? [],
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function waitForServer(port, label) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await call(port, 'localhost', '/api/health')
      if (res.status && res.status < 500) return true
    }
    catch { /* noch nicht da */ }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  console.error(`✗ ${label} auf :${port} antwortet nicht`)
  return false
}

/**
 * Die `websites`-Zeile dieses Projekts BELEGEN — die bestehende, wenn es sie
 * gibt.
 *
 * ── WARUM NICHT EINFACH EINE ZWEITE ANLEGEN ───────────────────────────────
 * Genau das war der erste Anlauf, und er hat den Beweis stumm falsch gemacht
 * (2026-08-07): das Register hat einen Unique-Index auf `slug`, aber keinen
 * auf `projectId`. Eine zweite Zeile für `reddit-comments` war also anlegbar,
 * und die Naht bekam weiterhin die ALTE — Abschnitt 3 meldete „keine
 * Umleitung", obwohl der Code stimmte. Zehn rote Prüfungen für einen Fehler im
 * Beweis.
 *
 * Der Befund ist im Code gelandet (`findWebsiteByProject` warnt jetzt bei
 * Dubletten), und der Beweis nimmt seither die echte Zeile — inklusive
 * Wiederherstellung ihres Ausgangszustands im `finally`.
 */
async function claimWebsite(projectId, appUrl, slug) {
  const { rows } = await control.listRows({
    databaseId, tableId: WEBSITES,
    queries: [Query.equal('projectId', projectId), Query.limit(2)],
  })
  const domainFields = {
    customDomain: '', customDomainStatus: '', customDomainToken: '',
    customDomainError: '', customDomainVerifiedAt: null, customDomainActivatedAt: null,
  }
  // Trockenlauf: die ploi-Ids dürfen gesetzt sein, ploi wird trotzdem nicht
  // angefasst — so läuft der Zweig `ploiConfigured: true` mit.
  const testFields = { appUrl, ploiServerId: '118713', ploiSiteId: '999999', ...domainFields }

  const existing = rows[0]
  if (existing) {
    cleanup.restore.push({
      id: existing.$id,
      data: {
        appUrl: existing.appUrl ?? '',
        ploiServerId: existing.ploiServerId ?? '',
        ploiSiteId: existing.ploiSiteId ?? '',
        ...domainFields,
      },
    })
    return await control.updateRow({ databaseId, tableId: WEBSITES, rowId: existing.$id, data: testFields })
  }

  const row = await control.createRow({
    databaseId, tableId: WEBSITES, rowId: ID.unique(),
    data: {
      name: `Beweis ${slug}`, slug, projectId, endpoint,
      status: 'active', healthStatus: 'unknown', healthCheckedAt: null,
      notes: 'Wegwerf-Zeile für verify-silo-domain.mjs',
      ...testFields,
    },
  })
  cleanup.websites.push(row.$id)
  return row
}

const patchWebsite = (id, data) => control.updateRow({ databaseId, tableId: WEBSITES, rowId: id, data })
const readWebsite = id => control.getRow({ databaseId, tableId: WEBSITES, rowId: id })

/** Die Adress-Auskunft der Silo-App ist 30 s gecacht — nach einer Änderung
 *  muss der Beweis warten, sonst misst er den alten Stand. */
const CACHE_WAIT_MS = 31_000
const waitForCache = () => new Promise(resolve => setTimeout(resolve, CACHE_WAIT_MS))

/** Appwrite-Projects-API des SILO-Projekts (der SDK bildet sie nicht ab). */
async function siloPlatforms() {
  if (!commentsKey) return { status: 0, platforms: [] }
  const res = await fetch(`${endpoint}/projects/${SILO_PROJECT}/platforms`, {
    headers: { 'X-Appwrite-Project': SILO_PROJECT, 'X-Appwrite-Key': commentsKey, 'Accept': 'application/json' },
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, platforms: json?.platforms ?? [] }
}

/** Die Gegenprobe aus CLAUDE.md: 403 = Origin unbekannt, 401 = akzeptiert. */
async function originStatus(host) {
  const res = await fetch(`${endpoint}/account`, {
    headers: { 'Origin': `https://${host}`, 'X-Appwrite-Project': SILO_PROJECT },
  })
  return res.status
}

try {
  console.log(`\nSilo-Domains: Beweis gegen control :${CONTROL_PORT}, Silo :${SILO_PORT}, toter Silo :${DEAD_SILO_PORT}\n`)
  dnsStub = await startDnsStub({ zone, port: DNS_STUB_PORT })

  console.log('0. Server erreichbar')
  const up = await Promise.all([
    waitForServer(CONTROL_PORT, 'control'),
    waitForServer(SILO_PORT, 'Silo (comments)'),
    waitForServer(DEAD_SILO_PORT, 'Silo mit toter Naht (portfolio)'),
  ])
  if (up.some(ok => !ok)) throw new Error('Server nicht bereit')
  check('alle drei Server antworten', true)

  console.log('\n1. Ohne eigene Domain passiert NICHTS')
  const site = await claimWebsite(SILO_PROJECT, `http://localhost:${SILO_PORT}`, `beweis-silo-${stamp}`)
  await waitForCache()
  const plain = await call(SILO_PORT, 'localhost', '/api/themes')
  check('die Pukalani-Adresse antwortet selbst (kein 3xx)', plain.status === 200,
    `Status ${plain.status} → ${plain.location}`)

  console.log('\n2. WARTENDE Domain: weiterhin keine Umleitung (die HTTP-01-Bedingung)')
  await patchWebsite(site.$id, { customDomain: DOMAIN, customDomainStatus: 'pending_cert', customDomainToken: 'a'.repeat(32) })
  await waitForCache()
  const whilePending = await call(SILO_PORT, 'localhost', '/api/themes')
  check('die alte Adresse leitet NICHT um, solange das Zertifikat fehlt',
    whilePending.status === 200, `Status ${whilePending.status} → ${whilePending.location}`)
  const acme = await call(SILO_PORT, DOMAIN, '/.well-known/acme-challenge/probe')
  check('… und die ACME-Antwort auf der wartenden Domain wird nicht umgeleitet',
    acme.status !== 301 && acme.status !== 308, `Status ${acme.status} → ${acme.location}`)

  console.log('\n3. AKTIV: Host-Annahme und Umleitungen')
  await patchWebsite(site.$id, { customDomainStatus: 'active', customDomainActivatedAt: new Date().toISOString() })
  await waitForCache()

  const onOwn = await call(SILO_PORT, DOMAIN, '/api/themes')
  check('die eigene Domain bedient die Site (200, keine Schleife)',
    onOwn.status === 200, `Status ${onOwn.status} ${onOwn.text.slice(0, 120)}`)

  const fromOld = await call(SILO_PORT, 'localhost', '/dashboard/community/domain?x=1')
  check('die Pukalani-Adresse leitet dauerhaft um (301)', fromOld.status === 301, `Status ${fromOld.status}`)
  check('… mit Pfad UND Query',
    fromOld.location === `https://${DOMAIN}/dashboard/community/domain?x=1`, fromOld.location)
  check('… und mit `Cache-Control: no-store`, damit die alte Adresse Rückfall bleibt',
    fromOld.cacheControl.includes('no-store'), fromOld.cacheControl)

  const fromWww = await call(SILO_PORT, SIBLING, '/')
  check('die www-Form leitet auf die eingetragene Form um',
    fromWww.status === 301 && fromWww.location === `https://${DOMAIN}/`,
    `Status ${fromWww.status} → ${fromWww.location}`)

  const post = await call(SILO_PORT, 'localhost', '/api/auth/me', { method: 'POST' })
  check('ein POST bekommt 308 und behält damit seine Methode', post.status === 308, `Status ${post.status}`)

  console.log('\n4. Die Grenzen der Umleitung (jede einzeln)')
  const foreign = await call(SILO_PORT, FOREIGN, '/api/themes')
  check('ein FREMDER Host bleibt unberührt — sonst wäre die lokale Entwicklung kaputt',
    foreign.status !== 301 && foreign.status !== 308, `Status ${foreign.status} → ${foreign.location}`)
  const health = await call(SILO_PORT, 'localhost', '/api/health')
  check('`/api/health` wird nie umgeleitet (Deploy-Prüfung + Überwachung)',
    health.status === 200, `Status ${health.status} → ${health.location}`)
  const wellKnown = await call(SILO_PORT, 'localhost', '/.well-known/acme-challenge/probe')
  check('`/.well-known/` wird nie umgeleitet (HTTP-01)',
    wellKnown.status !== 301 && wellKnown.status !== 308, `Status ${wellKnown.status} → ${wellKnown.location}`)

  console.log('\n5. FAIL-SOFT: derselbe Zustand, aber die Naht ist tot')
  /**
   * Die Gegenprobe zum Abschnitt davor. Gleich geformte Zeile, aktive Domain
   * — nur zeigt die Naht dieses Servers auf einen toten Port. Er MUSS weiter
   * auf seiner alten Adresse antworten und darf nirgendwohin umleiten: ein
   * Ausfall des Control Plane reisst keine laufende Site mit.
   */
  const deadSite = await claimWebsite(DEAD_PROJECT, `http://localhost:${DEAD_SILO_PORT}`, `beweis-tot-${stamp}`)
  await patchWebsite(deadSite.$id, {
    customDomain: `tot-${stamp}.localhost`,
    customDomainStatus: 'active',
    customDomainToken: 'b'.repeat(32),
    customDomainActivatedAt: new Date().toISOString(),
  })
  await waitForCache()
  const deadOld = await call(DEAD_SILO_PORT, 'localhost', '/')
  check('der Silo mit toter Naht antwortet weiter auf seiner alten Adresse',
    deadOld.status === 200, `Status ${deadOld.status} → ${deadOld.location}`)
  check('… und leitet NICHT ins Ungewisse um', !deadOld.location, deadOld.location)

  console.log('\n6. Die Naht-Grenze: `settle` ist ohne Secret nicht einmal da')
  const noSecret = await call(SILO_PORT, DOMAIN, '/api/site/domain/settle', { method: 'POST' })
  check('ohne Service-Secret antwortet die Route 401 oder 404, nie 200',
    noSecret.status === 401 || noSecret.status === 404, `Status ${noSecret.status}`)
  const wrongSecret = await call(SILO_PORT, DOMAIN, '/api/site/domain/settle', {
    method: 'POST', headers: { 'x-pukalani-onboarding-secret': 'falsch' },
  })
  check('mit FALSCHEM Secret 401', wrongSecret.status === 401, `Status ${wrongSecret.status}`)

  console.log('\n7. Die Betreiber-Konsole: eintragen, prüfen, freischalten')
  // Ein Betreiber-Konto im control-Projekt, mit dem Label, das `sites.manage`
  // trägt. Über den ECHTEN Login der control-App, nicht über einen Umweg.
  const email = `silo-domain-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const operator = await controlUsers.create({ userId: ID.unique(), email, password, name: 'Beweis Betreiber' })
  cleanup.users.push(operator.$id)
  await controlUsers.updateLabels({ userId: operator.$id, labels: ['admin'] })
  const loginRes = await call(CONTROL_PORT, 'localhost', '/api/auth/login', { method: 'POST', body: { email, password } })
  const cookie = (loginRes.setCookie.find(c => c.startsWith('a_session_')) || '').split(';')[0]
  check('Betreiber angemeldet', loginRes.status === 200 && !!cookie, `Status ${loginRes.status} ${loginRes.text.slice(0, 160)}`)

  // Zuerst die Ablehnung — sie beweist, dass die Regeln des Pools hier gelten.
  const denied = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain`, {
    method: 'PUT', cookie, body: { domain: 'login.pukalani.app' },
  })
  check('`login.pukalani.app` wird abgewiesen (domain_operator_domain)',
    denied.status === 400 && denied.json?.reason === 'domain_operator_domain',
    `Status ${denied.status} ${JSON.stringify(denied.json)}`)

  const taken = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain`, {
    method: 'PUT', cookie, body: { domain: `tot-${stamp}.localhost` },
  })
  check('eine Domain, die schon einer anderen Website gehört, wird abgewiesen (409)',
    taken.status === 409 && taken.json?.reason === 'domain_taken',
    `Status ${taken.status} ${JSON.stringify(taken.json)}`)

  const put = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain`, {
    method: 'PUT', cookie, body: { domain: DOMAIN },
  })
  check('Domain über die Betreiber-Konsole eingetragen',
    put.status === 200 && put.json?.domain === DOMAIN && put.json?.status === 'pending_dns',
    `Status ${put.status} ${put.text.slice(0, 200)}`)
  check('… ein frisches Token liegt in DIESER Zeile',
    /^pukalani-domain-verify=[a-f0-9]{32}$/.test(put.json?.instructions?.txtValue ?? ''),
    put.json?.instructions?.txtValue)

  // Ohne DNS bleibt es ehrlich stehen — echte Abfrage gegen den Stub, der
  // diesen Namen (noch) nicht besitzt und an 1.1.1.1 weiterreicht.
  const noDns = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain/verify`, { method: 'POST', cookie })
  check('Prüfen ohne DNS bleibt bei `pending_dns`',
    noDns.status === 200 && noDns.json?.status === 'pending_dns',
    `Status ${noDns.status} ${JSON.stringify(noDns.json?.status)}`)
  check('… und sagt WAS fehlt (der TXT-Eintrag)',
    (noDns.json?.error ?? '').includes('_pukalani-verify.'), noDns.json?.error)

  console.log('\n8. Die volle Kette bis `active` — inkl. Rückruf in die Silo-App (F45)')
  const row = await readWebsite(site.$id)
  zone[`_pukalani-verify.${DOMAIN}`] = { txt: [`pukalani-domain-verify=${row.customDomainToken}`] }
  zone[DOMAIN] = { a: [SERVER_IP] }
  zone[SIBLING] = { a: [SERVER_IP] }

  if (commentsKey) {
    const before = await siloPlatforms()
    check('vor der Freischaltung kennt das Silo-Projekt die Domain NICHT',
      !before.platforms.some(p => p.hostname === DOMAIN), `Status ${before.status}`)
    check('… und lehnt ihren Origin ab (403 general_unknown_origin)', await originStatus(DOMAIN) === 403)
  }

  /**
   * NUR FÜR DIESEN ABSCHNITT: `appUrl` auf die IPv4-Adresse.
   *
   * ── EINE EIGENART DER TESTUMGEBUNG, KEIN BEFUND AM CODE ─────────────────
   * Der Rückruf geht über `fetch` an `websites.appUrl`. Im Nitro-DEV-Prozess
   * des Control Plane scheitert die Namensauflösung von `localhost` mit
   * **ENOTFOUND** — gemessen am 2026-08-07, nachdem `callSiteSettle` die
   * Ursache mit ausgibt statt nur „fetch failed" zu melden. Dieselbe Adresse
   * antwortet per curl und per `node -e "fetch(...)"` aus derselben Shell
   * einwandfrei; es ist also der Prozess, nicht das Netz.
   *
   * In PRODUKTION gibt es das nicht: dort steht in `appUrl` ein echter
   * Hostname mit echtem DNS (`https://portfolio.pukalani.app`). Die Zeile
   * hier ersetzt genau diese eine Eigenart und nichts sonst — der Rückruf,
   * das Secret, die Statusprüfung und die Web-Platform laufen unverändert.
   *
   * Danach wird `appUrl` sofort zurückgesetzt, damit Abschnitt 9 wieder gegen
   * denselben Rückfall-Host misst wie 1–5.
   */
  await patchWebsite(site.$id, { appUrl: `http://127.0.0.1:${SILO_PORT}` })

  const activated = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain/verify`, { method: 'POST', cookie })
  check('Prüfen führt bis `active` — der Rückruf in die Silo-App hat geklappt',
    activated.status === 200 && activated.json?.status === 'active',
    `Status ${activated.status} ${JSON.stringify(activated.json?.status)} ${activated.json?.error ?? ''}`)
  check('… und hält den Zeitpunkt fest', !!activated.json?.activatedAt, activated.json?.activatedAt)

  if (commentsKey) {
    const after = await siloPlatforms()
    for (const host of [DOMAIN, SIBLING]) {
      const entry = after.platforms.find(p => p.hostname === host)
      if (entry) cleanup.platforms.push(entry.$id)
      check(`das Silo-Projekt kennt jetzt ${host} als Web-Platform`, !!entry)
    }
    check('… und akzeptiert ihren Origin (401 statt 403)', await originStatus(DOMAIN) === 401)
    check('… GEGENPROBE: ein nie registrierter Host bleibt abgewiesen (403)',
      await originStatus(`nie-registriert-${stamp}.localhost`) === 403)
  }

  // Die Eigenart der Testumgebung endet hier — ab jetzt wieder der echte
  // Rückfall-Host.
  await patchWebsite(site.$id, { appUrl: `http://localhost:${SILO_PORT}` })

  console.log('\n9. Entfernen über die Betreiber-Konsole')
  const removed = await call(CONTROL_PORT, 'localhost', `/api/control/websites/${site.$id}/domain`, { method: 'DELETE', cookie })
  check('Domain entfernt', removed.status === 200 && removed.json?.status === 'none',
    `Status ${removed.status} ${removed.text.slice(0, 200)}`)
  await waitForCache()
  const backHome = await call(SILO_PORT, 'localhost', '/api/themes')
  check('die Site antwortet wieder selbst (kein 301 mehr)',
    backHome.status === 200, `Status ${backHome.status} → ${backHome.location}`)
  const goneDomain = await call(SILO_PORT, DOMAIN, '/api/themes')
  check('die abgegebene Domain ist für die Umleitung kein bekannter Host mehr',
    !goneDomain.location, `Status ${goneDomain.status} → ${goneDomain.location}`)
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\nAufräumen …')
  dnsStub?.close()
  for (const id of cleanup.platforms) {
    if (!commentsKey) break
    await fetch(`${endpoint}/projects/${SILO_PROJECT}/platforms/${id}`, {
      method: 'DELETE',
      headers: { 'X-Appwrite-Project': SILO_PROJECT, 'X-Appwrite-Key': commentsKey },
    }).catch(() => {})
  }
  // Erst die echten Zeilen in ihren Ausgangszustand, dann die Wegwerf-Zeilen
  // weg. Andersherum bliebe bei einem Abbruch eine fremde Site mit einer
  // Test-Domain stehen.
  for (const entry of cleanup.restore) {
    await control.updateRow({ databaseId, tableId: WEBSITES, rowId: entry.id, data: entry.data }).catch(() => {})
  }
  for (const id of cleanup.websites) {
    await control.deleteRow({ databaseId, tableId: WEBSITES, rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await controlUsers.delete({ userId: id }).catch(() => {})
  }
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden.\n`)
  process.exit(fail === 0 ? 0 : 1)
}

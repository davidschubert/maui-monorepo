/**
 * Beweis: eigene Domains je Community (control-035, Davids Entscheidungen vom
 * 2026-08-07).
 *
 * ── WAS DIESER BEWEIS TRÄGT — UND WAS NICHT ────────────────────────────────
 * Die VOLLE Kette ist lokal nicht herstellbar: sie braucht echte DNS-Einträge
 * in einer fremden Zone, einen ploi-Server und eine Let's-Encrypt-Ausstellung.
 * Ein Mock davor wäre kein Beweis, sondern eine Attrappe — er wäre immer grün.
 *
 * Also wird getrennt, was trennbar ist:
 *
 *   TRÄGT HIER (echt gemessen, gegen laufende Server und echte Daten):
 *     · die Host-Auflösung über die eigene Domain (Resolver, beide Formen)
 *     · die 301/308-Umleitung und dass die kanonische Form 200 antwortet
 *       (keine Schleife)
 *     · die Eingabe-Prüfung inkl. der Sperre für `*.pukalani.app`
 *     · die Plan-Grenze (403 `plan_required`) — server-seitig, nicht nur UI
 *     · die Eindeutigkeit: eine fremde Community kann die Domain nicht nehmen
 *     · die DNS-Prüfung gegen ECHTE öffentliche Records — mit BEIDEN
 *       Richtungen: ein Name, der wirklich auf uns zeigt, und einer, den es
 *       nie geben wird
 *     · dass das Verifikations-Token an die Community gebunden ist
 *     · die VOLLE Kette bis `active` (Abschnitt 12), einschließlich der
 *       Appwrite-Web-Platform (F45) — samt der Gegenprobe, die als einzige
 *       etwas beweist: Origin vorher 403 `general_unknown_origin`, nachher
 *       401, ein nie registrierter Host weiterhin 403
 *
 *   TRÄGT ERST BEIM ERSTEN ECHTEN KUNDEN (Runbook
 *   docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md):
 *     · ploi legt den Tenant an und Let's Encrypt stellt aus
 *     · die HTTPS-Probe (`domainAnswersOverHttps`) sieht ein echtes Zertifikat
 *
 * DER TROCKENLAUF (`NUXT_CUSTOM_DOMAIN_DRY_RUN=1`) macht genau diesen Schnitt
 * sichtbar: er lässt alle Zustandsübergänge laufen und fasst ploi nicht an.
 * Die DNS-Einträge, die Abschnitt 12 braucht, kommen aus einem winzigen
 * eigenen DNS-Server (lib/dnsStub.mjs) — Ersatz für die ZONE, nicht für die
 * Prüfung: alles, was er nicht selbst besitzt, reicht er an 1.1.1.1 weiter,
 * damit Abschnitt 5 gegen echte Records misst.
 *
 * ── DER BEWEIS IST SELBST GEGENGEPROBT (2026-08-07) ────────────────────────
 * Ein Beweis, der beim ersten Lauf grün ist, hat noch nichts gezeigt. Eine
 * absichtliche Mutation an `findCommunityForHost` (die zweite Abfrage — die
 * über `customDomain` — gibt immer `null` zurück) wurde gefangen, und zwar
 * GENAU von den Abschnitten, die die Auflösung über die eigene Domain messen:
 * 35/35 → 31/35, rot waren 7 („die eigene Domain antwortet 200" → 404
 * unknown_host), die www-Zeile in 8 und beide Zeilen in 11. (Der Lauf fand
 * damals vor Abschnitt 12 statt; heute sind es 46 Prüfungen.)
 *
 * Der Lauf hat dabei auch eine GRENZE dieses Beweises gezeigt: Abschnitt 9
 * (abuse-Sperre) blieb grün — ein 404 wegen kaputter Auflösung sieht dort aus
 * wie ein 404 wegen Sperre. Er trägt nur zusammen mit Abschnitt 7, der zeigt,
 * dass dieselbe Adresse ohne Sperre 200 antwortet.
 *
 * Abschnitt 10 existiert überhaupt nur wegen des ERSTEN Laufs: er wollte die
 * Domain über die Subdomain wieder abgeben und bekam ein 308. Das ist kein
 * Fehler, sondern Davids Entscheidung 2 in Aktion — festgehalten statt
 * wegkorrigiert.
 *
 * ── EINE STELLE, AN DER ABGEKÜRZT WIRD, UND WARUM ──────────────────────────
 * Um den Resolver und die Umleitung zu messen, muss eine Community eine
 * AKTIVE eigene Domain haben. Dorthin kommt sie regulär nur über echtes DNS.
 * Abschnitt 5 setzt `customDomain`/`customDomainStatus` deshalb mit dem
 * Admin-Client direkt — das ist die EINGABE des Resolvers, nicht sein
 * Ergebnis. Der SCHREIBWEG dorthin wird davor gemessen (Abschnitte 2–4: die
 * echte Route, ihre Ablehnungen, ihr ehrliches Steckenbleiben in
 * `pending_dns`), und die pure Regel dazwischen hängt an 37 Unit-Tests
 * (packages/control/tests/customDomain.test.ts).
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 * Beide Dienste gehören DIR (CLAUDE.md, „Tests"): ein Beweis über eine
 * Service-Naht ist nur so ehrlich wie sein entferntester Dienst. Fremde
 * Server auf 3004/3005/3006 nicht anfassen.
 *
 *   NUXT_CUSTOM_DOMAIN_DRY_RUN=1 NUXT_CUSTOM_DOMAIN_DNS_SERVERS=127.0.0.1:5354 \
 *     pnpm --filter control exec nuxi dev --port 3014
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3014 \
 *     pnpm --filter platform exec nuxi dev --port 3016
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-custom-domain.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { startDnsStub } from './lib/dnsStub.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig, Rest aus apps/control/.env).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

const COMMUNITIES = 'communities'
const stamp = Date.now().toString(36)
/** Die „Kundendomain" des Beweises. `.localhost` löst hier nirgends auf —
 *  genau richtig: sie darf NUR über die Datenbank kanonisch werden. */
const OWN_DOMAIN = `eigen-${stamp}.localhost`
const OWN_SIBLING = `www.eigen-${stamp}.localhost`
/**
 * Ein Name, der WIRKLICH auf uns zeigt — für die echte, positive
 * DNS-Messung. `platform.pukalani.app` ist unser eigener Host; als
 * KUNDENDOMAIN wäre er verboten, als DNS-Fixpunkt ist er der einzige, den
 * wir ohne fremde Zone haben.
 */
const REAL_POINTING = 'platform.pukalani.app'
/** Und einer, den es nie geben wird — für den sauberen Fehlpfad. */
const REAL_MISSING = `nie-vorhanden-${stamp}.pukalani-gibt-es-nicht.example`
/**
 * Die Domain der VOLLEN Kette (Abschnitt 12) — sie lebt in der Stub-Zone.
 *
 * `.localhost` UND NICHT `.test`, und das ist kein Geschmack: Vite blockt im
 * DEV-Server jeden unbekannten Host mit **403** („Blocked request. This host is
 * not allowed. … add to `server.allowedHosts`"). `.localhost` steht in seiner
 * Erlaubnisliste, `.test` nicht. Am 2026-08-07 kostete das eine Fehlersuche:
 * die Freischaltung lief vollständig durch, die Domain antwortete trotzdem 403
 * — das sah nach einer Rechte-Prüfung aus und war der Testserver. In
 * PRODUKTION gibt es Vite nicht, dort ist jede Kundendomain gleich gut.
 */
const FULL_DOMAIN = `voll-${stamp}.localhost`
const FULL_SIBLING = `www.voll-${stamp}.localhost`
/** Die Server-IP, die die Stub-Zone ausliefert — dieselbe, die die
 *  Runtime-Config des Control Plane als Vorgabe trägt. */
const SERVER_IP = process.env.NUXT_CUSTOM_DOMAIN_SERVER_IPS?.split(',')[0]?.trim() || '49.13.211.173'
const DNS_STUB_PORT = Number(process.env.DNS_STUB_PORT || 5354)

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [], platforms: [] }
/** Die Zone des Stubs — MUTIERBAR, weil das Verifikations-Token erst nach dem
 *  Eintragen bekannt ist (genau wie beim echten Kunden). */
const zone = {}
let dnsStub = null

/**
 * Die Appwrite-Projects-API des POOL-Projekts — dieselbe Route, die
 * `ensureAppwriteWebPlatforms` benutzt. Der SDK bildet sie nicht ab.
 */
async function appwritePlatforms(method = 'GET') {
  const res = await fetch(`${endpoint}/projects/${poolProject}/platforms`, {
    method,
    headers: { 'X-Appwrite-Project': poolProject, 'X-Appwrite-Key': poolKey, 'Accept': 'application/json' },
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, platforms: json?.platforms ?? [] }
}

/** Die Gegenprobe aus CLAUDE.md: 403 = Origin unbekannt, 401 = akzeptiert. */
async function originAccepted(host) {
  const res = await fetch(`${endpoint}/account`, {
    headers: { 'Origin': `https://${host}`, 'X-Appwrite-Project': poolProject },
  })
  return res.status
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
function call(host, path, { method = 'GET', body, cookie, followRedirect = false } = {}) {
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
        catch { /* HTML-Antwort */ }
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
    void followRedirect
  })
}

async function createPoolUser(tag) {
  const email = `custom-domain-${tag}-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Probe ${tag}` })
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
  const code = `PUKA-DOMAIN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Eigene Domain', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht auch NEGATIV (30 s) — nach einer Änderung nachfassen. */
async function waitForHost(host, expected = 200) {
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === expected) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

async function createCommunity(cookie, slug, name, code) {
  const res = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name, slug,
      purpose: 'new', memberRange: 'to100', category: 'club', goal: 'discussion',
      description: 'Wegwerf-Community für den Beweis der eigenen Domain.',
      vibe: 'elegant', inviteCode: code, locale: 'de',
    },
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Community "${slug}" nicht angelegt (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', res.json.communityId), Query.limit(25)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: res.json.communityId, tenantId: res.json.tenantId, host: res.json.host }
}

async function setPlan(communityId, plan) {
  await control.updateRow({ databaseId, tableId: COMMUNITIES, rowId: communityId, data: { plan } })
}

async function readRow(communityId) {
  return await control.getRow({ databaseId, tableId: COMMUNITIES, rowId: communityId })
}

try {
  console.log(`\nEigene Domain: Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  // Der Stub läuft von Anfang an. Er besitzt NUR die Namen in `zone` und
  // reicht alles andere an einen echten Resolver weiter — die Abschnitte, die
  // gegen echte öffentliche Records messen (5), bleiben damit ehrlich.
  dnsStub = await startDnsStub({ zone, port: DNS_STUB_PORT })

  console.log('1. Aufbau: zwei Communities, zwei Owner')
  const code = await issueCode()
  const ownerA = await createPoolUser('owner-a')
  const ownerB = await createPoolUser('owner-b')
  const cookieA = await login(ownerA)
  const cookieB = await login(ownerB)
  const siteA = await createCommunity(cookieA, `domain-a-${stamp}`, 'Domain A', code)
  const siteB = await createCommunity(cookieB, `domain-b-${stamp}`, 'Domain B', code)
  check('Community A angelegt', !!siteA.communityId, JSON.stringify(siteA))
  check('Community B angelegt', !!siteB.communityId, JSON.stringify(siteB))
  check('Host A antwortet', !!(await waitForHost(siteA.host)), siteA.host)

  console.log('\n2. GEGENPROBE ZUERST: ohne Pro gibt es keine eigene Domain')
  // Der Wizard legt mit der Testphase an (Plan `pro`) — für diese Probe wird
  // die Community bewusst auf `personal` gesetzt. Sonst prüfte der Abschnitt
  // nichts.
  await setPlan(siteA.communityId, 'personal')
  await new Promise(resolve => setTimeout(resolve, 31_000)) // Resolver-Cache
  const denied = await call(siteA.host, '/api/community/domain', {
    method: 'PUT', cookie: cookieA, body: { domain: 'kunde-abgewiesen.example' },
  })
  check('Eintragen wird SERVER-seitig abgewiesen (403)', denied.status === 403,
    `Status ${denied.status} ${denied.text.slice(0, 200)}`)
  check('… mit dem fachlichen Grund `plan_required`', denied.json?.reason === 'plan_required',
    JSON.stringify(denied.json))
  const rowAfterDenied = await readRow(siteA.communityId)
  check('… und es wurde NICHTS geschrieben', !rowAfterDenied.customDomain,
    `customDomain=${rowAfterDenied.customDomain}`)

  console.log('\n3. Mit Pro: die Eingabe-Prüfung (Gegenproben)')
  await setPlan(siteA.communityId, 'pro')
  await new Promise(resolve => setTimeout(resolve, 31_000))

  // DIE WICHTIGSTE ABLEHNUNG: eine Adresse unter der Betreiber-Domain würde
  // RESERVED_SUBDOMAINS umgehen — `login.pukalani.app` in Kundenhand wäre eine
  // Anmeldedaten-Falle mit unserem Namen und gültigem Zertifikat.
  for (const [host, reason] of [
    ['login.pukalani.app', 'domain_operator_domain'],
    ['pukalani.app', 'domain_operator_domain'],
    ['localhost', 'domain_not_a_domain'],
    ['bücher.de', 'domain_invalid'],
  ]) {
    const res = await call(siteA.host, '/api/community/domain', {
      method: 'PUT', cookie: cookieA, body: { domain: host },
    })
    check(`"${host}" wird abgelehnt (${reason})`,
      res.status === 400 && res.json?.reason === reason,
      `Status ${res.status} ${JSON.stringify(res.json)}`)
  }

  console.log('\n4. Eintragen — und das EHRLICHE Steckenbleiben ohne DNS')
  const set = await call(siteA.host, '/api/community/domain', {
    method: 'PUT', cookie: cookieA, body: { domain: OWN_DOMAIN },
  })
  check('Domain eingetragen', set.status === 200 && set.json?.domain === OWN_DOMAIN,
    `Status ${set.status} ${set.text.slice(0, 200)}`)
  check('… Status ist `pending_dns`, nicht „aktiv"', set.json?.status === 'pending_dns', set.json?.status)
  check('… beide Formen sind bekannt, die eingetragene zuerst',
    JSON.stringify(set.json?.forms) === JSON.stringify([OWN_DOMAIN, OWN_SIBLING]),
    JSON.stringify(set.json?.forms))
  check('… die Anleitung nennt den TXT-Record an der Basis',
    set.json?.instructions?.txtName === `_pukalani-verify.${OWN_DOMAIN}`,
    set.json?.instructions?.txtName)

  const rowA = await readRow(siteA.communityId)
  check('… ein Token wurde erzeugt und liegt in DIESER Zeile',
    /^[a-f0-9]{32}$/.test(rowA.customDomainToken ?? ''), rowA.customDomainToken)
  check('… der TXT-Wert der Anleitung trägt genau dieses Token',
    set.json?.instructions?.txtValue === `pukalani-domain-verify=${rowA.customDomainToken}`,
    set.json?.instructions?.txtValue)

  // ECHTE DNS-Abfrage gegen eine Domain, für die es NIE einen Record geben
  // wird. Kein Mock: hier fragt der Server wirklich Cloudflare/Google.
  const verifyMissing = await call(siteA.host, '/api/community/domain/verify', { method: 'POST', cookie: cookieA })
  check('Prüfen ohne DNS bleibt bei `pending_dns`',
    verifyMissing.status === 200 && verifyMissing.json?.status === 'pending_dns',
    `Status ${verifyMissing.status} ${JSON.stringify(verifyMissing.json?.status)}`)
  check('… und sagt WAS fehlt (der TXT-Eintrag)',
    (verifyMissing.json?.error ?? '').includes('_pukalani-verify.'), verifyMissing.json?.error)

  console.log('\n5. DIE DNS-PRÜFUNG GEGEN ECHTE ÖFFENTLICHE RECORDS (beide Richtungen)')
  // Positiv: ein Name, der WIRKLICH auf unsere Server-IP zeigt. Die
  // Zeige-Prüfung muss ihn erkennen — sonst wäre der Fehlpfad oben nur ein
  // Beweis dafür, dass die Abfrage gar nichts findet.
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { customDomain: REAL_POINTING, customDomainStatus: 'pending_dns' },
  })
  const verifyReal = await call(siteA.host, '/api/community/domain/verify', { method: 'POST', cookie: cookieA })
  check('ein Name, der wirklich auf uns zeigt, scheitert NUR am Eigentums-Nachweis',
    verifyReal.json?.status === 'pending_dns'
    && (verifyReal.json?.error ?? '').includes('_pukalani-verify.')
    && !(verifyReal.json?.error ?? '').includes('zeigt noch nicht auf uns'),
    JSON.stringify(verifyReal.json?.error))
  // Negativ: eine Domain, die es nicht gibt — dort muss die ZEIGE-Prüfung
  // greifen (nicht nur der Nachweis).
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { customDomain: REAL_MISSING, customDomainStatus: 'pending_dns' },
  })
  const verifyGone = await call(siteA.host, '/api/community/domain/verify', { method: 'POST', cookie: cookieA })
  check('eine Domain, die es nie geben wird, bleibt bei `pending_dns`',
    verifyGone.json?.status === 'pending_dns', JSON.stringify(verifyGone.json?.status))

  console.log('\n6. Eindeutigkeit: eine FREMDE Community kann die Domain nicht nehmen')
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { customDomain: OWN_DOMAIN, customDomainStatus: 'pending_dns' },
  })
  await setPlan(siteB.communityId, 'pro')
  check('Host B antwortet', !!(await waitForHost(siteB.host)), siteB.host)
  await new Promise(resolve => setTimeout(resolve, 31_000))
  const stealSame = await call(siteB.host, '/api/community/domain', {
    method: 'PUT', cookie: cookieB, body: { domain: OWN_DOMAIN },
  })
  check('dieselbe Form wird abgewiesen (409 domain_taken)',
    stealSame.status === 409 && stealSame.json?.reason === 'domain_taken',
    `Status ${stealSame.status} ${JSON.stringify(stealSame.json)}`)
  // UND das PAAR: `www.<domain>` löst auf dieselbe Zeile auf und darf deshalb
  // ebenfalls nicht vergeben werden — ein Unique-Index auf einer Spalte hätte
  // genau das nie gesehen.
  const stealSibling = await call(siteB.host, '/api/community/domain', {
    method: 'PUT', cookie: cookieB, body: { domain: OWN_SIBLING },
  })
  check('auch die www-Geschwister-Form wird abgewiesen',
    stealSibling.status === 409 && stealSibling.json?.reason === 'domain_taken',
    `Status ${stealSibling.status} ${JSON.stringify(stealSibling.json)}`)

  console.log('\n7. Der Resolver: die aktive eigene Domain bedient die Community')
  // ABKÜRZUNG MIT ANSAGE (s. Kopf): `active` ist hier die EINGABE des
  // Resolvers. Der Weg dorthin ist in 2–5 gemessen.
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { customDomainStatus: 'active', customDomainActivatedAt: new Date().toISOString() },
  })
  await new Promise(resolve => setTimeout(resolve, 31_000))

  const onOwn = await call(OWN_DOMAIN, '/api/themes')
  check('die eigene Domain antwortet 200 — KEINE Schleife auf der kanonischen Form',
    onOwn.status === 200, `Status ${onOwn.status} ${onOwn.text.slice(0, 120)}`)

  console.log('\n8. Die Umleitungen (Davids Entscheidung 2 + 4)')
  const fromSub = await call(siteA.host, '/dashboard/settings/domain?x=1')
  check('die Subdomain leitet dauerhaft auf die eigene Domain um (301)',
    fromSub.status === 301, `Status ${fromSub.status}`)
  check('… mit Pfad UND Query',
    fromSub.location === `https://${OWN_DOMAIN}/dashboard/settings/domain?x=1`, fromSub.location)
  check('… und mit `Cache-Control: no-store`, damit die Subdomain Rückfall bleibt',
    fromSub.cacheControl.includes('no-store'), fromSub.cacheControl)

  const fromWww = await call(OWN_SIBLING, '/')
  check('die www-Form leitet auf die eingetragene Form um',
    fromWww.status === 301 && fromWww.location === `https://${OWN_DOMAIN}/`,
    `Status ${fromWww.status} ${fromWww.location}`)

  // 308 STATT 301 FÜR SCHREIBENDE METHODEN: ein 301 ließe den Browser die
  // Methode auf GET wechseln, ein Formular-POST verlöre still seinen Rumpf.
  const postSub = await call(siteA.host, '/api/auth/me', { method: 'POST' })
  check('ein POST bekommt 308 und behält damit seine Methode',
    postSub.status === 308, `Status ${postSub.status}`)

  console.log('\n9. Die Sperren gelten auf ALLEN Hosts der Community (M13)')
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { suspension: 'abuse', suspensionReason: 'Beweis' },
  })
  await new Promise(resolve => setTimeout(resolve, 31_000))
  const abuseOwn = await call(OWN_DOMAIN, '/api/themes')
  const abuseSub = await call(siteA.host, '/api/themes')
  check('die eigene Domain antwortet 404 wie ein unbekannter Host',
    abuseOwn.status === 404, `Status ${abuseOwn.status}`)
  check('… und die Subdomain leitet NICHT dorthin um, sondern 404et ebenfalls',
    abuseSub.status === 404, `Status ${abuseSub.status} ${abuseSub.location}`)
  await control.updateRow({
    databaseId, tableId: COMMUNITIES, rowId: siteA.communityId,
    data: { suspension: '', suspensionReason: '' },
  })

  console.log('\n10. Die Verwaltung zieht MIT — auch die API-Routen')
  await new Promise(resolve => setTimeout(resolve, 31_000))
  /**
   * BEIM ERSTEN LAUF ROT GEWESEN, und zwar zu Recht: der Beweis wollte die
   * Domain über die SUBDOMAIN wieder abgeben und bekam ein 308 auf die eigene
   * Domain. Das ist kein Fehler, sondern die Folge von Davids Entscheidung 2 —
   * es gibt EINE kanonische Adresse, und dort liegt ab jetzt auch das
   * Dashboard. Der Beweis hält das seither ausdrücklich fest, statt es
   * wegzukorrigieren.
   *
   * FOLGE FÜR ECHTE BROWSER (im Runbook als Häkchen, hier als Tatsache): das
   * Session-Cookie ist an den HOST gebunden. Wer auf der Subdomain angemeldet
   * war, ist auf der eigenen Domain zunächst abgemeldet und muss sich dort neu
   * anmelden. Das ist Cookie-Recht und nichts, was man wegprogrammieren
   * sollte — man muss es nur sagen.
   */
  const manageOnSub = await call(siteA.host, '/api/community/domain', { method: 'DELETE', cookie: cookieA })
  check('auch eine API-Route der Subdomain zeigt auf die kanonische Adresse (308)',
    manageOnSub.status === 308 && manageOnSub.location === `https://${OWN_DOMAIN}/api/community/domain`,
    `Status ${manageOnSub.status} → ${manageOnSub.location}`)

  console.log('\n11. Abgeben: die Community ist wieder auf ihrer Subdomain zu Hause')
  const removed = await call(OWN_DOMAIN, '/api/community/domain', { method: 'DELETE', cookie: cookieA })
  check('Domain entfernt', removed.status === 200 && removed.json?.status === 'none',
    `Status ${removed.status} ${removed.text.slice(0, 200)}`)
  await new Promise(resolve => setTimeout(resolve, 31_000))
  const subAgain = await call(siteA.host, '/api/themes')
  check('die Subdomain antwortet wieder selbst (kein 301 mehr)',
    subAgain.status === 200, `Status ${subAgain.status} → ${subAgain.location}`)
  const ownGone = await call(OWN_DOMAIN, '/api/themes')
  check('die abgegebene Domain ist ein unbekannter Host (404)',
    ownGone.status === 404, `Status ${ownGone.status}`)

  console.log('\n12. DIE VOLLE KETTE bis `active` — inkl. Appwrite-Web-Platform (F45)')
  /**
   * Hier läuft der Ablauf zum ersten Mal GANZ durch, weil die DNS-Einträge
   * wirklich beantwortet werden (lib/dnsStub.mjs — Ersatz für die ZONE, nicht
   * für die Prüfung). Was der Trockenlauf überspringt und was deshalb erst
   * beim ersten echten Kunden bewiesen wird: ploi und Let's Encrypt.
   */
  const setFull = await call(siteA.host, '/api/community/domain', {
    method: 'PUT', cookie: cookieA, body: { domain: FULL_DOMAIN },
  })
  check('Domain der vollen Kette eingetragen',
    setFull.status === 200 && setFull.json?.status === 'pending_dns',
    `Status ${setFull.status} ${setFull.text.slice(0, 200)}`)

  const rowFull = await readRow(siteA.communityId)
  // GENAU DAS TOKEN DIESER COMMUNITY in die Zone legen — nicht irgendeines.
  zone[`_pukalani-verify.${FULL_DOMAIN}`] = { txt: [`pukalani-domain-verify=${rowFull.customDomainToken}`] }
  zone[FULL_DOMAIN] = { a: [SERVER_IP] }
  zone[FULL_SIBLING] = { a: [SERVER_IP] }

  const platformsBefore = await appwritePlatforms()
  check('vor der Freischaltung kennt Appwrite die Domain NICHT',
    !platformsBefore.platforms.some(p => p.hostname === FULL_DOMAIN),
    `Status ${platformsBefore.status}`)
  check('… und lehnt ihren Origin ab (403 general_unknown_origin)',
    await originAccepted(FULL_DOMAIN) === 403)

  const verifyFull = await call(siteA.host, '/api/community/domain/verify', { method: 'POST', cookie: cookieA })
  check('Prüfen führt bis `active`',
    verifyFull.status === 200 && verifyFull.json?.status === 'active',
    `Status ${verifyFull.status} ${JSON.stringify(verifyFull.json?.status)} ${verifyFull.json?.error ?? ''}`)
  check('… und hält den Zeitpunkt fest', !!verifyFull.json?.activatedAt, verifyFull.json?.activatedAt)

  const platformsAfter = await appwritePlatforms()
  for (const host of [FULL_DOMAIN, FULL_SIBLING]) {
    const entry = platformsAfter.platforms.find(p => p.hostname === host)
    if (entry) cleanup.platforms.push(entry.$id)
    check(`Appwrite kennt jetzt ${host} als Web-Platform`, !!entry)
  }
  // DIE MESSUNG, DIE ZÄHLT (F45): der Handschlag verrät nichts, die Ablehnung
  // steckt in der ersten Nachricht IM Socket. Billiger Test aus CLAUDE.md —
  // 403 = unbekannt, 401 = akzeptiert.
  check('… und akzeptiert ihren Origin (401 statt 403)',
    await originAccepted(FULL_DOMAIN) === 401)
  check('… GEGENPROBE: ein nie registrierter Host bleibt abgewiesen (403)',
    await originAccepted(`nie-registriert-${stamp}.example`) === 403)

  await new Promise(resolve => setTimeout(resolve, 31_000))
  const fullLive = await call(FULL_DOMAIN, '/api/themes')
  check('die freigeschaltete Domain bedient die Community (200)',
    fullLive.status === 200, `Status ${fullLive.status}`)

  const removeFull = await call(FULL_DOMAIN, '/api/community/domain', { method: 'DELETE', cookie: cookieA })
  check('Abgeben räumt auch die Appwrite-Einträge ab',
    removeFull.status === 200
    && !(await appwritePlatforms()).platforms.some(p => p.hostname === FULL_DOMAIN || p.hostname === FULL_SIBLING),
    `Status ${removeFull.status}`)
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\nAufräumen …')
  dnsStub?.close()
  // Falls der Lauf mitten in Abschnitt 12 abbrach: die Web-Platforms hängen
  // sonst im Pool-Projekt fest und lassen fremde Origins zu.
  for (const id of cleanup.platforms) {
    await fetch(`${endpoint}/projects/${poolProject}/platforms/${id}`, {
      method: 'DELETE',
      headers: { 'X-Appwrite-Project': poolProject, 'X-Appwrite-Key': poolKey },
    }).catch(() => {})
  }
  for (const id of cleanup.members) {
    await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.tenants) {
    await control.deleteRow({ databaseId, tableId: COMMUNITIES, rowId: id }).catch(() => {})
  }
  for (const id of cleanup.codes) {
    await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await poolUsers.delete({ userId: id }).catch(() => {})
  }
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden.\n`)
  process.exit(fail === 0 ? 0 : 1)
}

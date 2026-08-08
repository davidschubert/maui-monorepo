/**
 * Beweis: der LETZTE Schritt einer Silo-Freischaltung (F54-1, 2026-08-08).
 *
 * ── WAS HIER GEMESSEN WIRD UND WARUM ES EIN EIGENES SKRIPT IST ────────────
 * `verify-silo-domain.mjs` (35/35) beweist den Weg des CONTROL PLANE bis
 * `pending_platform`. Der letzte Schritt gehört der SILO-APP, und genau er
 * ist beim ersten echten Durchlauf durchgefallen — an einer Stelle, die lokal
 * grün war: `POST /v1/projects/:id/platforms` verlangt einen Scope, den die
 * Produktions-Keys nicht haben (`401 general_unauthorized_scope`); der lokale
 * Dev-Key hatte ALLE Scopes.
 *
 * Gemessen wird deshalb hier, gegen eine ECHTE Appwrite-Instanz und eine
 * ECHTE Silo-App:
 *
 *   · die Naht-Grenze von `settle` (ohne Secret 401, mit falschem 401)
 *   · die Zustands-Grenze (nur `pending_platform`, sonst 409)
 *   · DER PORTFOLIO-FALL: der Hostname steht als Web-Platform, die
 *     REGISTRIERUNG scheitert am Schlüssel — und trotzdem `ok: true`, weil
 *     die schlüssellose Origin-Probe ihn akzeptiert findet
 *   · die Gegenprobe im selben Lauf: ein Host, den Appwrite NICHT kennt,
 *     bleibt `ok: false` — mit dem Handgriff in der Meldung
 *   · ein einziger unbekannter Host unter mehreren blockiert
 *
 * ── DER SCHLÜSSEL DER APP IST ABSICHTLICH KAPUTT ──────────────────────────
 * Das ist die ganze Pointe. Nur mit einem Schlüssel, der die Projects-API
 * NICHT darf, misst dieser Beweis den Produktionsfall statt der lokalen
 * Idealwelt. Ginge die Registrierung durch, würde jeder Host beim ersten
 * Aufruf angelegt und die Probe hätte nichts mehr zu sagen.
 *
 * ── SO WIRD ER GEFAHREN ───────────────────────────────────────────────────
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3028 \
 *     NUXT_ONBOARDING_SERVICE_SECRET=<secret> \
 *     NUXT_APPWRITE_KEY=scope-less-key-for-proof \
 *     pnpm --filter comments exec nuxi dev --port 3026
 *
 *   SETTLE_SECRET=<derselbe secret> node --env-file=apps/comments/.env \
 *     packages/domains/scripts/verify-domain-settle.mjs
 *
 * Das Control Plane wird BEWUSST durch ein Doppel ersetzt (Port 3028): sein
 * eigener Weg ist schon bewiesen, und ein zweiter Nuxt-Dev-Server derselben
 * App würde die Sitzung eines Nachbarn stören (`.nuxt` ist geteilt).
 */
import { createServer } from 'node:http'

const APP = process.env.SETTLE_APP_URL || 'http://localhost:3026'
const FAKE_CONTROL_PORT = Number(process.env.FAKE_CONTROL_PORT || 3028)
const SECRET = process.env.SETTLE_SECRET || ''
const endpoint = (process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT || '').replace(/\/+$/, '')
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID || ''
/** Der GUTE Schlüssel — er spielt hier den Menschen in der Appwrite-Konsole. */
const consoleKey = process.env.NUXT_APPWRITE_KEY || ''

if (!SECRET || !endpoint || !projectId || !consoleKey) {
  console.error('✗ Env unvollständig — mit SETTLE_SECRET=… und --env-file=apps/comments/.env fahren.')
  process.exit(1)
}

const stamp = Date.now().toString(36)
/** Der Host, der als Web-Platform steht (wie beim Portfolio: von Hand angelegt). */
const HOST_OK = `settle-ok-${stamp}.localhost`
/** Der Host, den Appwrite nie gesehen hat. */
const HOST_MISSING = `settle-missing-${stamp}.localhost`

let pass = 0
let fail = 0
const created = []

function ok(label, condition, detail = '') {
  if (condition) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

/* ── Appwrite-Projects-API mit dem guten Schlüssel (die „Konsole") ───────── */

async function projectsApi(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    method: init.method || 'GET',
    headers: {
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': consoleKey,
      'Accept': 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  }
  catch {
    data = null
  }
  return { status: response.status, data }
}

async function listPlatformHostnames() {
  const result = await projectsApi(`/projects/${encodeURIComponent(projectId)}/platforms`)
  const list = Array.isArray(result.data?.platforms) ? result.data.platforms : []
  return list.filter(entry => entry.type === 'web')
}

/** Die schlüssellose Probe — genau so, wie der Code sie stellt. */
async function probeOrigin(host) {
  const response = await fetch(`${endpoint}/account`, {
    method: 'GET',
    headers: { 'Origin': `https://${host}`, 'X-Appwrite-Project': projectId, 'Accept': 'application/json' },
    redirect: 'manual',
  })
  const text = await response.text()
  let type = ''
  try {
    type = JSON.parse(text)?.type || ''
  }
  catch { /* egal */ }
  return { status: response.status, type }
}

/* ── Das Control-Plane-Doppel ────────────────────────────────────────────── */

const address = {
  canonicalHost: HOST_OK,
  fallbackHost: 'comments.pukalani.app',
  knownHosts: ['comments.pukalani.app', HOST_OK],
  domain: HOST_OK,
  status: 'pending_platform',
  forms: [HOST_OK],
}
let controlCalls = 0

const fakeControl = createServer((req, res) => {
  controlCalls++
  let body = ''
  req.on('data', chunk => (body += chunk))
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/control/site/domain/host') {
      res.statusCode = 200
      res.end(JSON.stringify(address))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ ok: false }))
  })
})

/* ── Die Silo-App rufen ──────────────────────────────────────────────────── */

async function callSettle(secret) {
  const response = await fetch(`${APP}/api/site/domain/settle`, {
    method: 'POST',
    headers: secret === null ? {} : { 'x-pukalani-onboarding-secret': secret },
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  }
  catch {
    data = null
  }
  return { status: response.status, data }
}

async function main() {
  await new Promise(resolve => fakeControl.listen(FAKE_CONTROL_PORT, resolve))

  /**
   * Lebendigkeit an der Route SELBST, nicht an `/api/health`: die fragt
   * Appwrite mit dem Schlüssel der App — und der ist hier absichtlich kaputt,
   * also antwortet sie 500. Das ist kein Fehler des Beweises, sondern seine
   * Vorbedingung. Ein 401 von `settle` beweist genau das Richtige: der Server
   * läuft und die Naht ist konfiguriert.
   */
  const alive = await callSettle(null).then(r => r.status).catch(() => 0)
  if (alive !== 401) {
    console.error(`✗ Silo-App auf ${APP} antwortet nicht wie erwartet (${alive}). Läuft der Dev-Server mit gesetztem Secret?`)
    process.exit(1)
  }

  section('1 · Grundwahrheit: was Appwrite ohne Schlüssel über einen Origin sagt')
  const before = await listPlatformHostnames()
  ok('HOST_OK ist noch nicht eingetragen', !before.some(p => p.hostname === HOST_OK))

  const createdPlatform = await projectsApi(`/projects/${encodeURIComponent(projectId)}/platforms`, {
    method: 'POST',
    body: { platformId: 'unique()', type: 'web', name: `Beweis ${HOST_OK}`, hostname: HOST_OK },
  })
  ok('die „Konsole" kann die Web-Platform anlegen (guter Schlüssel)', createdPlatform.status === 201,
    `HTTP ${createdPlatform.status}`)
  if (createdPlatform.data?.$id) created.push(createdPlatform.data.$id)

  const probeOk = await probeOrigin(HOST_OK)
  ok('eingetragener Host ⇒ 401 (Origin akzeptiert)', probeOk.status === 401,
    `HTTP ${probeOk.status} ${probeOk.type}`)
  const probeMissing = await probeOrigin(HOST_MISSING)
  ok('unbekannter Host ⇒ 403 general_unknown_origin', probeMissing.status === 403 && probeMissing.type === 'general_unknown_origin',
    `HTTP ${probeMissing.status} ${probeMissing.type}`)

  section('2 · Die Naht-Grenze von settle')
  const noSecret = await callSettle(null)
  ok('ohne Secret: 401', noSecret.status === 401, `HTTP ${noSecret.status}`)
  const wrongSecret = await callSettle('falsch-und-lang-genug-fuer-den-vergleich')
  ok('mit falschem Secret: 401', wrongSecret.status === 401, `HTTP ${wrongSecret.status}`)

  section('3 · Die Zustands-Grenze (nur pending_platform)')
  address.status = 'pending_dns'
  const wrongState = await callSettle(SECRET)
  ok('anderer Zustand: 409 domain_not_ready',
    wrongState.status === 409 && (wrongState.data?.reason === 'domain_not_ready' || wrongState.data?.code === 'domain_not_ready'),
    `HTTP ${wrongState.status} ${JSON.stringify(wrongState.data)}`)
  address.status = 'pending_platform'
  const callsBefore = controlCalls
  await callSettle(SECRET)
  ok('die Hostnamen kommen vom Control Plane, nicht aus dem Rumpf', controlCalls > callsBefore)

  section('4 · DER PORTFOLIO-FALL: Registrierung scheitert, Probe trägt')
  address.forms = [HOST_OK]
  const settled = await callSettle(SECRET)
  ok('HTTP 200', settled.status === 200, `HTTP ${settled.status}`)
  ok('ok: true — obwohl der Schlüssel die Projects-API nicht darf',
    settled.data?.ok === true, JSON.stringify(settled.data))
  ok('added ist leer — es wurde wirklich nichts eingetragen',
    Array.isArray(settled.data?.added) && settled.data.added.length === 0, JSON.stringify(settled.data?.added))

  const afterOk = await listPlatformHostnames()
  ok('keine zweite Zeile für HOST_OK entstanden (die App konnte nicht schreiben)',
    afterOk.filter(p => p.hostname === HOST_OK).length === 1)

  section('5 · Gegenprobe im selben Lauf: unbekannter Host bleibt liegen')
  address.forms = [HOST_MISSING]
  address.domain = HOST_MISSING
  const missing = await callSettle(SECRET)
  ok('ok: false', missing.data?.ok === false, JSON.stringify(missing.data))
  ok('die Meldung nennt den Host', String(missing.data?.message || '').includes(HOST_MISSING))
  ok('die Meldung nennt den Handgriff in der Konsole',
    String(missing.data?.message || '').includes('Settings → Platforms'))
  ok('die Meldung nennt den Grund des Fehlschlags beim Eintragen',
    /Appwrite \d{3}/.test(String(missing.data?.message || '')), String(missing.data?.message || ''))

  const afterMissing = await listPlatformHostnames()
  ok('HOST_MISSING wurde NICHT angelegt — die Registrierung ist wirklich tot',
    !afterMissing.some(p => p.hostname === HOST_MISSING))

  section('6 · Ein einziger unbekannter Host unter mehreren blockiert')
  address.forms = [HOST_OK, HOST_MISSING]
  const mixed = await callSettle(SECRET)
  ok('ok: false, sobald eine Form fehlt', mixed.data?.ok === false, JSON.stringify(mixed.data))
  ok('die Meldung nennt genau die fehlende Form',
    String(mixed.data?.message || '').includes(HOST_MISSING)
    && !String(mixed.data?.message || '').includes(`${HOST_OK} `),
    String(mixed.data?.message || ''))
}

try {
  await main()
}
catch (error) {
  fail++
  console.log(`\n✘ Abbruch: ${error?.message || error}`)
}
finally {
  for (const id of created) {
    await projectsApi(`/projects/${encodeURIComponent(projectId)}/platforms/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch(() => null)
  }
  fakeControl.closeAllConnections()
  await new Promise(resolve => fakeControl.close(resolve))
}

console.log(`\n${pass}/${pass + fail} bestanden.`)
process.exit(fail ? 1 : 0)

/**
 * Beweis für O3 — die Trennung der zwei Welten DESSELBEN Deployments.
 *
 * Prüft per Host-Header gegen den laufenden Platform-Server:
 *  - der Kontroll-Host lebt (kein 404 wie ein unbekannter Host),
 *  - dort antworten NUR die erlaubten API-Pfade (Datentrennung: ohne Mandanten
 *    würde scopeQuery nicht scopen),
 *  - ein Community-Host kennt den Trichter nicht,
 *  - ein unbekannter Host bekommt weiterhin 404.
 *
 * Aufruf (Platform-Dev-Server muss laufen):
 *   node packages/onboarding/scripts/verify-control-host.mjs
 */
/**
 * WICHTIG (Falle, die zwei Fehlmessungen gekostet hat): `fetch` (undici)
 * IGNORIERT einen selbst gesetzten `Host`-Header — er gehört zu den verbotenen
 * Headern. Damit kommt jede Anfrage als `localhost` an, und die Tenant-
 * Middleware antwortet völlig korrekt mit 404 „Unknown host" — der Test hätte
 * also einen Fehler gemeldet, den es nicht gibt. `*.localhost` löst in Node
 * ausserdem nicht auf (ENOTFOUND), anders als im Browser. Deshalb node:http,
 * das den Header durchreicht.
 *
 * ZWEITE Falle (dieselbe Suche, andere Ursache): der Nuxt-Dev-Server hört auf
 * `[::1]:3006` (Nitro), während Vites HMR-Server `0.0.0.0:3006` belegt — wer
 * über 127.0.0.1 anfragt, landet beim WebSocket-Server und bekommt auf JEDEN
 * HTTP-Request 426 „Upgrade Required". Deshalb wird hier bewusst über die
 * IPv6-Loopback `::1` verbunden.
 */
import { request } from 'node:http'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const BASE = `http://localhost:${PORT}`
let pass = 0
let fail = 0

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

function get(host, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '::1', port: PORT, path, method: 'GET', headers: { host } }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

console.log(`\nO3-Beweis gegen ${BASE}\n`)

console.log('1. Kontroll-Host app.localhost')
const start = await get('app.localhost', '/start')
check('/start erreichbar (kein 404)', start.status !== 404, `Status ${start.status}`)
check('/start schickt Gäste zum Login', /\/login/.test(start.body) || /\/login/.test(start.location || ''), `Status ${start.status}`)
const health = await get('app.localhost', '/api/health')
check('/api/health → 200', health.status === 200, `Status ${health.status}`)
for (const path of ['/api/comments?targetType=page&targetId=home', '/api/pages/public/home', '/api/stats', '/api/themes']) {
  const res = await get('app.localhost', path)
  check(`${path} → 404 (kein Mandanten-Datenpfad im Kundenbereich)`, res.status === 404, `Status ${res.status}`)
}
const me = await get('app.localhost', '/api/auth/me')
check('/api/auth/me erlaubt (401 ohne Session, nicht 404)', me.status === 401, `Status ${me.status}`)

console.log('\n2. Community-Host kunde-a.localhost')
const tenantComments = await get('kunde-a.localhost', '/api/comments?targetType=page&targetId=home')
check('/api/comments auf Community-Host erlaubt', tenantComments.status === 200, `Status ${tenantComments.status}`)
const funnelOnTenant = await get('kunde-a.localhost', '/start')
check('/start auf Community-Host → 404', funnelOnTenant.status === 404, `Status ${funnelOnTenant.status}`)

console.log('\n3. Unbekannter Host')
const unknown = await get('fremd.localhost', '/')
check('unbekannter Host → 404', unknown.status === 404, `Status ${unknown.status}`)
const unknownApi = await get('fremd.localhost', '/api/comments?targetType=page&targetId=home')
check('unbekannter Host, API → 404', unknownApi.status === 404, `Status ${unknownApi.status}`)

console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
process.exit(fail === 0 ? 0 : 1)

/**
 * S0-Abnahmetests (gegen laufenden Spike-Server, Default :3050).
 * Deckt die verbindlichen Gate-Kriterien in Miniatur ab:
 *  T1  Host alpha → Projekt alpha; Host beta → Projekt beta
 *  T2  unbekannter Host → 404 (keine Default-Site)
 *  T3  Site-Kontext enthält KEINEN Runtime-Key
 *  T4  Login pro Site → httpOnly-Cookie mit projekt-eigenem Namen
 *  T5  Session von Site A ist auf Site B WERTLOS (Cross-Site-Isolation)
 *  T6  /api/me ohne Session → 401 (anonym bleibt anonym)
 *  T7  Realtime-JWT von Site A authentifiziert NICHT gegen Projekt B
 */
const BASE = process.env.SPIKE_URL ?? 'http://127.0.0.1:3050'
const PASSWORD = 'S0-Demo-Passw0rd!'
const SITES = {
  alpha: { host: 'alpha.localhost', email: 'anna@alpha.local', projectId: 's0-site-alpha' },
  beta: { host: 'beta.localhost', email: 'ben@beta.local', projectId: 's0-site-beta' },
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}

// node:http statt fetch — undici VERBIETET einen eigenen Host-Header.
import { request as httpRequest } from 'node:http'
const base = new URL(BASE)

function req(host, path, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const r = httpRequest({
      host: base.hostname,
      port: base.port,
      path,
      method: opts.method ?? 'GET',
      headers: { Host: host, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let json = {}
        try { json = JSON.parse(data) } catch {}
        resolvePromise({
          status: res.statusCode,
          json,
          headers: { getSetCookie: () => res.headers['set-cookie'] ?? [] },
        })
      })
    })
    r.on('error', reject)
    if (opts.body) r.write(opts.body)
    r.end()
  })
}

// T1 — Host-Auflösung
{
  const a = await req(SITES.alpha.host, '/api/site')
  const b = await req(SITES.beta.host, '/api/site')
  check('T1a Host alpha → s0-site-alpha', a.json?.site?.projectId === SITES.alpha.projectId, JSON.stringify(a.json))
  check('T1b Host beta → s0-site-beta', b.json?.site?.projectId === SITES.beta.projectId, JSON.stringify(b.json))
}

// T2 — unbekannter Host: 404, nie Default
{
  const r = await req('evil.example.com', '/api/site')
  check('T2 unbekannter Host → 404', r.status === 404, `status=${r.status}`)
}

// T3 — kein Key im Request-Kontext: exakt die drei öffentlichen Felder,
// kein Wert, der wie ein Secret aussieht (Appwrite-Keys sind lange Hex-Strings)
{
  const r = await req(SITES.alpha.host, '/api/site')
  const keys = (r.json?.contextKeys ?? []).sort().join(',')
  const values = Object.values(r.json?.site ?? {})
  const noSecretValues = values.every((v) => typeof v !== 'string' || v.length < 60)
  check('T3 Kontext ohne Runtime-Key', keys === 'endpoint,projectId,siteId' && noSecretValues,
    `keys=${keys}`)
}

// T4 — Login je Site, Cookie-Name projekt-eigen
const cookies = {}
for (const [id, site] of Object.entries(SITES)) {
  const r = await req(site.host, '/api/login', {
    method: 'POST', body: JSON.stringify({ email: site.email, password: PASSWORD }),
  })
  const setCookie = r.headers.getSetCookie?.().join('; ') ?? ''
  cookies[id] = setCookie.split(';')[0]
  check(`T4 Login ${id} → Cookie a_session_${site.projectId}`,
    r.status === 200 && setCookie.includes(`a_session_${site.projectId}=`) && setCookie.toLowerCase().includes('httponly'),
    `status=${r.status} cookie=${setCookie.slice(0, 60)}`)
}

// T5 — Cross-Site-Isolation: Alpha-Session auf Beta nutzlos
{
  const own = await req(SITES.alpha.host, '/api/me', { headers: { Cookie: cookies.alpha } })
  check('T5a Alpha-Session auf Alpha → 200', own.status === 200 && own.json.project === SITES.alpha.projectId, `status=${own.status}`)

  // gleicher Cookie-WERT unter Betas Cookie-NAMEN eingeschleust → muss scheitern
  const alphaSecret = cookies.alpha.split('=').slice(1).join('=')
  const forged = `a_session_${SITES.beta.projectId}=${alphaSecret}`
  const cross = await req(SITES.beta.host, '/api/me', { headers: { Cookie: forged } })
  check('T5b Alpha-Session-Secret auf Beta → 401', cross.status === 401, `status=${cross.status} ${JSON.stringify(cross.json)}`)
}

// T6 — anonym bleibt anonym
{
  const r = await req(SITES.beta.host, '/api/me')
  check('T6 /api/me ohne Session → 401', r.status === 401, `status=${r.status}`)
}

// T7 — JWT ist projektgebunden
{
  const t = await req(SITES.alpha.host, '/api/realtime-token', { headers: { Cookie: cookies.alpha } })
  check('T7a Realtime-JWT für Alpha ausgestellt', t.status === 200 && !!t.json.jwt, `status=${t.status}`)

  const register = (await req(SITES.alpha.host, '/api/site')).json.site
  const endpoint = register.endpoint
  const direct = async (projectId) => {
    const res = await fetch(`${endpoint}/account`, {
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': t.json.jwt },
    })
    return res.status
  }
  check('T7b JWT gegen Projekt alpha → 200', (await direct(SITES.alpha.projectId)) === 200)
  check('T7c JWT gegen Projekt beta → 401', (await direct(SITES.beta.projectId)) === 401)
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`)
process.exit(failed ? 1 : 0)

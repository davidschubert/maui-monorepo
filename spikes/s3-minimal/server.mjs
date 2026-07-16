/**
 * Minimal-S3 (Gate G2): EIN Prozess bedient zwei Sites (alpha.localhost /
 * beta.localhost) gegen ZWEI Appwrite-Projekte auf der Haupt-Instanz —
 * Browser-PoC für Auth (Cookies host-scoped, parallel eingeloggt) und
 * projektgebundene JWT-Realtime (Event-Isolation). Wegwerf-Code.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createApp, createRouter, defineEventHandler, toNodeListener,
  getHeader, readBody, setCookie, getCookie, createError, setResponseHeader,
} from 'h3'
import { Client, Account, TablesDB, ID, Permission, Role } from 'node-appwrite'

const here = dirname(fileURLToPath(import.meta.url))
const register = JSON.parse(readFileSync(join(here, 'sites-register.json'), 'utf8'))
const secrets = JSON.parse(readFileSync(join(here, 'sites-secrets.json'), 'utf8'))
const SDK_IIFE = readFileSync(join(here, '../../node_modules/.pnpm/appwrite@26.1.0/node_modules/appwrite/dist/iife/sdk.js'))

const sites = new Map(Object.entries(register).map(([h, s]) => [h.toLowerCase(), Object.freeze({ ...s })]))

// ── Verträge (S0-Form): Resolver ohne Default, Factories mit event ─────────
function resolveSite(rawHost) {
  if (!rawHost) return null
  const host = rawHost.trim().toLowerCase().replace(/:\d+$/, '')
  return sites.get(host) ?? null
}
const cookieName = site => `a_session_${site.projectId}`
const baseClient = site => new Client().setEndpoint(site.endpoint).setProject(site.projectId)

function createSessionClient(event) {
  const site = event.context.site
  const session = getCookie(event, cookieName(site))
  if (!session) return null
  const client = baseClient(site).setSession(session)
  return { account: new Account(client) }
}
function getSystemClient(siteId, scope) {
  if (!['auth-login', 'ping-write'].includes(scope)) throw new Error(`Scope "${scope}" nicht enumeriert`)
  const site = [...sites.values()].find(s => s.siteId === siteId)
  const client = baseClient(site).setKey(secrets[siteId].runtimeKey)
  return { account: new Account(client), tablesDB: new TablesDB(client) }
}

const app = createApp()
app.use(defineEventHandler((event) => {
  const site = resolveSite(getHeader(event, 'host'))
  if (!site) throw createError({ status: 404, statusText: 'Unknown site' })
  event.context.site = site
}))

const router = createRouter()

router.get('/sdk.js', defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'application/javascript')
  return SDK_IIFE
}))

router.get('/api/site', defineEventHandler(event => event.context.site))

router.post('/api/login', defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)
  const { account } = getSystemClient(event.context.site.siteId, 'auth-login')
  const session = await account.createEmailPasswordSession({ email, password })
  setCookie(event, cookieName(event.context.site), session.secret, { httpOnly: true, sameSite: 'strict', path: '/' })
  return { ok: true, userId: session.userId }
}))

router.get('/api/me', defineEventHandler(async (event) => {
  const s = createSessionClient(event)
  if (!s) throw createError({ status: 401, statusText: 'No session' })
  try {
    const me = await s.account.get()
    return { userId: me.$id, email: me.email, project: event.context.site.projectId }
  }
  catch (e) {
    if (e?.code === 401) throw createError({ status: 401, statusText: 'Invalid session' })
    throw e
  }
}))

router.get('/api/realtime-token', defineEventHandler(async (event) => {
  const s = createSessionClient(event)
  if (!s) throw createError({ status: 401, statusText: 'No session' })
  const jwt = await s.account.createJWT()
  return { jwt: jwt.jwt }
}))

// Ping: schreibt eine Row ins EIGENE Projekt (System-Op) — Realtime-Probe
router.post('/api/ping', defineEventHandler(async (event) => {
  const s = createSessionClient(event)
  if (!s) throw createError({ status: 401, statusText: 'No session' })
  const { tablesDB } = getSystemClient(event.context.site.siteId, 'ping-write')
  const row = await tablesDB.createRow({
    databaseId: 'main', tableId: 'pings', rowId: ID.unique(),
    data: { msg: `ping von ${event.context.site.siteId} um ${new Date().toISOString().slice(11, 19)}` },
    permissions: [Permission.read(Role.users())],
  })
  return { id: row.$id }
}))

router.get('/', defineEventHandler((event) => {
  const site = event.context.site
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return `<!doctype html><html><head><title>S3 · ${site.siteId}</title>
<style>body{font:14px ui-sans-serif,system-ui;background:${site.siteId === 'alpha' ? '#0b1f2e' : '#2e150b'};color:#eee;padding:2rem;max-width:640px;margin:auto}
button{padding:.5rem 1rem;margin-right:.5rem}#log{background:#0003;padding:1rem;margin-top:1rem;min-height:8rem;white-space:pre-wrap;font-family:monospace;font-size:12px}</style>
<script src="/sdk.js"></script></head><body>
<h1>Site ${site.siteId} <small>(${site.projectId})</small></h1>
<button id="login" data-testid="login">Login</button>
<button id="me" data-testid="me">Wer bin ich?</button>
<button id="rt" data-testid="rt">Realtime verbinden</button>
<button id="ping" data-testid="ping">Ping senden</button>
<div id="log" data-testid="log"></div>
<script>
const log = m => document.getElementById('log').textContent += m + '\\n'
const j = r => r.json()
document.getElementById('login').onclick = async () => {
  const r = await fetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'user@${site.siteId}.local',password:'S3-Demo-Passw0rd!'})})
  log('login: ' + r.status)
}
document.getElementById('me').onclick = async () => {
  const r = await fetch('/api/me'); const d = await j(r).catch(()=>({}))
  log('me: ' + r.status + ' ' + (d.email ?? '') + ' @ ' + (d.project ?? ''))
}
document.getElementById('rt').onclick = async () => {
  const t = await j(await fetch('/api/realtime-token'))
  // Muster aus core/useRealtimeClient: Realtime-Klasse, JWT VOR dem Connect
  const client = new Appwrite.Client().setEndpoint('${site.endpoint}').setProject('${site.projectId}')
  client.setJWT(t.jwt)
  const realtime = new Appwrite.Realtime(client)
  await realtime.subscribe('tablesdb.main.tables.pings.rows', e => log('RT-EVENT [${site.siteId}]: ' + (e.payload?.msg ?? JSON.stringify(e.events?.[0]))))
  log('realtime: subscribed (${site.projectId})')
}
document.getElementById('ping').onclick = async () => {
  const r = await fetch('/api/ping', {method:'POST'})
  log('ping: ' + r.status)
}
</script></body></html>`
}))

app.use(router)
createServer(toNodeListener(app)).listen(3060, () => console.log('S3-minimal auf :3060'))

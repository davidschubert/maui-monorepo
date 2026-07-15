/**
 * S0-Wegwerf-App: EIN Prozess bedient N Sites, aufgelöst pro Request über
 * den Host-Header. Validiert die FORM der Verträge für M1 — kein Produkt.
 */
import { createServer } from 'node:http'
import {
  createApp, createRouter, defineEventHandler, toNodeListener,
  getHeader, readBody, setCookie, createError,
} from 'h3'
import { resolveSite } from './siteResolver.mjs'
import {
  createSessionClient, getSystemClient, sessionCookieName,
} from './appwrite.mjs'

const app = createApp()

// Mandanten-Middleware: Host → Site, unbekannt → 404, Kontext eingefroren.
app.use(defineEventHandler((event) => {
  const site = resolveSite(getHeader(event, 'host'))
  if (!site) {
    throw createError({ status: 404, statusText: 'Unknown site' })
  }
  event.context.site = site // bereits Object.freeze'd, OHNE Runtime-Key
}))

const router = createRouter()

// Vertrag "useSiteConfig()": öffentliche Site-Config, SSR-injizierbar.
router.get('/api/site', defineEventHandler((event) => ({
  site: event.context.site,
  contextKeys: Object.keys(event.context.site),
})))

// SSR-Login wie im Core: Session-Erstellung ist eine ENUMERIERTE System-Op
// über den Secret-Resolver (Admin-Key nötig, damit session.secret zurückkommt
// — identisch zu createAdminClient im Core-Login). Cookie bleibt httpOnly.
router.post('/api/login', defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)
  const { account } = getSystemClient(event.context.site.siteId, 'auth-login')
  const session = await account.createEmailPasswordSession({ email, password })
  setCookie(event, sessionCookieName(event.context.site), session.secret, {
    httpOnly: true, sameSite: 'strict', path: '/',
  })
  return { ok: true, userId: session.userId }
}))

// Session-geschützt: Autorisierung liegt bei Appwrite, nicht in Nuxt/h3.
// Appwrite-401 (ungültige/fremde Session) wird als 401 gemappt, nie als 500
// durchgereicht (im Core erledigt das zentral server/error.ts).
router.get('/api/me', defineEventHandler(async (event) => {
  const session = createSessionClient(event)
  if (!session) throw createError({ status: 401, statusText: 'No session' })
  try {
    const me = await session.account.get()
    return { userId: me.$id, email: me.email, project: event.context.site.projectId }
  } catch (e) {
    if (e?.code === 401) throw createError({ status: 401, statusText: 'Invalid session' })
    throw e
  }
}))

// JWT für die geteilte Realtime (Form-Check: Session → projektgebundenes JWT).
router.get('/api/realtime-token', defineEventHandler(async (event) => {
  const session = createSessionClient(event)
  if (!session) throw createError({ status: 401, statusText: 'No session' })
  const jwt = await session.account.createJWT()
  return { jwt: jwt.jwt }
}))

app.use(router)

const port = Number(process.env.PORT ?? 3050)
createServer(toNodeListener(app)).listen(port, () => {
  console.log(`S0 spike listening on :${port}`)
})

/**
 * Beweis für Entscheidung 12 (David, 2026-07-28) — SITE-OWNER wählen Theme +
 * Variante ihrer Community selbst. Seit dem 2026-07-29 (Davids Entscheidung,
 * Rest von OPEN-ITEMS B5) gehört die NEUTRAL-PALETTE (`data-neutral`,
 * control-020) dazu: Abschnitt 12 unten prüft sie auf derselben Kette und
 * belegt, dass ein gesetztes Besucher-Cookie auf dem Mandanten-Host VERLIERT.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane: zwei Communities anlegen, dann auf dem
 * Community-Host prüfen:
 *   - der Owner (OHNE globales Operator-Label) sieht den Abschnitt
 *     „Erscheinungsbild" in /dashboard/settings/community (SSR 200)
 *   - GET Stand → PATCH theme='crimson' variant='deep' → 200, und die
 *     tenants-Row im Control Plane trägt den Wert
 *   - nach Ablauf des Resolver-Caches (≤30 s) trägt die ÖFFENTLICHE Seite
 *     data-theme="crimson" data-variant="deep" im SSR-HTML
 *   - die ANDERE Community bleibt unverändert (kein Projekt-weites Umfärben)
 *   - Unfug wird abgewiesen: unbekanntes Theme, fremde Variante, Custom Theme
 *   - der Owner von kunde-a darf kunde-b NICHT umfärben → 403
 *   - ein OPERATOR ohne Mitgliedschaft → 403 (Naht-Regel: der
 *     Break-Glass der Platform-App reicht am Control Plane nicht durch)
 *   - auf dem Kontroll-Host gibt es die Route nicht → 404
 *
 * Setzt am Ende alles zurück und räumt jede angelegte Zeile weg.
 *
 * VORAUSSETZUNG — zwei laufende Dev-Server (eigene Ports, damit parallele
 * Sessions sich nicht in die Quere kommen):
 *   pnpm --filter control dev --port 3155
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3155 \
 *     pnpm --filter platform dev --port 3154
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-site-branding.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3154)
// Lokal ist der Kontroll-Host `app.localhost` (NUXT_PUBLIC_TENANCY_CONTROL_HOSTS
// in apps/platform/.env); produktiv sind es my./start.pukalani.app.
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

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
const cleanup = { users: [], codes: [], tenants: [], members: [], workspaces: [] }

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
function call(host, path, { method = 'GET', body, cookie, accept } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Seite */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Seiten-SSR wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
function page(host, path, cookie) {
  return call(host, path, { cookie, accept: 'text/html' })
}

/**
 * Wert eines <html>-Attributs aus dem SSR-HTML ziehen (null = nicht gesetzt).
 * Gesucht wird GENAU das `<html …>`-Tag — nicht „bis zum ersten >", denn das
 * wäre der Doctype davor.
 */
function htmlAttr(html, name) {
  const tag = html.match(/<html\b[^>]*>/i)?.[0] ?? ''
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null
}

async function createPoolUser(tag) {
  const email = `e12-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `E12 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode(tag) {
  const code = `MAUI-E12${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'E12-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(cookie, slug, name) {
  const code = await issueCode(slug.slice(-4).toUpperCase())
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'E12-Beweis: Site-Owner wählen ihre Farbwelt selbst.',
      // Vibe „fresh" = spring/bright — bewusst NICHT crimson/deep, damit der
      // spätere Wechsel nachweislich der Wechsel ist und nicht der Startwert.
      vibe: 'fresh',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (created.status !== 200 || !created.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(created.json.communityId)
  const tenantRow = await control.getRow({ databaseId, tableId: 'tenants', rowId: created.json.communityId }).catch(() => null)
  if (tenantRow?.workspaceId) cleanup.workspaces.push(tenantRow.workspaceId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', created.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: created.json.communityId, host: created.json.host }
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

/**
 * Auf die Wirkung warten — und GENAU DAS ist die dokumentierte Latenz: der
 * Tenant-Resolver der Platform-App cacht die Host-Auflösung 30 s
 * (createTenantsTableResolver, Microcache). Vorher kann die Seite die neue
 * Farbe gar nicht tragen. Wir pollen bis 45 s und melden, wie lange es dauerte.
 */
async function waitForSsrTheme(host, theme, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    // BEWUSST OHNE Cookie: useTheme() lässt die eigene Besucher-Wahl (Cookie
    // maui-theme) vorgehen — die Community-Farbe sieht man als frischer Gast.
    const res = await page(host, '/')
    if (htmlAttr(res.text, 'data-theme') === theme) {
      return { ok: true, ms: Date.now() - started, html: res.text }
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  const last = await page(host, '/')
  return { ok: false, ms: Date.now() - started, html: last.text }
}

/** Dasselbe für die Neutral-Palette (data-neutral, Rest von B5). */
async function waitForSsrNeutral(host, neutral, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const res = await page(host, '/')
    if (htmlAttr(res.text, 'data-neutral') === neutral) {
      return { ok: true, ms: Date.now() - started, html: res.text }
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  const last = await page(host, '/')
  return { ok: false, ms: Date.now() - started, html: last.text }
}

try {
  console.log(`\nE12-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const neighbor = await createPoolUser('neighbor')
  const operator = await createPoolUser('operator')
  await poolUsers.updateLabels({ userId: operator.userId, labels: ['admin'] })

  const ownerControlCookie = await login(CONTROL_HOST, owner)
  const neighborControlCookie = await login(CONTROL_HOST, neighbor)
  const stamp = Date.now().toString(36)

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(ownerControlCookie, `e12-kunde-a-${stamp}`, 'E12 Kunde A')
  const siteB = await createCommunity(neighborControlCookie, `e12-kunde-b-${stamp}`, 'E12 Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  const themesA = await waitForHost(siteA.host)
  const themesB = await waitForHost(siteB.host)
  check('kunde-a antwortet', !!themesA)
  check('kunde-b antwortet', !!themesB)

  console.log('\n2. Stand VOR der Wahl (Vibe „fresh" = spring/bright)')
  check('kunde-a startet auf spring', themesA?.json?.settings?.defaultThemeId === 'spring',
    JSON.stringify(themesA?.json?.settings))
  check('Variante bright', themesA?.json?.settings?.defaultVariantId === 'bright',
    JSON.stringify(themesA?.json?.settings))

  const ownerCookieA = await login(siteA.host, owner)

  console.log('\n3. Der Abschnitt „Erscheinungsbild" steht im Dashboard des Owners (ohne Operator-Label)')
  const communityPage = await page(siteA.host, '/dashboard/settings/community', ownerCookieA)
  check('Settings → Community SSR 200', communityPage.status === 200, `Status ${communityPage.status}`)
  check('Abschnitt im Markup (data-community-branding)', communityPage.text.includes('data-community-branding'))
  check('Grundton-Zeile im Markup (data-community-neutral, Rest von B5)', communityPage.text.includes('data-community-neutral'))
  check('Registrierungs-Schalter steht weiterhin daneben (S1)', communityPage.text.includes('data-community-registration'))

  console.log('\n4. Wahl treffen: crimson / deep')
  const patched = await call(siteA.host, '/api/site/branding', {
    method: 'PATCH', cookie: ownerCookieA, body: { theme: 'crimson', variant: 'deep' },
  })
  check('PATCH → 200 und Antwort trägt den neuen Wert',
    patched.status === 200 && patched.json?.theme === 'crimson' && patched.json?.variant === 'deep',
    `Status ${patched.status} ${patched.text.slice(0, 160)}`)

  const tenantAfter = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteA.communityId })
  check('Control Plane trägt den Wert (tenants.theme=crimson)', tenantAfter.theme === 'crimson', String(tenantAfter.theme))
  check('Control Plane trägt die Variante (tenants.variant=deep)', tenantAfter.variant === 'deep', String(tenantAfter.variant))

  console.log('\n5. Live-Wirkung: die Community trägt die Farbe im SSR-HTML (nach Cache-Ablauf ≤30 s)')
  const live = await waitForSsrTheme(siteA.host, 'crimson')
  check(`kunde-a: data-theme="crimson" (nach ${Math.round(live.ms / 1000)} s)`, live.ok,
    `data-theme=${htmlAttr(live.html, 'data-theme')}`)
  check('kunde-a: data-variant="deep"', htmlAttr(live.html, 'data-variant') === 'deep',
    `data-variant=${htmlAttr(live.html, 'data-variant')}`)

  const otherLive = await page(siteB.host, '/')
  check('kunde-b bleibt unverändert (kein Projekt-weites Umfärben)',
    htmlAttr(otherLive.text, 'data-theme') === 'spring',
    `data-theme=${htmlAttr(otherLive.text, 'data-theme')}`)

  console.log('\n6. Unfug wird abgewiesen (Katalog ist die Validierungsquelle)')
  for (const [label, body] of [
    ['unbekanntes Theme', { theme: 'gibt-es-nicht', variant: '' }],
    ['fremde Variante (ink gehört zu graphite)', { theme: 'crimson', variant: 'ink' }],
    ['Custom Theme (liegt pro Projekt, nicht pro Mandant)', { theme: 'c-abc123', variant: '' }],
    ['Variante ohne Theme', { theme: '', variant: 'deep' }],
    ['Attribut-Einschmuggeln', { theme: 'crimson" onload=x', variant: '' }],
    ['unbekanntes Feld im Body', { theme: 'crimson', variant: 'deep', tenantId: 'fremd' }],
  ]) {
    const res = await call(siteA.host, '/api/site/branding', { method: 'PATCH', cookie: ownerCookieA, body })
    check(`${label} → 400`, res.status === 400, `Status ${res.status}`)
  }
  const stillCrimson = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteA.communityId })
  check('nach allen Ablehnungen steht der gute Wert unverändert', stillCrimson.theme === 'crimson' && stillCrimson.variant === 'deep',
    `${stillCrimson.theme}/${stillCrimson.variant}`)

  console.log('\n7. Fremde Community: die Owner-Rolle reist nicht mit')
  const ownerCookieB = await login(siteB.host, owner)
  const cross = await call(siteB.host, '/api/site/branding', {
    method: 'PATCH', cookie: ownerCookieB, body: { theme: 'crimson', variant: 'deep' },
  })
  check('Owner von kunde-a darf kunde-b NICHT umfärben → 403', cross.status === 403, `Status ${cross.status}`)
  const tenantB = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteB.communityId })
  check('kunde-b unverändert in der Datenbank', tenantB.theme === 'spring', String(tenantB.theme))

  console.log('\n8. Naht-Regel: der Operator-Break-Glass reicht am Control Plane NICHT durch')
  const operatorCookie = await login(siteA.host, operator)
  const operatorPatch = await call(siteA.host, '/api/site/branding', {
    method: 'PATCH', cookie: operatorCookie, body: { theme: 'lagoon', variant: '' },
  })
  // Die Platform-App lässt ihn passieren (protokollierter Break-Glass), das
  // Control Plane verlangt eine echte community_members-Row → 403 durchgereicht.
  check('Operator mit admin-Label, ohne Mitgliedschaft → 403', operatorPatch.status === 403, `Status ${operatorPatch.status}`)
  const afterOperator = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteA.communityId })
  check('nichts geschrieben', afterOperator.theme === 'crimson', String(afterOperator.theme))

  console.log('\n9. Kontroll-Host hat keine Community → die Route existiert dort nicht')
  const onControl = await call(CONTROL_HOST, '/api/site/branding', {
    method: 'PATCH', cookie: ownerControlCookie, body: { theme: 'crimson', variant: 'deep' },
  })
  check('PATCH auf dem Kontroll-Host → 404', onControl.status === 404, `Status ${onControl.status}`)

  console.log('\n10. Zurücksetzen auf den Ausgangszustand (spring/bright)')
  const reset = await call(siteA.host, '/api/site/branding', {
    method: 'PATCH', cookie: ownerCookieA, body: { theme: 'spring', variant: 'bright' },
  })
  check('PATCH zurück → 200', reset.status === 200 && reset.json?.theme === 'spring', `Status ${reset.status}`)
  // Das Feld war in diesem PATCH nicht dabei — die Palette darf sich davon
  // nicht ändern (Deploy-Fenster platform/control, siehe Route-Kommentar).
  const afterPartial = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteA.communityId })
  check('PATCH ohne `neutral` lässt die Palette unangetastet', (afterPartial.neutral ?? '') === '',
    JSON.stringify(afterPartial.neutral))

  console.log('\n11. Neutral-Palette folgt der Community (Rest von B5, 2026-07-29)')
  const neutralPatch = await call(siteA.host, '/api/site/branding', {
    method: 'PATCH', cookie: ownerCookieA, body: { theme: 'spring', variant: 'bright', neutral: 'taupe' },
  })
  check('PATCH neutral=taupe → 200 und Antwort trägt den Wert',
    neutralPatch.status === 200 && neutralPatch.json?.neutral === 'taupe',
    `Status ${neutralPatch.status} ${neutralPatch.text.slice(0, 160)}`)
  const tenantNeutral = await control.getRow({ databaseId, tableId: 'tenants', rowId: siteA.communityId })
  check('Control Plane trägt tenants.neutral=taupe', tenantNeutral.neutral === 'taupe', String(tenantNeutral.neutral))

  for (const [label, body] of [
    ['unbekannte Palette', { theme: 'spring', variant: 'bright', neutral: 'gibt-es-nicht' }],
    ['getönte Custom-Ramp (gehört dem Projekt)', { theme: 'spring', variant: 'bright', neutral: 'c-abc123' }],
    ['Attribut-Einschmuggeln', { theme: 'spring', variant: 'bright', neutral: 'mist" onload=x' }],
  ]) {
    const res = await call(siteA.host, '/api/site/branding', { method: 'PATCH', cookie: ownerCookieA, body })
    check(`${label} → 400`, res.status === 400, `Status ${res.status}`)
  }

  // DER KERN: ein Besucher MIT eigener Neutral-Wahl sieht trotzdem die der
  // Community. Vorher gewann hier das Cookie (es gab keine Community-Wahl).
  const liveNeutral = await waitForSsrNeutral(siteA.host, 'taupe')
  check(`kunde-a: data-neutral="taupe" ohne Cookie (nach ${Math.round(liveNeutral.ms / 1000)} s)`,
    liveNeutral.ok, `data-neutral=${htmlAttr(liveNeutral.html, 'data-neutral')}`)
  const withCookie = await page(siteA.host, '/', 'maui-neutral=olive')
  check('kunde-a: Besucher-Cookie `olive` VERLIERT (data-neutral bleibt taupe)',
    htmlAttr(withCookie.text, 'data-neutral') === 'taupe',
    `data-neutral=${htmlAttr(withCookie.text, 'data-neutral')}`)

  // Und der Gegenbeweis: auf dem Kontroll-Host (kein Mandant) gewinnt es weiter.
  // `/login` und nicht `/`: die Wurzel des Kontroll-Hosts leitet in den Wizard
  // (302 auf /login?redirect=/start) und hat gar kein <html> zum Prüfen.
  const onControlHost = await page(CONTROL_HOST, '/login', 'maui-neutral=olive')
  check('Kontroll-Host: dasselbe Cookie GEWINNT (data-neutral=olive)',
    htmlAttr(onControlHost.text, 'data-neutral') === 'olive',
    `data-neutral=${htmlAttr(onControlHost.text, 'data-neutral')}`)

  const otherNeutral = await page(siteB.host, '/')
  check('kunde-b behält seine Palette (kein Projekt-weites Umfärben)',
    htmlAttr(otherNeutral.text, 'data-neutral') === 'mist',
    `data-neutral=${htmlAttr(otherNeutral.text, 'data-neutral')}`)

  const neutralReset = await call(siteA.host, '/api/site/branding', {
    method: 'PATCH', cookie: ownerCookieA, body: { theme: 'spring', variant: 'bright', neutral: '' },
  })
  check('Zurücksetzen auf die Voreinstellung → 200, neutral=\'\'',
    neutralReset.status === 200 && neutralReset.json?.neutral === '', `Status ${neutralReset.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n12. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'tenants', rowId: id }).catch(() => {})
  for (const id of cleanup.workspaces) await control.deleteRow({ databaseId, tableId: 'workspaces', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'tenants', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

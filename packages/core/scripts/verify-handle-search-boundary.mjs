/**
 * Beweis: die Handle-Grenze einer Community hält — beim LESEN und beim NEHMEN.
 *
 * ZWEI FRAGEN IN EINER DATEI, weil sie denselben teuren Aufbau brauchen (zwei
 * echte Communities auf einer Instanz, drei Konten, der echte Wizard):
 *   Abschnitte 1–7  — `GET /api/handles/search` reicht nicht über die Grenze.
 *   Abschnitte 8–10 — H1: einen NAMEN bekommt hier nur, wer dazugehört.
 *
 * ── WARUM ES DIESEN BEWEIS BRAUCHT ─────────────────────────────────────────
 * Handles sind je Community eindeutig (`community_handles`, Unique
 * `(communityId, handleLower)`) — ZWEI Communities auf DERSELBEN Instanz legen
 * ihre Namen also in DIESELBE Tabelle. Eine Vorschlagsliste, die dort über die
 * Grenze greift, wäre die Mitgliederliste von Kunde B in der Schreibfläche von
 * Kunde A. Der bisherige Beweis (`packages/posts/scripts/verify-mention-menu.mjs`)
 * lief gegen `apps/comments` — ein SILO, in dem es die Grenze gar nicht gibt.
 * Deshalb hier: der Pool, mit zwei echten Communities.
 *
 * ── ZWEI SCHICHTEN, ZWEI MESSUNGEN ─────────────────────────────────────────
 * Die Route liest über `tenantDb(event).list` mit der Türklinke 'member'. Es
 * halten also ZWEI unabhängige Dinge, und ein Beweis, der sie zusammen misst,
 * kann nicht sagen, welches davon trägt (und würde still grün bleiben, wenn
 * eines wegfällt):
 *
 *   (1) DER MANDANTEN-FILTER der Datentür (`Query.equal('communityId', …)`).
 *       Allein gemessen in Abschnitt 5: derselbe Mensch ist Mitglied BEIDER
 *       Communities, hat also BEIDE Labels — die Row-Permissions ließen die
 *       fremde Zeile durch, nur der Filter hält sie zurück.
 *   (2) DIE ROW-PERMISSIONS (`read(label:<communityId>)`, gestempelt von der
 *       Tür). Allein gemessen in Abschnitt 6: ein Mitglied von A steht auf dem
 *       HOST von B, der Filter zeigt also auf B und würde die Zeile liefern —
 *       nur das fehlende Label hält sie zurück.
 *
 * Zu JEDER Sperre gehört die GEGENPROBE im selben Abschnitt. Ohne sie beweist
 * eine leere Antwort nur, dass die Suche kaputt ist.
 *
 * ── DER BEWEIS IST SELBST GEGENGEPROBT (2026-08-05) ────────────────────────
 * Ein Beweis, der beim ersten Lauf grün ist, hat noch nichts gezeigt. Zwei
 * absichtliche Mutationen an `server/api/handles/search.get.ts`, je eine je
 * Schicht — beide wurden gefangen, und zwar GENAU von dem Abschnitt, der die
 * betroffene Schicht misst:
 *   (a) Filter weg (roher Session-Client statt `tenantDb`) ⇒ Abschnitt 5 rot:
 *       Owner A sah `["grenzprobe_alpha","grenzprobe_beta"]` auf SEINEM Host.
 *   (b) `as: 'operator'` statt 'member' (Filter bleibt, Row-Permissions
 *       umgangen) ⇒ Abschnitt 6 rot: der Nachbar sah `["grenzprobe_beta"]`
 *       auf einem Host, zu dem er nicht gehört.
 * Wer den Beweis umbaut, macht diese zwei Proben wieder — sonst weiss niemand,
 * ob das Grün noch etwas bedeutet.
 *
 * Dasselbe für die H1-Abschnitte (2026-08-05): Wache entfernt (`return true`
 * am Anfang von `resolveCommunityMembership`) ⇒ 31/37 statt 37/37, und die
 * sechs Roten sind GENAU die Abschnitte 8+9; Abschnitt 10 („für Mitglieder
 * ändert sich nichts") bleibt grün. Gemessen wurde dabei wörtlich der Befund:
 *   - der Fremde bekam auf Host B `{"handle":"probenachbar","member":true}`,
 *     die Tabelle wuchs von 1 auf 2 Zeilen,
 *   - er nahm `@grenzprobe_vorstand`, und das rechtmässige Mitglied bekam
 *     danach `409 {"reason":"taken"}` — für immer.
 *
 * ── AUFBAU ─────────────────────────────────────────────────────────────────
 * Zwei Wegwerf-Communities über den ECHTEN Wizard-Abschluss, zwei Owner, ein
 * Nachbar. Jeder Owner setzt seinen Namen über `PATCH /api/handles/me` — also
 * über die Produktionsroute, nicht per Admin-Client in die Tabelle geschrieben.
 * Das `finally` räumt alles wieder ab.
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 * Beide Dienste gehören DIR (CLAUDE.md, „Tests"): ein Beweis über eine
 * Service-Naht ist nur so ehrlich wie sein entferntester Dienst.
 *
 *   pnpm --filter control exec nuxi dev --port 3014
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3014 \
 *     pnpm --filter platform exec nuxi dev --port 3016
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/core/scripts/verify-handle-search-boundary.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig, Rest aus apps/control/.env).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

const HANDLES_TABLE = 'community_handles'
/** Gemeinsames Präfix — genau darum geht es: EINE Suche, zwei Communities. */
const PREFIX = 'grenzprobe'
const HANDLE_A = `${PREFIX}_alpha`
const HANDLE_B = `${PREFIX}_beta`
/** Der Name, den sich der Fremde auf HOST B nehmen will (H1). */
const HANDLE_SQUAT = `${PREFIX}_vorstand`
/** Der Name, den derselbe Mensch auf SEINEM Host bekommen darf (Gegenprobe). */
const HANDLE_HOME = `${PREFIX}_nachbar`
const ALL_HANDLES = [HANDLE_A, HANDLE_B, HANDLE_SQUAT, HANDLE_HOME]

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], tenantIds: [], members: [], handles: [] }

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
  const email = `handle-boundary-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Probe ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

/** Anmelden auf dem Kontroll-Host → Session-Cookie (host-übergreifend gesendet). */
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
  const code = `PUKA-HANDLE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Handle-Grenze', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function createCommunity(cookie, slug, name, code) {
  const res = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'Wegwerf-Community für den Beweis der Handle-Grenze.',
      vibe: 'elegant',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Community "${slug}" nicht angelegt (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  // Der SPALTEN-Wert der Handle-Zeilen ist `tenantId`, nicht `communityId` —
  // zwei verschiedene Schlüssel (die Zeile trägt den einen, das Label den anderen).
  cleanup.tenantIds.push(res.json.tenantId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', res.json.communityId), Query.limit(25)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: res.json.communityId, tenantId: res.json.tenantId, host: res.json.host }
}

/** Die Suche als Liste von Handles — genau das, was das Menü anzeigt. */
async function search(host, cookie, q) {
  const res = await call(host, `/api/handles/search?q=${encodeURIComponent(q)}`, { cookie })
  return { status: res.status, handles: Array.isArray(res.json) ? res.json.map(r => r.label) : null, raw: res }
}

/** Mitgliedschaft anlegen (wie in verify-site-authz) + Label über einen Besuch. */
async function joinAs(account, cookie, community, host, role = 'viewer') {
  const row = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId: community.communityId,
      runtimeProjectId: poolProject,
      runtimeUserId: account.userId,
      role,
      status: 'active',
      email: account.email,
    },
  })
  cleanup.members.push(row.$id)
  // Das Label vergibt server/middleware/06.community-label.ts bei einem Besuch
  // auf dem Host — genau der Weg, den ein echtes Mitglied nimmt.
  await call(host, '/api/auth/me', { cookie })
  const labels = (await poolUsers.get({ userId: account.userId })).labels ?? []
  return labels.includes(community.communityId)
}

try {
  console.log(`\nHandle-Grenze: Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  console.log('1. Aufbau: zwei Communities auf DERSELBEN Instanz')
  const code = await issueCode()
  const ownerA = await createPoolUser('owner-a')
  const ownerB = await createPoolUser('owner-b')
  const neighbour = await createPoolUser('nachbar')
  const cookieA = await login(ownerA)
  const cookieB = await login(ownerB)
  const cookieN = await login(neighbour)

  const stamp = Date.now().toString(36)
  const siteA = await createCommunity(cookieA, `hgrenze-a-${stamp}`, 'Handle-Grenze A', code)
  const siteB = await createCommunity(cookieB, `hgrenze-b-${stamp}`, 'Handle-Grenze B', code)
  check('Community A angelegt', !!siteA.communityId, JSON.stringify(siteA))
  check('Community B angelegt', !!siteB.communityId, JSON.stringify(siteB))
  check('… es sind wirklich zwei verschiedene', siteA.communityId !== siteB.communityId)
  check('Host A antwortet', await waitForHost(siteA.host), siteA.host)
  check('Host B antwortet', await waitForHost(siteB.host), siteB.host)

  console.log('\n2. Zwei Namen mit GEMEINSAMEM Präfix — über die echte Route gesetzt')
  const setA = await call(siteA.host, '/api/handles/me', { method: 'PATCH', cookie: cookieA, body: { handle: HANDLE_A } })
  check(`Owner A heißt @${HANDLE_A}`, setA.status === 200 && setA.json?.handle === HANDLE_A,
    `Status ${setA.status} ${setA.text.slice(0, 160)}`)
  const setB = await call(siteB.host, '/api/handles/me', { method: 'PATCH', cookie: cookieB, body: { handle: HANDLE_B } })
  check(`Owner B heißt @${HANDLE_B}`, setB.status === 200 && setB.json?.handle === HANDLE_B,
    `Status ${setB.status} ${setB.text.slice(0, 160)}`)

  // Der Kern der Sache, mit dem Admin-Client nachgesehen: BEIDE Zeilen liegen in
  // DERSELBEN Tabelle. Wäre das nicht so, bewiese der Rest nichts.
  const rowsInTable = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('handleLower', [HANDLE_A, HANDLE_B]), Query.limit(10)],
  })
  cleanup.handles.push(...rowsInTable.rows.map(row => row.$id))
  const rowA = rowsInTable.rows.find(row => row.handleLower === HANDLE_A)
  const rowB = rowsInTable.rows.find(row => row.handleLower === HANDLE_B)
  check('beide Namen liegen in DERSELBEN Tabelle', rowsInTable.total === 2, `total=${rowsInTable.total}`)
  check('… getrennt nur durch die Spalte communityId',
    rowA?.communityId === siteA.tenantId && rowB?.communityId === siteB.tenantId,
    `${rowA?.communityId} / ${rowB?.communityId} vs ${siteA.tenantId} / ${siteB.tenantId}`)
  check('… und durch ihr Lese-Publikum read(label:<communityId>)',
    (rowA?.$permissions ?? []).includes(`read("label:${siteA.communityId}")`)
    && (rowB?.$permissions ?? []).includes(`read("label:${siteB.communityId}")`),
    `${JSON.stringify(rowA?.$permissions)} / ${JSON.stringify(rowB?.$permissions)}`)

  console.log('\n3. GEGENPROBE: die Suche funktioniert überhaupt')
  const ownFindA = await search(siteA.host, cookieA, PREFIX)
  check(`Owner A findet auf seinem Host @${HANDLE_A}`,
    ownFindA.status === 200 && ownFindA.handles?.includes(HANDLE_A),
    `Status ${ownFindA.status} ${JSON.stringify(ownFindA.handles)}`)
  const ownFindB = await search(siteB.host, cookieB, PREFIX)
  check(`Owner B findet auf seinem Host @${HANDLE_B}`,
    ownFindB.status === 200 && ownFindB.handles?.includes(HANDLE_B),
    `Status ${ownFindB.status} ${JSON.stringify(ownFindB.handles)}`)

  console.log('\n4. DIE GRENZE: derselbe Präfix, der fremde Name bleibt draußen')
  check(`Owner A sieht @${HANDLE_B} NICHT`, !ownFindA.handles?.includes(HANDLE_B), JSON.stringify(ownFindA.handles))
  check(`Owner B sieht @${HANDLE_A} NICHT`, !ownFindB.handles?.includes(HANDLE_A), JSON.stringify(ownFindB.handles))
  const exactB = await search(siteA.host, cookieA, HANDLE_B)
  check('… auch die Suche nach dem VOLLEN fremden Namen bleibt leer',
    exactB.status === 200 && exactB.handles?.length === 0, `Status ${exactB.status} ${JSON.stringify(exactB.handles)}`)
  const exactA = await search(siteB.host, cookieB, HANDLE_A)
  check('… und in der Gegenrichtung ebenso',
    exactA.status === 200 && exactA.handles?.length === 0, `Status ${exactA.status} ${JSON.stringify(exactA.handles)}`)

  console.log('\n5. Schicht 1 ALLEIN: der Mandanten-Filter (Mehrfach-Mitgliedschaft)')
  // Owner A tritt Community B bei. Ab jetzt trägt er BEIDE Labels — die
  // Row-Permissions sind also KEINE Sperre mehr. Was auf seinem eigenen Host
  // noch hält, ist einzig der Filter der Datentür.
  check('Owner A ist jetzt auch Mitglied von B (beide Labels)',
    await joinAs(ownerA, cookieA, siteB, siteB.host))
  const bothLabels = (await poolUsers.get({ userId: ownerA.userId })).labels ?? []
  check('… nachgemessen an den Labels des Kontos',
    bothLabels.includes(siteA.communityId) && bothLabels.includes(siteB.communityId), JSON.stringify(bothLabels))

  const crossFind = await search(siteB.host, cookieA, PREFIX)
  check('GEGENPROBE: auf Host B sieht er @' + HANDLE_B + ' (das Label greift wirklich)',
    crossFind.status === 200 && crossFind.handles?.includes(HANDLE_B),
    `Status ${crossFind.status} ${JSON.stringify(crossFind.handles)}`)
  const homeFind = await search(siteA.host, cookieA, PREFIX)
  check('auf Host A bleibt es trotz Label B bei @' + HANDLE_A + ' — der FILTER hält allein',
    homeFind.status === 200 && homeFind.handles?.includes(HANDLE_A) && !homeFind.handles.includes(HANDLE_B),
    `Status ${homeFind.status} ${JSON.stringify(homeFind.handles)}`)

  console.log('\n6. Schicht 2 ALLEIN: die Row-Permissions (fremder Host, kein Label)')
  // Der Nachbar ist Mitglied von A. Steht er auf dem Host von B, zeigt der
  // Filter auf B und würde die fremde Zeile ausliefern — es fehlt ihm nur das
  // Label. Genau das misst dieser Abschnitt.
  check('Nachbar ist Mitglied von A', await joinAs(neighbour, cookieN, siteA, siteA.host))
  const neighbourLabels = (await poolUsers.get({ userId: neighbour.userId })).labels ?? []
  check('… und NICHT von B', !neighbourLabels.includes(siteB.communityId), JSON.stringify(neighbourLabels))

  const neighbourHome = await search(siteA.host, cookieN, PREFIX)
  check('GEGENPROBE: auf Host A findet er @' + HANDLE_A,
    neighbourHome.status === 200 && neighbourHome.handles?.includes(HANDLE_A),
    `Status ${neighbourHome.status} ${JSON.stringify(neighbourHome.handles)}`)
  const neighbourAway = await search(siteB.host, cookieN, PREFIX)
  check('auf Host B bekommt er NICHTS — die ROW-PERMISSIONS halten allein',
    neighbourAway.status === 200 && neighbourAway.handles?.length === 0,
    `Status ${neighbourAway.status} ${JSON.stringify(neighbourAway.handles)}`)

  console.log('\n7. Ohne Sitzung gibt es gar nichts')
  for (const [label, host] of [['A', siteA.host], ['B', siteB.host]]) {
    const res = await search(host, undefined, PREFIX)
    check(`Gast auf Host ${label} → 401`, res.status === 401, `Status ${res.status}`)
  }

  /**
   * ── H1 (2026-08-05) ────────────────────────────────────────────────────────
   * Die Abschnitte 1–7 zeigen, dass ein Fremder auf einem Community-Host nichts
   * SIEHT. Sie sagen nichts darüber, ob er dort etwas NEHMEN kann — und genau
   * das konnte er: `GET /api/handles/me` prüfte nur die Sitzung und vergab beim
   * Hinsehen. Der Nachbar ist hier der Fremde: Mitglied von A, auf Host B ohne
   * jede Zugehörigkeit.
   */
  console.log('\n8. H1: der Fremde sieht hin — und bekommt NICHTS angelegt')
  // Gezählt wird über `communityId` (die führende Spalte beider Indizes aus
  // system-029) — ein `Query.equal('userId', …)` allein hat hier keinen Index.
  const rowsOfB = () => poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('communityId', siteB.tenantId), Query.limit(50)],
  })
  const beforeRows = await rowsOfB()
  const mineAway = await call(siteB.host, '/api/handles/me', { cookie: cookieN })
  check('GET /api/handles/me auf dem fremden Host → 200 (kein roher Fehler)',
    mineAway.status === 200, `Status ${mineAway.status} ${mineAway.text.slice(0, 160)}`)
  check('… und sagt ehrlich: hier gehörst du nicht dazu',
    mineAway.json?.member === false && mineAway.json?.handle === null, JSON.stringify(mineAway.json))

  const afterRows = await rowsOfB()
  cleanup.handles.push(...afterRows.rows.map(row => row.$id))
  check('IN COMMUNITY B ist dadurch keine Zeile entstanden',
    afterRows.total === beforeRows.total,
    `vorher ${beforeRows.total}, nachher ${afterRows.total}: ${JSON.stringify(afterRows.rows.map(r => `${r.handle}/${r.userId}`))}`)
  check('… und keine einzige gehört dem Fremden',
    !afterRows.rows.some(row => row.userId === neighbour.userId),
    JSON.stringify(afterRows.rows.map(r => `${r.handle}/${r.userId}`)))

  console.log('\n9. H1: und er kann sich dort auch keinen Namen NEHMEN')
  const squat = await call(siteB.host, '/api/handles/me', {
    method: 'PATCH', cookie: cookieN, body: { handle: HANDLE_SQUAT },
  })
  check(`PATCH auf dem fremden Host → 403`, squat.status === 403, `Status ${squat.status} ${squat.text.slice(0, 160)}`)
  check('… mit fachlichem Grund im Envelope (reason: not_a_member)',
    squat.json?.reason === 'not_a_member', JSON.stringify(squat.json))

  // Die schärfste Messung: der Name muss danach noch FREI sein. Eine
  // Historien-Zeile gibt ihn nie wieder her — hätte der Fremde ihn bekommen,
  // scheiterte das hier mit 409 `taken`, und zwar für immer.
  // Es holt ihn OWNER A (seit Abschnitt 5 Mitglied von B und dort noch ohne
  // Namen), nicht Owner B: der hat in Abschnitt 2 gerade erst geändert und
  // liefe in die 30-Tage-Sperrfrist — dann bewiese ein Fehlschlag nichts.
  const rightfulMember = await call(siteB.host, '/api/handles/me', {
    method: 'PATCH', cookie: cookieA, body: { handle: HANDLE_SQUAT },
  })
  check(`@${HANDLE_SQUAT} ist in Community B noch frei — ein MITGLIED bekommt ihn`,
    rightfulMember.status === 200 && rightfulMember.json?.handle === HANDLE_SQUAT,
    `Status ${rightfulMember.status} ${rightfulMember.text.slice(0, 160)}`)

  console.log('\n10. GEGENPROBE: für ein MITGLIED ändert sich nichts')
  const mineHome = await call(siteA.host, '/api/handles/me', { cookie: cookieN })
  check('auf SEINEM Host bekommt derselbe Mensch beim Hinsehen einen Namen',
    mineHome.status === 200 && mineHome.json?.member === true && !!mineHome.json?.handle,
    `Status ${mineHome.status} ${JSON.stringify(mineHome.json)}`)
  const changeHome = await call(siteA.host, '/api/handles/me', {
    method: 'PATCH', cookie: cookieN, body: { handle: HANDLE_HOME },
  })
  check(`… und darf ihn auf @${HANDLE_HOME} ändern`,
    changeHome.status === 200 && changeHome.json?.handle === HANDLE_HOME,
    `Status ${changeHome.status} ${changeHome.text.slice(0, 160)}`)
  const ownerStillWorks = await call(siteA.host, '/api/handles/me', { cookie: cookieA })
  check('… und Owner A behält seinen',
    ownerStillWorks.status === 200 && ownerStillWorks.json?.handle === HANDLE_A,
    `Status ${ownerStillWorks.status} ${JSON.stringify(ownerStillWorks.json)}`)

  const guestMine = await call(siteA.host, '/api/handles/me', {})
  check('ohne Sitzung bleibt es bei 401 (die Wache ersetzt sie nicht)',
    guestMine.status === 401, `Status ${guestMine.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n11. Aufräumen')
  // Handle-Zeilen liegen im POOL-Projekt, alles andere im Control Plane.
  // Gesucht wird über BEIDE Wege: die gesetzten Namen UND alles, was den
  // Wegwerf-Konten gehört (die automatische Vergabe erfindet Namen selbst —
  // `probenachbar`, `probeownera`, … — die keine Konstante hier kennt).
  const strays = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('handleLower', ALL_HANDLES), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  const mine = cleanup.tenantIds.length
    ? await poolDb.listRows({
        databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
        queries: [Query.equal('communityId', cleanup.tenantIds), Query.limit(100)],
      }).catch(() => ({ rows: [] }))
    : { rows: [] }
  strays.rows.push(...mine.rows)
  for (const id of new Set([...cleanup.handles, ...strays.rows.map(row => row.$id)])) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: HANDLES_TABLE, rowId: id }).catch(() => {})
  }
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] }).catch(() => ({ rows: [] }))
  console.log(`  ✔ aufgeräumt — verbleibende Communities: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

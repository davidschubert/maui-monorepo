#!/usr/bin/env node
/**
 * A4 — DIE PRESENCE-GRENZE, in BEIDE Richtungen bewiesen.
 *
 * Der Befund (docs/archiv/PRESENCE-GRENZE.md): im Pool teilen sich alle
 * Communities EIN Appwrite-Projekt. Solange eine Presence `read("users")` trug,
 * durfte sie jeder eingeloggte Nutzer JEDER Community lesen — der tenantId-
 * Filter in unserem Code ist Anwendungslogik, keine Zugriffskontrolle. Wer die
 * Browser-Konsole öffnet und `presences.list()` direkt ruft, umgeht ihn.
 *
 * Dieses Skript IST diese Browser-Konsole: es meldet echte Nutzer an (echte
 * Sessions, kein API-Key) und liest die Presences-API direkt an unserem Code
 * vorbei. Es zeigt beides:
 *   VORHER — mit `read("users")` SIEHT Kunde A die Presence von Kunde B.
 *   NACHHER — mit `read("label:<communityId>")` sieht er sie NICHT MEHR,
 *             während ein MITGLIED derselben Community sie weiterhin sieht.
 * Die zweite Hälfte ist der eigentliche Punkt: eine Grenze, die auch die
 * eigenen Leute aussperrt, ist keine Lösung, sondern ein Ausfall.
 *
 * ZWEI AKTE:
 *   Akt 1 — der MECHANISMUS, direkt gegen Appwrite. Braucht keinen Server und
 *           beweist, worauf alles ruht: dass die Presences-API die Leserechte
 *           wirklich erzwingt (die eine Annahme aus Abschnitt 7.3 der Analyse).
 *   Akt 2 — der ECHTE PFAD durch unseren Code, wenn ein Platform-Dev-Server
 *           läuft: auf zwei Mandanten-Hosts BEITRETEN (Anmeldung bzw. erster
 *           Beitrag — seit A5 die einzigen Auslöser, ein Besuch genügt
 *           ausdrücklich nicht) → bekommt jeder nur SEIN Site-Label
 *           (server/middleware/06.community-label.ts)? → Heartbeat schreiben → sieht
 *           der Nachbar-Mandant die Presence? Ohne laufenden Server wird Akt 2
 *           übersprungen (mit Hinweis), nicht als Fehler gewertet.
 *           Die Hosts brauchen OFFENE Registrierung (tenants.openRegistration),
 *           sonst gibt es dort keinen Beitritt und Akt 2 meldet zu Recht Fehler.
 *
 * Läuft gegen die Instanz aus der Env — nie hartkodiert Prod. Legt Wegwerf-
 * Nutzer an und räumt sie (auch im Fehlerfall) wieder weg.
 *
 *   node --env-file=apps/platform/.env packages/core/scripts/verify-presence-boundary.mjs
 *   # Akt 2 zusätzlich: `pnpm --filter platform dev` in einem zweiten Terminal
 *   # (Hosts aus der lokalen tenants-Tabelle, Default kunde-a/kunde-b.localhost)
 */
import { request } from 'node:http'
import { Client, ID, Presences, Query, TablesDB, Users } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen (Runtime-Key mit users/sessions).')
  process.exit(1)
}

const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const adminUsers = new Users(admin)
const adminPresences = new Presences(admin)

// Zwei erfundene, aber FORMGÜLTIGE Site-Ids (alphanumerisch ≤36 — genau das,
// was Appwrite als Label akzeptiert und was tenants.$id liefert).
const stamp = Date.now().toString(36)
const SITE_A = `a4siteA${stamp}`
const SITE_B = `a4siteB${stamp}`

const created = { users: [], presences: [], comments: [] }
let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** Ein Nutzer + sein Site-Label + eine echte Session (= „der Browser"). */
async function member(tag, communityId) {
  const email = `a4-${tag}-${stamp}@example.test`
  const user = await adminUsers.create({
    userId: ID.unique(), email, password: `Pw-${ID.unique()}`, name: `A4 ${tag}`,
  })
  created.users.push(user.$id)
  await adminUsers.updateLabels({ userId: user.$id, labels: [communityId] })
  const session = await adminUsers.createSession({ userId: user.$id })
  // Session statt API-Key: nur so gelten die Row-Permissions überhaupt — ein
  // Key umgeht sie absichtlich und würde jede Grenze „bestehen".
  const asUser = new Presences(
    new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret),
  )
  return { id: user.$id, name: `A4 ${tag}`, communityId, presences: asUser }
}

/** Presence von `who` schreiben — mit genau den Rechten, die geprüft werden. */
async function writePresence(who, permissions) {
  await adminPresences.upsert({
    presenceId: who.id,
    userId: who.id,
    status: 'online',
    permissions: [...permissions, `update("user:${who.id}")`, `delete("user:${who.id}")`],
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    metadata: { userName: who.name, tenantId: `tenant-of-${who.communityId}` },
  })
  if (!created.presences.includes(who.id)) created.presences.push(who.id)
}

/** Sieht `viewer` die Presence von `target`? (ttl:0 — nie eine gecachte Liste) */
async function sees(viewer, target) {
  const res = await viewer.presences.list({ queries: [Query.limit(200)], ttl: 0 })
  return (res.presences ?? []).some(p => p.userId === target.id)
}

// ── Akt 2: durch unseren eigenen Code ───────────────────────────────────────
const PORT = Number(process.env.PLATFORM_PORT || 3006)
const HOST_A = process.env.TENANT_HOST_A || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_HOST_B || 'kunde-b.localhost'

/** node:http, weil fetch einen eigenen Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1', port: PORT, path, method,
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

/** Nutzer OHNE Label — das Label soll ja gerade unser Code vergeben. */
async function plainUser(tag) {
  const email = `a4-${tag}-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await adminUsers.create({ userId: ID.unique(), email, password, name: `A4 ${tag}` })
  created.users.push(user.$id)
  return { id: user.$id, name: `A4 ${tag}`, email, password }
}

/**
 * Konto AUF EINEM MANDANTEN-HOST anlegen — seit A5 (2026-07-29) ist das einer der
 * beiden Beitritts-Auslöser (packages/core/shared/communityJoin.ts). Vorher genügte
 * für das Label ein eingeloggter Besuch; jetzt braucht es eine Mitgliedschaft,
 * und die entsteht hier.
 */
async function signupOn(host, tag) {
  const email = `a4-${tag}-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const res = await call(host, '/api/auth/signup', {
    method: 'POST', body: { email, password, name: `A4 ${tag}` },
  })
  if (res.status !== 200) throw new Error(`Signup auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 200)}`)
  const found = await adminUsers.list({ queries: [Query.equal('email', email), Query.limit(1)] })
  const user = found.users[0]
  if (!user) throw new Error('Signup ohne Nutzer?')
  created.users.push(user.$id)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  return { id: user.$id, name: `A4 ${tag}`, email, password, cookie: raw ? raw.split(';')[0] : null }
}

/** Der zweite Auslöser: der erste eigene Schreibvorgang in dieser Community. */
async function contributeOn(host, cookie) {
  const res = await call(host, '/api/comments', {
    method: 'POST',
    cookie,
    body: { targetId: `a4-join-${stamp}`, targetType: 'verify', content: 'Ich mache mit.' },
  })
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Kommentar auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 200)}`)
  }
  const id = res.json?.$id ?? res.json?.comment?.$id
  if (id) created.comments.push(id)
  return res
}

async function loginOn(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

const labelsOf = async id => (await adminUsers.get({ userId: id })).labels ?? []

try {
  console.log(`\nA4 — Presence-Grenze gegen ${endpoint} / Projekt ${projectId}`)
  console.log(`Site A = ${SITE_A} · Site B = ${SITE_B}\n`)

  const alice = await member('alice', SITE_A) // Kunde A
  const bob = await member('bob', SITE_B) // Kunde B
  const bea = await member('bea', SITE_B) // Mitglied DERSELBEN Community wie Bob

  console.log('1. VORHER — read("users"): der Befund, reproduziert')
  await writePresence(bob, ['read("users")'])
  check('Alice (FREMDE Community) SIEHT Bobs Presence — das ist das Leck',
    await sees(alice, bob))
  check('Bea (Bobs Community) sieht sie auch', await sees(bea, bob))
  check('Bob sieht seine eigene', await sees(bob, bob))

  console.log('\n2. NACHHER — read("label:<communityId>"): die Grenze zieht Appwrite')
  await writePresence(bob, [`read("label:${SITE_B}")`])
  check('Alice (FREMDE Community) sieht Bobs Presence NICHT MEHR',
    !(await sees(alice, bob)), 'Leck offen!')
  check('Bea (Mitglied derselben Community) sieht sie WEITERHIN',
    await sees(bea, bob), 'Grenze sperrt die eigenen Leute aus!')
  check('Bob sieht seine eigene weiterhin', await sees(bob, bob))

  console.log('\n3. Gegenprobe in die andere Richtung (Site A)')
  await writePresence(alice, [`read("label:${SITE_A}")`])
  check('Bob sieht Alice’ Presence NICHT', !(await sees(bob, alice)), 'Leck offen!')
  check('Alice sieht ihre eigene', await sees(alice, alice))

  console.log('\n4. Fail-closed: Pool-Zeile ohne Site-Label (Datenfehler)')
  // tenantReadRolesFor gibt ohne communityId ein LEERES Read-Set zurück. Das muss
  // heißen „niemand", nicht „alle" — sonst wäre der Datenfehler ein Leck.
  await writePresence(bob, [])
  check('niemand sieht sie — auch nicht das eigene Mitglied',
    !(await sees(bea, bob)) && !(await sees(alice, bob)), 'nicht fail-closed!')

  console.log('\n5. Der Angreifer hat keinen Sonderweg')
  const guest = new Presences(new Client().setEndpoint(endpoint).setProject(projectId))
  await writePresence(bob, [`read("label:${SITE_B}")`])
  let guestSees = null
  try {
    const res = await guest.list({ queries: [Query.limit(200)], ttl: 0 })
    guestSees = (res.presences ?? []).some(p => p.userId === bob.id)
  }
  catch { guestSees = false } // 401 general_unauthorized_scope — der Normalfall
  check('ohne Session (Gast) kommt nichts heraus', guestSees === false)

  // ══════════ AKT 2 — derselbe Beweis, aber durch unseren Code ══════════
  console.log('\n── Akt 2: der echte Pfad (Middleware + Heartbeat) ──')
  const alive = await call(HOST_A, '/api/health').catch(() => null)
  if (!alive) {
    console.log(`  ⓘ übersprungen — kein Platform-Server auf Port ${PORT}`)
    console.log('    (starten mit `pnpm --filter platform dev`, dann erneut laufen lassen)')
  }
  else {
    const aHost = await call(HOST_A, '/api/themes')
    const bHost = await call(HOST_B, '/api/themes')
    if (aHost.status !== 200 || bHost.status !== 200) {
      throw new Error(`Mandanten-Hosts antworten nicht (${HOST_A}: ${aHost.status}, ${HOST_B}: ${bHost.status})`)
    }

    console.log(`\n6. Label-Vergabe: MITGLIEDSCHAFT, nicht Besuch (${HOST_A} / ${HOST_B})`)
    // SEIT A5 (2026-07-29) folgt das Label einer community_members-Zeile MIT ZUGANG.
    // Vorher genügte ein eingeloggter Besuch (A4) — und genau daran scheiterte
    // „Zugang entziehen": das Publikum kam beim nächsten Aufruf zurück. Die
    // Prüfungen hier fahren deshalb die ECHTEN Beitritts-Auslöser
    // (Anmeldung auf dem Host, erster Schreibvorgang) statt eines Besuchs.
    const ann = await plainUser('ann') // hat ihr Konto schon → tritt per Beitrag bei
    const nick = await plainUser('nick') // macht nirgends mit
    check('frisch angelegt: noch kein Label', (await labelsOf(ann.id)).length === 0)

    const annCookie = await loginOn(HOST_A, ann)
    // Der BESUCH allein darf nichts vergeben — das ist die Umkehrung von A4.
    await call(HOST_A, '/api/auth/me', { cookie: annCookie })
    await call(HOST_A, '/', { cookie: annCookie })
    check('eingeloggter BESUCH vergibt kein Label mehr (A5)',
      (await labelsOf(ann.id)).length === 0, JSON.stringify(await labelsOf(ann.id)))

    await contributeOn(HOST_A, annCookie)
    const ben = await signupOn(HOST_B, 'ben') // Anmeldung AUF dem Host = Beitritt
    const benCookie = ben.cookie ?? await loginOn(HOST_B, ben)

    const annLabels = await labelsOf(ann.id)
    const benLabels = await labelsOf(ben.id)
    check('Ann trägt nach ihrem ersten Beitrag GENAU ein Label (ihr Host)',
      annLabels.length === 1, JSON.stringify(annLabels))
    check('Ben trägt nach der Anmeldung auf seinem Host GENAU ein Label',
      benLabels.length === 1, JSON.stringify(benLabels))
    check('die beiden Labels sind VERSCHIEDEN (zwei Communities)',
      annLabels[0] !== benLabels[0], `${annLabels[0]} / ${benLabels[0]}`)
    check('Nick (macht nirgends mit) trägt keines',
      (await labelsOf(nick.id)).length === 0)

    console.log('\n7. Mehrfach-Mitgliedschaft + Idempotenz')
    await contributeOn(HOST_B, await loginOn(HOST_B, ann))
    const annBoth = await labelsOf(ann.id)
    check('Ann in ZWEI Communities → zwei Labels (additiv, nichts geht verloren)',
      annBoth.length === 2 && annBoth.includes(annLabels[0]) && annBoth.includes(benLabels[0]),
      JSON.stringify(annBoth))
    for (let i = 0; i < 3; i++) await call(HOST_A, '/api/auth/me', { cookie: annCookie })
    check('weitere Besuche ändern nichts (idempotent)',
      (await labelsOf(ann.id)).length === 2, JSON.stringify(await labelsOf(ann.id)))

    console.log('\n8. Heartbeat schreibt die Grenze — Gegenprobe zwischen zwei Mandanten')
    // Zweites Mitglied von Kunde B. Die Anmeldung IST der Beitritt (A5) — es
    // braucht keinen zusätzlichen Besuch mehr, damit Carl das Label trägt.
    const carl = await signupOn(HOST_B, 'carl')
    const hb = await call(HOST_B, '/api/presence/heartbeat', {
      method: 'POST', cookie: benCookie, body: { scope: 'post:demo' },
    })
    check('Heartbeat auf Kunde B → 200', hb.status === 200, `Status ${hb.status}`)
    created.presences.push(ben.id)
    const written = await adminPresences.get({ presenceId: ben.id })
    const perms = written.$permissions ?? []
    check(`geschriebene Permission ist read("label:${benLabels[0]}")`,
      perms.includes(`read("label:${benLabels[0]}")`), JSON.stringify(perms))
    check('und KEIN read("users") mehr', perms.length > 0 && !perms.includes('read("users")'),
      JSON.stringify(perms))

    // Jetzt lesen wie der Browser: mit echten Sessions, an unserem Code vorbei.
    const asSession = async (userId) => {
      const s = await adminUsers.createSession({ userId })
      return { id: userId, presences: new Presences(new Client().setEndpoint(endpoint).setProject(projectId).setSession(s.secret)) }
    }
    const nickSees = await asSession(nick.id) // eingeloggt, aber in KEINER Community
    const carlSees = await asSession(carl.id) // Mitglied von Kunde B
    check('Nick (eingeloggt, fremde/keine Community) sieht Bens Presence NICHT',
      !(await sees(nickSees, { id: ben.id })), 'Leck offen!')
    check('Carl (Mitglied von Kunde B) sieht sie', await sees(carlSees, { id: ben.id }),
      'Mitglieder sehen sich nicht mehr!')
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n9. Aufräumen')
  for (const id of created.presences) await adminPresences.delete({ presenceId: id }).catch(() => {})
  // Die Beitritts-Auslöser hinterlassen echte Kommentare (Akt 2) — und im
  // Control Plane je Beitritt eine community_members-Zeile. Die Zeilen bleiben
  // bewusst stehen: dieses Skript hat keinen Control-Plane-Schlüssel, und mit
  // dem gelöschten Nutzer zeigen sie auf niemanden mehr. Wer aufräumen will,
  // nimmt packages/onboarding/scripts/verify-site-authz.mjs — das hat beide.
  if (created.comments.length > 0) {
    const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
    const dbId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
    for (const id of created.comments) {
      await poolDb.deleteRow({ databaseId: dbId, tableId: 'comments', rowId: id }).catch(() => {})
    }
  }
  for (const id of created.users) await adminUsers.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ ${created.users.length} Nutzer + ${created.presences.length} Presences + ${created.comments.length} Kommentare entfernt`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

#!/usr/bin/env node
/**
 * courses im Pool — LIVE-Isolationsbeweis über die ECHTE API (Muster
 * events/verify-pool-isolation + events/verify-site-authz, zusammengelegt).
 *
 * Fährt den echten Kundenpfad gegen den laufenden Platform-Dev-Server
 * (Default Port 3150) mit Host-Headern der beiden LOKALEN Tenants
 * kunde-a.localhost / kunde-b.localhost:
 *
 *   1. Produkt-Gate: courses ist ab Plan pro — auf Plan basic antwortet die
 *      Galerie 404 (Katalog pukalani.tenancy.products), auf pro 401 (das Produkt
 *      existiert, es fehlt nur die Anmeldung).
 *   2. Ein community_members-OWNER auf kunde-a OHNE jedes Operator-Label legt Kurs
 *      + Lektion an (Datentür stempelt tenantId — per Admin-SDK nachgeprüft).
 *   3. Galerie/Detail/Enroll/Lektions-Content bei B sehen davon NICHTS
 *      (404), bei A alles (200/201).
 *   4. Verwaltung: derselbe Owner ist auf kunde-b draußen (403) — die Rolle
 *      reist nicht mit; ein Fremder ohne Rolle ebenfalls 403, ein Gast 401.
 *   5. Operator-Break-Glass (globales admin-Label): kommt auf kunde-b durch
 *      (200, protokolliert) und sieht den A-Kurs TROTZDEM nicht — beim
 *      Admin-Client ist die Tür die EINZIGE Grenze. Schreibzugriffe auf die
 *      A-Zeilen von B aus enden mit 404.
 *   6. Slug pro Mandant (courses-002): derselbe Slug auf B → 201 statt 409.
 *
 * node:http über ::1, weil fetch den Host-Header verwirft und Nitro auf [::1]
 * hört. Setzt die Tenant-Pläne temporär auf 'pro' (Resolver-Cache 30 s →
 * Warte-Schleife) und stellt sie am Ende wieder her; räumt Kurse, Lektionen,
 * Buchungen, Fortschritt, Mitgliedschaft und Test-User auch im Fehlerfall weg.
 *
 * Aus packages/courses (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3150)
const HOST_A = process.env.TENANT_A_HOST || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_B_HOST || 'kunde-b.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const poolKey = process.env.NUXT_APPWRITE_KEY
const controlEndpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
const controlProject = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
const controlDb = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
const controlKey = process.env.NUXT_PLATFORM_CONTROL_KEY

if (!endpoint || !poolProject || !databaseId || !poolKey || !controlEndpoint || !controlProject || !controlDb || !controlKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/platform/.env aufrufen.')
  process.exit(1)
}

const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const control = new TablesDB(new Client().setEndpoint(controlEndpoint).setProject(controlProject).setKey(controlKey))

let pass = 0
let fail = 0
const cleanup = { users: [], courses: [], lessons: [], members: [], planRestore: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
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

async function createUser(tag, labels = []) {
  const email = `courses-iso-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Courses-Iso ${tag}` })
  cleanup.users.push(user.$id)
  if (labels.length) await poolUsers.updateLabels({ userId: user.$id, labels })
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  const cookie = res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  return cookie
}

async function tenantRowByHost(host) {
  const res = await control.listRows({
    databaseId: controlDb, tableId: 'communities',
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  return res.rows[0] ?? null
}

async function waitFor(label, fn, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await fn()) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  console.error(`  ✗ Timeout: ${label}`)
  return false
}

const slug = `iso-kurs-${Date.now()}`

try {
  console.log(`\ncourses-Pool-Isolation gegen http://[::1]:${PORT} (Pool ${poolProject})\n`)

  const tenantA = await tenantRowByHost(HOST_A)
  const tenantB = await tenantRowByHost(HOST_B)
  if (!tenantA || !tenantB) {
    console.error(`✗ Lokale Tenants ${HOST_A}/${HOST_B} nicht gefunden — zuerst seeden.`)
    process.exit(1)
  }

  console.log('1. Produkt-Gate (courses = ab Plan pro)')
  // Beide Tenants stehen lokal auf plan null (= basic) → die Galerie muss 404
  // sein. Warte-Schleife: der Host-Resolver cacht 30 s.
  const gatedClosed = await waitFor('Produkt-Gate zu (Plan basic → 404)', async () => {
    const res = await call(HOST_A, '/api/courses')
    return res.status === 404
  })
  check('Plan basic → /api/courses antwortet 404 (Produkt existiert nicht)', gatedClosed)

  cleanup.planRestore.push({ id: tenantA.$id, plan: tenantA.plan ?? null }, { id: tenantB.$id, plan: tenantB.plan ?? null })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantA.$id, data: { plan: 'pro' } })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantB.$id, data: { plan: 'pro' } })
  const planLive = await waitFor('Plan-Upgrade sichtbar (Resolver-Cache 30 s)', async () => {
    const [a, b] = await Promise.all([call(HOST_A, '/api/courses'), call(HOST_B, '/api/courses')])
    return a.status === 401 && b.status === 401
  })
  check('Plan pro → /api/courses antwortet 401 statt 404 (Produkt da, Anmeldung fehlt)', planLive)

  console.log('\n2. Site-Owner OHNE Operator-Label legt auf A an')
  const owner = await createUser('owner')
  const member = await control.createRow({
    databaseId: controlDb, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId: tenantA.$id,
      runtimeProjectId: tenantA.projectId,
      runtimeUserId: owner.userId,
      role: 'owner',
      status: 'active',
    },
  })
  cleanup.members.push(member.$id)
  const ownerAfter = await poolUsers.get({ userId: owner.userId })
  check('Owner trägt KEIN Operator-Label', !(ownerAfter.labels ?? []).some(l => l === 'admin' || l === 'moderator'), JSON.stringify(ownerAfter.labels))

  const ownerCookie = await login(HOST_A, owner)

  const created = await call(HOST_A, '/api/courses', {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Iso-Kurs A', slug, description: 'Gehört Kunde A.', access: 'free', status: 'published' },
  })
  const courseId = created.json?.$id
  check('POST /api/courses auf A → 201 (Site-Rolle genügt, kein globales Label)', created.status === 201 && !!courseId, `Status ${created.status} ${created.text.slice(0, 160)}`)
  if (courseId) cleanup.courses.push(courseId)

  // TenantContext.tenantId = tenants.tenantId (Scope-Wert der Datenzeilen);
  // tenants.$id ist die communityId (Label-Schlüssel) — zwei Schlüssel, ein Tenant.
  const rawCourse = courseId ? await pool.getRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => null) : null
  check('Tür hat communityId von A gestempelt (nie vom Aufrufer)', rawCourse?.communityId === tenantA.tenantId, `communityId=${rawCourse?.communityId}, erwartet ${tenantA.tenantId}`)

  const lessonRes = await call(HOST_A, `/api/courses/${courseId}/lessons`, {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Lektion 1', content: 'Nur für Kunde A.', status: 'published' },
  })
  const lessonId = lessonRes.json?.$id
  check('POST Lektion auf A → 201', lessonRes.status === 201 && !!lessonId, `Status ${lessonRes.status} ${lessonRes.text.slice(0, 160)}`)
  if (lessonId) cleanup.lessons.push(lessonId)
  const rawLesson = lessonId ? await pool.getRow({ databaseId, tableId: 'lessons', rowId: lessonId }).catch(() => null) : null
  check('Tür hat communityId auch auf die Lektion gestempelt', rawLesson?.communityId === tenantA.tenantId, `communityId=${rawLesson?.communityId}`)

  console.log('\n3. Mitglieder-Sicht: der Nachbar sieht nichts')
  const stranger = await createUser('stranger')
  const strangerCookie = await login(HOST_B, stranger)

  const galleryA = await call(HOST_A, '/api/courses', { cookie: ownerCookie })
  const galleryB = await call(HOST_B, '/api/courses', { cookie: strangerCookie })
  check('A sieht seinen Kurs in der Galerie', galleryA.status === 200 && (galleryA.json?.rows ?? []).some(r => r.$id === courseId), `Status ${galleryA.status}`)
  check('B sieht den A-Kurs NICHT (Liste gescopt)', galleryB.status === 200 && !(galleryB.json?.rows ?? []).some(r => r.$id === courseId), `Status ${galleryB.status}`)

  const detailA = await call(HOST_A, `/api/courses/${slug}`, { cookie: ownerCookie })
  const detailB = await call(HOST_B, `/api/courses/${slug}`, { cookie: strangerCookie })
  check('A liest sein Kurs-Detail per Slug (200)', detailA.status === 200, `Status ${detailA.status}`)
  check('B bekommt denselben Slug nicht (404)', detailB.status === 404, `Status ${detailB.status}`)

  const enrollB = await call(HOST_B, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: strangerCookie })
  check('B kann sich nicht in den A-Kurs einschreiben (404)', enrollB.status === 404, `Status ${enrollB.status}`)
  const enrollA = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: ownerCookie })
  check('A schreibt sich ein (201)', enrollA.status === 201, `Status ${enrollA.status} ${enrollA.text.slice(0, 160)}`)

  const lessonFromB = await call(HOST_B, `/api/lessons/${lessonId}`, { cookie: strangerCookie })
  check('B bekommt den Lektions-CONTENT per ID nicht (404)', lessonFromB.status === 404, `Status ${lessonFromB.status}`)
  const lessonFromA = await call(HOST_A, `/api/lessons/${lessonId}`, { cookie: ownerCookie })
  check('A liest den Lektions-Content (200, nach Enrollment)', lessonFromA.status === 200, `Status ${lessonFromA.status} ${lessonFromA.text.slice(0, 160)}`)
  const completeFromB = await call(HOST_B, `/api/lessons/${lessonId}/complete`, { method: 'POST', cookie: strangerCookie })
  check('B kann den A-Fortschritt nicht schreiben (404)', completeFromB.status === 404, `Status ${completeFromB.status}`)

  console.log('\n4. Verwaltung: die Site-Rolle reist nicht mit')
  const manageA = await call(HOST_A, '/api/courses/manage', { cookie: ownerCookie })
  check('Owner: GET /api/courses/manage auf A → 200 und enthält den Kurs', manageA.status === 200 && (manageA.json?.rows ?? []).some(r => r.$id === courseId), `Status ${manageA.status}`)
  const manageBOwner = await call(HOST_B, '/api/courses/manage', { cookie: ownerCookie })
  check('Derselbe Owner auf kunde-b → 403', manageBOwner.status === 403, `Status ${manageBOwner.status}`)
  const manageBStranger = await call(HOST_B, '/api/courses/manage', { cookie: strangerCookie })
  check('Eingeloggt ohne Rolle → 403', manageBStranger.status === 403, `Status ${manageBStranger.status}`)
  const manageGuest = await call(HOST_A, '/api/courses/manage')
  check('Gast ohne Session → 401', manageGuest.status === 401, `Status ${manageGuest.status}`)

  console.log('\n5. Operator-Break-Glass (globales admin-Label) — die Tür bleibt')
  const operator = await createUser('operator', ['admin'])
  const opCookie = await login(HOST_B, operator)
  const opManageB = await call(HOST_B, '/api/courses/manage', { cookie: opCookie })
  check('Operator kommt auf kunde-b durch (200, protokolliert)', opManageB.status === 200, `Status ${opManageB.status}`)
  check('… sieht den A-Kurs dort TROTZDEM nicht (Tür = einzige Grenze)', !(opManageB.json?.rows ?? []).some(r => r.$id === courseId))
  const opDetailB = await call(HOST_B, `/api/courses/${courseId}/manage`, { cookie: opCookie })
  check('Builder-Detail des A-Kurses von B aus → 404', opDetailB.status === 404, `Status ${opDetailB.status}`)
  const opPatchB = await call(HOST_B, `/api/courses/${courseId}`, { method: 'PATCH', cookie: opCookie, body: { title: 'Übernahme' } })
  check('PATCH des A-Kurses von B aus → 404', opPatchB.status === 404, `Status ${opPatchB.status}`)
  const opLessonB = await call(HOST_B, `/api/courses/${courseId}/lessons`, { method: 'POST', cookie: opCookie, body: { title: 'Fremd', content: 'x' } })
  check('Lektion in den A-Kurs von B aus → 404', opLessonB.status === 404, `Status ${opLessonB.status}`)
  if (opLessonB.json?.$id) cleanup.lessons.push(opLessonB.json.$id)
  const opLessonDelB = await call(HOST_B, `/api/lessons/${lessonId}`, { method: 'DELETE', cookie: opCookie })
  check('A-Lektion von B aus löschen → 404', opLessonDelB.status === 404, `Status ${opLessonDelB.status}`)
  const stillThere = lessonId ? await pool.getRow({ databaseId, tableId: 'lessons', rowId: lessonId }).catch(() => null) : null
  check('… die A-Lektion existiert unverändert weiter', !!stillThere && stillThere.title === 'Lektion 1', `title=${stillThere?.title}`)
  console.log('  ℹ Break-Glass-Protokoll: im Dev-Server-Log muss "site.operator_access" mit capability=courses.manage stehen')

  console.log('\n6. Slug gehört dem Mandanten (courses-002: uq_tenant_slug)')
  const sameSlugOnB = await call(HOST_B, '/api/courses', {
    method: 'POST', cookie: opCookie,
    body: { title: 'Gleicher Slug bei B', slug, description: 'Gehört Kunde B.', access: 'free', status: 'draft' },
  })
  check('Derselbe Slug bei B → 201 statt 409 (Unique ist tenant-relativ)', sameSlugOnB.status === 201, `Status ${sameSlugOnB.status} ${sameSlugOnB.text.slice(0, 160)}`)
  if (sameSlugOnB.json?.$id) cleanup.courses.push(sameSlugOnB.json.$id)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n7. Aufräumen')
  // Buchungen/Fortschritt hängen an den Kursen — vor den Kursen weg.
  for (const courseId of cleanup.courses) {
    for (const table of ['enrollments', 'lesson_progress']) {
      const rows = await pool.listRows({ databaseId, tableId: table, queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) await pool.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
    }
    const lessons = await pool.listRows({ databaseId, tableId: 'lessons', queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
    for (const row of lessons.rows) await pool.deleteRow({ databaseId, tableId: 'lessons', rowId: row.$id }).catch(() => {})
    await pool.deleteRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => {})
  }
  for (const id of cleanup.lessons) await pool.deleteRow({ databaseId, tableId: 'lessons', rowId: id }).catch(() => {})
  for (const id of cleanup.members) await control.deleteRow({ databaseId: controlDb, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  for (const { id, plan } of cleanup.planRestore) {
    await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: id, data: { plan } }).catch(() => {})
  }
  console.log(`  ✔ aufgeräumt (${cleanup.courses.length} Kurs(e), ${cleanup.members.length} Mitgliedschaft(en), ${cleanup.users.length} User, Pläne zurückgesetzt)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

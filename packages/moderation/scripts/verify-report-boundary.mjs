#!/usr/bin/env node
/**
 * MODERATIONS-AUDIT BEFUND 1 — DIE GRENZE EINER MELDUNG, in beide Richtungen
 * bewiesen, und zwar auf der REALTIME-EBENE (nicht nur an der Route).
 *
 * DER BEFUND: `/api/reports` setzte die Row-Permissions von Hand und benutzte
 * dafür die GLOBALEN Betreiber-Labels `read("label:admin")` /
 * `read("label:moderator")`. Das war nach beiden Seiten falsch:
 *
 *   (a) Ein Kunden-Moderator im Pool trägt diese Labels NICHT — seine Rolle
 *       steht in `community_members`. Appwrite lieferte ihm also KEINE
 *       Realtime-Ereignisse für `reports`; die Queue in
 *       /dashboard/comments behauptete „live" und lud nur beim Neuladen.
 *   (b) Wer ein globales Betreiber-Label trägt, las per Realtime die
 *       Meldungen ALLER Communities des geteilten Pool-Projekts.
 *
 * WARUM DIE ROUTE ALS BEWEIS NICHT GENÜGT: `/api/reports` liest über den
 * Admin-Client und ist per `reports.moderate` gegatet — sie war NIE das Leck.
 * Das Leck lag eine Ebene tiefer, in den Permissions der ZEILE, und die
 * entscheiden, was ein Browser über WebSocket zu sehen bekommt. Dieses Skript
 * liest deshalb wie der Browser: mit echten Sessions, direkt gegen Appwrite,
 * an unserem Code vorbei. Sieht eine Session die Zeile nicht, bekommt sie auch
 * kein Realtime-Ereignis dazu — das ist dieselbe Prüfung, nur ohne Socket.
 *
 * ZWEI AKTE (Muster: core/scripts/verify-presence-boundary.mjs):
 *   Akt 1 — der MECHANISMUS, direkt gegen Appwrite. Braucht keinen Server.
 *           Zeigt VORHER (globale Labels: das Leck) und NACHHER (das
 *           abgeleitete Moderations-Label: Team ja, Mitglied nein, fremdes
 *           Team nein, Betreiber nein).
 *   Akt 2 — der ECHTE PFAD durch unseren Code, wenn ein Platform-Dev-Server
 *           läuft: melden über /api/reports und nachsehen, welche Permissions
 *           die Route wirklich geschrieben hat. Ohne Server wird Akt 2
 *           übersprungen (mit Hinweis), nicht als Fehler gewertet.
 *
 * Läuft gegen die Instanz aus der Env — nie hartkodiert Prod. Legt Wegwerf-
 * Nutzer/Zeilen an und räumt sie (auch im Fehlerfall) wieder weg.
 *
 *   node --env-file=apps/platform/.env packages/moderation/scripts/verify-report-boundary.mjs
 *   # Akt 2 zusätzlich: `pnpm --filter platform dev` in einem zweiten Terminal
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen (Runtime-Key mit users/sessions/rows).')
  process.exit(1)
}

const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const adminUsers = new Users(admin)
const adminDb = new TablesDB(admin)

const REPORTS_TABLE = 'reports'

// Zwei erfundene, aber FORMGÜLTIGE Community-Ids (alphanumerisch ≤36 — genau
// das, was Appwrite als Label akzeptiert und was tenants.$id liefert).
const stamp = Date.now().toString(36)
const SITE_A = `mbsiteA${stamp}`
const SITE_B = `mbsiteB${stamp}`
/** Muss Zeichen für Zeichen zu core/shared/communityModeratorLabel.ts passen. */
const modLabel = communityId => `mod${communityId}`

const created = { users: [], reports: [] }
let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** Ein Nutzer mit genau diesen Labels + eine echte Session (= „der Browser"). */
async function actor(tag, labels) {
  const email = `mb-${tag}-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await adminUsers.create({ userId: ID.unique(), email, password, name: `MB ${tag}` })
  created.users.push(user.$id)
  if (labels.length > 0) await adminUsers.updateLabels({ userId: user.$id, labels })
  // Session statt API-Key: nur so gelten die Row-Permissions überhaupt — ein
  // Key umgeht sie absichtlich und würde jede Grenze „bestehen".
  const session = await adminUsers.createSession({ userId: user.$id })
  return {
    id: user.$id,
    tag,
    email,
    password,
    db: new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret)),
  }
}

/**
 * Eine Meldung mit genau den Rechten schreiben, die geprüft werden.
 *
 * Jede bekommt ihr EIGENES Ziel: der Unique-Index `reporter_target` lässt pro
 * (Melder, Ziel) nur eine Zeile zu — mit demselben Ziel scheiterte hier schon
 * die zweite Prüfung an einem 409, das wie ein Grenz-Fehler aussah.
 */
let targetCounter = 0
async function writeReport(reporter, communityId, permissions) {
  const targetId = `mb-target-${stamp}-${targetCounter++}`
  const row = await adminDb.createRow({
    databaseId,
    tableId: REPORTS_TABLE,
    rowId: ID.unique(),
    data: {
      reporterId: reporter.id,
      targetType: 'verify',
      targetId,
      reason: 'spam',
      note: 'Beweis-Zeile — wird wieder entfernt.',
      status: 'open',
      resolvedBy: null,
      resolution: null,
      communityId,
    },
    permissions,
  })
  created.reports.push(row.$id)
  return row
}

/** Sieht `viewer` diese Meldung? (genau die Frage, die auch Realtime stellt) */
async function sees(viewer, reportId) {
  try {
    const res = await viewer.db.listRows({
      databaseId, tableId: REPORTS_TABLE, queries: [Query.equal('$id', reportId), Query.limit(1)],
    })
    return res.rows.length > 0
  }
  catch {
    // 401/403 = erst recht kein Zugriff
    return false
  }
}

// ── Akt 2: durch unseren eigenen Code ───────────────────────────────────────
const PORT = Number(process.env.PLATFORM_PORT || 3006)
const HOST_A = process.env.TENANT_HOST_A || 'kunde-a.localhost'

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

async function loginOn(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

try {
  console.log(`\nBefund 1 — Melde-Grenze gegen ${endpoint} / Projekt ${projectId}`)
  console.log(`Community A = ${SITE_A} · Community B = ${SITE_B}\n`)

  // Vier Sessions, die zusammen die ganze Frage stellen.
  const melder = await actor('melder', [SITE_A]) // gewöhnliches Mitglied A, hat gemeldet
  const mitglied = await actor('mitglied', [SITE_A]) // gewöhnliches Mitglied A
  const modA = await actor('modA', [SITE_A, modLabel(SITE_A)]) // Moderator von A
  const modB = await actor('modB', [SITE_B, modLabel(SITE_B)]) // Moderator von B
  const betreiber = await actor('betreiber', ['admin']) // globales Betreiber-Label

  console.log('1. VORHER — globale Labels: der Befund, reproduziert')
  const alt = await writeReport(melder, SITE_A, [
    `read("user:${melder.id}")`,
    'read("label:admin")',
    'read("label:moderator")',
  ])
  check('der FREMDE Betreiber sieht die Meldung — das ist Leck (b)',
    await sees(betreiber, alt.$id))
  check('der Moderator DIESER Community sieht sie NICHT — das ist Loch (a)',
    !(await sees(modA, alt.$id)), 'sollte im Alt-Zustand blind sein')

  console.log('\n2. NACHHER — read("label:mod<communityId>"): die Grenze zieht Appwrite')
  const neu = await writeReport(melder, SITE_A, [
    `read("user:${melder.id}")`,
    `read("label:${modLabel(SITE_A)}")`,
    `update("user:${melder.id}")`,
    `delete("user:${melder.id}")`,
  ])
  check('der Moderator DIESER Community SIEHT sie (Live-Aktualisierung möglich)',
    await sees(modA, neu.$id), 'Grenze sperrt die eigenen Leute aus!')
  check('der Melder sieht seine eigene Meldung', await sees(melder, neu.$id))
  check('ein gewöhnliches MITGLIED derselben Community sieht sie NICHT',
    !(await sees(mitglied, neu.$id)), 'Meldungen sind kein Mitglieder-Inhalt!')
  check('der Moderator einer FREMDEN Community sieht sie NICHT',
    !(await sees(modB, neu.$id)), 'Leck offen!')
  check('ein FREMDER Betreiber (globales Label) sieht sie NICHT MEHR',
    !(await sees(betreiber, neu.$id)), 'Leck (b) offen!')

  console.log('\n3. Fail-closed: Pool-Zeile ohne bildbares Moderations-Label')
  // tenantReadRolesFor gibt ohne communityId ein LEERES Read-Set zurück. Das
  // muss „niemand" heißen, nicht „alle" — sonst wäre der Datenfehler ein Leck.
  const blind = await writeReport(melder, '', [`read("user:${melder.id}")`])
  check('niemand außer dem Melder sieht sie',
    !(await sees(modA, blind.$id)) && !(await sees(betreiber, blind.$id)) && await sees(melder, blind.$id),
    'nicht fail-closed!')

  console.log('\n4. Der Angreifer hat keinen Sonderweg')
  const guest = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId))
  let guestSees = false
  try {
    const res = await guest.listRows({
      databaseId, tableId: REPORTS_TABLE, queries: [Query.equal('$id', neu.$id), Query.limit(1)],
    })
    guestSees = res.rows.length > 0
  }
  catch { guestSees = false }
  check('ohne Session (Gast) kommt nichts heraus', guestSees === false)

  // ══════════ AKT 2 — derselbe Beweis, aber durch unseren Code ══════════
  console.log('\n── Akt 2: der echte Pfad (/api/reports schreibt die Grenze) ──')
  const alive = await call(HOST_A, '/api/health').catch(() => null)
  if (!alive) {
    console.log(`  ⓘ übersprungen — kein Platform-Server auf Port ${PORT}`)
    console.log('    (starten mit `pnpm --filter platform dev`, dann erneut laufen lassen)')
  }
  else {
    const themes = await call(HOST_A, '/api/themes')
    if (themes.status !== 200) throw new Error(`Mandanten-Host ${HOST_A} antwortet nicht (${themes.status})`)

    // Ein echtes Ziel im echten Mandanten: erst kommentieren, dann melden.
    // (Seit Befund 8 prüft die Route die Existenz des Ziels — ein erfundenes
    // targetId wäre jetzt zu Recht ein 404.)
    const autor = await actor('autor', [])
    const autorCookie = await loginOn(HOST_A, autor)
    const posted = await call(HOST_A, '/api/comments', {
      method: 'POST',
      cookie: autorCookie,
      body: { targetId: `mb-thread-${stamp}`, targetType: 'verify', content: 'Beweis-Kommentar.' },
    })
    const commentId = posted.json?.$id ?? posted.json?.comment?.$id
    check('Kommentar als Melde-Ziel angelegt', !!commentId, `${posted.status} ${posted.text.slice(0, 160)}`)

    const kritiker = await actor('kritiker', [])
    const kritikerCookie = await loginOn(HOST_A, kritiker)
    const reported = await call(HOST_A, '/api/reports', {
      method: 'POST',
      cookie: kritikerCookie,
      body: { targetType: 'comment', targetId: commentId, reason: 'spam' },
    })
    check('Melden geht (200)', reported.status === 200, `${reported.status} ${reported.text.slice(0, 200)}`)
    const reportId = reported.json?.report?.$id
    if (reportId) created.reports.push(reportId)

    if (reportId) {
      const row = await adminDb.getRow({ databaseId, tableId: REPORTS_TABLE, rowId: reportId })
      const perms = row.$permissions ?? []
      check('die Zeile trägt den Mandanten-Stempel', !!row.communityId,
        JSON.stringify({ communityId: row.communityId }))

      /**
       * ZWEI SCHLÜSSEL FÜR DENSELBEN MANDANTEN — hier sichtbar: die
       * `communityId`-SPALTE trägt den Zeilen-Scope (`tenantId`-Wert, z. B.
       * 't-kunde-a'), das LABEL leitet sich dagegen von `tenants.$id` ab
       * (tenantRowPermissionsFor: „$id hat die einzige alnum-Garantie").
       * Die $id lebt im CONTROL-Projekt; dieses Skript hat nur den Pool-Key
       * und kann sie deshalb nicht nachschlagen. Geprüft wird darum die FORM
       * (genau EIN Label-Read, mit dem Moderations-Präfix) — und danach die
       * WIRKUNG mit echten Sessions, was ohnehin die härtere Aussage ist.
       */
      const labelReads = perms.filter(p => p.startsWith('read("label:'))
      const written = labelReads[0]?.match(/^read\("label:(mod[a-zA-Z0-9]+)"\)$/)?.[1] ?? ''
      check('GENAU EIN Label darf lesen — und es ist ein Moderations-Label',
        labelReads.length === 1 && !!written, JSON.stringify(perms))
      check('und KEIN read("label:admin")/read("label:moderator") mehr (der Befund)',
        !perms.includes('read("label:admin")') && !perms.includes('read("label:moderator")'),
        JSON.stringify(perms))
      check('und kein Mitglieder-Read auf der Community (Meldung ≠ Inhalt)',
        !perms.some(p => p === `read("label:${written.slice(3)}")`), JSON.stringify(perms))
      check('der Melder darf lesen und zurückziehen',
        perms.includes(`read("user:${kritiker.id}")`) && perms.includes(`delete("user:${kritiker.id}")`),
        JSON.stringify(perms))

      // Und jetzt lesen wie der Browser: mit echten Sessions, an unserem Code
      // vorbei. Genau das entscheidet, wer ein Realtime-Ereignis bekommt.
      const echterMod = await actor('echtmod', written ? [written] : [])
      const nurMitglied = await actor('nurmitglied', written ? [written.slice(3)] : [])
      const fremderMod = await actor('fremdmod', [modLabel(SITE_B)])
      check('WER DAS MODERATIONS-LABEL TRÄGT, SIEHT DIE ECHTE MELDUNG',
        await sees(echterMod, reportId), 'Moderator bleibt blind — keine Live-Aktualisierung!')
      check('ein gewöhnliches Mitglied DERSELBEN Community sieht sie NICHT',
        !(await sees(nurMitglied, reportId)), 'Leck!')
      check('ein FREMDES Moderations-Team sieht sie NICHT',
        !(await sees(fremderMod, reportId)), 'Leck offen!')
      check('ein globales Betreiber-Label sieht sie NICHT',
        !(await sees(betreiber, reportId)), 'Leck (b) offen!')

      console.log('\n5. Befund 2 + 3 auf demselben Weg')
      const nochmal = await call(HOST_A, '/api/reports', {
        method: 'POST',
        cookie: kritikerCookie,
        body: { targetType: 'comment', targetId: commentId, reason: 'spam' },
      })
      check('zweite Meldung → 409 mit reason „already_reported" (kein 200-„ok" mehr)',
        nochmal.status === 409 && nochmal.json?.reason === 'already_reported',
        `${nochmal.status} ${nochmal.text.slice(0, 200)}`)

      const unbekannt = await call(HOST_A, '/api/reports', {
        method: 'POST',
        cookie: kritikerCookie,
        body: { targetType: 'event', targetId: commentId, reason: 'spam' },
      })
      check('Befund 8: nicht registrierter Ziel-Typ → 400 unknown_target',
        unbekannt.status === 400 && unbekannt.json?.reason === 'unknown_target',
        `${unbekannt.status} ${unbekannt.text.slice(0, 200)}`)

      const phantom = await call(HOST_A, '/api/reports', {
        method: 'POST',
        cookie: kritikerCookie,
        body: { targetType: 'comment', targetId: 'gibtesnicht', reason: 'spam' },
      })
      check('Befund 8: erfundenes Ziel → 404 target_not_found (keine Karteileiche)',
        phantom.status === 404 && phantom.json?.reason === 'target_not_found',
        `${phantom.status} ${phantom.text.slice(0, 200)}`)

      const zurueck = await call(HOST_A,
        `/api/reports?targetType=comment&targetId=${encodeURIComponent(commentId)}`,
        { method: 'DELETE', cookie: kritikerCookie })
      check('Befund 2: Zurückziehen geht (200)', zurueck.status === 200,
        `${zurueck.status} ${zurueck.text.slice(0, 200)}`)
      const weg = await adminDb.getRow({ databaseId, tableId: REPORTS_TABLE, rowId: reportId }).catch(() => null)
      check('…und die Zeile ist wirklich weg', weg === null)
      if (weg === null) created.reports = created.reports.filter(id => id !== reportId)
    }

    if (commentId) {
      await adminDb.deleteRow({ databaseId, tableId: 'comments', rowId: commentId }).catch(() => {})
    }
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n6. Aufräumen')
  for (const id of created.reports) {
    await adminDb.deleteRow({ databaseId, tableId: REPORTS_TABLE, rowId: id }).catch(() => {})
  }
  // Akt 2 hinterlässt im Control Plane je Beitritt eine community_members-Zeile.
  // Die bleibt bewusst stehen: dieses Skript hat keinen Control-Plane-Schlüssel,
  // und mit dem gelöschten Nutzer zeigt sie auf niemanden mehr.
  for (const id of created.users) await adminUsers.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ ${created.users.length} Nutzer + ${created.reports.length} Meldungen entfernt`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

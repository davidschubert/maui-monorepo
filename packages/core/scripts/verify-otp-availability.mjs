/**
 * Beweis für F37 — DER PASSWORTLOSE LOGIN ENDET NIE IN EINER SACKGASSE.
 *
 * `pukalani.auth.otp` ist ein Schalter in der APP. Ob die Instanz ihn erfüllen
 * kann, entscheidet die Appwrite-Console („Auth → Settings → Email OTP") und
 * das SMTP der Instanz — das lässt sich aus dem Code nicht sehen. Deshalb prüft
 * dieses Skript nicht „OTP geht", sondern die HÄRTERE, immer wahre Zusage:
 *
 *   Die Route antwortet ENTWEDER mit einem Code (200) ODER mit einer ehrlichen,
 *   benannten Absage (503 + reason `otp_unavailable`, aus der die Anmeldeseite
 *   „hier gerade nicht verfügbar, nimm dein Passwort" macht).
 *   Ein generischer 500 ist in BEIDEN Welten ein Fehlschlag.
 *
 * Nebenbei sagt der Lauf im Klartext, welcher der beiden Fälle vorliegt — das
 * ist die Auskunft, die der Betreiber braucht, um in der Console nachzusehen.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/core/scripts/verify-otp-availability.mjs
 *
 * TENANT_HOST überschreibt den geprüften Host (Default: der Kontroll-Host).
 */
import { request } from 'node:http'
import { Client, ID, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const HOST = process.env.TENANT_HOST || process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !poolKey) {
  console.error('✗ Env unvollständig (NUXT_PUBLIC_APPWRITE_ENDPOINT + POOL_KEY nötig).')
  process.exit(1)
}

const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil `fetch` einen eigenen Host-Header verwirft; ::1 = Nitro. */
function call(host, path, { method = 'GET', body } = {}) {
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
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const created = []

try {
  console.log(`\nF37-OTP-Beweis gegen http://localhost:${PORT} (Host ${HOST}, Pool ${poolProject})\n`)

  // Ein BESTEHENDES Konto: so hängt die Antwort nicht daran, ob die
  // Registrierung dieses Mandanten offen ist (bei geschlossener Registrierung
  // antwortet die Route für Unbekannte bewusst mit einer Attrappe — F35).
  const email = `f37-otp-${Date.now()}@example.test`
  const user = await poolUsers.create({ userId: ID.unique(), email, password: `Pw-${ID.unique()}`, name: 'F37 OTP' })
  created.push(user.$id)

  const res = await call(HOST, '/api/auth/otp', { method: 'POST', body: { email } })
  const reason = res.json?.reason

  console.log(`  → Antwort: ${res.status} ${JSON.stringify(res.json ?? res.text.slice(0, 160))}\n`)

  check('kein generischer 500 (die alte Sackgasse)', res.status !== 500, `Status ${res.status}`)
  check('die Antwort ist ENTWEDER ein Code ODER eine benannte Absage',
    res.status === 200 || (res.status === 503 && reason === 'otp_unavailable'),
    `Status ${res.status}, reason=${reason}`)

  if (res.status === 200) {
    check('… Fall A: die Instanz kann OTP — es kommen userId + Sicherheitsphrase',
      typeof res.json?.userId === 'string' && typeof res.json?.phrase === 'string',
      JSON.stringify(res.json))
    console.log('\n  ℹ „Email OTP" ist im Appwrite-Projekt AKTIV. Nichts zu tun.')
  }
  else {
    console.log('\n  ⚠ „Email OTP" ist im Appwrite-Projekt AUS (oder die Instanz hat kein SMTP).')
    console.log('    → Appwrite-Console → Projekt → Auth → Settings → „Email OTP" einschalten.')
    console.log('    Die Oberfläche sagt das dem Nutzer inzwischen ehrlich (auth.otp.unavailable)')
    console.log('    statt „Code konnte nicht angefordert werden — bitte erneut versuchen."')
  }

  // Der Vollständigkeit halber: die Route bleibt gegen Konten-Enumeration dicht
  // (F35) — eine unbekannte Adresse sieht in der ANTWORT genauso aus.
  const unknown = await call(HOST, '/api/auth/otp', {
    method: 'POST', body: { email: `f37-unbekannt-${Date.now()}@example.test` },
  })
  check('unbekannte Adresse antwortet in derselben Form (keine Konten-Enumeration)',
    unknown.status === res.status, `${unknown.status} ≠ ${res.status}`)
  if (unknown.status === 200 && unknown.json?.userId) {
    // Offene Registrierung: Appwrite hat per Auto-Signup ein Konto angelegt.
    created.push(unknown.json.userId)
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  for (const id of created) await poolUsers.delete({ userId: id }).catch(() => {})
  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
  process.exit(fail === 0 ? 0 : 1)
}

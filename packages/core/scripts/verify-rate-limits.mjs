/**
 * Beweis für die Drossel-Grenzen des Sicherheits-Pakets vom 2026-08-02.
 *
 * Drei Routen hatten KEIN Budget, obwohl sie teuer oder gefährlich sind:
 *
 *  3. `POST /api/auth/signup` — legt Konten an UND verschickt Mail an eine frei
 *     wählbare Adresse; sie läuft über den Admin-Client und umgeht damit auch
 *     Appwrites eigenes Limit. Ungedrosselt war das ein Mail-Bombing-Werkzeug
 *     mit Konto-Müll als Nebenwirkung. Jetzt ALWAYS_LIMITED (5/min und IP) wie
 *     ihre Geschwister recovery/otp/verification.
 *  6. `POST /api/storage/<bucket>` — Avatar-Upload, bis 5 MB je Datei auf die
 *     geteilte Platte. Jetzt 30/min wie `/api/media`.
 *  7. `GET /api/presence/count` — unauthentifiziert erreichbar und pro Aufruf
 *     bis zu fünf Presences-Seiten über den ADMIN-Client. Jetzt 120/min wie
 *     die öffentlichen Kommentar-Lese-Routen.
 *
 * NEBENWIRKUNGSFREI: signup wird mit einem ungültigen Passwort gerufen (die
 * Sperr-/Validierungsprüfung schlägt vor jeder Anlage zu, das Budget zählt
 * trotzdem — ALWAYS_LIMITED zählt JEDEN Request), der Upload ohne Session
 * (401 vor jedem Schreiben), presence/count ist ohnehin nur lesend.
 *
 * Jede Prüfung bekommt eine eigene, zufällige Client-IP — sonst stören sich
 * die Läufe gegenseitig. Dass die lokal überhaupt wirkt, ist die dokumentierte
 * Grenze aus server/utils/clientIp.ts: ohne vorgelagerten nginx hängt niemand
 * die echte Adresse an, also IST das letzte Segment die des Clients.
 *
 *   node packages/core/scripts/verify-rate-limits.mjs
 *   PORT=3001 HOST=localhost node packages/core/scripts/verify-rate-limits.mjs
 */
import { request } from 'node:http'

const PORT = Number(process.env.PORT || process.env.PLATFORM_PORT || 3006)
const HOST = process.env.HOST || 'kunde-a.localhost'

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

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(path, { method = 'GET', body, clientIp, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
        ...(payload
          ? {
              'content-type': contentType ?? 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : {}),
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
    }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function freshIp() {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`
}

/**
 * Feuert `tries` Requests aus EINER IP und meldet, beim wievielten der erste
 * 429 kam (`null` = nie). Bewusst seriell: ein paralleler Schwarm könnte im
 * Fixed-Window an der Fenstergrenze stehen und das Ergebnis verwackeln.
 */
async function firstThrottled(tries, make) {
  const ip = freshIp()
  for (let i = 1; i <= tries; i++) {
    const res = await make(ip, i)
    if (res.status === 429) return i
  }
  return null
}

console.log(`\nDrossel-Beweis gegen http://localhost:${PORT} (Host ${HOST})\n`)

console.log('3. POST /api/auth/signup — 5/min und IP (ALWAYS_LIMITED)')
{
  // Ungültiges Passwort: die Route lehnt in JEDEM Fall ab, ohne ein Konto
  // anzulegen. Gezählt wird trotzdem — genau das ist der Punkt.
  const at = await firstThrottled(8, (ip, i) => call('/api/auth/signup', {
    method: 'POST',
    body: { email: `rl-${i}-${Date.now()}@example.test`, password: 'x', name: 'RL' },
    clientIp: ip,
  }))
  check('wird überhaupt gedrosselt (vorher: nie)', at !== null, 'kein 429 in 8 Versuchen')
  check('… und zwar ab dem 6. Versuch im Fenster', at === 6, `erster 429 bei #${at}`)
  // Ein anderer Anschluss ist davon unberührt — das Limit sperrt nicht die Welt aus.
  const other = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: `rl-other-${Date.now()}@example.test`, password: 'x', name: 'RL' },
    clientIp: freshIp(),
  })
  check('eine ANDERE IP hat ihr eigenes Budget', other.status !== 429, `Status ${other.status}`)
}

console.log('\n6. POST /api/storage/<bucket> — 30/min (Avatar-Upload)')
{
  const at = await firstThrottled(34, (ip, i) => call('/api/storage/avatars', {
    method: 'POST',
    body: `probe-${i}`,
    contentType: 'multipart/form-data; boundary=x',
    clientIp: ip,
  }))
  check('wird überhaupt gedrosselt (vorher: nie)', at !== null, 'kein 429 in 34 Versuchen')
  check('… und zwar ab dem 31. Versuch im Fenster', at === 31, `erster 429 bei #${at}`)
}

console.log('\n7. GET /api/presence/count — 120/min (Admin-Client-Verstärker)')
{
  const at = await firstThrottled(124, (ip, i) => call(`/api/presence/count?scope=global&n=${i}`, { clientIp: ip }))
  check('wird überhaupt gedrosselt (vorher: nie, obwohl unauthentifiziert)', at !== null, 'kein 429 in 124 Versuchen')
  check('… und zwar ab dem 121. Versuch im Fenster', at === 121, `erster 429 bei #${at}`)
}

console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
process.exit(fail === 0 ? 0 : 1)

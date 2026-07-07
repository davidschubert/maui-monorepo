/**
 * Brute-Force-/Spam-Schutz (Konzept A2): Auth-Routen nutzen den AdminClient und
 * umgehen Appwrites eingebaute Rate Limits — hier drosselt Nitro selbst. Zwei
 * Klassen:
 *  - Auth (Login/Recovery/OTP): eng, 5/min und IP.
 *  - Schreib-Endpoints (Comments/Votes/Reports): weiter, da legitime Nutzung
 *    (v.a. Voten) deutlich frequenter ist — reiner Bot-/Spam-Schutz, kein
 *    Bremsen normaler Nutzung.
 *
 * ⚠️ In-memory Map — reicht für Single-Instanz (ploi.io). Multi-Instanz-
 * Produktion braucht einen geteilten Store (z.B. Redis via Nitro Storage).
 */
const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 5
const WRITE_MAX = 60
// Presence-Heartbeats laufen legitim hochfrequent (20s-Intervall + jede
// metadata-Änderung, pro Tab) — großzügiges eigenes Budget, das nur echtes
// Hämmern (Scripting) stoppt, nie normale Multi-Tab-Nutzung.
const PRESENCE_MAX = 120
const TOKEN_MAX = 10
const PRUNE_THRESHOLD = 1_000

const attempts = new Map<string, number[]>()

function prune(now: number) {
  if (attempts.size < PRUNE_THRESHOLD) return
  for (const [key, timestamps] of attempts) {
    if (timestamps.every(ts => now - ts >= WINDOW_MS)) attempts.delete(key)
  }
}

// Routen werden je METHODE+Pfad gematcht, damit z.B. der Reset-Confirm
// (PUT /recovery) nicht das Mail-Budget des Anforderns (POST /recovery) teilt.
// Mail-versendende Routen: JEDER Request zählt (Mail-Bombing-Schutz).
const ALWAYS_LIMITED = new Set([
  'POST /api/auth/recovery',
  'POST /api/auth/otp',
])
// Credential-/Code-/Token-Prüfung: nur FEHLgeschlagene Versuche zählen — ein
// erfolgreicher Login/Reset (200) soll das Budget nicht aufbrauchen. Der
// Reset-Confirm (PUT /recovery) versendet keine Mail → hier, nicht ALWAYS.
const FAILURE_LIMITED = new Set([
  'POST /api/auth/login',
  'POST /api/auth/otp/verify',
  'PUT /api/auth/recovery',
])
// Schreib-Routen mit teils dynamischen Segmenten ([id]) → Regex + stabiler
// Bucket-Name, damit z.B. Vote-Spam über viele Kommentar-IDs EIN Budget teilt
// (statt je ID ein frisches). Jeder Request zählt. `reports/resolve` fehlt
// bewusst: schon Moderator-gated, kein offener Abuse-Vektor.
const WRITE_LIMITED: { re: RegExp, bucket: string, max?: number }[] = [
  { re: /^POST \/api\/comments$/, bucket: 'comments:create' },
  { re: /^PATCH \/api\/comments\/[^/]+$/, bucket: 'comments:edit' },
  { re: /^POST \/api\/comments\/[^/]+\/vote$/, bucket: 'comments:vote' },
  { re: /^POST \/api\/reports$/, bucket: 'reports:create' },
  // Community-Posts (Phase 25): member-led → Spam-Backstop. hide/restore
  // fehlen bewusst (Moderator-gated, wie reports/resolve).
  { re: /^POST \/api\/posts$/, bucket: 'posts:create' },
  { re: /^PATCH \/api\/posts\/[^/]+$/, bucket: 'posts:edit' },
  { re: /^POST \/api\/posts\/[^/]+\/vote$/, bucket: 'posts:vote' },
  // Presence-Schreibwege (Admin-Client-Amplifikation) + JWT-Mint: session-
  // gated, aber ein Skript/XSS soll den Server nicht ungedrosselt Appwrite-
  // Writes/JWTs erzeugen lassen. heartbeat+leave teilen EIN Budget.
  { re: /^POST \/api\/presence\/(heartbeat|leave)$/, bucket: 'presence:write', max: PRESENCE_MAX },
  { re: /^GET \/api\/auth\/realtime-token$/, bucket: 'auth:jwt', max: TOKEN_MAX },
  // Client-Error-Inbox (Observability-Gate): der Client dedupliziert/kappt
  // selbst (10/Session) — das Limit hier stoppt Scripting/kaputte Clients.
  { re: /^POST \/api\/telemetry\/error$/, bucket: 'telemetry:error', max: 30 },
]

export default defineEventHandler((event) => {
  const isWriteMethod = event.method === 'POST' || event.method === 'PUT' || event.method === 'PATCH'
  const pathname = getRequestURL(event).pathname
  const route = `${event.method} ${pathname}`
  // GET ist grundsätzlich frei — Ausnahme: explizit gelistete teure GETs (JWT-Mint).
  const write = WRITE_LIMITED.find(w => w.re.test(route))
  if (!isWriteMethod && !write) return
  const always = ALWAYS_LIMITED.has(route)
  const onFailure = FAILURE_LIMITED.has(route)
  if (!always && !onFailure && !write) return

  // Fehlt die IP (exotische Proxy-Setups), NICHT alle Clients in einen
  // gemeinsamen 'unknown'-Topf werfen (sie würden sich gegenseitig aussperren) —
  // stattdessen auf die Session-Identität ausweichen; 'unknown' nur als letzter
  // Fallback für anonyme Requests ohne IP.
  const ip = getRequestIP(event, { xForwardedFor: true })
    ?? (event.context.user ? `user:${event.context.user.$id}` : undefined)
    ?? 'unknown'
  // Eigenes Budget pro Bucket bzw. Methode+Route — Login-/Reset-Versuche und
  // verschiedene Schreib-Aktionen verbrauchen nicht gegenseitig ihr Kontingent.
  const key = `${ip}:${write ? write.bucket : route}`
  const max = write ? (write.max ?? WRITE_MAX) : MAX_ATTEMPTS
  const now = Date.now()
  prune(now)

  const recent = (attempts.get(key) ?? []).filter(ts => now - ts < WINDOW_MS)

  if (recent.length >= max) {
    const oldest = recent[0] ?? now
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)))
    throw createError({ status: 429, statusText: 'Too Many Requests' })
  }

  const record = () => {
    const r = (attempts.get(key) ?? []).filter(ts => Date.now() - ts < WINDOW_MS)
    r.push(Date.now())
    attempts.set(key, r)
  }

  if (always || write) {
    record()
  }
  else {
    // Erst nach der Antwort entscheiden: nur 4xx/5xx (Fehlversuch) zählt.
    event.node.res.once('finish', () => {
      if (event.node.res.statusCode >= 400) record()
    })
  }
})

/**
 * Brute-Force-Schutz für den Login (Konzept A2): Die Route nutzt den
 * AdminClient und umgeht damit Appwrites eingebaute Rate Limits — hier
 * drosselt Nitro selbst: 5 Versuche pro Minute und IP, danach 429.
 *
 * ⚠️ In-memory Map — reicht für Single-Instanz (ploi.io). Multi-Instanz-
 * Produktion braucht einen geteilten Store (z.B. Redis via Nitro Storage).
 */
const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 5
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

export default defineEventHandler((event) => {
  if (event.method !== 'POST' && event.method !== 'PUT') return
  const pathname = getRequestURL(event).pathname
  const route = `${event.method} ${pathname}`
  const always = ALWAYS_LIMITED.has(route)
  const onFailure = FAILURE_LIMITED.has(route)
  if (!always && !onFailure) return

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  // Eigenes Budget pro Methode+Route — Login-/Reset-Versuche verbrauchen kein
  // Recovery-Mail-Kontingent
  const key = `${ip}:${route}`
  const now = Date.now()
  prune(now)

  const recent = (attempts.get(key) ?? []).filter(ts => now - ts < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0] ?? now
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)))
    throw createError({ status: 429, statusText: 'Too Many Requests' })
  }

  const record = () => {
    const r = (attempts.get(key) ?? []).filter(ts => Date.now() - ts < WINDOW_MS)
    r.push(Date.now())
    attempts.set(key, r)
  }

  if (always) {
    record()
  }
  else {
    // Erst nach der Antwort entscheiden: nur 4xx/5xx (Fehlversuch) zählt.
    event.node.res.once('finish', () => {
      if (event.node.res.statusCode >= 400) record()
    })
  }
})

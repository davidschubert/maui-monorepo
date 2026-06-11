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

// Recovery ebenfalls drosseln: POST verschickt Mails, PUT probiert Secrets
const LIMITED = new Set(['/api/auth/login', '/api/auth/recovery'])

export default defineEventHandler((event) => {
  if (event.method !== 'POST' && event.method !== 'PUT') return
  const pathname = getRequestURL(event).pathname
  if (!LIMITED.has(pathname)) return

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  // Eigenes Budget pro Route — Login-Versuche verbrauchen kein Recovery-Kontingent
  const key = `${ip}:${pathname}`
  const now = Date.now()
  prune(now)

  const recent = (attempts.get(key) ?? []).filter(ts => now - ts < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0] ?? now
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)))
    throw createError({ status: 429, statusText: 'Too Many Requests' })
  }

  recent.push(now)
  attempts.set(key, recent)
})

/**
 * Kontroll-Hosts (Kundenbereich/Onboarding) — PURE Auflösung + Pfad-Regel.
 *
 * Hier, im shared-Bereich, weil BEIDE Seiten dieselbe Wahrheit brauchen:
 * der Server entscheidet daran über Mandant/kein Mandant und über erlaubte
 * API-Pfade, der Browser darüber, ob er den Kundenbereich statt einer
 * Community rendert. Zwei Kopien dieser Logik wären ein sicherer Weg in einen
 * Zustand, in dem die Seite den Kundenbereich zeigt, der Server aber einen
 * Mandanten erwartet.
 */

/** Kommagetrennte Env-Liste → normalisierte Hostnamen. */
export function parseControlHosts(raw: string | undefined | null): string[] {
  return (raw || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Laufzeit (Env) vor Build (app.config) — die Hosts unterscheiden sich je
 * Umgebung (lokal `app.localhost`, Prod `app.pukalani.app`).
 */
export function resolveControlHosts(envValue: string | undefined | null, configured: readonly string[] | undefined): string[] {
  const fromEnv = parseControlHosts(envValue)
  if (fromEnv.length) return fromEnv
  return (configured ?? []).map(host => host.trim().toLowerCase()).filter(Boolean)
}

export function isControlHost(host: string | undefined | null, hosts: readonly string[]): boolean {
  const normalized = (host || '').trim().toLowerCase()
  return normalized.length > 0 && hosts.includes(normalized)
}

/**
 * Darf dieser API-Pfad auf einem Kontroll-Host laufen?
 *
 * FAIL-CLOSED — nur ausdrücklich erlaubte Präfixe kommen durch. Der Grund ist
 * Datentrennung, nicht Ordnung: auf einem Host OHNE Mandanten scopt
 * `scopeQuery` nicht, `/api/comments` würde dort quer über ALLE Communities
 * des Pool-Projekts antworten. Ein neuer Endpunkt im Kundenbereich muss
 * deshalb bewusst eingetragen werden.
 *
 * Nicht-API-Pfade (Seiten, /_nuxt, /_i18n) prüft die Regel NICHT: sie liefern
 * keine Mandanten-Daten aus, und der Kundenbereich braucht eigene Seiten.
 */
export function isAllowedControlPath(path: string, prefixes: readonly string[]): boolean {
  if (!path.startsWith('/api/')) return true
  return prefixes.some(prefix => path === prefix || path.startsWith(prefix))
}

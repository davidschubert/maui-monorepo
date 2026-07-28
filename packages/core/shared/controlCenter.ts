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
 * Gegenprobe: läuft dieser Request auf einem MANDANTEN-Host? PURE.
 *
 * Für BETREIBER-Inhalte, die es auf einer Kunden-Community nicht geben darf
 * (N7: der öffentliche Changelog). Die Herleitung ist eine Ausschluss-Rechnung
 * und genau deshalb ohne aufgelösten Tenant-Kontext möglich — `00.tenant.ts`
 * beantwortet bei aktivem Gate JEDEN Request auf genau drei Arten:
 * Kontroll-Host, aufgelöster Mandant oder 404 für unbekannte Hosts. Was also
 * überhaupt rendert und kein Kontroll-Host ist, IST ein Mandanten-Host.
 * Ohne Tenant-Gate (Silo-Apps wie comments, Playground) gibt es überhaupt
 * keine Mandanten → immer false, Bestands-Apps bleiben unverändert.
 *
 * Fail-CLOSED beim unbekannten Host: der bekommt zwar schon in der Middleware
 * 404, aber die Rechnung hier würde ihn ohnehin als Mandanten-Host werten —
 * lieber ein 404 zu viel auf Betreiber-Inhalt als eines zu wenig.
 *
 * Serverseitig ist das NICHT die Wahrheit, sondern `useTenant(event)`
 * (server/utils/tenant.ts): dort liegt der wirklich aufgelöste Kontext.
 */
export function isTenantHost(
  tenancyEnabled: boolean,
  host: string | undefined | null,
  controlHosts: readonly string[],
): boolean {
  if (!tenancyEnabled) return false
  return !isControlHost(host, controlHosts)
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

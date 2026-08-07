/**
 * DIE UMLEITUNG AUF DIE KANONISCHE ADRESSE — die pure Rechnung dazu.
 *
 * Seit control-035 (eigene Domains, Davids Entscheidungen vom 2026-08-07) löst
 * eine Community unter mehreren Hosts auf: ihrer Pukalani-Subdomain, ihrer
 * eigenen Domain und deren www-/Apex-Geschwister. Genau EINER ist kanonisch;
 * alle anderen antworten dauerhaft-umgeleitet (`00.tenant.ts`).
 *
 * WARUM DIESE ZEILEN IN CORE STEHEN UND NICHT IM CONTROL-LAYER: die
 * Middleware, die sie braucht, gehört core — und ein Fundament-Layer hängt NIE
 * an einem Produkt- oder Naht-Layer (CONCEPT.md A14). WELCHER Host kanonisch
 * ist, rechnet weiterhin der control-Layer aus der `communities`-Zeile
 * (`canonicalHostFor()`); hier wird nur noch verglichen. Zwei Fragen, zwei
 * Orte: „was ist zu Hause?" gehört zu den Daten, „bin ich dort?" zum Request.
 */

/**
 * PURE (unit-getestet): muss dieser Request umgeleitet werden, und wohin?
 *
 * `null` = nein — der Request-Host IST die kanonische Adresse (oder es gibt
 * keine, etwa auf einem Kontroll-Host, im Silo oder im Playground).
 *
 * Der Pfad (inkl. Query) reist MIT. Eine Umleitung, die auf `/` wirft, macht
 * aus jedem geteilten Deep-Link eine Startseite — und aus jedem `?code=…` im
 * Einladungs-Link eine Sackgasse.
 *
 * IMMER `https`: eine eigene Domain wird erst kanonisch, wenn ihr Zertifikat
 * steht, und die Subdomain hat ihres über das Wildcard ohnehin.
 */
export function canonicalRedirectTarget(
  requestHost: string,
  canonicalHost: string | undefined,
  path: string,
): string | null {
  const from = (requestHost || '').trim().toLowerCase()
  const to = (canonicalHost || '').trim().toLowerCase()
  if (!from || !to || from === to) return null
  return `https://${to}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * PURE: der Statuscode der Umleitung.
 *
 * Davids Entscheidung sagt **301** — gemeint ist die DAUERHAFTIGKEIT. Für
 * alles außer GET/HEAD ist der richtige dauerhafte Code aber **308**: ein 301
 * lässt Browser die Methode auf GET wechseln, ein Formular-POST auf die alte
 * Adresse verlöre dabei stillschweigend seinen Rumpf. Der Nutzer sähe dann
 * eine Seite statt einer Fehlermeldung — die schlimmste Art, Daten zu
 * verlieren.
 */
export function canonicalRedirectStatus(method: string | undefined): 301 | 308 {
  const verb = (method || 'GET').toUpperCase()
  return verb === 'GET' || verb === 'HEAD' ? 301 : 308
}

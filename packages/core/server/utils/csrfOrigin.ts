/**
 * DIE CSRF-HERKUNFTSREGEL — PURE, damit sie prüfbar ist.
 *
 * ── Der Befund (Nacht-Audit 2026-08-02, F32) ──────────────────────────────
 * Die Middleware ließ `Sec-Fetch-Site: same-site` bedingungslos durch. Das war
 * richtig gedacht für eine App auf EINEM Host — aber dieses Deployment hängt
 * unter der Wildcard `*.pukalani.app`, und dort ist JEDER Mandanten-Host
 * same-site zu jedem anderen. `boese-community.pukalani.app` konnte also ein
 * Formular auf `andere-community.pukalani.app/api/...` abschicken und der
 * Browser meldete brav `same-site` — der Check winkte durch. Solange die
 * Session-Cookies `SameSite=Lax` sind, hält noch das Cookie-Flag; sobald das
 * partitionierte Embed-Cookie (`SameSite=None`) kommt — und genau dafür gibt
 * es diesen Check —, ist das ein Cross-Tenant-CSRF-Vektor.
 *
 * ── Die Regel ─────────────────────────────────────────────────────────────
 * `same-site` ist per Definition CROSS-ORIGIN. Ein Browser schickt dabei immer
 * einen `Origin`-Header. Also fällt `same-site` jetzt in denselben
 * Origin-gegen-Host-Vergleich, den `cross-site`-lose Requests schon immer
 * durchliefen — und ein `same-site` OHNE Origin ist ein Widerspruch in sich
 * und wird abgelehnt.
 *
 * Was bewusst NICHT strenger wird:
 *  - `same-origin`: der Browser hat bereits verglichen, und bei manchen
 *    gleichherkünftigen Formular-POSTs fehlt der Origin-Header. Ein
 *    Origin-Zwang würde hier echte Requests brechen, ohne etwas zu gewinnen.
 *  - `none` (Adresszeile, Lesezeichen): kein fremdes Dokument im Spiel.
 *  - Requests OHNE Sec-Fetch-Site UND ohne Origin (Server-zu-Server, z. B. der
 *    Stripe-Webhook, curl): sie tragen kein Browser-Cookie.
 *
 * DER EMBED-FLUSS BRICHT NICHT (nachgeprüft, apps/comments ist der einzige
 * aktive Konsument mit `csrfOriginCheck: true`): alle unsicheren Embed-Routen
 * werden aus einem Dokument DERSELBEN Origin gerufen — das iframe zeigt auf
 * `<widget-host>/embed` und ruft `<widget-host>/api/*`, das Login-Popup ruft
 * `/api/auth/embed-handoff` von der Widget-Origin aus, das iframe danach
 * `/api/auth/embed-session` ebenfalls. Alle melden `same-origin`. `embed.js`
 * läuft zwar auf der fremden Gastgeber-Seite, macht dort aber nur GET
 * (`/api/comments/count`) — unsichere Methoden fasst diese Regel gar nicht an.
 * Es gibt also keine Ausnahme zu ziehen.
 */

export type CsrfVerdict = 'allow' | 'reject'

export interface CsrfOriginInput {
  /** `Sec-Fetch-Site`, so wie er ankam (fehlend = alter Browser/kein Browser). */
  secFetchSite: string | undefined | null
  /** `Origin`, so wie er ankam. */
  origin: string | undefined | null
  /** Host des Requests INKLUSIVE Port (`getRequestURL(event).host`). */
  host: string
}

/** Origin-String gegen den Request-Host halten. Unparsebar (`'null'` bei
 *  sandboxed iframes, Müll) zählt als fremd. */
function originMatchesHost(origin: string, host: string): boolean {
  try {
    // `host` (nicht `hostname`) — der Port gehört zur Herkunft: unter
    // localhost sind :3000 und :3001 same-site, aber nicht dieselbe Origin.
    return new URL(origin).host === host
  }
  catch {
    return false
  }
}

/** PURE (unit-getestet): darf dieser unsichere Request passieren? */
export function csrfOriginVerdict({ secFetchSite, origin, host }: CsrfOriginInput): CsrfVerdict {
  const site = (secFetchSite ?? '').trim()
  const from = (origin ?? '').trim()

  if (site === 'cross-site') return 'reject'
  if (site === 'same-origin' || site === 'none') return 'allow'

  if (site === 'same-site') {
    // Kein Origin bei einem cross-origin-Request: kein echter Browser-Kontext,
    // also auch kein Grund, ihm zu glauben.
    if (!from) return 'reject'
    return originMatchesHost(from, host) ? 'allow' : 'reject'
  }

  // Unbekannter/fehlender Sec-Fetch-Site-Wert → allein der Origin entscheidet.
  if (!from) return 'allow'
  return originMatchesHost(from, host) ? 'allow' : 'reject'
}

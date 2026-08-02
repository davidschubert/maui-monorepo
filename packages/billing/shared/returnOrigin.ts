/**
 * WOHIN DARF STRIPE ZURÜCKSCHICKEN? (Audit 2026-08-02)
 *
 * `success_url`/`cancel_url`/`return_url` wurden aus `getRequestURL(event)
 * .origin` gebaut — also aus dem `Host`-Header. Auf einer Wildcard-Site
 * (`*.pukalani.app` → EIN nginx-Server-Block) reicht der Header ungeprüft bis
 * in den Node-Prozess: wer einen Kunden auf `/api/billing/checkout` mit
 * gefälschtem Host lotst, bekommt eine ECHTE Stripe-Checkout-URL, die nach
 * der Zahlung auf einen fremden Host zurückführt. Der Kauf ist echt, das Ziel
 * nicht — und die Adresszeile trug bis dahin Stripes Domain.
 *
 * Das Muster, das es schon richtig macht, ist `apps/control/server/utils/
 * communityCheckout.ts`: dort baut der SERVER die URL aus `tenants.host`. Die
 * billing-eigenen Routen haben keinen Mandanten (sie laufen in Silo-Apps:
 * `apps/comments`, `apps/control`), aber sie haben dieselbe Sorte Wahrheit —
 * die konfigurierte Basis-URL der App (`NUXT_PUBLIC_I18N_BASE_URL`).
 *
 * REGEL: ist eine Basis-URL konfiguriert, gewinnt SIE — der Request-Host wird
 * nicht einmal angesehen. Ohne Konfiguration (lokale Entwicklung, wo es keine
 * gibt) bleibt der Request-Origin. Das ist bewusst strenger als
 * `core/shared/seoOrigin.ts`, das nur das SCHEMA aus der Env nimmt: SEO darf
 * pro Mandanten-Host variieren, ein Zahlungs-Rücksprung nicht.
 *
 * PURE + unit-getestet, deshalb in shared/ und ohne Nuxt-Abhängigkeit.
 */
export function resolveBillingReturnOrigin(
  requestOrigin: string | undefined | null,
  configuredBaseUrl: string | undefined | null,
): string {
  const configured = originOf(configuredBaseUrl)
  if (configured) return configured
  return originOf(requestOrigin)
}

function originOf(value: string | undefined | null): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    // Nur Web-Schemata — ein `javascript:`/`data:`-Wert aus einer
    // fehlgeleiteten Env hätte hier nichts zu suchen.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  }
  catch {
    return ''
  }
}

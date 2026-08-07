/**
 * Horizont-3 Naht 1 — Mandanten-Auflösung pro Request (Blueprint 00.tenant.ts).
 *
 * RUHEND per Config-Gate: pukalani.tenancy.enabled ist Core-Default AUS — dann ist
 * diese Middleware ein sofortiger No-Op (heutiger Single-Tenant-Betrieb).
 * Aktiv (Platform-App) gilt die Spike-Semantik (s5-pool-silo):
 *  - bekannter Host  → event.context.tenant = TenantContext (pool | silo)
 *  - unbekannter Host → 404 (KEINE Default-Site — nichts leakt an Fremd-Hosts);
 *    AUSNAHME ist Nuxts interner Fehlerseiten-Renderpass, s. unten (C12b)
 *  - Resolver-Fehler  → 500 (fail-loud; NIE still aufs Default-Projekt fallen,
 *    sonst landet Mandanten-Traffic unbemerkt im falschen Datenraum)
 * Muss alphabetisch VOR auth.ts laufen (00.-Prefix): die Client-Factories
 * (Naht 2) lesen den Tenant bereits beim Session-Lookup.
 */
// shared/*.ts wird im server-Verzeichnis NICHT auto-importiert (nur
// shared/utils + shared/types) — deshalb explizit.
import { isControlHost } from '../../shared/controlCenter'
import { UNKNOWN_HOST_CODE, UNKNOWN_HOST_STATUS_TEXT, isErrorPageRenderPass } from '../../shared/unknownHost'
import { canonicalRedirectStatus, canonicalRedirectTarget } from '../../shared/canonicalHost'

export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as {
    pukalani?: { tenancy?: { enabled?: boolean, controlHosts?: string[] } }
  }
  if (appConfig.pukalani?.tenancy?.enabled !== true) return

  const resolver = getTenantResolver()
  // Gate an, aber (noch) kein Resolver registriert → dokumentiertes fail-open
  // auf heutiges Verhalten (Single-Tenant); die App merkt es beim Aktivieren.
  if (!resolver) return

  // Host-unabhängige Infra-Pfade — beide tenant-agnostisch, nichts leakt:
  // - /api/health: Deploy-Verify + Monitoring pollen den kanonischen Site-Host,
  //   der selbst KEIN Tenant ist (buildSha/Uptime).
  // - /_i18n/: nuxt-i18n lädt Locale-Messages im Prod-Build per INTERNEM
  //   self-fetch OHNE Host-Header — ein 404 hier ließe jede Seite mit rohen
  //   i18n-Keys rendern (Prod-Befund 2026-07-23). Inhalte sind build-statisch.
  const path = event.path.split('?')[0] ?? ''
  if (path === '/api/health' || path.startsWith('/_i18n/')) return

  const host = normalizeHost(getHeader(event, 'host'))

  // KONTROLL-Hosts (Kundenbereich/Onboarding, z. B. app.pukalani.app): bewusst
  // KEIN Mandant — hier wird eine Community erst erzeugt. Ohne diese Ausnahme
  // liefe der Host in den 404 für unbekannte Hosts. Weil ohne Mandanten aber
  // NICHTS gescopt ist, engt 01.control-center.ts die erlaubten Pfade
  // fail-closed ein (die Ausnahme ist also kein Loch, sondern ein anderer,
  // engerer Modus).
  if (isControlHost(host, controlHosts(event))) {
    event.context.controlCenter = true
    return
  }

  const tenant = await resolver(host)
  if (!tenant) {
    // C12b: Nuxt rendert seine Fehlerseite über einen INTERNEN Request auf
    // /__nuxt_error — der läuft durch DIESE Middleware erneut, mit demselben
    // unbekannten Host. Würde hier wieder geworfen, gäbe Nuxt den Renderer auf
    // und fiele auf sein eingebautes Template zurück („500 - Unknown host"
    // über einer 404-Antwort). Also: den Render-Durchgang durchlassen, damit
    // die gebrandete CoreErrorPage entsteht. Ohne Mandant heißt hier ohne
    // Community-Branding — genau richtig, die Adresse gehört ja zu keiner.
    // Kein Loch: /__nuxt_error beantwortet Nuxts Renderer nur intern
    // (shared/unknownHost.ts), und es rendert ausschließlich die Fehlerseite.
    if (isErrorPageRenderPass(path)) return

    throw createError({
      status: 404,
      statusText: UNKNOWN_HOST_STATUS_TEXT,
      data: { code: UNKNOWN_HOST_CODE },
    })
  }
  event.context.tenant = tenant

  /**
   * EIGENE DOMAIN — die Umleitung auf die kanonische Adresse (control-035,
   * Davids Entscheidung 2 vom 2026-08-07: **301**, und die Subdomain bleibt
   * Rückfall).
   *
   * Eine Community löst seit control-035 unter mehreren Hosts auf: ihrer
   * Pukalani-Subdomain, ihrer eigenen Domain und deren www-/Apex-Geschwister.
   * Genau EINER ist kanonisch (der Resolver rechnet ihn, `canonicalHostFor()`),
   * alle anderen zeigen dorthin. Ohne diese Zeilen liefe dieselbe Community
   * unter drei Adressen gleichzeitig — mit drei Session-Cookies, drei
   * Suchmaschinen-Indizes und drei `canonical`-Werten.
   *
   * SIE STEHT NACH `event.context.tenant = tenant`, und das ist Absicht: eine
   * `abuse`-Sperre (M13) hat den Resolver schon vorher `null` liefern lassen,
   * eine gesperrte Community leitet also nirgendwohin um, sondern 404et — auf
   * ALLEN ihren Hosts.
   *
   * ── DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF ────────────────────────
   *
   * (1) **308 statt 301, sobald der Request nicht GET/HEAD ist.** Ein 301 lässt
   *     Browser die Methode auf GET wechseln — ein Formular-POST auf die alte
   *     Adresse verlöre dabei stillschweigend seinen Rumpf, und der Nutzer
   *     sähe eine Seite statt einer Fehlermeldung. 308 ist derselbe
   *     „dauerhaft", nur methodenerhaltend. Davids Entscheidung („301") meint
   *     die DAUERHAFTIGKEIT, und die bleibt.
   *
   * (2) **`Cache-Control: no-store` daneben.** Ein 301 darf ein Browser für
   *     immer behalten. Genau das würde Davids zweite Zusage brechen — „die
   *     Subdomain bleibt Rückfall": nimmt der Kunde seine Domain wieder weg,
   *     stünde jeder Besucher mit gemerkter Umleitung vor einer toten Adresse.
   *     Der Header nimmt das Risiko nicht ganz weg (manche Browser merken sich
   *     301 trotzdem), aber er ist das, was von hier aus geht — der Rest steht
   *     als Prüf-Häkchen im Runbook.
   *
   * (3) **Der Pfad reist mit** (`event.path`, also inkl. Query). Eine
   *     Umleitung, die auf `/` wirft, macht aus jedem geteilten Deep-Link eine
   *     Startseite.
   */
  const target = canonicalRedirectTarget(host, tenant.canonicalHost, event.path)
  if (target) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return await sendRedirect(event, target, canonicalRedirectStatus(event.method))
  }
})

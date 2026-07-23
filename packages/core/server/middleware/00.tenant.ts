/**
 * Horizont-3 Naht 1 — Mandanten-Auflösung pro Request (Blueprint 00.tenant.ts).
 *
 * RUHEND per Config-Gate: maui.tenancy.enabled ist Core-Default AUS — dann ist
 * diese Middleware ein sofortiger No-Op (heutiger Single-Tenant-Betrieb).
 * Aktiv (Platform-App) gilt die Spike-Semantik (s5-pool-silo):
 *  - bekannter Host  → event.context.tenant = TenantContext (pool | silo)
 *  - unbekannter Host → 404 (KEINE Default-Site — nichts leakt an Fremd-Hosts)
 *  - Resolver-Fehler  → 500 (fail-loud; NIE still aufs Default-Projekt fallen,
 *    sonst landet Mandanten-Traffic unbemerkt im falschen Datenraum)
 * Muss alphabetisch VOR auth.ts laufen (00.-Prefix): die Client-Factories
 * (Naht 2) lesen den Tenant bereits beim Session-Lookup.
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { maui?: { tenancy?: { enabled?: boolean } } }
  if (appConfig.maui?.tenancy?.enabled !== true) return

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
  const tenant = await resolver(host)
  if (!tenant) {
    throw createError({ status: 404, statusText: 'Unknown host' })
  }
  event.context.tenant = tenant
})

import type { CommunityAudience } from '../../shared/types/tenant'

/**
 * Lese-Publikum DIESER Community (C18, Davids Entscheidung vom 2026-07-30:
 * wählbar, NEUE Communities entstehen öffentlich) — SSR-gespiegelt via
 * tenant-brand-Plugin, reist im Payload.
 *
 * Drei Zustände, und der dritte ist wieder der wichtige (Muster
 * useTenantOpenRegistration):
 *   'public'  = Mandanten-Host, Inhalte sind für Gäste lesbar (wie bisher)
 *   'members' = Mandanten-Host, Inhalte nur für Mitglieder — die Seite sagt
 *               Suchmaschinen `noindex, nofollow`, sitemap und Vorschaubild
 *               sind zu, und die Zeilen tragen `read(label:<communityId>)`
 *   null      = KEIN Mandanten-Host (Silo-App, Kontroll-Host, Playground).
 *               Dort gibt es keine Community-Grenze; die Sichtbarkeit regelt
 *               weiterhin die Instanz.
 *
 * Die AUTORITÄT ist serverseitig: die Row-Permissions (Appwrite gibt eine
 * Zeile ohne passendes Publikum gar nicht heraus) und der fail-closed Resolver.
 * Dieser Wert ist die ANSAGE — an den Crawler und an das Dashboard.
 */
export function useTenantAudience() {
  const audience = useState<CommunityAudience | null>('pukalani-tenant-audience', () => null)
  /** true = dieser Host gehört einer Community (nur dann ist der Schalter sinnvoll). */
  const isTenantHost = computed(() => audience.value !== null)
  /** Explizit geschlossen — nur 'members' zählt, `null` ist kein Mandant. */
  const membersOnly = computed(() => audience.value === 'members')
  return { audience, isTenantHost, membersOnly }
}

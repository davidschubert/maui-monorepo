import type { Capability } from '../../shared/types/authz'
import { tenantCapabilitiesFor, type TenantRole } from '../../shared/tenantAuthz'

/**
 * Site-Rolle des eingeloggten Users auf DIESEM Mandanten-Host (N1) —
 * SSR-gespiegelt via tenant-brand-Plugin (Quelle: server/middleware/
 * site-role.ts, derselbe Resolver + 30-s-Cache wie requireTenantPermission;
 * Rollen-Entzug erscheint im UI deshalb nach ≤30 s bzw. beim nächsten
 * Seitenwechsel — dokumentiert akzeptiert). Nach Client-Login hält der
 * Auth-Store den Wert aktuell (refresh → GET /api/site/role), Logout nullt.
 *
 * null = keine Site-Rolle (Gast, kein Tenant-Host, keine Mitgliedschaft).
 *
 * NUR UX-Schicht: die Autorität bleiben requireSitePermission/
 * requireTenantPermission auf den Server-Routen — dieser State entscheidet
 * Sichtbarkeit (Nav, Guards), nie Daten.
 */
export function useSiteRole() {
  const role = useState<TenantRole | null>('pukalani-site-role', () => null)
  /** Capabilities der Rolle, abgeleitet aus der geteilten Matrix (tenantAuthz). */
  const capabilities = computed<Set<Capability>>(() => tenantCapabilitiesFor(role.value))
  return { role, capabilities }
}

/** Hat der User über seine SITE-Rolle diese Capability? (reaktiv, UX-Schicht) */
export function useSiteCapability(capability: Capability) {
  const { capabilities } = useSiteRole()
  return computed(() => capabilities.value.has(capability))
}

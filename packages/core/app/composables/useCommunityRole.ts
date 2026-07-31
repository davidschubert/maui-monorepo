import type { Capability } from '../../shared/types/authz'
import { communityCapabilitiesFor, type CommunityRole } from '../../shared/communityAuthz'

/**
 * Community-Rolle des eingeloggten Users auf DIESEM Mandanten-Host (N1) —
 * SSR-gespiegelt via tenant-brand-Plugin (Quelle: server/middleware/
 * 07.community-role.ts, derselbe Resolver + 30-s-Cache wie
 * requireCommunityPermission;
 * Rollen-Entzug erscheint im UI deshalb nach ≤30 s bzw. beim nächsten
 * Seitenwechsel — dokumentiert akzeptiert). Nach Client-Login hält der
 * Auth-Store den Wert aktuell (refresh → GET /api/community/role), Logout nullt.
 *
 * null = keine Community-Rolle (Gast, kein Tenant-Host, keine Mitgliedschaft).
 *
 * NUR UX-Schicht: die Autorität bleibt requireCommunityPermission auf den
 * Server-Routen — dieser State entscheidet Sichtbarkeit (Nav, Guards), nie Daten.
 */
export function useCommunityRole() {
  const role = useState<CommunityRole | null>('pukalani-community-role', () => null)
  /** Capabilities der Rolle, abgeleitet aus der geteilten Matrix (communityAuthz). */
  const capabilities = computed<Set<Capability>>(() => communityCapabilitiesFor(role.value))
  return { role, capabilities }
}

/** Hat der User über seine COMMUNITY-Rolle diese Capability? (reaktiv, UX-Schicht) */
export function useCommunityCapability(capability: Capability) {
  const { capabilities } = useCommunityRole()
  return computed(() => capabilities.value.has(capability))
}

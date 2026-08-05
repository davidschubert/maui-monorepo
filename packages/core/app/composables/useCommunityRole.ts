import type { Capability } from '../../shared/types/authz'
import { communityCapabilitiesFor, type CommunityRole } from '../../shared/communityAuthz'
import { trustLevelCapabilitiesFor, type TrustLevel } from '../../shared/trustLevel'

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
  /**
   * Vertrauensstufe (F1 Teilpaket 3) — die ZWEITE Quelle von Capabilities,
   * gespiegelt aus derselben Middleware wie die Rolle.
   *
   * 0 heißt „keine Stufe" und ist der Wert für Gäste, für Silo-Apps ohne
   * Discussions und für jeden Lesefehler. Eine fehlende Stufe kann also nichts
   * verstecken, was die Rolle schon erlaubt.
   */
  const trustLevel = useState<TrustLevel>('pukalani-community-trust-level', () => 0)
  /**
   * Capabilities aus BEIDEN Quellen — VEREINIGUNG, nie Ersetzung.
   *
   * Dieselbe Rechnung wie serverseitig in `decideCommunityAccess`: die Stufe
   * ERWEITERT, sie nimmt nie etwas. Ein Owner mit Stufe 0 sieht deshalb genau
   * das, was er vorher sah, und ein Mitglied der Stufe 3 zusätzlich seine
   * Aufräum-Werkzeuge. Die Autorität bleibt die Server-Route: hier entscheidet
   * sich nur, ob ein Knopf angeboten wird, der ohnehin geprüft wird.
   */
  const capabilities = computed<Set<Capability>>(() => new Set<Capability>([
    ...communityCapabilitiesFor(role.value),
    ...trustLevelCapabilitiesFor(trustLevel.value),
  ]))
  return { role, trustLevel, capabilities }
}

/**
 * Hat der User über seine COMMUNITY-Rolle ODER seine Vertrauensstufe diese
 * Capability? (reaktiv, UX-Schicht)
 */
export function useCommunityCapability(capability: Capability) {
  const { capabilities } = useCommunityRole()
  return computed(() => capabilities.value.has(capability))
}

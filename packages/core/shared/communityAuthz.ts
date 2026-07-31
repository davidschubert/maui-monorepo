import type { Capability } from './types/authz'

/**
 * COMMUNITY-ROLLEN (G1) — die Rechte-Matrix für Mitglieder EINER Kunden-
 * Community, getrennt vom Operator-RBAC in authz.ts. **Die EINE Liste der 5
 * Rollen**: seit E8 Etappe 4 (2026-07-30) importiert auch das Control Plane sie
 * von hier, statt eine zweite Kopie zu pflegen.
 *
 * Zwei bewusst getrennte Welten (docs/referenz/G0-PRODUKTVERTRAG.md §2):
 *  - authz.ts (Role = admin|moderator) = Betreiber/Operator (globale Appwrite-
 *    Labels auf DEINER Instanz; über die GANZE Plattform gültig).
 *  - communityAuthz.ts (CommunityRole) = die 5 Rollen INNERHALB einer Kunden-
 *    Community. Verankert an `community_members {communityId = tenants.$id,
 *    runtimeProjectId, runtimeUserId}` — die Runtime-Identität (Pool-/Silo-
 *    Projekt-User), NICHT die Control-Plane-userId.
 *
 * Pure TS ohne Nuxt-/Appwrite-Deps → Server (requireCommunityPermission) UND
 * Client (UI-Gating) nutzen dieselbe Quelle via relativem Import.
 *
 * VOKABULAR (E8-4): hieß bis 2026-07-30 `tenantAuthz.ts` mit `TenantRole`/
 * `TENANT_ROLES`. Die Rollen-WERTE ('owner' … 'viewer') stehen in Zeilen und
 * ändern sich nie — umbenannt wurden nur die Namen im Code.
 *
 * Rollen-Gitter (kein reiner Chain — Editor und Moderator sind Geschwister):
 *   viewer ⊂ {editor, moderator} ⊂ admin ⊂ owner
 * Editor darf verfassen, aber nicht moderieren; Moderator moderiert, verfasst
 * aber nicht. Admin vereint beide + Branding + Team. Owner = Admin + Übergabe/
 * Löschung. Abrechnung/System/Instanz-weite Rechte bleiben beim Operator.
 */
export const COMMUNITY_ROLES = ['owner', 'admin', 'moderator', 'editor', 'viewer'] as const
export type CommunityRole = (typeof COMMUNITY_ROLES)[number]

/** Viewer: liest die Community + kommentiert. Kein Dashboard-Verwaltungsrecht. */
const VIEWER: readonly Capability[] = [
  'dashboard.access',
]

/** Editor: verfasst Inhalte (Beiträge, Seiten, Events, Medien) — moderiert NICHT. */
const EDITOR: readonly Capability[] = [
  ...VIEWER,
  'posts.write',
  'pages.manage',
  'media.manage',
  'events.manage',
]

/** Moderator: Meldungen + Kommentare + Beiträge moderieren — verfasst NICHT. */
const MODERATOR: readonly Capability[] = [
  ...VIEWER,
  'comments.moderate',
  'reports.moderate',
  'posts.moderate',
]

/** Admin: Editor ∪ Moderator + Kurse, Activity, Branding, Team. Kein Billing/System. */
const ADMIN: readonly Capability[] = [
  ...new Set<Capability>([
    ...EDITOR,
    ...MODERATOR,
    'courses.manage',
    'activity.manage',
    'branding.manage',
    'team.manage',
  ]),
]

/** Owner: Admin + Owner-Übergabe + Community-Löschung + Abo (A6: der Owner kauft). */
const OWNER: readonly Capability[] = [
  ...new Set<Capability>([
    ...ADMIN,
    'community.transfer',
    'community.delete',
    // A6 (Davids Entscheidung 2, 2026-07-30): gekauft wird im Dashboard der
    // Community, und zwar NUR vom Owner — das Abo hängt an der Community.
    // BEWUSST eine EIGENE Community-Capability: billing.manage ist Instanz-weit
    // (Operator-Payment-Logs) — sie dem Owner zu geben, wäre das Leck, das
    // der Rollen-Trennungs-Test (communityAuthz.test.ts) verbietet.
    'community.billing',
  ]),
]

/** Rolle → ihre Capabilities. Single Source of Truth für Community-Autorisierung. */
export const COMMUNITY_ROLE_CAPABILITIES: Record<CommunityRole, readonly Capability[]> = {
  owner: OWNER,
  admin: ADMIN,
  moderator: MODERATOR,
  editor: EDITOR,
  viewer: VIEWER,
}

/** Type-Guard: ist der String eine bekannte Community-Rolle? */
export function isCommunityRole(value: string): value is CommunityRole {
  return (COMMUNITY_ROLES as readonly string[]).includes(value)
}

/** Hat GENAU DIESE Rolle die gefragte Capability? (eine Rolle je User/Community) */
export function communityRoleHasCapability(role: CommunityRole, capability: Capability): boolean {
  return COMMUNITY_ROLE_CAPABILITIES[role].includes(capability)
}

/** Capabilities einer Community-Rolle als Set (für UI/Aggregation). */
export function communityCapabilitiesFor(role: CommunityRole | null | undefined): Set<Capability> {
  if (!role || !isCommunityRole(role)) return new Set()
  return new Set(COMMUNITY_ROLE_CAPABILITIES[role])
}

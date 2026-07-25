import type { Capability } from './types/authz'

/**
 * Kunden-Site-Rollen (G1) — die Rechte-Matrix für Mitglieder EINER Community-
 * Site, getrennt vom Operator-RBAC in authz.ts.
 *
 * Zwei bewusst getrennte Welten (docs/plans/G0-PRODUKTVERTRAG.md §2):
 *  - authz.ts (Role = admin|moderator) = Betreiber/Operator (globale Appwrite-
 *    Labels auf DEINER Instanz; über die GANZE Plattform gültig).
 *  - tenantAuthz.ts (TenantRole) = die 5 Rollen INNERHALB einer Kunden-Site.
 *    Verankert an `site_members {siteId = tenants.$id, runtimeProjectId,
 *    runtimeUserId}` — die Runtime-Identität (Pool-/Silo-Projekt-User), NICHT
 *    die Control-Plane-userId.
 *
 * Pure TS ohne Nuxt-/Appwrite-Deps → Server (requireTenantPermission) UND
 * Client (UI-Gating) nutzen dieselbe Quelle via relativem Import.
 *
 * Rollen-Gitter (kein reiner Chain — Editor und Moderator sind Geschwister):
 *   viewer ⊂ {editor, moderator} ⊂ admin ⊂ owner
 * Editor darf verfassen, aber nicht moderieren; Moderator moderiert, verfasst
 * aber nicht. Admin vereint beide + Branding + Team. Owner = Admin + Übergabe/
 * Löschung. Abrechnung/System/Instanz-weite Rechte bleiben beim Operator.
 */
export const TENANT_ROLES = ['owner', 'admin', 'moderator', 'editor', 'viewer'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

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

/** Owner: Admin + Owner-Übergabe + Site-Löschung. */
const OWNER: readonly Capability[] = [
  ...new Set<Capability>([
    ...ADMIN,
    'site.transfer',
    'site.delete',
  ]),
]

/** Rolle → ihre Capabilities. Single Source of Truth für Site-Autorisierung. */
export const TENANT_ROLE_CAPABILITIES: Record<TenantRole, readonly Capability[]> = {
  owner: OWNER,
  admin: ADMIN,
  moderator: MODERATOR,
  editor: EDITOR,
  viewer: VIEWER,
}

/** Type-Guard: ist der String eine bekannte Site-Rolle? */
export function isTenantRole(value: string): value is TenantRole {
  return (TENANT_ROLES as readonly string[]).includes(value)
}

/** Hat GENAU DIESE Rolle die gefragte Capability? (eine Rolle je User/Site) */
export function tenantRoleHasCapability(role: TenantRole, capability: Capability): boolean {
  return TENANT_ROLE_CAPABILITIES[role].includes(capability)
}

/** Capabilities einer Site-Rolle als Set (für UI/Aggregation). */
export function tenantCapabilitiesFor(role: TenantRole | null | undefined): Set<Capability> {
  if (!role || !isTenantRole(role)) return new Set()
  return new Set(TENANT_ROLE_CAPABILITIES[role])
}

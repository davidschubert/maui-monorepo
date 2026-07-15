import type { Capability, Role } from './types/authz'

/**
 * Die Rechte-Matrix (Single Source of Truth) — siehe docs/RBAC-CONCEPT.md.
 * Bewusst im Code (versioniert, type-safe), NICHT runtime-editierbar. Pure TS
 * ohne Nuxt-/Appwrite-Deps → von Server (server/utils) UND Client (app/utils)
 * via relativem Import nutzbar.
 */

/** Alle bekannten Capabilities — zugleich das Wildcard-Set der admin-Rolle. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'dashboard.access',
  'comments.moderate',
  'reports.moderate',
  'users.manage',
  'changelog.manage',
  'system.manage',
  'storage.manage',
  'audit.read',
  'activity.manage',
  'media.manage',
  'posts.moderate',
  'events.manage',
  'feedback.manage',
  'billing.manage',
  'courses.manage',
  'tickets.manage',
]

/** Alle zuweisbaren Rollen. */
export const ROLES: readonly Role[] = ['admin', 'moderator']

/** Rolle → ihre Capabilities. admin = alle; moderator = Teilmenge. */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: ALL_CAPABILITIES,
  // tickets.manage: Karten-Mitglieder sind per Anforderung Admins UND Mods
  moderator: ['dashboard.access', 'comments.moderate', 'reports.moderate', 'tickets.manage'],
}

/** Type-Guard: ist das Label eine bekannte Rolle? */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

/** Capability-Vereinigung aller Rollen-Labels eines Users. */
export function capabilitiesFor(labels: readonly string[] | null | undefined): Set<Capability> {
  const caps = new Set<Capability>()
  for (const label of labels ?? []) {
    if (isRole(label)) {
      for (const cap of ROLE_CAPABILITIES[label]) caps.add(cap)
    }
  }
  return caps
}

/** Hat ein User (über seine Labels) die gefragte Capability? */
export function hasCapability(
  labels: readonly string[] | null | undefined,
  capability: Capability,
): boolean {
  for (const label of labels ?? []) {
    if (isRole(label) && ROLE_CAPABILITIES[label].includes(capability)) return true
  }
  return false
}

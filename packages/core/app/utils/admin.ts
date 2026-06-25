import type { Capability } from '../../shared/types/authz'
import { ROLES, capabilitiesFor, hasCapability } from '../../shared/authz'

/** Im Dashboard zuweisbare Rollen (UI-Quelle, Matrix bleibt in shared/authz). */
export const ASSIGNABLE_ROLES = ROLES

/**
 * Admin-Erkennung über Appwrite User Labels. Das Label 'admin' wird NIE
 * über die App vergeben (Privilegien-Eskalation) — der erste Admin wird
 * in der Console bzw. per direktem API-Key-Call markiert.
 */
export function isAdminUser(user: { labels?: string[] } | null | undefined): boolean {
  return user?.labels?.includes('admin') ?? false
}

/**
 * Client-seitiger Capability-Check (UX-Schicht — die Autorität liegt in
 * requirePermission() im Server). Nutzt dieselbe Matrix (shared/authz).
 */
export function userHasCapability(
  user: { labels?: string[] } | null | undefined,
  capability: Capability,
): boolean {
  return hasCapability(user?.labels, capability)
}

/**
 * Wie userHasCapability, aber für einen Capability-NAMEN als String (z.B. aus
 * Route-Meta) — unbekannte Namen ergeben false (deny-by-default).
 */
export function userHasCapabilityName(
  user: { labels?: string[] } | null | undefined,
  name: string,
): boolean {
  return capabilitiesFor(user?.labels).has(name as Capability)
}

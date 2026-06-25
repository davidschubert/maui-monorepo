import type { Capability } from '../../shared/types/authz'
import { hasCapability } from '../../shared/authz'

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

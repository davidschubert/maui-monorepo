import type { H3Event } from 'h3'
import type { Capability } from '../../shared/types/authz'
import { hasCapability } from '../../shared/authz'

/**
 * Serverseitiger Capability-Gate für JEDE geschützte Route — die Autorität liegt
 * hier (User-Labels → Rollen → Capabilities, siehe docs/RBAC-CONCEPT.md). Die
 * Route-/Client-Middleware ist nur UX. Auto-Import in allen Feature-Layern.
 */
export function requirePermission(event: H3Event, capability: Capability) {
  const user = event.context.user

  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  if (!hasCapability(user.labels, capability)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  return user
}

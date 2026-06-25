import type { H3Event } from 'h3'

/**
 * Serverseitiger Admin-Gate (User-Label 'admin').
 *
 * @deprecated Bevorzugt `requirePermission(event, '<capability>')` (core,
 * siehe docs/RBAC-CONCEPT.md) — das gated feingranular und erlaubt nicht-Admin-
 * Rollen wie moderator. requireAdmin bleibt nur als „echter Admin"-Check für
 * Fälle, die explizit die volle Admin-Rolle verlangen.
 */
export function requireAdmin(event: H3Event) {
  const user = event.context.user

  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  if (!user.labels?.includes('admin')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  return user
}

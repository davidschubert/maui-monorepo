import type { H3Event } from 'h3'

/**
 * Serverseitiger Admin-Gate für JEDE /api/admin-Route — die Route-Middleware
 * im Client ist nur UX, die Autorität liegt hier (User-Label 'admin').
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

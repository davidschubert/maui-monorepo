/**
 * Geschützte Route: liefert den eingeloggten User (gesetzt von
 * server/middleware/auth.ts) oder 401 ohne gültige Session.
 */
export default defineEventHandler((event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  return event.context.user
})

/** Aktuelle Feature-Flags (Admin-Ansicht). */
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  return getAppConfig(event)
})

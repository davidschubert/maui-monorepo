/** Aktuelle Feature-Flags (Admin-Ansicht). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  return getAppConfig(event)
})

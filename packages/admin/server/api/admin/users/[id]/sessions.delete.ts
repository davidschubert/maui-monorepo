/** Alle Sessions eines Users invalidieren (Security-Aktion, z.B. nach Kompromittierung) */
export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const admin = createAdminClient(event)
  await admin.users.deleteSessions({ userId })

  return { ok: true }
})

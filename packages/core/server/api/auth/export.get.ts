/**
 * DSGVO-Datenexport: alle eigenen Daten als JSON — Account + Sessions (Core)
 * plus die Daten aller registrierten UserDataContributors (comments,
 * moderation, system, …), vollständig paginiert. Kein Feature-Wissen mehr
 * in core (A14): die Zusammensetzung übernimmt exportUserCompletely.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  return await exportUserCompletely(event, user.$id, { via: 'session' })
})

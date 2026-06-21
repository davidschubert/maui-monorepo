/**
 * Verlässt die Presence (z.B. beim Schließen des Tabs via sendBeacon): löscht
 * die globale Presence-Row des Users, damit der Online-Zähler sofort fällt.
 * Best effort.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { ok: false }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  try {
    await tablesDB.deleteRow({ databaseId: config.public.appwriteDatabaseId, tableId: 'presence', rowId: user.$id })
  }
  catch {
    // schon weg / Table fehlt → ignorieren
  }
  return { ok: true }
})

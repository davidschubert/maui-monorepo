/**
 * Verlässt die Presence eines scope (Tab-Close via sendBeacon = global, oder
 * Thread-Wechsel mit { scope }). Löscht die zugehörige Row, damit Zähler/
 * Anwesenheit sofort fallen. Best effort.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { ok: false }

  // readBody kann bei leerem Body undefined liefern (nicht rejecten) → absichern
  const body = (await readBody(event).catch(() => null)) as { scope?: string } | null
  const scope = typeof body?.scope === 'string' && body.scope ? body.scope : 'global'

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  try {
    await tablesDB.deleteRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'presence',
      rowId: presenceRowId(user.$id, scope),
    })
  }
  catch {
    // schon weg / Table fehlt → ignorieren
  }
  return { ok: true }
})

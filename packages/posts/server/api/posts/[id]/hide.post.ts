import { POSTS_TABLE, type CommunityPost } from '../../../../shared/types/post'

/**
 * Moderation: Post ausblenden — zweiphasig wie comments (Status-Update
 * zuerst, damit das Realtime-Event Leser noch erreicht; dann read(any)
 * entziehen, sonst bleibt der Post per Roh-REST gast-lesbar).
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'posts.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Post not found') })
  if (row.status !== 'published') {
    throw createError({ status: 409, statusText: 'Only published posts can be hidden' })
  }

  const updated = await admin.tablesDB.updateRow<CommunityPost>({
    databaseId, tableId: POSTS_TABLE, rowId: id, data: { status: 'hidden' },
  })

  if (updated.$permissions.includes(POST_READ_ANY)) {
    const withdraw = () => admin.tablesDB.updateRow({
      databaseId, tableId: POSTS_TABLE, rowId: id,
      permissions: updated.$permissions.filter(p => p !== POST_READ_ANY),
    })
    // Phase 2 muss halten — Retry für transiente Fehler, persistente laut loggen
    await withdraw()
      .catch(() => withdraw())
      .catch((error) => {
        console.error(`[posts] Permission-Entzug fehlgeschlagen — hidden-Post ${id} bleibt Roh-REST-lesbar bis zum Re-Hide:`, error)
      })
  }

  // Ausblenden schließt zugleich die offenen Meldungen (moderation-Vertrag,
  // wie der comments-Flow) — best-effort: der Hide ist bereits passiert,
  // ein Resolve-Fehler darf ihn nicht als gescheitert melden
  await resolveReportsForTarget(event, 'post', id, 'hidden', user.$id)
    .catch(error => console.error(`[posts] Meldungen zu Post ${id} konnten nicht aufgelöst werden:`, error))

  // Feed-Einträge des Posts entfernen (core-Vertrag) — sonst bleibt sein
  // metadata-Snippet im Activity-Feed sichtbar, obwohl der Inhalt weg ist
  await removeActivitiesForObject(event, { objectType: 'post', objectId: id })

  return { ok: true }
})

import { Query } from 'node-appwrite'
import { COMMENTS_TABLE } from '../../../shared/types/comment'

const MAX_TARGETS = 50

/**
 * Kommentar-Anzahl je Target, gebündelt (z. B. für Kommentar-Buttons im
 * Community-Feed, BEVOR eine Section geöffnet ist). Zählt wie der Listen-
 * Header: alle nicht-hidden Kommentare (deleted-Platzhalter inklusive).
 * Öffentlich — dieselbe Sichtbarkeit wie die Kommentarliste selbst.
 */
export default defineEventHandler(async (event): Promise<{ counts: Record<string, number> }> => {
  const query = getQuery(event)
  const targetType = String(query.targetType ?? '')
  const ids = String(query.targetIds ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!targetType || ids.length === 0) {
    throw createError({ status: 400, statusText: 'targetType and targetIds are required' })
  }
  if (ids.length > MAX_TARGETS) {
    throw createError({ status: 422, statusText: 'Too many targets' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const totals = await Promise.all(ids.map(id =>
    tablesDB.listRows({
      databaseId,
      tableId: COMMENTS_TABLE,
      queries: scopeQuery(event, [
        Query.equal('targetId', id),
        Query.equal('targetType', targetType),
        Query.notEqual('status', 'hidden'),
        Query.limit(1),
      ]),
    }).then(r => r.total).catch(() => 0),
  ))

  return { counts: Object.fromEntries(ids.map((id, index) => [id, totals[index] ?? 0])) }
})

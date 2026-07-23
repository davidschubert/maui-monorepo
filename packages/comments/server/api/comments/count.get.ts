import { Query } from 'node-appwrite'
import { COMMENTS_TABLE } from '../../../shared/types/comment'

/**
 * E3 (Embed-Plan Task 15): öffentliche Kommentar-Anzahl EINES Targets für
 * „N Kommentare"-Links auf HOSTSEITEN — der einzige bewusst cross-origin
 * konsumierbare Read-Endpoint (CORS '*', ohne Credentials; embed.js füllt
 * damit data-maui-count-Elemente). Zählt wie der Listen-Header: alle
 * nicht-hidden Kommentare (deleted-Platzhalter inklusive). Microcache 30 s
 * (user-agnostisch, tenant-scoped) + Read-Rate-Bucket (rate-limit.ts).
 */
const countCache = createMicrocache<number>(30_000)

export default defineEventHandler(async (event): Promise<{ count: number }> => {
  // CORS bewusst offen: read-only, credential-frei, keine personenbezogene Antwort
  setHeader(event, 'Access-Control-Allow-Origin', '*')

  const query = getQuery(event)
  const targetId = String(query.targetId ?? '')
  const targetType = String(query.targetType ?? '')
  if (!targetId || targetId.length > 255 || !targetType || targetType.length > 64) {
    throw createError({ status: 400, statusText: 'targetId and targetType are required' })
  }

  const cacheKey = `${tenantCacheScope(event)}:${targetType}:${targetId}`
  const cached = countCache.get(cacheKey)
  if (cached !== undefined) return { count: cached }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const count = await tablesDB.listRows({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMENTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetId', targetId),
      Query.equal('targetType', targetType),
      Query.notEqual('status', 'hidden'),
      Query.limit(1),
    ]),
  }).then(r => r.total).catch(() => 0)

  countCache.set(cacheKey, count)
  return { count }
})

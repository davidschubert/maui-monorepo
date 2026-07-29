import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminCommentListResponse, ModeratedComment, ModerationFilter } from '../../../../shared/types/moderation'

const PAGE_SIZE = 25
const FILTERS: ModerationFilter[] = ['reported', 'hidden', 'all']
/** Sortierbar sind nur indizierte Spalten (Migration 002) — alles andere fällt zurück. */
const SORTABLE = new Set(['$createdAt', 'status'])
/** Appwrite nimmt je `equal`-Query höchstens 100 Werte. */
const ID_CHUNK = 100

type CommentRow = Models.Row & Omit<ModeratedComment, '$id' | '$createdAt' | 'reportCount'>

function toModerated(row: CommentRow): ModeratedComment {
  return {
    $id: row.$id,
    $createdAt: row.$createdAt,
    content: row.content,
    authorId: row.authorId,
    authorName: row.authorName,
    targetId: row.targetId,
    targetType: row.targetType,
    status: row.status,
  }
}

export default defineEventHandler(async (event): Promise<AdminCommentListResponse> => {
  await requireSitePermission(event, 'comments.moderate')

  const query = getQuery(event)
  const status = FILTERS.includes(query.status as ModerationFilter)
    ? query.status as ModerationFilter
    : 'reported'
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const offset = (page - 1) * PAGE_SIZE
  // Suche läuft über den Fulltext-Index comments.content_search (Migration 004)
  const search = String(query.search ?? '').trim()
  const searchQueries = search ? [Query.search('content', search)] : []
  const sort = SORTABLE.has(String(query.sort ?? '')) ? String(query.sort) : '$createdAt'
  const dir = query.dir === 'asc' ? 'asc' : 'desc'

  // Betreiber-Weg durch die Tür — der Filter kommt von dort, nicht aus dieser
  // Route. Vorher stand hier scopeQuery von Hand; genau solche Stellen wollen
  // wir nicht mehr pflegen müssen.
  const ops = tenantDb(event, { as: 'operator' })
  // KI-Assist-Verfügbarkeit einmal pro Liste — das UI blendet den Button
  // sonst gar nicht erst ein (core-Gate maui.ai + NUXT_AI_KEY)
  const aiAssist = isAiAvailable(event)

  // 'reported' kommt jetzt aus dem Moderation-Layer (reports-Tabelle), nicht mehr
  // aus comment.status — über den expliziten Vertrag, nicht direkt (Layer-Grenze A14).
  if (status === 'reported') {
    const { order, counts } = await openReportsByTarget(event, 'comment')
    // Die Reihenfolge der Queue ist „neueste Meldung zuerst" — eine
    // Sortierung nach Datum/Status wäre hier eine andere Aussage, deshalb
    // bietet die Oberfläche in dieser Ansicht bewusst keine an.
    let ids = order
    if (search) {
      // Suche innerhalb der gemeldeten Menge: die ist durch REPORTS_WINDOW
      // (500) gedeckelt, `equal` nimmt 100 Werte je Abfrage → max. 5 Abfragen.
      const matched = new Set<string>()
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const chunk = ids.slice(i, i + ID_CHUNK)
        const hits = await ops.list<CommentRow>('comments', [
          Query.equal('$id', chunk),
          ...searchQueries,
          Query.limit(chunk.length),
        ])
        for (const row of hits.rows) matched.add(row.$id)
      }
      ids = ids.filter(id => matched.has(id))
    }
    const pageIds = ids.slice(offset, offset + PAGE_SIZE)
    if (pageIds.length === 0) {
      return { total: ids.length, comments: [], aiAssist }
    }
    const result = await ops.list<CommentRow>('comments', [
      Query.equal('$id', pageIds),
      Query.limit(pageIds.length),
    ])
    const byId = new Map(result.rows.map(row => [row.$id, row]))
    const comments = pageIds
      .map(id => byId.get(id))
      .filter((row): row is CommentRow => row !== undefined)
      .map(row => ({ ...toModerated(row), reportCount: counts.get(row.$id) ?? 0 }))
    return { total: ids.length, comments, aiAssist }
  }

  const result = await ops.list<CommentRow>('comments', [
    ...(status === 'all' ? [] : [Query.equal('status', status)]),
    ...searchQueries,
    dir === 'asc' ? Query.orderAsc(sort) : Query.orderDesc(sort),
    Query.limit(PAGE_SIZE),
    Query.offset(offset),
  ])

  return {
    total: result.total,
    comments: result.rows.map(toModerated),
    aiAssist,
  }
})

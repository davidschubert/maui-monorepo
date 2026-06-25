import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

interface SearchResult {
  users: { $id: string, name: string, email: string }[]
  comments: { $id: string, content: string, authorId: string, authorName: string }[]
}

type CommentRow = Models.Row & { content: string, authorId: string, authorName: string }

/** Globale Admin-Suche (User + Kommentare) für die Command-Palette. */
export default defineEventHandler(async (event): Promise<SearchResult> => {
  requirePermission(event, 'dashboard.access')

  const q = String(getQuery(event).q ?? '').trim()
  if (q.length < 2) return { users: [], comments: [] }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const [users, comments] = await Promise.all([
    admin.users.list({ search: q, queries: [Query.limit(5)] })
      .catch(() => ({ users: [] as Models.User<Models.Preferences>[] })),
    admin.tablesDB.listRows<CommentRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.search('content', q), Query.limit(5)],
    }).catch(() => ({ rows: [] as CommentRow[] })),
  ])

  return {
    users: users.users.map(u => ({ $id: u.$id, name: u.name, email: u.email })),
    comments: comments.rows.map(r => ({
      $id: r.$id,
      content: r.content.length > 80 ? `${r.content.slice(0, 80)}…` : r.content,
      authorId: r.authorId,
      authorName: r.authorName,
    })),
  }
})

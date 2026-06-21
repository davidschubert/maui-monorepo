import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

const PAGE_SIZE = 25

/** Auf sichere Felder reduzieren — Server-User-Objekte enthalten Hash-Felder */
function toRow(user: Models.User<Models.Preferences>): AdminUserRow {
  const prefs = user.prefs as { avatarUrl?: string }
  return {
    $id: user.$id,
    name: user.name,
    email: user.email,
    avatarUrl: typeof prefs?.avatarUrl === 'string' ? prefs.avatarUrl : '',
    $createdAt: user.$createdAt,
    accessedAt: user.accessedAt,
    emailVerification: user.emailVerification,
    phoneVerification: user.phoneVerification,
    status: user.status,
    labels: user.labels ?? [],
  }
}

export default defineEventHandler(async (event): Promise<AdminUserListResponse> => {
  requireAdmin(event)

  const query = getQuery(event)
  const search = String(query.search ?? '').trim()
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  // Whitelist sortierbarer Felder (Appwrite users.list kann diese ordnen)
  const SORTABLE = new Set(['name', 'email', '$createdAt', 'status'])
  const sort = SORTABLE.has(String(query.sort)) ? String(query.sort) : '$createdAt'
  const dir = query.dir === 'asc' ? 'asc' : 'desc'

  const admin = createAdminClient(event)

  const result = await admin.users.list({
    queries: [
      dir === 'asc' ? Query.orderAsc(sort) : Query.orderDesc(sort),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
    ...(search ? { search } : {}),
  })

  return { total: result.total, users: result.users.map(toRow) }
})

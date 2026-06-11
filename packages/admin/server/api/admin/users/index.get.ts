import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

const PAGE_SIZE = 25

/** Auf sichere Felder reduzieren — Server-User-Objekte enthalten Hash-Felder */
function toRow(user: Models.User<Models.Preferences>): AdminUserRow {
  return {
    $id: user.$id,
    name: user.name,
    email: user.email,
    $createdAt: user.$createdAt,
    accessedAt: user.accessedAt,
    emailVerification: user.emailVerification,
    status: user.status,
    labels: user.labels ?? [],
  }
}

export default defineEventHandler(async (event): Promise<AdminUserListResponse> => {
  requireAdmin(event)

  const query = getQuery(event)
  const search = String(query.search ?? '').trim()
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const admin = createAdminClient(event)

  const result = await admin.users.list({
    queries: [
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
    ...(search ? { search } : {}),
  })

  return { total: result.total, users: result.users.map(toRow) }
})

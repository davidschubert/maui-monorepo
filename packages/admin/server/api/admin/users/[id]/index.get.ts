import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserDetailResponse, ModeratedComment } from '../../../../../shared/types/admin'

type CommentRow = Models.Row & Omit<ModeratedComment, '$id' | '$createdAt'>

/** Vollständige User-Sicht: Profil, aktive Sessions und letzte Kommentare. */
export default defineEventHandler(async (event): Promise<AdminUserDetailResponse> => {
  requireAdmin(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  let user: Models.User<Models.Preferences>
  try {
    user = await admin.users.get({ userId })
  }
  catch {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  const [sessions, comments] = await Promise.all([
    admin.users.listSessions({ userId }).catch(() => ({ sessions: [] as Models.Session[] })),
    admin.tablesDB.listRows<CommentRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.equal('authorId', userId), Query.orderDesc('$createdAt'), Query.limit(10)],
    }).catch(() => ({ total: 0, rows: [] as CommentRow[] })),
  ])

  const prefs = user.prefs as { bio?: string, avatarUrl?: string }

  return {
    user: {
      $id: user.$id,
      name: user.name,
      email: user.email,
      $createdAt: user.$createdAt,
      accessedAt: user.accessedAt,
      emailVerification: user.emailVerification,
      status: user.status,
      labels: user.labels ?? [],
      phone: user.phone,
      phoneVerification: user.phoneVerification,
      registration: user.registration,
      bio: typeof prefs?.bio === 'string' ? prefs.bio : '',
      avatarUrl: typeof prefs?.avatarUrl === 'string' ? prefs.avatarUrl : '',
    },
    sessions: sessions.sessions.map(s => ({
      $id: s.$id,
      $createdAt: s.$createdAt,
      $updatedAt: s.$updatedAt,
      provider: s.provider,
      ip: s.ip,
      clientName: s.clientName,
      clientVersion: s.clientVersion,
      osName: s.osName,
      osVersion: s.osVersion,
      countryName: s.countryName,
      current: s.current,
    })),
    comments: comments.rows.map(row => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      content: row.content,
      authorId: row.authorId,
      authorName: row.authorName,
      targetId: row.targetId,
      targetType: row.targetType,
      status: row.status,
    })),
    commentsTotal: comments.total,
  }
})

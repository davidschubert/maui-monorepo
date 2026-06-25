import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

/** DSGVO: Daten eines Users als JSON exportieren (Admin) + Audit. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

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
    admin.tablesDB.listRows<Models.Row & { content: string, targetType: string, targetId: string, status: string }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.equal('authorId', userId), Query.orderDesc('$createdAt'), Query.limit(1000)],
    }).catch(() => ({ rows: [] })),
  ])

  await recordAudit(event, { action: 'user.exported', targetType: 'user', targetId: user.$id, targetName: user.name })

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.$id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      registration: user.registration,
      emailVerification: user.emailVerification,
      status: user.status,
      labels: user.labels,
      prefs: user.prefs,
    },
    sessions: sessions.sessions.map(s => ({
      id: s.$id,
      createdAt: s.$createdAt,
      ip: s.ip,
      client: [s.clientName, s.clientVersion].filter(Boolean).join(' '),
      os: [s.osName, s.osVersion].filter(Boolean).join(' '),
      country: s.countryName,
    })),
    comments: comments.rows.map(r => ({
      id: r.$id,
      createdAt: r.$createdAt,
      content: r.content,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
    })),
  }
})

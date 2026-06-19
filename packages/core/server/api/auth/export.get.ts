import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createSessionClient } from '../../lib/appwrite'

/** DSGVO-Datenexport: alle eigenen Daten als JSON (Profil, Sessions, Kommentare). */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const { account, tablesDB } = createSessionClient(event)

  const [acct, sessions, comments] = await Promise.all([
    account.get(),
    account.listSessions().catch(() => ({ sessions: [] as Models.Session[] })),
    tablesDB.listRows<Models.Row & { content: string, targetType: string, targetId: string, status: string }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.equal('authorId', user.$id), Query.orderDesc('$createdAt'), Query.limit(1000)],
    }).catch(() => ({ rows: [] })),
  ])

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: acct.$id,
      name: acct.name,
      email: acct.email,
      phone: acct.phone,
      registration: acct.registration,
      emailVerification: acct.emailVerification,
      labels: acct.labels,
      prefs: acct.prefs,
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

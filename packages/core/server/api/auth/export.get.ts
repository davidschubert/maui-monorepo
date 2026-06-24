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
    // Auch account.get() abfangen: ein einzelner Blip darf nicht den ganzen
    // Export 500en — fällt auf den bereits authentifizierten Context-User zurück.
    account.get().catch(() => null),
    account.listSessions().catch(() => ({ sessions: [] as Models.Session[] })),
    tablesDB.listRows<Models.Row & { content: string, targetType: string, targetId: string, status: string }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.equal('authorId', user.$id), Query.orderDesc('$createdAt'), Query.limit(1000)],
    }).catch(() => ({ rows: [] })),
  ])

  const profile = acct ?? user
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: profile.$id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      registration: profile.registration,
      emailVerification: profile.emailVerification,
      labels: profile.labels,
      prefs: profile.prefs,
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

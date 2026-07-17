import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserComment, AdminUserDetailResponse } from '../../../../../shared/types/admin'

type CommentRow = Models.Row & Omit<AdminUserComment, '$id' | '$createdAt'>

/** Vollständige User-Sicht: Profil, aktive Sessions und letzte Kommentare. */
export default defineEventHandler(async (event): Promise<AdminUserDetailResponse> => {
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

  // 'current' kommt aus der Admin-API immer als false zurück (der API-Key agiert
  // nicht als der User). Schaut ein Admin auf das EIGENE Profil, ermitteln wir
  // die aktive Session über den Session-Client und markieren sie selbst.
  const viewingSelf = event.context.user?.$id === userId
  const currentSessionId = viewingSelf
    ? await createSessionClient(event).account.getSession({ sessionId: 'current' })
        .then(s => s.$id).catch(() => '')
    : ''

  const [sessions, logs, targets, comments] = await Promise.all([
    admin.users.listSessions({ userId }).catch(() => ({ sessions: [] as Models.Session[] })),
    // Aktivitätsprotokoll (historisch, auch beendete Sessions): Logins,
    // Session-/Account-Ereignisse mit Geo/Client/OS/Gerät je Event.
    admin.users.listLogs({ userId, queries: [Query.limit(25)] }).catch(() => ({ logs: [] as Models.Log[] })),
    // Benachrichtigungskanäle (email/sms/push-Targets)
    admin.users.listTargets({ userId }).catch(() => ({ targets: [] as Models.Target[] })),
    admin.tablesDB.listRows<CommentRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'comments',
      queries: [Query.equal('authorId', userId), Query.orderDesc('$createdAt'), Query.limit(10)],
    }).catch(() => ({ total: 0, rows: [] as CommentRow[] })),
  ])

  // Appwrite liefert für nicht auflösbare (lokale/private) IPs 'Unknown' oder '--'
  // als Land — auf leer normalisieren, damit die UI lokalisiert "Unbekannt" zeigt.
  const normalizeCountry = (name: string): string =>
    (!name || name === 'Unknown' || name === '--') ? '' : name

  const prefs = user.prefs as { bio?: string, avatarUrl?: string }

  // Online-Status über die Appwrite Presences API (frisch gefiltert): ist der
  // User in der Liste, ist er online — updatedAt ist sein „zuletzt aktiv".
  const presence = (await listOnlinePresences(event)).find(p => p.userId === userId)
  const online = !!presence
  const lastSeen = presence?.updatedAt ?? ''

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
      mfa: user.mfa,
      passwordUpdate: user.passwordUpdate ?? '',
      online,
      lastSeen,
    },
    // mapSafeSession (core, Auto-Import): vollständige, Secret-freie Session-Sicht
    sessions: sessions.sessions.map(s =>
      mapSafeSession(s, viewingSelf ? s.$id === currentSessionId : s.current),
    ),
    activity: logs.logs.map(log => ({
      event: log.event,
      time: log.time,
      ip: log.ip,
      countryCode: normalizeCountry(log.countryName) ? log.countryCode : '',
      countryName: normalizeCountry(log.countryName),
      clientName: log.clientName,
      clientVersion: log.clientVersion,
      osName: log.osName,
      osVersion: log.osVersion,
      deviceName: log.deviceName,
    })),
    targets: targets.targets.map(target => ({
      $id: target.$id,
      $createdAt: target.$createdAt,
      name: target.name,
      providerType: target.providerType,
      identifier: target.identifier,
      expired: target.expired,
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

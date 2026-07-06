import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createSessionClient } from '../../lib/appwrite'
import type { NotificationListResponse, UserNotification } from '../../../shared/types/notification'

type NotifRow = Models.Row & Omit<UserNotification, '$id' | '$createdAt'>

/** Eigene Benachrichtigungen (rowSecurity → nur die eigenen), neueste zuerst. */
export default defineEventHandler(async (event): Promise<NotificationListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const databaseId = config.public.appwriteDatabaseId
  const recipientFilter = Query.equal('recipientId', event.context.user.$id)

  const res = await tablesDB.listRows<NotifRow>({
    databaseId,
    tableId: 'notifications',
    // recipientId-Filter als Defense-in-Depth zusätzlich zur Row-Security:
    // schützt auch, falls die Tabelle je ohne Per-User-Read-Permissions migriert wird.
    queries: [recipientFilter, Query.orderDesc('$createdAt'), Query.limit(50)],
  }).catch(() => ({ rows: [] as NotifRow[] }))

  const notifications = res.rows.map(r => ({
    $id: r.$id,
    $createdAt: r.$createdAt,
    recipientId: r.recipientId,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.read,
  }))

  // unread über die GESAMTE Menge zählen (Index recipientId+read, system-007) —
  // ungelesene jenseits der neuesten 50 würden im Badge sonst fehlen.
  const unread = await tablesDB.listRows<NotifRow>({
    databaseId,
    tableId: 'notifications',
    queries: [recipientFilter, Query.equal('read', false), Query.limit(1)],
  }).then(r => r.total).catch(() => notifications.filter(n => !n.read).length)

  return { notifications, unread }
})

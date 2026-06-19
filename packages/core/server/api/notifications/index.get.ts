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

  const res = await tablesDB.listRows<NotifRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'notifications',
    queries: [Query.orderDesc('$createdAt'), Query.limit(50)],
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

  return { notifications, unread: notifications.filter(n => !n.read).length }
})

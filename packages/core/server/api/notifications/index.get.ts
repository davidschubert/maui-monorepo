import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createSessionClient } from '../../lib/appwrite'
import { runScopedNotificationQuery } from '../../utils/notificationScope'
import type { NotificationListResponse, UserNotification } from '../../../shared/types/notification'

type NotifRow = Models.Row & Omit<UserNotification, '$id' | '$createdAt'>

/**
 * Eigene Benachrichtigungen (rowSecurity → nur die eigenen), neueste zuerst.
 *
 * GESCOPT auf die Welt DIESES Hosts (C15/Audit S6): Community-Host → nur ihre
 * Meldungen, Kundenbereich → nur kontobezogene, Silo → alles wie bisher.
 * Bestandszeilen ohne Stempel bleiben überall sichtbar (Begründung in
 * shared/notificationScope.ts).
 *
 * BEWUSST WEITER MIT DEM SESSION-CLIENT, nicht über `tenantDb`: die Autorität,
 * WER eine Notification lesen darf, sind ihre Row-Permissions
 * (read(Role.user(recipientId))) — Appwrite gibt einem fremden Session-Client
 * die Zeile gar nicht heraus, und das soll die harte Grenze bleiben. Die Tür
 * würde das eher schwächen: `as:'member'` bringt keinen Vorteil (sie filtert
 * genau auf eine tenantId und wertet Bestandszeilen fail-closed — beides ist
 * hier falsch), und `as:'operator'` würde die Row-Permissions bewusst umgehen
 * und die Empfänger-Grenze durch Anwendungslogik ersetzen. Der Mandant ist bei
 * Notifications ein ABLAGE-Merkmal, kein Zugriffsschutz; für Ablage braucht es
 * keine Datentür.
 */
export default defineEventHandler(async (event): Promise<NotificationListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const databaseId = config.public.appwriteDatabaseId
  const recipientFilter = Query.equal('recipientId', event.context.user.$id)

  const res = await runScopedNotificationQuery(event, scope => tablesDB.listRows<NotifRow>({
    databaseId,
    tableId: 'notifications',
    // recipientId-Filter als Defense-in-Depth zusätzlich zur Row-Security:
    // schützt auch, falls die Tabelle je ohne Per-User-Read-Permissions migriert wird.
    queries: [recipientFilter, ...scope, Query.orderDesc('$createdAt'), Query.limit(50)],
  })).catch(() => ({ rows: [] as NotifRow[] }))

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
  // ungelesene jenseits der neuesten 50 würden im Badge sonst fehlen. Derselbe
  // Scope wie die Liste, sonst zählte der Badge fremde Communities mit.
  const unread = await runScopedNotificationQuery(event, scope => tablesDB.listRows<NotifRow>({
    databaseId,
    tableId: 'notifications',
    queries: [recipientFilter, ...scope, Query.equal('read', false), Query.limit(1)],
  })).then(r => r.total).catch(() => notifications.filter(n => !n.read).length)

  return { notifications, unread }
})

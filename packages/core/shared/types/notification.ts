/** In-App-Benachrichtigung. Table 'notifications' gehört dem core-Layer;
 *  Feature-Layer erzeugen Einträge über den notify()-Server-Util. */
export interface UserNotification {
  $id: string
  $createdAt: string
  recipientId: string
  type: string
  title: string
  body: string
  link: string
  read: boolean
}

export interface NotificationListResponse {
  notifications: UserNotification[]
  unread: number
}

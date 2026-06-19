/** In-App-Benachrichtigung. Table 'notifications' gehört dem admin-Layer. */
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

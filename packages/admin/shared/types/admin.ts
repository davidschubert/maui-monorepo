/** Auf sichere Felder reduzierter Appwrite-User für die Admin-UI */
export interface AdminUserRow {
  $id: string
  name: string
  email: string
  $createdAt: string
  emailVerification: boolean
  /** true = aktiv, false = blockiert (Appwrite-Semantik) */
  status: boolean
  labels: string[]
}

export interface AdminUserListResponse {
  total: number
  users: AdminUserRow[]
}

export interface AdminStats {
  usersTotal: number
  commentsTotal: number
  commentsReported: number
}

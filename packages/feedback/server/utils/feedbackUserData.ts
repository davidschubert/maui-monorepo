import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { FEEDBACK_TABLE, type FeedbackRow } from '../../shared/types/feedback'

/**
 * GDPR-Contributor des feedback-Layers: Feedback ist die Meinungsäußerung
 * des Users → Export vollständig, Löschung als HARD-Delete (kein Kontext
 * Dritter hängt daran, anders als bei Kommentar-Threads).
 */
export async function feedbackExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const rows = await listAllRows<FeedbackRow>(tablesDB, config.public.appwriteDatabaseId, FEEDBACK_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as FeedbackRow[])

  return {
    feedback: rows.map(row => ({
      category: row.category, message: row.message, page: row.page,
      status: row.status, createdAt: row.$createdAt,
    })),
  }
}

export async function feedbackDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0

  // STRIKT (kein catch um deleteRow) — deleteUserCompletely gated users.delete
  // auf Voll-Erfolg. Nur die List degradiert, solange die Migration aussteht.
  const rows = await listAllRows<FeedbackRow>(tablesDB, databaseId, FEEDBACK_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as FeedbackRow[])
  for (const row of rows) {
    await tablesDB.deleteRow({ databaseId, tableId: FEEDBACK_TABLE, rowId: row.$id })
    deleted++
  }

  return { deleted, anonymized: 0 }
}

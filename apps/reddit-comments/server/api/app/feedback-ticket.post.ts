import { z } from 'zod'
import { FEEDBACK_TABLE, type FeedbackRow } from '../../../../../packages/feedback/shared/types/feedback'

/**
 * Feedback → Ticket — APP-Route (A14: die App komponiert feedback + tickets,
 * die Layer kennen sich nicht; Muster events/checkout). Liest die Feedback-Row,
 * erzeugt über createTicketFromFeedback (tickets-Layer, Auto-Import) das Ticket
 * in der ersten Board-Liste und markiert das Feedback als erledigt — es lebt
 * ab jetzt auf dem Board. Doppel-Übernahme → 409 (feedbackId-Rückreferenz).
 */
const bodySchema = z.object({ feedbackId: z.string().min(1).max(36) })

export default defineEventHandler(async (event) => {
  // Beide Seiten des Vertrags: Feedback sichten UND Board schreiben
  requirePermission(event, 'feedback.manage')
  requirePermission(event, 'tickets.manage')

  const { feedbackId } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const feedback = await tablesDB.getRow<FeedbackRow>({
    databaseId, tableId: FEEDBACK_TABLE, rowId: feedbackId,
  }).catch((error) => {
    throw toH3Error(error, 'Feedback not found')
  })

  const ticket = await createTicketFromFeedback(event, {
    feedbackId: feedback.$id,
    category: feedback.category,
    message: feedback.message,
    page: feedback.page,
    userName: feedback.userName,
    createdAt: feedback.$createdAt,
  })

  // Feedback gilt mit der Übernahme als gesichtet (lebt jetzt auf dem Board)
  if (feedback.status === 'open') {
    await tablesDB.updateRow({
      databaseId, tableId: FEEDBACK_TABLE, rowId: feedback.$id, data: { status: 'resolved' },
    }).catch((error) => {
      throw toH3Error(error, 'Could not resolve feedback')
    })
  }

  // KI-Triage best-effort im Hintergrund (P3) — blockiert die Antwort nicht;
  // Realtime schiebt das Ergebnis aufs offene Board, sobald es da ist
  if (getTicketsAiConfig().enabled) {
    void triageTicket(event, ticket.$id).catch((error) => {
      console.warn('[app] Auto-Triage nach Feedback-Übernahme fehlgeschlagen:', error)
    })
  }

  return { ticketId: ticket.$id }
})

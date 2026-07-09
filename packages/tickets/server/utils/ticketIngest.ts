import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketLabel, type TicketListRow, type TicketRow } from '../../shared/types/ticket'

/**
 * P2 Feedback-Ingestion (Plan §7): erzeugt aus einem Feedback-Inhalt ein
 * Ticket in der ERSTEN Board-Liste (Inbox-Semantik — Listen sind Daten,
 * keine Enum). Der tickets-Layer kennt feedback NICHT — die APP verdrahtet
 * (A14) und reicht die Inhalte hier herein; `feedbackId` ist die
 * Rückreferenz und verhindert Doppel-Übernahmen (409).
 */
export interface FeedbackTicketInput {
  feedbackId: string
  category: 'idea' | 'bug' | 'other'
  message: string
  page?: string
  userName?: string
  createdAt?: string
}

export async function createTicketFromFeedback(event: H3Event, input: FeedbackTicketInput): Promise<TicketRow> {
  const user = requirePermission(event, 'tickets.manage')
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await tablesDB.listRows<TicketRow>({
    databaseId, tableId: TICKETS_TABLE,
    queries: [Query.equal('feedbackId', input.feedbackId), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not check existing tickets')
  })
  if (existing.total > 0) {
    throw createError({ status: 409, statusText: 'Feedback already converted' })
  }

  const lists = await tablesDB.listRows<TicketListRow>({
    databaseId, tableId: TICKET_LISTS_TABLE,
    queries: [Query.orderAsc('position'), Query.limit(1)],
  })
  const inbox = lists.rows[0]
  if (!inbox) {
    throw createError({ status: 400, statusText: 'Board has no lists' })
  }

  const firstLine = input.message.trim().split('\n')[0] ?? ''
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : (firstLine || 'Feedback')

  const meta: string[] = []
  if (input.userName) meta.push(`**Von:** ${input.userName}`)
  if (input.page) meta.push(`**Seite:** ${input.page}`)
  if (input.createdAt) meta.push(`**Eingegangen:** ${input.createdAt.slice(0, 10)}`)
  // Kein '## …'-Heading: der Core-Markdown-Sink (MarkdownContent) rendert
  // Headings nicht — Zitat + Meta-Zeile reichen als Struktur
  const description = [
    ...input.message.trim().split('\n').map(line => `> ${line}`),
    ...(meta.length ? ['', meta.join(' · ')] : []),
  ].join('\n')

  const position = await nextTicketPosition(tablesDB, databaseId, TICKETS_TABLE, inbox.$id)
  const label: TicketLabel = input.category === 'bug' ? 'issue' : input.category

  return await tablesDB.createRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ID.unique(),
    data: {
      listId: inbox.$id,
      title,
      description,
      label,
      priority: '',
      effort: '',
      startAt: null,
      dueAt: null,
      checklist: '',
      membersJson: '',
      status: 'open',
      doneAt: null,
      position,
      feedbackId: input.feedbackId,
      createdBy: user.$id,
      createdByName: user.name ?? '',
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create ticket from feedback')
  })
}

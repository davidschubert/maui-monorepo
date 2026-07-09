import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKET_WATCHERS_TABLE, type TicketMember, type TicketRow, type TicketWatcherRow } from '../../shared/types/ticket'

/**
 * Ticket-Benachrichtigungen (P4): Empfänger = Beobachter (ticket_watchers)
 * ∪ Karten-Mitglieder, minus Auslöser. Läuft über den core-Vertrag notify()
 * (In-App-Bell; speichert bewusst fertigen Text — ein späteres Messaging-
 * Produkt dockt am selben Vertrag an). Best-effort: Fehler loggen, nie werfen.
 */
export async function notifyTicketPeople(event: H3Event, ticket: TicketRow, input: {
  title: string
  body: string
  excludeUserId?: string
}): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)

    const watchers = await tablesDB.listRows<TicketWatcherRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: TICKET_WATCHERS_TABLE,
      queries: [Query.equal('ticketId', ticket.$id), Query.limit(100)],
    })

    const recipients = new Set<string>(watchers.rows.map(w => w.userId))
    try {
      for (const member of JSON.parse(ticket.membersJson || '[]') as TicketMember[]) recipients.add(member.id)
    }
    catch { /* kaputtes JSON → nur Watcher */ }
    if (input.excludeUserId) recipients.delete(input.excludeUserId)

    for (const recipientId of recipients) {
      await notify(event, {
        recipientId,
        type: 'reminder',
        title: input.title,
        body: input.body,
        link: `/dashboard/tickets?ticket=${ticket.$id}`,
        ...(input.excludeUserId ? { senderId: input.excludeUserId } : {}),
      })
    }
  }
  catch (error) {
    console.warn('[tickets] Benachrichtigung fehlgeschlagen (best-effort):', error)
  }
}

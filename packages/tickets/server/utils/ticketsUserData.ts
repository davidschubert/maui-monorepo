import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKETS_TABLE, type TicketMember, type TicketRow } from '../../shared/types/ticket'

/**
 * GDPR-Contributor des tickets-Layers (Vertrag: core/server/utils/userData.ts).
 * Tickets sind Betreiber-Arbeitsdaten: bei Löschung wird der Ersteller
 * pseudonymisiert (Inhalt bleibt — er gehört dem Board, nicht dem User) und
 * der User aus allen Mitglieder-Listen entfernt.
 */
export async function ticketsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const created = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.equal('createdBy', userId)])
  const memberOf = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.contains('membersJson', userId)])

  return {
    createdTickets: created.map(ticket => ({
      title: ticket.title, description: ticket.description, label: ticket.label,
      priority: ticket.priority, effort: ticket.effort, status: ticket.status,
      createdAt: ticket.$createdAt,
    })),
    memberOfTickets: memberOf.map(ticket => ({ title: ticket.title, createdAt: ticket.$createdAt })),
  }
}

export async function ticketsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let anonymized = 0

  const created = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.equal('createdBy', userId)])
  for (const ticket of created) {
    await tablesDB.updateRow({
      databaseId, tableId: TICKETS_TABLE, rowId: ticket.$id,
      data: { createdBy: '', createdByName: '' },
    })
    anonymized++
  }

  const memberOf = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.contains('membersJson', userId)])
  for (const ticket of memberOf) {
    const members = (JSON.parse(ticket.membersJson || '[]') as TicketMember[]).filter(m => m.id !== userId)
    await tablesDB.updateRow({
      databaseId, tableId: TICKETS_TABLE, rowId: ticket.$id,
      data: { membersJson: members.length ? JSON.stringify(members) : '' },
    })
    anonymized++
  }

  return { deleted: 0, anonymized }
}

import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKETS_TABLE, TICKET_FILES_TABLE, TICKET_WATCHERS_TABLE, type TicketFileRow, type TicketMember, type TicketRow, type TicketWatcherRow } from '../../shared/types/ticket'

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
  // P4: Beobachtungen + hochgeladene Anhänge (degradieren vor Migration 003)
  const watching = await listAllRows<TicketWatcherRow>(tablesDB, databaseId, TICKET_WATCHERS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as TicketWatcherRow[])
  const uploads = await listAllRows<TicketFileRow>(tablesDB, databaseId, TICKET_FILES_TABLE, [Query.equal('uploadedBy', userId)])
    .catch(() => [] as TicketFileRow[])

  return {
    createdTickets: created.map(ticket => ({
      title: ticket.title, description: ticket.description, label: ticket.label,
      priority: ticket.priority, effort: ticket.effort, status: ticket.status,
      createdAt: ticket.$createdAt,
    })),
    memberOfTickets: memberOf.map(ticket => ({ title: ticket.title, createdAt: ticket.$createdAt })),
    watchingTickets: watching.map(w => ({ ticketId: w.ticketId, createdAt: w.$createdAt })),
    uploadedFiles: uploads.map(f => ({ name: f.name, size: f.size, createdAt: f.$createdAt })),
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

  // P4: Beobachtungen hart löschen (reine Verhaltensdaten); Anhänge bleiben
  // Board-Arbeitsmaterial — nur der Uploader wird pseudonymisiert.
  // STRIKT (kein catch-Schlucken): deleteUserCompletely gated auf Voll-Erfolg;
  // vor Migration 003 existieren die Tables schlicht nicht → 404 wirft, das
  // ist auf solchen Instanzen korrekt sichtbar statt still übersprungen.
  let deleted = 0
  const watching = await listAllRows<TicketWatcherRow>(tablesDB, databaseId, TICKET_WATCHERS_TABLE, [Query.equal('userId', userId)])
  for (const row of watching) {
    await tablesDB.deleteRow({ databaseId, tableId: TICKET_WATCHERS_TABLE, rowId: row.$id })
    deleted++
  }
  const uploads = await listAllRows<TicketFileRow>(tablesDB, databaseId, TICKET_FILES_TABLE, [Query.equal('uploadedBy', userId)])
  for (const row of uploads) {
    await tablesDB.updateRow({ databaseId, tableId: TICKET_FILES_TABLE, rowId: row.$id, data: { uploadedBy: '' } })
    anonymized++
  }

  return { deleted, anonymized }
}

import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_RSVPS_TABLE, EVENT_TICKETS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow, type EventTicketRow, type EventVote } from '../../shared/types/event'

/**
 * GDPR-Contributor des events-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * RSVPs → Hard-Delete (reine Verhaltens-Daten des Users); war die RSVP
 * 'going', sinkt der denormalisierte attendeeCount atomar mit.
 * Organisierte Events → cancelled + organizerName anonymisiert (der Termin
 * ist Kontext der Teilnehmer, wie Posts-Tombstones — Muster Phase 25).
 */
export async function eventsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const rsvps = await listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [Query.equal('userId', userId)])
  const organized = await listAllRows<EventRow>(tablesDB, databaseId, EVENTS_TABLE, [Query.equal('organizerId', userId)])
  // Degradiert auf leer, solange Migration 003 auf einer Instanz aussteht
  const votes = await listAllRows<EventVote>(tablesDB, databaseId, EVENT_VOTES_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as EventVote[])
  // Kauf-Metadaten (Rechnungen liegen bei Stripe); degradiert vor Migration 004
  const tickets = await listAllRows<EventTicketRow>(tablesDB, databaseId, EVENT_TICKETS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as EventTicketRow[])

  return {
    rsvps: rsvps.map(r => ({ eventId: r.eventId, status: r.status, createdAt: r.$createdAt })),
    votes: votes.map(v => ({ eventId: v.eventId, value: v.value, createdAt: v.$createdAt })),
    tickets: tickets.map(tk => ({ eventId: tk.eventId, status: tk.status, amount: tk.amount, createdAt: tk.$createdAt })),
    organizedEvents: organized.map(e => ({
      title: e.title, description: e.description, startAt: e.startAt, endAt: e.endAt,
      location: e.location, status: e.status, createdAt: e.$createdAt,
    })),
  }
}

export async function eventsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // RSVPs: Hard-Delete. STRIKT — deleteUserCompletely gated users.delete auf
  // Voll-Erfolg, ein geschluckter Fehler wäre eine Lücke. Nur der Zähler-
  // Decrement degradiert bei bereits verschwundenem Event (404).
  const rsvps = await listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [Query.equal('userId', userId)])
  for (const rsvp of rsvps) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_RSVPS_TABLE, rowId: rsvp.$id })
    deleted++
    if (rsvp.status === 'going') {
      await tablesDB.decrementRowColumn({
        databaseId, tableId: EVENTS_TABLE, rowId: rsvp.eventId, column: 'attendeeCount', value: 1, min: 0,
      }).catch(() => {})
    }
  }

  // Up-/Downvotes: Hard-Delete (Zähler-Drift bis zum nächsten Vote
  // akzeptiert — Präzedenzfall posts/comments). List degradiert vor
  // Migration 003.
  const votes = await listAllRows<EventVote>(tablesDB, databaseId, EVENT_VOTES_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as EventVote[])
  for (const vote of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  // Tickets: Hard-Delete (Kauf-Metadaten des Users; die steuerliche
  // Wahrheit liegt bei Stripe). List degradiert vor Migration 004.
  const tickets = await listAllRows<EventTicketRow>(tablesDB, databaseId, EVENT_TICKETS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as EventTicketRow[])
  for (const ticket of tickets) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_TICKETS_TABLE, rowId: ticket.$id })
    deleted++
  }

  // Organisierte Events: Soft-Cancel + Anonymisierung (idempotent)
  const organized = await listAllRows<EventRow>(tablesDB, databaseId, EVENTS_TABLE, [Query.equal('organizerId', userId)])
  for (const row of organized) {
    if (row.status === 'cancelled' && row.organizerName === '') continue
    await tablesDB.updateRow({
      databaseId,
      tableId: EVENTS_TABLE,
      rowId: row.$id,
      data: { status: 'cancelled', organizerName: '' },
    })
    anonymized++
  }

  return { deleted, anonymized }
}

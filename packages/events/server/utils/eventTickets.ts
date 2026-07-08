import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_TICKETS_TABLE, effectiveAccess, type EventRow, type EventTicketRow } from '../../shared/types/event'

/**
 * Paid-Events-Vertrag (EVENTS-V2 §4/§5, Muster registerUserDataContributor):
 * events kennt KEIN Stripe — die APP registriert den Guard (Phase 23 ruft
 * darin die Billing-Logik auf; bis dahin genügt der Ticket-Row-Check
 * hasEventTicket). OHNE registrierten Guard sind paid-Events FAIL-CLOSED.
 * Der Billing-Webhook schreibt Tickets ausschließlich über die exportierte,
 * typisierte Schnittstelle grantEventTicket() — kein Schema-Wissen nötig.
 */
export type EventTicketGuard = (event: H3Event, row: EventRow, userId: string) => Promise<boolean>

let ticketGuard: EventTicketGuard | null = null

/** Registrierung durch die APP (Nitro-Plugin) — letzter Aufruf gewinnt */
export function registerEventTicketGuard(guard: EventTicketGuard): void {
  ticketGuard = guard
}

/**
 * Gate für den Übergang ZU 'going' auf paid-Events. free/members-Verhalten
 * bleibt unberührt; maybe/declined sind auch auf paid frei (Interesse zeigen
 * kostet nichts).
 */
export async function assertCanRsvpGoing(event: H3Event, row: EventRow, userId: string): Promise<void> {
  if (effectiveAccess(row) !== 'paid') return
  if (!ticketGuard) {
    // FAIL-CLOSED: ohne Guard-Verdrahtung ist kein paid-Zugang möglich
    throw createError({ status: 403, statusText: 'Paid event — ticketing not configured' })
  }
  const allowed = await ticketGuard(event, row, userId).catch(() => false)
  if (!allowed) {
    throw createError({ status: 403, statusText: 'Ticket required' })
  }
}

/** Hat der User ein bezahltes Ticket? (Standard-Guard-Implementierung) */
export async function hasEventTicket(event: H3Event, eventId: string, userId: string): Promise<boolean> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<EventTicketRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENT_TICKETS_TABLE,
    queries: [
      Query.equal('eventId', eventId),
      Query.equal('userId', userId),
      Query.equal('status', 'paid'),
      Query.limit(1),
    ],
  }).catch(() => ({ rows: [] as EventTicketRow[] }))
  return res.rows.length > 0
}

export interface GrantEventTicketInput {
  eventId: string
  userId: string
  stripeSessionId?: string
  amount?: number
}

/**
 * Ticket ausstellen (idempotent) — der EINZIGE Schreibweg in event_tickets.
 * Konsument: der Billing-Webhook (Phase 23) bei checkout.session.completed.
 * Unique-Index eventId+userId macht Webhook-Retries gefahrlos.
 */
export async function grantEventTicket(event: H3Event, input: GrantEventTicketInput): Promise<EventTicketRow> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  try {
    return await admin.tablesDB.createRow<EventTicketRow>({
      databaseId,
      tableId: EVENT_TICKETS_TABLE,
      rowId: ID.unique(),
      data: {
        eventId: input.eventId,
        userId: input.userId,
        status: 'paid',
        stripeSessionId: input.stripeSessionId ?? null,
        amount: input.amount ?? null,
      },
      // eigenes Ticket lesbar (account/billing-Ansichten, Export)
      permissions: [Permission.read(Role.user(input.userId))],
    })
  }
  catch (error) {
    // Unique-Race/Webhook-Retry: bestehendes Ticket ist das Ergebnis
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      const existing = await admin.tablesDB.listRows<EventTicketRow>({
        databaseId,
        tableId: EVENT_TICKETS_TABLE,
        queries: [Query.equal('eventId', input.eventId), Query.equal('userId', input.userId), Query.limit(1)],
      })
      if (existing.rows[0]) return existing.rows[0]
    }
    throw error
  }
}

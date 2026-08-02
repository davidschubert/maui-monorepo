import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENTS_TABLE, EVENT_TICKETS_TABLE, effectiveAccess, type EventRow, type EventTicketRow } from '../../shared/types/event'

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

/**
 * Hat der User ein bezahltes Ticket? (Standard-Guard-Implementierung.)
 * Datentür als Operator: im Pool zählt nur ein Ticket des EIGENEN Mandanten —
 * fail-closed, solange der Billing-Webhook dort keine Tickets stempelt
 * (paid-Events im Pool sind noch nicht verdrahtet).
 */
export async function hasEventTicket(event: H3Event, eventId: string, userId: string): Promise<boolean> {
  const ticket = await tenantDb(event, { as: 'operator' }).find<EventTicketRow>(EVENT_TICKETS_TABLE, [
    Query.equal('eventId', eventId),
    Query.equal('userId', userId),
    Query.equal('status', 'paid'),
  ]).catch(() => null)
  return ticket !== null
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
 *
 * BEWUSST Admin-Client statt Datentür (CLAUDE.md-Ausnahme: der Webhook ist
 * kein Mandanten-Request — er kommt von Stripe, ohne Tenant-Host, `useTenant`
 * ist hier null und `tenantDb` könnte deshalb weder scopen noch stempeln).
 *
 * DER MANDANT KOMMT AUS DEM EVENT (Audit-Befund S7): das Ticket gehört dem
 * Mandanten SEINES Events — die einzige Ableitung, die stimmen kann. Ist das
 * Event nicht lesbar, wird geworfen statt ungestempelt geschrieben; ein
 * Webhook-Retry ist die richtige Antwort, ein unauffindbares Ticket nicht
 * (Webhook-Regel: transiente Fehler werfen, nie still zurückkehren).
 *
 * DIE SPALTE HEISST `communityId` (Befund vom 2026-08-02, der Geldpfad war
 * kaputt): E8-3 hat `tenantId` in allen events-Tabellen ersetzt (events-007
 * additiv, events-008 gelöscht) — dieser Pfad schrieb weiter den alten Namen.
 * Appwrite lehnt unbekannte Felder mit `400 row_invalid_structure` ab, also
 * entstand seither KEIN Ticket mehr: der Kunde zahlte, der Webhook wiederholte
 * endlos, und `assertCanRsvpGoing` hielt genau ihn mit 403 vor der Tür. Der
 * zweite, unabhängige Bruch saß im Lesepfad — `hasEventTicket` sucht durch die
 * Datentür, und die filtert auf `communityId`.
 *
 * Wer hier ein Feld ändert, ändert eine SCHEMA-Zusage: der Beweis dafür ist
 * `scripts/verify-paid-ticket.mjs` gegen die echte Instanz, nicht der
 * Unit-Test — ein gemockter Row-Store nimmt jeden Feldnamen an.
 */
export async function grantEventTicket(event: H3Event, input: GrantEventTicketInput): Promise<EventTicketRow> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const eventRow = await admin.tablesDB.getRow<EventRow>({
    databaseId, tableId: EVENTS_TABLE, rowId: input.eventId,
  }).catch((error: unknown) => { throw toH3Error(error, 'Event not found') })

  // `unknown` statt eines engen Row-Typs, wie in rowBelongsToTenant: die
  // Spalte ist additiv (events-007) und steht in keinem Row-Interface. Im
  // Silo/Bestand ist sie '' — das ist der ehrliche Wert („gehört keinem
  // Mandanten, weil es keine gibt"), keine erfundene Zugehörigkeit.
  const eventCommunityId = (eventRow as { communityId?: unknown }).communityId
  const communityId = typeof eventCommunityId === 'string' ? eventCommunityId : ''

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
        communityId,
      },
      // eigenes Ticket lesbar (account/billing-Ansichten, Export)
      permissions: [Permission.read(Role.user(input.userId))],
    })
  }
  catch (error) {
    // Unique-Race/Webhook-Retry: bestehendes Ticket ist das Ergebnis.
    // BEWUSST OHNE communityId-Filter: gesucht wird über `eventId`, und das ist
    // eine GLOBAL eindeutige Appwrite-Row-Id — zwei Mandanten können sie gar
    // nicht teilen, der Filter könnte also nichts Fremdes abwehren. Er würde
    // aber Bestands-Tickets (vor diesem Stempel geschrieben) unauffindbar
    // machen und aus einem harmlosen Retry ein hartes Scheitern.
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

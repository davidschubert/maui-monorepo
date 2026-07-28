import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { assertCanRsvpGoing, grantEventTicket, hasEventTicket, registerEventTicketGuard } from '../server/utils/eventTickets'
import type { EventRow } from '../shared/types/event'

/**
 * S7 (vormals N5b) — der Paid-Events-Webhook stempelt den Mandanten.
 *
 * ZUSTAND VORHER: `grantEventTicket()` schrieb am Mandanten-Scope vorbei,
 * `hasEventTicket()` liest durch die Datentür. Daraus folgte: ein im Pool
 * ausgestelltes Ticket war für den Lesepfad UNSICHTBAR — paid-Events blieben
 * dort fail-closed (D1). Diese Suite hat genau das festgenagelt.
 *
 * ZUSTAND JETZT: der Webhook hat weiterhin keinen Tenant-Host (er kommt von
 * Stripe), leitet den Mandanten aber aus dem EVENT ab — die einzige Quelle,
 * die stimmen kann: das Ticket gehört dem Mandanten seines Events. Die Suite
 * dreht sich damit um; sie beweist jetzt, dass der Lesepfad das eigene Ticket
 * findet, das des NACHBARN aber nicht, und dass ein nicht lesbares Event zu
 * einem Fehler führt statt zu einem ungestempelten Ticket.
 */

interface TicketRecord { $id: string, eventId: string, userId: string, status: string, tenantId?: string }

const store: TicketRecord[] = []
/** Events, aus denen der Stempel abgeleitet wird (Id → tenantId der Row). */
const events = new Map<string, string>()

const createRow = vi.fn(async ({ data, rowId }: { data: Record<string, unknown>, rowId: string }) => {
  const row = { $id: rowId, ...data } as TicketRecord
  store.push(row)
  return row
})

const getRow = vi.fn(async ({ rowId }: { rowId: string }) => {
  const tenantId = events.get(rowId)
  if (tenantId === undefined) {
    const err = new Error('Row not found') as Error & { code?: number }
    err.code = 404
    throw err
  }
  return { $id: rowId, tenantId }
})

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.createError = (input: { status?: number, statusText?: string }) => {
    const err = new Error(input.statusText ?? 'Error') as Error & { status?: number }
    err.status = input.status
    return err
  }
  g.toH3Error = (_error: unknown, statusText: string) => {
    const err = new Error(statusText) as Error & { status?: number }
    err.status = 404
    return err
  }
  g.useRuntimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })
  g.createAdminClient = () => ({ tablesDB: { createRow, getRow, listRows: async () => ({ rows: [] }) } })

  /**
   * Modell der Datentür (tenantDb `as: 'operator'`): `find` filtert die
   * mitgegebenen Query.equal-Bedingungen UND scopet IMMER zusätzlich auf den
   * Mandanten des Requests. Genau dieser implizite Scope ist der Grund, warum
   * ein ungestempeltes Ticket im Pool nicht gefunden wurde.
   */
  g.tenantDb = (event: H3Event) => ({
    find: async (_table: string, queries: string[]) => {
      const tenantId = (event.context as { tenant?: { tenantId?: string } }).tenant?.tenantId
      const conditions = queries
        .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
        .filter(c => c.method === 'equal')
      return store.find(row =>
        conditions.every(c => (row as unknown as Record<string, unknown>)[c.attribute] === c.values[0])
        // Die Tür: im Pool zählt nur der EIGENE Mandant.
        && (tenantId ? row.tenantId === tenantId : true),
      ) ?? null
    },
  })
})

afterEach(() => {
  store.length = 0
  events.clear()
  createRow.mockClear()
  getRow.mockClear()
  registerEventTicketGuard(async () => false)
})

const poolEvent = { context: { tenant: { mode: 'pool', projectId: 'p', tenantId: 'kunde-a', siteId: 's-a' } } } as unknown as H3Event
const siloEvent = { context: {} } as unknown as H3Event

const paidRow = { $id: 'ev-1', access: 'paid' } as EventRow

describe('grantEventTicket stempelt den Mandanten SEINES Events (S7)', () => {
  it('übernimmt die tenantId aus der Event-Row, nicht aus dem Request', async () => {
    // Der Request hat gar keinen brauchbaren Mandanten (Stripe-Webhook) —
    // maßgeblich ist allein das Event.
    events.set('ev-1', 'kunde-a')
    await grantEventTicket(siloEvent, { eventId: 'ev-1', userId: 'u-1', stripeSessionId: 'cs_1', amount: 900 })

    const data = createRow.mock.calls[0]?.[0].data as Record<string, unknown>
    expect(data).toMatchObject({ eventId: 'ev-1', userId: 'u-1', status: 'paid', tenantId: 'kunde-a' })
  })

  it('schreibt im Silo den ehrlichen Leerwert statt einer erfundenen Zugehörigkeit', async () => {
    events.set('ev-1', '')
    await grantEventTicket(siloEvent, { eventId: 'ev-1', userId: 'u-1' })

    const data = createRow.mock.calls[0]?.[0].data as Record<string, unknown>
    expect(data.tenantId).toBe('')
  })

  it('wirft, wenn das Event nicht lesbar ist — statt ungestempelt zu schreiben', async () => {
    // Ein Webhook-Retry ist die richtige Antwort. Ein Ticket, das der Lesepfad
    // nie findet, wäre die falsche: der Kunde hat bezahlt.
    await expect(grantEventTicket(poolEvent, { eventId: 'ev-weg', userId: 'u-1' })).rejects.toThrow()
    expect(createRow).not.toHaveBeenCalled()
    expect(store).toHaveLength(0)
  })
})

describe('Der Lesepfad findet das eigene Ticket jetzt — und nur das eigene', () => {
  it('sieht das eben ausgestellte Ticket im Mandanten-Kontext', async () => {
    events.set('ev-1', 'kunde-a')
    await grantEventTicket(poolEvent, { eventId: 'ev-1', userId: 'u-1' })
    expect(store).toHaveLength(1)
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(true)
  })

  it('lässt RSVP „going" mit dem Standard-Guard durch', async () => {
    events.set('ev-1', 'kunde-a')
    await grantEventTicket(poolEvent, { eventId: 'ev-1', userId: 'u-1' })
    registerEventTicketGuard((e, row, userId) => hasEventTicket(e, row.$id, userId))
    await expect(assertCanRsvpGoing(poolEvent, paidRow, 'u-1')).resolves.toBeUndefined()
  })

  it('lässt ein Ticket des NACHBARN nicht durch', async () => {
    store.push({ $id: 't-3', eventId: 'ev-1', userId: 'u-1', status: 'paid', tenantId: 'kunde-b' })
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(false)
  })

  it('lässt BESTANDS-Tickets ohne Stempel im Pool weiterhin draußen (fail-closed)', async () => {
    // Vor S7 geschriebene Rows bleiben unsichtbar — dieselbe Regel wie bei
    // posts-004/events-006. Bewusst kein Nachziehen im Lesepfad.
    store.push({ $id: 't-alt', eventId: 'ev-1', userId: 'u-1', status: 'paid' })
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(false)
  })
})

describe('Silo (comments-App): Ticketing funktioniert wie bisher', () => {
  it('findet das Ticket ohne Mandanten-Kontext — dort gibt es nichts zu scopen', async () => {
    events.set('ev-1', '')
    await grantEventTicket(siloEvent, { eventId: 'ev-1', userId: 'u-1' })
    expect(await hasEventTicket(siloEvent, 'ev-1', 'u-1')).toBe(true)

    registerEventTicketGuard((e, row, userId) => hasEventTicket(e, row.$id, userId))
    await expect(assertCanRsvpGoing(siloEvent, paidRow, 'u-1')).resolves.toBeUndefined()
  })
})

describe('Ohne registrierten Guard sind paid-Events zu', () => {
  it('wirft 403, auch wenn ein passendes Ticket existiert', async () => {
    // Die Guard-Registry ist Modul-State — ein frisch geladenes Modul hat
    // keinen Guard, genau wie ein Deployment, in dem die App ihn nie registriert.
    vi.resetModules()
    const fresh = await import('../server/utils/eventTickets')
    store.push({ $id: 't-4', eventId: 'ev-1', userId: 'u-1', status: 'paid', tenantId: 'kunde-a' })
    await expect(fresh.assertCanRsvpGoing(poolEvent, paidRow, 'u-1')).rejects.toMatchObject({ status: 403 })
  })

  it('lässt free-Events davon unberührt', async () => {
    vi.resetModules()
    const fresh = await import('../server/utils/eventTickets')
    await expect(fresh.assertCanRsvpGoing(poolEvent, { $id: 'ev-2', access: 'free' } as EventRow, 'u-1'))
      .resolves.toBeUndefined()
  })
})

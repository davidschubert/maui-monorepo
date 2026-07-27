import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { assertCanRsvpGoing, grantEventTicket, hasEventTicket, registerEventTicketGuard } from '../server/utils/eventTickets'
import type { EventRow } from '../shared/types/event'

/**
 * N5b — der DOKUMENTIERTE Zustand des Paid-Events-Webhooks, festgenagelt.
 *
 * `grantEventTicket()` schreibt bewusst am Mandanten-Scope vorbei (der Stripe-
 * Webhook hat keinen Tenant-Host), `hasEventTicket()` liest durch die Datentür.
 * Daraus folgt: ein im Pool ausgestelltes Ticket ist für den Lesepfad
 * UNSICHTBAR — paid-Events bleiben dort fail-closed, bis der Webhook den
 * Mandanten aus dem Event ableitet und stempelt. Kein Umbau, nur der Beweis,
 * dass „fail-closed" wirklich fail-closed heißt (und nicht versehentlich offen).
 */

interface TicketRecord { $id: string, eventId: string, userId: string, status: string, tenantId?: string }

const store: TicketRecord[] = []
const createRow = vi.fn(async ({ data, rowId }: { data: Record<string, unknown>, rowId: string }) => {
  const row = { $id: rowId, ...data } as TicketRecord
  store.push(row)
  return row
})

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.createError = (input: { status?: number, statusText?: string }) => {
    const err = new Error(input.statusText ?? 'Error') as Error & { status?: number }
    err.status = input.status
    return err
  }
  g.useRuntimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })
  g.createAdminClient = () => ({ tablesDB: { createRow, listRows: async () => ({ rows: [] }) } })

  /**
   * Modell der Datentür (tenantDb `as: 'operator'`): `find` filtert die
   * mitgegebenen Query.equal-Bedingungen UND scopet IMMER zusätzlich auf den
   * Mandanten des Requests. Genau dieser implizite Scope ist der Grund, warum
   * ein ungestempeltes Ticket im Pool nicht gefunden wird.
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
  createRow.mockClear()
  registerEventTicketGuard(async () => false)
})

const poolEvent = { context: { tenant: { mode: 'pool', projectId: 'p', tenantId: 'kunde-a', siteId: 's-a' } } } as unknown as H3Event
const siloEvent = { context: {} } as unknown as H3Event

const paidRow = { $id: 'ev-1', access: 'paid' } as EventRow

describe('grantEventTicket stempelt (noch) keinen Mandanten', () => {
  it('schreibt die Ticket-Row ohne tenantId — der Webhook kennt keinen Tenant-Host', async () => {
    await grantEventTicket(poolEvent, { eventId: 'ev-1', userId: 'u-1', stripeSessionId: 'cs_1', amount: 900 })
    const data = createRow.mock.calls[0]?.[0].data as Record<string, unknown>
    expect(data).not.toHaveProperty('tenantId')
    expect(data).toMatchObject({ eventId: 'ev-1', userId: 'u-1', status: 'paid' })
  })
})

describe('Fail-closed: ein Pool-Ticket ohne tenantId bleibt unsichtbar', () => {
  it('findet das eben ausgestellte Ticket im Mandanten-Kontext NICHT', async () => {
    await grantEventTicket(poolEvent, { eventId: 'ev-1', userId: 'u-1' })
    expect(store).toHaveLength(1)
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(false)
  })

  it('bleibt auch mit dem Standard-Guard zu — RSVP „going" scheitert mit 403', async () => {
    await grantEventTicket(poolEvent, { eventId: 'ev-1', userId: 'u-1' })
    registerEventTicketGuard((e, row, userId) => hasEventTicket(e, row.$id, userId))
    await expect(assertCanRsvpGoing(poolEvent, paidRow, 'u-1')).rejects.toMatchObject({ status: 403 })
  })

  it('würde ein GESTEMPELTES Ticket sehen — der Scope ist die einzige Ursache', async () => {
    // Gegenprobe: derselbe Lesepfad, nur mit tenantId auf der Row. Damit ist
    // belegt, dass der fehlende Stempel (nicht etwa der Test) das Nein erzeugt.
    store.push({ $id: 't-2', eventId: 'ev-1', userId: 'u-1', status: 'paid', tenantId: 'kunde-a' })
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(true)
  })

  it('lässt ein Ticket des NACHBARN nicht durch', async () => {
    store.push({ $id: 't-3', eventId: 'ev-1', userId: 'u-1', status: 'paid', tenantId: 'kunde-b' })
    expect(await hasEventTicket(poolEvent, 'ev-1', 'u-1')).toBe(false)
  })
})

describe('Silo (comments-App): Ticketing funktioniert wie bisher', () => {
  it('findet das Ticket ohne Mandanten-Kontext — dort gibt es nichts zu scopen', async () => {
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

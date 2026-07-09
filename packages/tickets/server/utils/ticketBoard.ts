import { Query } from 'node-appwrite'
import type { TablesDB } from 'node-appwrite'
import type { H3Event } from 'h3'
import { TICKET_LISTS_TABLE } from '../../shared/types/ticket'
import type { TICKETS_TABLE, TicketListRow, TicketRow } from '../../shared/types/ticket'

/**
 * Gemeinsame Helfer der Ticket-Routen. Alle Writes laufen über den
 * Admin-Client (Tables ohne User-Write-Permissions — requirePermission
 * 'tickets.manage' ist die Autorität davor).
 */

export const POSITION_GAP = 1000

/** Nächste End-Position (max + GAP) — Midpoint-Insertion macht der Client */
export async function nextTicketPosition(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: typeof TICKETS_TABLE | typeof TICKET_LISTS_TABLE,
  listId?: string,
): Promise<number> {
  const queries = [Query.orderDesc('position'), Query.limit(1)]
  if (listId) queries.push(Query.equal('listId', listId))
  const res = await tablesDB.listRows<TicketRow | TicketListRow>({ databaseId, tableId, queries })
  const last = res.rows[0]
  return (last?.position ?? 0) + POSITION_GAP
}

/** Liste muss existieren (400 statt kryptischem Folgefehler) */
export async function requireTicketList(event: H3Event, listId: string): Promise<TicketListRow> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const row = await tablesDB.getRow<TicketListRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_LISTS_TABLE,
    rowId: listId,
  }).catch(() => null)
  if (!row) {
    throw createError({ status: 400, statusText: 'Unknown list' })
  }
  return row
}

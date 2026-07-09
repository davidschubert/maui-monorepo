import { Query } from 'node-appwrite'
import { listSortSchema } from '../../../../../schemas/ticket'
import { POSITION_GAP } from '../../../../utils/ticketBoard'
import { TICKETS_TABLE, type TicketRow } from '../../../../../shared/types/ticket'

/**
 * Karten einer Liste sortieren (Erstellung neu/alt zuerst, alphabetisch) —
 * schreibt die Positionen neu (normalisiert die Float-Lücken gleich mit).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, listSortSchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const cards = await tablesDB.listRows<TicketRow>({
    databaseId, tableId: TICKETS_TABLE,
    queries: [Query.equal('listId', id), Query.limit(500)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load list cards')
  })

  const sorted = [...cards.rows].sort((a, b) => {
    if (body.by === 'alpha') return a.title.localeCompare(b.title, 'de')
    const diff = new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    return body.by === 'createdAsc' ? diff : -diff
  })

  for (const [index, card] of sorted.entries()) {
    const position = (index + 1) * POSITION_GAP
    if (card.position === position) continue
    await tablesDB.updateRow({
      databaseId, tableId: TICKETS_TABLE, rowId: card.$id, data: { position },
    }).catch((error) => {
      throw toH3Error(error, 'Could not sort list')
    })
  }

  return { ok: true }
})

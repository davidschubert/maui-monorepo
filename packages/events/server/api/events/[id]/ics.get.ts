import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/**
 * ICS-Export (text/calendar, EIN VEVENT) — kein externer Dienst. Liest über
 * den Session-Client: nur Events, die der Aufrufer ohnehin sehen darf
 * (published/cancelled via read(any); drafts → 404).
 */
export default defineEventHandler(async (event): Promise<string> => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.getRow<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Event not found')
  })

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="event-${row.$id}.ics"`)
  return buildEventIcs(row)
})

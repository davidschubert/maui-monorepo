import { eventEditSchema } from '../../../schemas/event'
import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event bearbeiten / publishen (events.manage). Status-Übergänge hier:
 * draft→published (setzt read(any), meldet den Feed-Eintrag) und
 * published→draft (entzieht read(any)). Absagen läuft über DELETE.
 * Abgesagte Events sind nicht mehr editierbar.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const body = await readValidatedBody(event, eventEditSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Event not found') })
  if (row.status === 'cancelled') {
    throw createError({ status: 409, statusText: 'Cancelled events cannot be edited' })
  }

  // Zeitfenster gegen den ZUSAMMENGEFÜHRTEN Zustand prüfen (PATCH kann nur
  // eines der beiden Felder tragen — das Schema sieht dann nichts Falsches)
  const mergedStart = body.startAt ?? row.startAt
  const mergedEnd = body.endAt === undefined ? row.endAt : body.endAt
  if (mergedEnd && Date.parse(mergedEnd) <= Date.parse(mergedStart)) {
    throw createError({ status: 422, statusText: 'endAt must be after startAt' })
  }

  const publishing = body.status === 'published' && row.status === 'draft'
  const unpublishing = body.status === 'draft' && row.status === 'published'

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.startAt !== undefined) data.startAt = body.startAt
  if (body.endAt !== undefined) data.endAt = body.endAt
  if (body.location !== undefined) data.location = body.location
  if (body.url !== undefined) data.url = body.url
  if (body.capacity !== undefined) data.capacity = body.capacity
  if (body.status !== undefined) data.status = body.status

  const updated = await admin.tablesDB.updateRow<EventRow>({
    databaseId,
    tableId: EVENTS_TABLE,
    rowId: id,
    data,
    // Leserecht folgt dem Status: published = alle, draft = niemand
    ...(publishing ? { permissions: [...new Set([...row.$permissions, EVENT_READ_ANY])] } : {}),
    ...(unpublishing ? { permissions: row.$permissions.filter(p => p !== EVENT_READ_ANY) } : {}),
  }).catch((error) => {
    throw toH3Error(error, 'Could not update event')
  })

  if (publishing) {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.published',
      objectType: 'event',
      objectId: updated.$id,
      link: `/events/${updated.$id}`,
      metadata: { title: updated.title },
    })
  }

  return updated
})

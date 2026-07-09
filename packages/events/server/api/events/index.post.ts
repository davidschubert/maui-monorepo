import { ID } from 'node-appwrite'
import { eventSchema } from '../../../schemas/event'
import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event anlegen — Admin-Sache (events.manage; „jeder User erstellt Events"
 * ist bewusst v2). Draft trägt KEINE Read-Permission (nur die Verwaltung
 * liest via Admin-Client); direktes Publish setzt read(any) und meldet
 * den Feed-Eintrag.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'events.manage')

  const body = await readValidatedBody(event, eventSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const status = body.status ?? 'draft'
  const row = await admin.tablesDB.createRow<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    rowId: ID.unique(),
    data: {
      title: body.title,
      description: body.description,
      startAt: body.startAt,
      endAt: body.endAt ?? null,
      location: body.location ?? null,
      url: body.url ?? null,
      capacity: body.capacity ?? null,
      attendeeCount: 0,
      status,
      organizerId: user.$id,
      organizerName: user.name,
      locationType: body.locationType ?? null,
      replayUrl: body.replayUrl ?? null,
      coverFileId: null,
      address: body.address ?? null,
      locationNotes: body.locationNotes ?? null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      remindersSentAt: null,
      access: body.access ?? null,
      priceAmount: body.priceAmount ?? null,
      priceLookupKey: body.priceLookupKey ?? null,
      // Serie (§7e) setzt der Nachgang unten — der Master braucht die eigene Id
      recurrence: '',
      seriesId: '',
      seriesIndex: 0,
      seriesUntil: null,
      seriesGeneratedUntil: null,
    },
    // Schreiben bleibt Server-Sache — Rows tragen nur Leserechte
    permissions: status === 'published' ? [EVENT_READ_ANY] : [],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create event')
  })

  // Serie (§7e): Master markiert sich selbst (seriesId = eigene Id) und
  // expandiert das Rolling Window — nur der Master announced in den Feed
  let created = row
  if (body.recurrence) {
    created = await admin.tablesDB.updateRow<EventRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: EVENTS_TABLE,
      rowId: row.$id,
      data: {
        recurrence: body.recurrence,
        seriesId: row.$id,
        seriesIndex: 0,
        seriesUntil: body.seriesUntil ?? null,
      },
    }).catch((error) => {
      throw toH3Error(error, 'Could not initialize event series')
    })
    await expandSeries(event, created)
  }

  if (status === 'published') {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.published',
      objectType: 'event',
      objectId: row.$id,
      link: `/events/${row.$id}`,
      metadata: { title: row.title },
    })
  }

  setResponseStatus(event, 201)
  return created
})

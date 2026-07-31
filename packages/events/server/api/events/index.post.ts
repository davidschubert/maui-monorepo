import { eventSchema } from '../../../schemas/event'
import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event anlegen — Verwaltungs-Sache (events.manage; „jeder User erstellt
 * Events" ist bewusst v2). Draft trägt KEINE Read-Permission (nur die
 * Verwaltung liest via Admin-Client); direktes Publish setzt read(any) und
 * meldet den Feed-Eintrag. Datentür als Operator: create stempelt den Mandanten.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — im Pool entscheidet die
 * Site-Rolle (editor/admin/owner tragen events.manage), erst danach greift der
 * protokollierte Operator-Break-Glass. Ohne Mandanten-Kontext (Silo/Playground)
 * fällt der Gate auf das globale Operator-Label zurück: Verhalten unverändert.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { user } = await requireCommunityPermission(event, 'events.manage')

  // Pool-Quota (No-Op, bis der Plan-Katalog events-Limits trägt — der Hook
  // steht, damit die Zahlen nur noch Konfiguration sind, kein Code)
  await assertPoolWriteQuota(event, { kind: 'events', tableId: EVENTS_TABLE })

  const body = await readValidatedBody(event, eventSchema.parse)
  const db = tenantDb(event, { as: 'operator' })

  const status = body.status ?? 'draft'
  const row = await db.create<EventRow>(EVENTS_TABLE, {
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
  }, {
    // Schreiben bleibt Server-Sache — Rows tragen nur Leserechte (published =
    // veröffentlicht wie posts). C18: was das für Rechte sind, entscheidet die
    // Community — auf einer geschlossenen `read(label:<communityId>)`.
    permissions: status === 'published' ? withPublishedRead([], event) : [],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create event')
  })

  // Serie (§7e): Master markiert sich selbst (seriesId = eigene Id) und
  // expandiert das Rolling Window — nur der Master announced in den Feed
  let created = row
  if (body.recurrence) {
    created = await db.update<EventRow>(EVENTS_TABLE, row.$id, {
      recurrence: body.recurrence,
      seriesId: row.$id,
      seriesIndex: 0,
      seriesUntil: body.seriesUntil ?? null,
    }, 'Event not found').catch((error) => {
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

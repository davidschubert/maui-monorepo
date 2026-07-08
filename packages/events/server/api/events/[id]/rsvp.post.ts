import { ID, Permission, Query, Role } from 'node-appwrite'
import { rsvpSchema } from '../../../../schemas/event'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow, type RsvpResponse, type RsvpStatus } from '../../../../shared/types/event'

/**
 * RSVP: setzen, wechseln oder (gleicher Status erneut) zurückziehen — Upsert
 * mit Toggle, server-autoritativ über den Admin-Client (event_rsvps haben
 * bewusst keine User-Schreibrechte). attendeeCount zählt NUR 'going' und
 * wird ausschließlich über atomare Increments geschrieben; der Kapazitäts-
 * Check läuft VOR dem Upsert und ist über increment(max: capacity) auch im
 * Race überbuchungssicher.
 */
export default defineEventHandler(async (event): Promise<RsvpResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const { status: target } = await readValidatedBody(event, rsvpSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Event not found') })
  if (row.status !== 'published') {
    throw createError({ status: 409, statusText: 'Event is not open for RSVPs' })
  }

  const existing = await admin.tablesDB.listRows<EventRsvpRow>({
    databaseId,
    tableId: EVENT_RSVPS_TABLE,
    queries: [Query.equal('eventId', id), Query.equal('userId', user.$id), Query.limit(1)],
  })
  const current = existing.rows[0]

  const increment = () => admin.tablesDB.incrementRowColumn({
    databaseId, tableId: EVENTS_TABLE, rowId: id, column: 'attendeeCount',
    value: 1, ...(row.capacity !== null ? { max: row.capacity } : {}),
  })
  const decrement = () => admin.tablesDB.decrementRowColumn({
    databaseId, tableId: EVENTS_TABLE, rowId: id, column: 'attendeeCount', value: 1, min: 0,
  })

  let myRsvp: RsvpStatus | null

  if (current && current.status === target) {
    // Toggle: gleicher Status erneut = RSVP zurückziehen
    await admin.tablesDB.deleteRow({ databaseId, tableId: EVENT_RSVPS_TABLE, rowId: current.$id })
    if (current.status === 'going') await decrement()
    myRsvp = null
  }
  else if (target === 'going') {
    // Paid-Gate (E4): Übergang ZU going braucht auf paid-Events ein Ticket —
    // ohne registrierten Guard fail-closed 403 (EVENTS-V2 §5)
    await assertCanRsvpGoing(event, row, user.$id)

    // Kapazitäts-Check VOR dem Upsert — der Vor-Check liefert das saubere
    // 409, das atomare increment(max) hält auch parallele Requests dicht.
    if (row.capacity !== null && row.attendeeCount >= row.capacity) {
      throw createError({ status: 409, statusText: 'Event is full' })
    }
    await increment().catch(() => {
      throw createError({ status: 409, statusText: 'Event is full' })
    })

    try {
      if (current) {
        await admin.tablesDB.updateRow({
          databaseId, tableId: EVENT_RSVPS_TABLE, rowId: current.$id, data: { status: target },
        })
      }
      else {
        await admin.tablesDB.createRow({
          databaseId,
          tableId: EVENT_RSVPS_TABLE,
          rowId: ID.unique(),
          data: { eventId: id, userId: user.$id, status: target },
          // eigene RSVP lesbar (Debug/Export) — mehr nicht
          permissions: [Permission.read(Role.user(user.$id))],
        }).catch(async (error) => {
          // Unique-Index-Race (Doppelklick/zwei Tabs): der Gewinner steht —
          // dessen Row auf 'going' ziehen; war er schon 'going', ist unser
          // Increment doppelt und wird zurückgenommen.
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
            const winner = await admin.tablesDB.listRows<EventRsvpRow>({
              databaseId, tableId: EVENT_RSVPS_TABLE,
              queries: [Query.equal('eventId', id), Query.equal('userId', user.$id), Query.limit(1)],
            })
            if (winner.rows[0] && winner.rows[0].status !== 'going') {
              await admin.tablesDB.updateRow({
                databaseId, tableId: EVENT_RSVPS_TABLE, rowId: winner.rows[0].$id, data: { status: 'going' },
              })
            }
            else {
              await decrement()
            }
            return
          }
          throw error
        })
      }
    }
    catch (error) {
      // Upsert gescheitert → Zähler-Gate zurückrollen, sonst driftet er
      await decrement().catch(() => {})
      throw toH3Error(error, 'Could not save RSVP')
    }

    myRsvp = 'going'
    // Community-Signal nur beim Zusagen (Core-Vertrag, best-effort)
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.rsvp',
      objectType: 'event',
      objectId: row.$id,
      link: `/events/${row.$id}`,
      metadata: { title: row.title },
    })
  }
  else {
    // maybe/declined: Upsert ohne Kapazitäts-Gate; verlässt der User
    // 'going', sinkt der Zähler
    if (current) {
      await admin.tablesDB.updateRow({
        databaseId, tableId: EVENT_RSVPS_TABLE, rowId: current.$id, data: { status: target },
      }).catch((error) => { throw toH3Error(error, 'Could not save RSVP') })
      if (current.status === 'going') await decrement()
    }
    else {
      await admin.tablesDB.createRow({
        databaseId,
        tableId: EVENT_RSVPS_TABLE,
        rowId: ID.unique(),
        data: { eventId: id, userId: user.$id, status: target },
        permissions: [Permission.read(Role.user(user.$id))],
      }).catch(async (error) => {
        // Unique-Race: Gewinner-Row auf den gewünschten Status ziehen;
        // verlässt sie dabei 'going', sinkt der Zähler
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
          const winner = await admin.tablesDB.listRows<EventRsvpRow>({
            databaseId, tableId: EVENT_RSVPS_TABLE,
            queries: [Query.equal('eventId', id), Query.equal('userId', user.$id), Query.limit(1)],
          })
          if (winner.rows[0] && winner.rows[0].status !== target) {
            await admin.tablesDB.updateRow({
              databaseId, tableId: EVENT_RSVPS_TABLE, rowId: winner.rows[0].$id, data: { status: target },
            })
            if (winner.rows[0].status === 'going') await decrement()
          }
          return
        }
        throw toH3Error(error, 'Could not save RSVP')
      })
    }
    myRsvp = target
  }

  // Frischen Zustand zurückgeben — die UI ersetzt Event + RSVP atomar
  const fresh = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id })
  return { event: fresh, myRsvp }
})

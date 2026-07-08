import { AppwriteException, ID, Permission, Query, Role } from 'node-appwrite'
import { eventVoteSchema } from '../../../../schemas/event'
import { EVENT_VOTES_TABLE, EVENTS_TABLE, type EventRow, type EventVote, type EventVoteResponse, type EventVoteValue } from '../../../../shared/types/event'

/**
 * Up-/Downvote auf ein Event — Toggle-Semantik (Muster posts/score):
 *   kein Vote → anlegen · gleicher Value → entfernen · anderer → umdrehen.
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab);
 * danach Recount + EIN Write der Zähler (Admin) → ein Realtime-Event,
 * serialisiert pro Event gegen Lost Updates.
 */
export default defineEventHandler(async (event): Promise<EventVoteResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const { value } = await readValidatedBody(event, eventVoteSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)
  const admin = createAdminClient(event)

  // Nur sichtbare Events sind votbar (published/cancelled — drafts nie)
  const target = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id }).catch(() => null)
  if (!target) {
    throw createError({ status: 404, statusText: 'Event not found' })
  }
  if (target.status === 'draft') {
    throw createError({ status: 409, statusText: 'Event not votable' })
  }

  const existing = await tablesDB.listRows<EventVote>({
    databaseId,
    tableId: EVENT_VOTES_TABLE,
    queries: [Query.equal('eventId', id), Query.equal('userId', user.$id), Query.limit(1)],
  })
  const current = existing.rows[0]

  if (current && current.value === value) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENT_VOTES_TABLE, rowId: current.$id })
  }
  else if (current) {
    await tablesDB.updateRow<EventVote>({ databaseId, tableId: EVENT_VOTES_TABLE, rowId: current.$id, data: { value } })
  }
  else {
    try {
      await tablesDB.createRow<EventVote>({
        databaseId,
        tableId: EVENT_VOTES_TABLE,
        rowId: ID.unique(),
        data: { eventId: id, userId: user.$id, value },
        permissions: [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      })
    }
    catch (error) {
      // Doppelklick-Race: der Unique-Index lässt nur einen durch — Counts +
      // myVote werden unten ohnehin autoritativ neu gelesen
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
    }
  }

  return await serializePerEvent(id, async (): Promise<EventVoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      admin.tablesDB.listRows({ databaseId, tableId: EVENT_VOTES_TABLE, queries: [Query.equal('eventId', id), Query.equal('value', 1), Query.limit(1)] }).then(r => r.total),
      admin.tablesDB.listRows({ databaseId, tableId: EVENT_VOTES_TABLE, queries: [Query.equal('eventId', id), Query.equal('value', -1), Query.limit(1)] }).then(r => r.total),
      admin.tablesDB.listRows<EventVote>({ databaseId, tableId: EVENT_VOTES_TABLE, queries: [Query.equal('eventId', id), Query.equal('userId', user.$id), Query.limit(1)] }),
    ])
    const myVote: EventVoteValue | null = mine.rows[0]?.value === -1 ? -1 : mine.rows[0] ? 1 : null

    const updated = await admin.tablesDB.updateRow<EventRow>({
      databaseId,
      tableId: EVENTS_TABLE,
      rowId: id,
      data: { upvotes, downvotes, score: upvotes - downvotes },
    })

    return { event: updated, myVote }
  })
})

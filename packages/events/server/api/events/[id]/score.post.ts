import { AppwriteException, Permission, Query, Role } from 'node-appwrite'
import { eventVoteSchema } from '../../../../schemas/event'
import { EVENT_VOTES_TABLE, EVENTS_TABLE, type EventRow, type EventVote, type EventVoteResponse, type EventVoteValue } from '../../../../shared/types/event'

/**
 * Up-/Downvote auf ein Event — Toggle-Semantik (Muster posts/score):
 *   kein Vote → anlegen · gleicher Value → entfernen · anderer → umdrehen.
 * Zwei Türen, wie die zwei Clients zuvor: member (Session — User schreibt
 * seine Vote-Row selbst, Row-Security + Unique-Index sichern ab) und
 * operator (autoritativer Recount + Zähler-Write auf fremder Row);
 * serialisiert pro Event gegen Lost Updates.
 *
 * WER HANDELT (F17): `ops` bekommt bewusst KEIN `actor` — die Handlung ist die
 * Stimme über `db` (dort greifen Inhalts-Sperre M13 und Beitritt A5), der
 * Zähler darüber ist eine Ableitung aus ALLEN Stimmen (Muster comments/vote).
 */
export default defineEventHandler(async (event): Promise<EventVoteResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const { value } = await readValidatedBody(event, eventVoteSchema.parse)
  const db = tenantDb(event)
  const ops = tenantDb(event, { as: 'operator' })

  // Nur sichtbare Events sind votbar (published/cancelled — drafts nie);
  // get belegt die Zugehörigkeit — ein fremder Mandant bekommt 404.
  const target = await ops.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (target.status === 'draft') {
    throw createError({ status: 409, statusText: 'Event not votable' })
  }

  const current = await db.find<EventVote>(EVENT_VOTES_TABLE, [
    Query.equal('eventId', id), Query.equal('userId', user.$id),
  ])

  if (current && current.value === value) {
    await db.remove(EVENT_VOTES_TABLE, current.$id)
  }
  else if (current) {
    await db.update<EventVote>(EVENT_VOTES_TABLE, current.$id, { value })
  }
  else {
    try {
      await db.create<EventVote>(EVENT_VOTES_TABLE, {
        eventId: id, userId: user.$id, value,
      }, {
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
      ops.count(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('value', 1)]),
      ops.count(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('value', -1)]),
      ops.find<EventVote>(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('userId', user.$id)]),
    ])
    const myVote: EventVoteValue | null = mine?.value === -1 ? -1 : mine ? 1 : null

    const updated = await ops.update<EventRow>(EVENTS_TABLE, id, {
      upvotes, downvotes, score: upvotes - downvotes,
    })

    return { event: updated, myVote }
  })
})

import { AppwriteException, Permission, Query, Role } from 'node-appwrite'
import { upvoteDelta } from '../../../../../core/shared/upvoteDelta'
import { scoreVoteSchema } from '../../../../schemas/post'
import { POSTS_TABLE, POST_VOTES_TABLE, type CommunityPost, type PostVote, type PostVoteResponse, type PostVoteValue } from '../../../../shared/types/post'

/**
 * Up-/Downvote auf einen Post — Toggle-Semantik wie comments:
 *   kein Vote → anlegen · gleicher Value → entfernen · anderer → umdrehen.
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab);
 * danach Recount + EIN Write der Zähler (Admin) → ein Realtime-Event,
 * serialisiert pro Post gegen Lost Updates.
 */
export default defineEventHandler(async (event): Promise<PostVoteResponse> => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const postId = getRouterParam(event, 'id')
  if (!postId) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const { value } = await readValidatedBody(event, scoreVoteSchema.parse)
  // Zwei Türen, wie die zwei Clients zuvor: member (Session — User schreibt
  // seine Vote-Row selbst, Row-Security + Unique-Index sichern ab) und
  // operator (autoritativer Recount + Zähler-Write auf fremder Row).
  //
  // WER HANDELT (F17): `ops` bekommt bewusst KEIN `actor` — die Handlung ist
  // die Stimme über `db` (dort greifen Inhalts-Sperre und Beitritt), der
  // Zähler darüber ist eine Ableitung aus ALLEN Stimmen (Muster comments/vote).
  const db = tenantDb(event)
  const ops = tenantDb(event, { as: 'operator' })

  // Nur published-Posts sind votbar (UI blockt nur clientseitig); get belegt
  // die Zugehörigkeit — ein fremder Mandant bekommt 404.
  const target = await ops.get<CommunityPost>(POSTS_TABLE, postId, 'Post not found')
  if (target.status !== 'published') {
    throw createError({ status: 409, statusText: 'Post not votable' })
  }

  const current = await db.find<PostVote>(POST_VOTES_TABLE, [
    Query.equal('postId', postId),
    Query.equal('userId', user.$id),
  ])

  if (current && current.value === value) {
    await db.remove(POST_VOTES_TABLE, current.$id)
  }
  else if (current) {
    await db.update<PostVote>(POST_VOTES_TABLE, current.$id, { value })
  }
  else {
    try {
      await db.create<PostVote>(POST_VOTES_TABLE, {
        postId,
        userId: user.$id,
        value,
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

  return await serializePerPost(postId, async (): Promise<PostVoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      ops.count(POST_VOTES_TABLE, [Query.equal('postId', postId), Query.equal('value', 1)]),
      ops.count(POST_VOTES_TABLE, [Query.equal('postId', postId), Query.equal('value', -1)]),
      ops.find<PostVote>(POST_VOTES_TABLE, [Query.equal('postId', postId), Query.equal('userId', user.$id)]),
    ])
    const myVote: PostVoteValue | null = mine?.value === -1 ? -1 : mine ? 1 : null

    const post = await ops.update<CommunityPost>(POSTS_TABLE, postId, {
      upvotes,
      downvotes,
      score: upvotes - downvotes,
    })

    /**
     * MITSCHREIBENDE ZÄHLER (F1): eine Stimme bewegt ZWEI Menschen — den
     * Gebenden und den Autor. Die Vorzeichen-Regel ist pur und geteilt
     * (`core/shared/upvoteDelta.ts`), weil `comments/[id]/vote.post.ts`
     * dieselbe Rechnung braucht und die beiden Layer einander nicht kennen.
     *
     * Gerechnet wird ZUSTAND VORHER gegen ZUSTAND NACHHER: `myVote` ist
     * autoritativ aus der Datenbank gelesen (wegen der Doppelklick-Rennen),
     * `current` der Stand von vorher. Nur Aufstimmen zählen — Abstimmen sind
     * abzeichen-neutral (Davids Entscheidung 4).
     *
     * SELBST-STIMMEN werden NICHT ausgenommen: der bestehende Aggregat-Zähler
     * (`likesGiven`) macht das auch nicht, und eine neue Sonderregel nur hier
     * ließe zwei Zahlen über dieselbe Sache verschieden rechnen.
     */
    const delta = upvoteDelta(current?.value ?? null, myVote)
    if (delta !== 0) {
      await recordUserCounterEvents(event, [
        { userId: user.$id, kind: 'upvotesGiven', delta },
        ...(target.authorId ? [{ userId: target.authorId, kind: 'upvotesReceived' as const, delta }] : []),
      ])
    }

    /**
     * POSTING-ABZEICHEN (F1 Teilpaket 2): hier — und nur hier — ist bekannt,
     * WELCHER Beitrag gerade wie viele Stimmen hat. Genau das braucht Davids
     * Mehrfach-Regel: verliehen wird je INHALT, der über die Schwelle geht.
     *
     * Der Stand VORHER kommt aus `target` (vor dem Neuzählen gelesen), der
     * nachher aus dem autoritativen Zählen — so entsteht ein Schreibversuch nur
     * für das, was wirklich neu ist. Gemeldet wird auch OHNE Änderung an den
     * eigenen Stimmen: eine fremde Stimme kann die Schwelle in derselben
     * Sekunde gerissen haben, und die Meldung ist idempotent.
     *
     * ÜBER DEN CORE-VERTRAG statt direkt: `comments` meldet über denselben Weg,
     * und ein Layer, der zwei Wege in dieselbe Verleihung hat, bekommt früher
     * oder später zwei Regeln.
     */
    await reportContentUpvotes(event, {
      authorId: target.authorId,
      contentId: postId,
      kind: 'topic',
      upvotes,
      previousUpvotes: target.upvotes,
    })

    return { post, myVote }
  })
})

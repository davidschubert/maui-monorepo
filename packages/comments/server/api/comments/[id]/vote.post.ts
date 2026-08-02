import { AppwriteException, Permission, Query, Role } from 'node-appwrite'
import { voteSchema } from '../../../../schemas/comment'
import {
  COMMENTS_TABLE,
  VOTES_TABLE,
  type Comment,
  type CommentVote,
  type VoteResponse,
  type VoteValue,
} from '../../../../shared/types/comment'

/**
 * Vote mit Toggle-Semantik (Spec):
 *   kein Vote      → anlegen
 *   gleicher Value → Vote ENTFERNEN (Toggle)
 *   anderer Value  → umdrehen
 *
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab).
 * Danach werden upvotes/downvotes/score aus den ECHTEN Vote-Counts (AdminClient,
 * sieht alle Rows) neu berechnet und in EINEM updateRow auf den Kommentar
 * geschrieben:
 *  - genau EIN Realtime-Event statt zwei → kein Zähler-Flackern im UI,
 *  - Zähler immer autoritativ → kein Increment-Drift bei parallelen/Doppel-Votes.
 */
export default defineEventHandler(async (event): Promise<VoteResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  await assertCommentsWritable(event)

  const { value } = await readValidatedBody(event, voteSchema.parse)
  // Zwei Türklinken, ein Vorgang: die eigene Stimme schreibt der User selbst
  // (Session), die autoritativen Zähler liest und schreibt der Betreiber-Weg
  // (Admin sieht ALLE Stimmen). Gescopt wird bei beiden gleich.
  //
  // WER HANDELT (F17): `ops` bekommt bewusst KEIN `actor`. Die HANDLUNG des
  // Menschen ist die Stimme, und die geht über `db` (Mitglieds-Klinke, also
  // Inhalts-Sperre M13 und Beitritt A5). Was `ops` danach schreibt, ist die
  // Summe ALLER Stimmen auf einer fremden Zeile — eine Ableitung, kein zweiter
  // Schreibvorgang derselben Person. Ist die Community gesperrt, scheitert
  // schon `db` und der Recount ist nie erreicht.
  const db = tenantDb(event)
  const ops = tenantDb(event, { as: 'operator' })

  // Status prüfen: auf gelöschte/ausgeblendete Kommentare darf nicht gevotet
  // werden (UI blockt nur clientseitig). Sonst ließen sich Vote-Rows + Score
  // eines [gelöscht]-Platzhalters per direktem Request manipulieren.
  // `get` der Tür weist zugleich Stimmen auf fremde Mandanten ab.
  const target = await ops.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (target.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not votable' })
  }

  const current = await db.find<CommentVote>(VOTES_TABLE, [
    Query.equal('commentId', commentId),
    Query.equal('userId', user.$id),
  ])

  if (current && current.value === value) {
    // Toggle: Vote entfernen
    await db.remove(VOTES_TABLE, current.$id, 'Vote not found')
  }
  else if (current) {
    // Umdrehen
    await db.update<CommentVote>(VOTES_TABLE, current.$id, { value }, 'Vote not found')
  }
  else {
    // Neuer Vote. Bei Doppelklick können zwei Requests parallel hier landen — der
    // Unique-Index (commentId,userId) lässt nur einen durch; der 409 des zweiten
    // ist kein Fehler (Counts + myVote werden unten autoritativ neu gelesen).
    try {
      await db.create<CommentVote>(VOTES_TABLE, { commentId, userId: user.$id, value }, {
        // Die eigene Stimme sieht NUR der Stimmende (Lehre comment_votes):
        // die Liste liefert die API aggregiert, nicht die Rohzeilen.
        permissions: [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      })
    }
    catch (error) {
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
    }
  }

  // Zähler UND eigenen Vote autoritativ aus den echten Votes ableiten (AdminClient
  // sieht alle Rows) und upvotes/downvotes/score in EINEM Write setzen → genau ein
  // Realtime-Event. myVote aus der DB statt aus dem Write-Pfad: bei Doppelklick
  // (Toggle/Flip parallel) gewinnt sonst eine Race und myVote weicht vom Count ab.
  // Recount+Write pro Kommentar serialisiert (voteLock): parallele Votes
  // verschiedener User können sonst einen Write auf VERALTETEM Recount
  // hinterlassen (Lost Update — Zähler driften bis zum nächsten Vote).
  return await serializePerComment(commentId, async (): Promise<VoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      ops.count(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('value', 1)]),
      ops.count(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('value', -1)]),
      ops.find<CommentVote>(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('userId', user.$id)]),
    ])
    const myVote: VoteValue | null = mine?.value === -1 ? -1 : mine ? 1 : null

    const comment = await ops.update<Comment>(
      COMMENTS_TABLE,
      commentId,
      { upvotes, downvotes, score: upvotes - downvotes },
      'Comment not found',
    )

    return { comment, myVote }
  })
})

import { Query } from 'node-appwrite'
import { postEditSchema } from '../../../schemas/post'
import { decidePostAuthorAction } from '../../../shared/postAuthorPolicy'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Titel/Body bearbeiten — nur der Autor, nur published/scheduled. Polls sind
 * nach der ersten FREMDEN Stimme eingefroren (Plan §4): die Frage unter
 * bereits abgegebenen Stimmen zu ändern wäre Manipulations-Fläche.
 *
 * WER darf was, steht seit C16 pur in `shared/postAuthorPolicy.ts` (dieselbe
 * Regel liest das Karten-Menü). Diese Route bleibt die AUTORITÄT: sie
 * übersetzt das Urteil in die HTTP-Antwort und zählt als Einzige die fremden
 * Stimmen.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Wartungsmodus friert ALLE Schreibvorgänge ein, nicht nur das Anlegen —
  // Muster commentPolicy.assertNotMaintenance: dort steht auch das Bearbeiten
  // und Löschen EIGENER Inhalte still. Sonst ist der Schalter nur halb wirksam.
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const input = await readValidatedBody(event, postEditSchema.parse)
  // Datentür (member): Session-Client — die Row-Security des Autors bleibt
  // die erste Grenze, die Tür belegt zusätzlich die Zugehörigkeit.
  const db = tenantDb(event)

  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')

  // Erste Frage OHNE Poll-Wissen: `hasForeignPollVotes: false` heißt hier
  // „noch nicht gezählt". Die Zählung ist eine eigene Abfrage und lohnt sich
  // nur, wenn Autor und Status ohnehin passen — die Reihenfolge der Fehler
  // (403 vor 409) bleibt damit exakt die alte.
  const gate = decidePostAuthorAction(
    { authorId: row.authorId, status: row.status, type: row.type, hasForeignPollVotes: false },
    user.$id,
  )
  if (gate.reason === 'not_author') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  if (gate.reason === 'not_editable') {
    throw createError({ status: 409, statusText: 'Post is not editable' })
  }

  if (row.type === 'poll') {
    // Operator: fremde Vote-Rows zählen (tragen keine breite Read-Permission)
    const foreign = await tenantDb(event, { as: 'operator' }).count(POLL_VOTES_TABLE, [
      Query.equal('postId', id),
      Query.notEqual('userId', user.$id),
    ])
    // Dieselbe Regel, jetzt mit vollständigem Bild.
    const counted = decidePostAuthorAction(
      { authorId: row.authorId, status: row.status, type: row.type, hasForeignPollVotes: foreign > 0 },
      user.$id,
    )
    if (counted.reason === 'poll_locked') {
      throw createError({ status: 409, statusText: 'Poll already has votes' })
    }
  }

  const updated = await db.update<CommunityPost>(POSTS_TABLE, id, {
    title: input.title || null,
    body: input.body,
  }).catch((error) => { throw toH3Error(error, 'Could not update post') })

  return updated
})

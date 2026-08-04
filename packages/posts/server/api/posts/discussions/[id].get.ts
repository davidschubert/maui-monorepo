import { discussionTopicPath, topicSlug } from '../../../../shared/discussionUrl'
import {
  POSTS_TABLE,
  POST_CATEGORIES_TABLE,
  type CommunityPost,
  type DiscussionTopicResponse,
  type FeedPost,
  type PostCategory,
} from '../../../../shared/types/post'

/**
 * EIN Topic — aufgelöst AUSSCHLIESSLICH über die Row-Id.
 *
 * Die Route kennt Kategorie- und Slug-Segment der URL gar nicht: sie liefert
 * den kanonischen Pfad MIT, und die Seite vergleicht ihn mit dem, was im
 * Browser steht (pure Regel `resolveCanonicalTopicRoute`). Genau deshalb steht
 * die Id in der URL — Umbenennen und Umkategorisieren kosten nichts, alte
 * Links heilen sich per 301 selbst.
 *
 * Geliefert wird der VOLLE Beitrag (FeedPost), damit die Detailseite dieselbe
 * Darstellung benutzen kann wie der Feed — inklusive Umfrage-Zustand und
 * eigener Stimme. Nichts Neues: exakt die Anreicherung, die auch
 * `GET /api/posts` macht.
 */
export default defineEventHandler(async (event): Promise<DiscussionTopicResponse> => {
  requirePlanProduct(event, 'posts')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing topic id' })
  }

  const db = tenantDb(event)
  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Topic not found')

  /**
   * ZWEIMAL 404 statt einer Erklärung, und beide Male mit Absicht:
   *  - nicht veröffentlicht (geplant/ausgeblendet/gelöscht): der Autor kann
   *    seine eigene Zeile über die Row-Permissions zwar LESEN, aber eine
   *    Topic-SEITE gibt es dafür nicht. Ein 403 verriete zudem, dass hier
   *    etwas Ausgeblendetes liegt.
   *  - ohne Kategorie: das ist ein Feed-Beitrag, kein Topic. Er hat unter
   *    /discussions keine Adresse.
   */
  if (row.status !== 'published' || !row.categoryId) {
    throw createError({ status: 404, statusText: 'Topic not found' })
  }

  const category = await db.get<PostCategory>(POST_CATEGORIES_TABLE, row.categoryId, 'Topic not found')

  /**
   * F1 Stufe 2: DIESER Aufruf zählt (server/utils/topicViews.ts).
   *
   * Hier und nicht auf der Seite: die Route ist die eine Stelle, die JEDER
   * Weg zum Topic passiert — der SSR-Aufbau, die Navigation im Client und ein
   * geteilter Link gleichermaßen. Ein Zähler im Vue-Code hinge dagegen an
   * `onMounted` und verpasste damit ausgerechnet die Besucher ohne JavaScript.
   *
   * NACH den beiden 404ern: was es nicht gibt, was nicht veröffentlicht ist und
   * was in keiner Kategorie steht, wird auch nicht gezählt. Sonst könnte man
   * über erfundene Ids Zähler-Zeilen anlegen lassen.
   *
   * Wirft nie und schreibt fast nie (Puffer + 30-Minuten-Fenster je Betrachter).
   */
  await recordTopicView(event, row.$id)

  const userId = event.context.user?.$id ?? null
  const [avatars, pollStates, postVotes] = await Promise.all([
    resolveAvatars(event, [row.authorId]),
    pollStatesFor(event, [row], userId),
    postVotesFor(event, [row], userId),
  ])

  const post: FeedPost = {
    ...row,
    authorAvatarUrl: avatars.get(row.authorId),
    poll: pollStates.get(row.$id),
    myPostVote: postVotes.get(row.$id) ?? null,
  }

  const slug = topicSlug(row.title, row.body)
  return { post, category, slug, path: discussionTopicPath(category.slug, row.$id, slug) }
})

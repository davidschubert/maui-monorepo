import { Query } from 'node-appwrite'
import { POSTS_TABLE, POST_CATEGORIES_TABLE, type PostCategory } from '../../../../shared/types/post'

/**
 * Kategorie löschen — NUR solange kein Beitrag sie trägt.
 *
 * WARUM DIE SPERRE (409 statt Kaskade): das Löschen einer belegten Kategorie
 * hätte genau drei mögliche Ausgänge, und zwei davon sind Datenverlust —
 * Topics mitlöschen (Inhalt vernichten), Topics stillschweigend
 * entkategorisieren (sie verschwinden aus Discussions und tauchen nirgends
 * wieder auf), oder eben ablehnen. Wer eine Kategorie loswerden will, in der
 * schon diskutiert wurde, STILLLEGT sie (`active: false`): sie fällt aus der
 * Auswahl, ihre Topics bleiben lesbar und ihre Links gültig. Löschen ist damit
 * genau das, wofür es gebraucht wird — die versehentlich angelegte Kategorie.
 *
 * `actor: 'operator'` mit derselben Begründung wie beim Anlegen (M13/A5).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing category id' })
  }

  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  // Zugehörigkeit zuerst belegen (404 für fremde Zeilen), erst dann zählen —
  // sonst verriete die Zählung die Existenz einer fremden Kategorie.
  await db.get<PostCategory>(POST_CATEGORIES_TABLE, id, 'Category not found')

  // Gezählt wird JEDER Beitrag, nicht nur der veröffentlichte: ein geplanter
  // oder ausgeblendeter Beitrag würde sonst auf eine gelöschte Kategorie
  // zeigen und beim Publizieren in einer 404-Detailseite landen.
  const inUse = await db.count(POSTS_TABLE, [Query.equal('categoryId', id)])
  if (inUse > 0) {
    throw createError({
      status: 409,
      statusText: 'Category is in use',
      data: { code: 'category_in_use' },
    })
  }

  await db.remove(POST_CATEGORIES_TABLE, id, 'Category not found')
  setResponseStatus(event, 204)
  return null
})

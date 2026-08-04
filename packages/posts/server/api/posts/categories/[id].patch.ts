import { categoryEditSchema } from '../../../../schemas/postCategory'
import { POST_CATEGORIES_TABLE, type PostCategory } from '../../../../shared/types/post'

/**
 * Kategorie ändern — Name, Beschreibung, Reihenfolge, aktiv/stillgelegt.
 *
 * DER SLUG STEHT NICHT IM SCHEMA, und das ist die eigentliche Aussage dieser
 * Route: die Kategorie-SEITE (`/discussions/<slug>`) ist der EINE Link des
 * URL-Schemas, der keine Id zum Auflösen hat und sich deshalb nicht selbst
 * heilen kann. Ein umbenannter Slug würde jeden geteilten Kategorie-Link tot
 * machen — dieselbe Regel wie beim pages-Layer („Später nicht änderbar").
 * Ein Alt-Slug-Gedächtnis wäre eine spätere Ausbaustufe, keine Stufe 1.
 *
 * `actor: 'operator'` mit derselben Begründung wie beim Anlegen (M13/A5) —
 * siehe index.post.ts.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing category id' })
  }

  const body = await readValidatedBody(event, categoryEditSchema.parse)
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  // Die Tür belegt die Zugehörigkeit VOR dem Schreiben — eine fremde Kategorie
  // ist von hier aus nicht erreichbar (404, nie 403).
  const updated = await db.update<PostCategory>(POST_CATEGORIES_TABLE, id, {
    name: body.name,
    description: body.description ?? '',
    sortOrder: body.sortOrder ?? 0,
    active: body.active ?? true,
  }, 'Category not found').catch((error) => {
    throw toH3Error(error, 'Could not update category')
  })

  return updated
})

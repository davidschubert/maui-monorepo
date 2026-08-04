import { Query } from 'node-appwrite'
import { categorySchema } from '../../../../schemas/postCategory'
import { POST_CATEGORIES_TABLE, type PostCategory } from '../../../../shared/types/post'

/**
 * Kategorie anlegen — Struktur ist Admin-Sache (Davids Konzept Teil 1:
 * „Mitglieder können KEINE Kategorien anlegen"), also `posts.manage`.
 *
 * WER HANDELT (F17/C1c): `actor: 'operator'`, und das ist eine Entscheidung,
 * keine Bequemlichkeit. Zwei Dinge hängen am `actor`, und beide sollen hier
 * NICHT greifen:
 *
 *  1. M13 — die Zahlungssperre friert INHALTE ein. Davids Grenze lautet
 *     ausdrücklich: „offen bleiben alle Owner-Einstellungen (Branding,
 *     Team/Rollen, Publikum, Registrierung) und die Moderation". Eine
 *     Kategorie ist kein Inhalt, sondern der Rahmen, in dem Inhalt entsteht —
 *     dieselbe Sorte Einstellung wie das Branding. Mit `actor: 'member'`
 *     könnte ein Owner mit Zahlungsverzug seine Community nicht mehr ordnen,
 *     obwohl die Sperre ihn zum Zahlen bewegen und nicht aussperren soll.
 *     Die Themen-ANLAGE dagegen bleibt gesperrt: die läuft unverändert über
 *     `POST /api/posts` und ist Inhalt.
 *  2. A5 — wer schreibt, tritt bei. Ein Betreiber im Break-Glass soll durch
 *     das Aufräumen einer Kunden-Community nicht deren Mitglied werden, und
 *     ein Admin IST bereits Mitglied (er hat eine Rolle).
 *
 * `as: 'operator'` ist davon unabhängig nötig: `post_categories` trägt bewusst
 * keine Client-Schreibrechte (Table-Permissions leer, Migration posts-007).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.manage')

  const body = await readValidatedBody(event, categorySchema.parse)
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  /**
   * Vorab-Prüfung auf den Slug, obwohl der Unique-Index (communityId, slug)
   * die Wahrheit ist: der Index wirft einen nackten 409, aus dem die
   * Oberfläche nicht ableiten könnte, WELCHES Feld kollidiert. Der Index
   * bleibt trotzdem die Autorität — diese Abfrage ist die Erklärung, nicht
   * der Schutz (zwei gleichzeitige Anlagen fängt weiterhin nur er).
   */
  const existing = await db.find<PostCategory>(POST_CATEGORIES_TABLE, [Query.equal('slug', body.slug)])
  if (existing) {
    throw createError({ status: 409, statusText: 'Slug already in use', data: { code: 'slug_taken' } })
  }

  const row = await db.create<PostCategory>(POST_CATEGORIES_TABLE, {
    name: body.name,
    slug: body.slug,
    description: body.description ?? '',
    sortOrder: body.sortOrder ?? 0,
    active: body.active ?? true,
  }, {
    // Die Struktur ist so öffentlich wie die Inhalte darin: 'public' heißt in
    // einer geschlossenen Community `read(label:<communityId>)` (C18), nicht
    // `any` — die Tür rechnet das aus, diese Route entscheidet nur die ABSICHT.
    read: 'public',
  }).catch((error) => {
    throw toH3Error(error, 'Could not create category')
  })

  setResponseStatus(event, 201)
  return row
})

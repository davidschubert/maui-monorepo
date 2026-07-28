import { z } from 'zod'
import { MEDIA_TABLE, type MediaItem } from '../../../shared/types/media'

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: z.string().trim().max(200).optional(),
  alt: z.string().trim().max(300).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict()

/**
 * Metadaten/Status eines Medien-Eintrags ändern (media.manage).
 *
 * SICHTBARKEIT (media-002): trägt der Patch `published`, folgt das Leserecht
 * von Row UND Datei dem neuen Status — bewusst auch dann, wenn sich der Wert
 * nicht geändert hat: so heilt ein zweiter Klick einen zuvor gescheiterten
 * Permission-Write, statt ihn stillschweigend zu überspringen.
 *
 * DATENTÜR (C1b): `update` belegt die Zugehörigkeit VOR dem Schreiben — eine
 * fremde Row antwortet 404 wie eine, die es nicht gibt. `as:'operator'` ist
 * fachlich nötig: `media_items`-Rows tragen seit media-002 NUR Leserechte,
 * niemand darf sie per Session-Client ändern; die Autorität ist die Capability.
 * Der Admin-Client umgeht Row-Permissions, damit ist die Tür hier die EINZIGE
 * Mandanten-Grenze.
 *
 * AUTORISIERUNG (S3): `requireSitePermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 * Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  await requireSitePermission(event, 'media.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing media id' })
  }
  const body = await readValidatedBody(event, patchSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 422, statusText: 'Empty patch' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const row = await db.update<MediaItem>(MEDIA_TABLE, id, body, 'Media item not found')

  if (body.published !== undefined) {
    await applyMediaVisibility(event, row, body.published).catch((error) => {
      throw toH3Error(error, 'Could not update media visibility')
    })
  }

  return { id: row.$id, ...body }
})

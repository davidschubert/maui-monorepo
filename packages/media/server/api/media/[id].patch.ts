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

/** Metadaten/Status eines Medien-Eintrags ändern (media.manage). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'media.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing media id' })
  }
  const body = await readValidatedBody(event, patchSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 422, statusText: 'Empty patch' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<MediaItem>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: MEDIA_TABLE,
    rowId: id,
    data: body,
  }).catch((error) => { throw toH3Error(error, 'Media item not found') })

  return { id: row.$id, ...body }
})

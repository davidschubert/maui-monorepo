import { ID, Query } from 'node-appwrite'
import { z } from 'zod'

// Name landet als font-family im CSS — restriktives Muster statt Escaping.
// SPIEGEL: themes/shared/fonts.ts (SAFE_FONT_NAME/SAFE_ID) prüft dieselben
// Muster am Render-Sink (Defense-in-Depth) — synchron halten.
const fontFileSchema = z.object({
  weight: z.number().int().min(100).max(900).multipleOf(100),
  fileId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,35}$/i, 'Invalid file id'),
  variable: z.boolean().optional(),
}).strict()

const createFontSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9 _-]{0,63}$/i, 'Invalid font name'),
  files: z.array(fontFileSchema).min(1).max(9),
})

const MAX_CUSTOM_FONTS = 12

/** Theme-Studio: eigene Schrift anlegen (system-Table custom_fonts). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const body = await readValidatedBody(event, createFontSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await admin.tablesDB.listRows({
    databaseId, tableId: 'custom_fonts', queries: [Query.orderDesc('order'), Query.limit(1)],
  }).catch((error) => { throw toH3Error(error, 'Fonts table missing — run migrations') })

  if (existing.total >= MAX_CUSTOM_FONTS) {
    throw createError({ status: 422, statusText: 'Font limit reached' })
  }
  const nextOrder = ((existing.rows[0] as { order?: number } | undefined)?.order ?? 0) + 1

  const row = await admin.tablesDB.createRow({
    databaseId,
    tableId: 'custom_fonts',
    rowId: ID.unique(),
    data: {
      name: body.name.trim(),
      files: JSON.stringify(body.files),
      order: nextOrder,
    },
  })

  await recordAudit(event, { action: 'font.created', targetType: 'font', targetId: row.$id, targetName: body.name })
  setResponseStatus(event, 201)
  return { id: row.$id, name: body.name.trim(), order: nextOrder, files: body.files }
})

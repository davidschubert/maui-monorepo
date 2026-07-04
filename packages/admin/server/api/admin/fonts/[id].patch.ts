import { z } from 'zod'
import type { Models } from 'node-appwrite'

const fontFileSchema = z.object({
  weight: z.number().int().min(100).max(900).multipleOf(100),
  fileId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,35}$/i, 'Invalid file id'),
  variable: z.boolean().optional(),
}).strict()

const updateFontSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9 _-]{0,63}$/i, 'Invalid font name').optional(),
  order: z.number().int().min(0).max(1000).optional(),
  files: z.array(fontFileSchema).min(1).max(9).optional(),
})

/** Theme-Studio: eigene Schrift bearbeiten (Name/Reihenfolge/Dateien). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing font id' })

  const body = await readValidatedBody(event, updateFontSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 400, statusText: 'No fields to update' })
  }
  const { files, ...rest } = body
  const data: Record<string, unknown> = { ...rest }
  if (typeof data.name === 'string') data.name = data.name.trim()
  if (files !== undefined) data.files = JSON.stringify(files)

  const runtimeConfig = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow<Models.Row & { name: string }>({
    databaseId: runtimeConfig.public.appwriteDatabaseId,
    tableId: 'custom_fonts',
    rowId: id,
    data,
  }).catch((error) => { throw toH3Error(error, 'Font not found') })

  await recordAudit(event, { action: 'font.updated', targetType: 'font', targetId: id, targetName: String(row.name ?? '') })
  return { ok: true }
})

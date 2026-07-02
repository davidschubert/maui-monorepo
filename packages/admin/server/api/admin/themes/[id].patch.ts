import { z } from 'zod'
import type { Models } from 'node-appwrite'

const updateThemeSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  primary: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color').optional(),
  order: z.number().int().min(0).max(1000).optional(),
})

/** Theme-Studio: eigenes Theme bearbeiten (Name/Farbe/Reihenfolge). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing theme id' })

  const data = await readValidatedBody(event, updateThemeSchema.parse)
  if (Object.keys(data).length === 0) {
    throw createError({ status: 400, statusText: 'No fields to update' })
  }
  if (data.primary) data.primary = data.primary.toLowerCase()

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow<Models.Row & { name: string }>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'custom_themes',
    rowId: id,
    data,
  }).catch((error) => { throw toH3Error(error, 'Theme not found') })

  await recordAudit(event, { action: 'theme.updated', targetType: 'theme', targetId: id, targetName: String(row.name ?? '') })
  return { ok: true }
})

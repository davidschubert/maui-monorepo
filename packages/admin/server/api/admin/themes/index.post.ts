import { ID, Query } from 'node-appwrite'
import { z } from 'zod'

const createThemeSchema = z.object({
  name: z.string().trim().min(1).max(64),
  primary: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color'),
})

const MAX_CUSTOM_THEMES = 20

/** Theme-Studio: eigenes Theme anlegen (system-Table custom_themes). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const body = await readValidatedBody(event, createThemeSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await admin.tablesDB.listRows({
    databaseId, tableId: 'custom_themes', queries: [Query.orderDesc('order'), Query.limit(1)],
  }).catch((error) => { throw toH3Error(error, 'Themes table missing — run migrations') })

  if (existing.total >= MAX_CUSTOM_THEMES) {
    throw createError({ status: 422, statusText: 'Theme limit reached' })
  }
  const nextOrder = ((existing.rows[0] as { order?: number } | undefined)?.order ?? 0) + 1

  const row = await admin.tablesDB.createRow({
    databaseId,
    tableId: 'custom_themes',
    rowId: ID.unique(),
    data: { name: body.name, primary: body.primary.toLowerCase(), order: nextOrder },
  })

  await recordAudit(event, { action: 'theme.created', targetType: 'theme', targetId: row.$id, targetName: body.name })
  setResponseStatus(event, 201)
  return { id: row.$id, name: body.name, primary: body.primary.toLowerCase(), order: nextOrder }
})

import { ID, Query } from 'node-appwrite'
import { z } from 'zod'

const themeConfigSchema = z.object({
  mode: z.enum(['perceived', 'linear']).optional(),
  anchor: z.union([z.literal('auto'), z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900), z.literal(950)])]).optional(),
  hueShift: z.number().min(-180).max(180).optional(),
  saturation: z.number().min(0).max(2).optional(),
  lightnessMax: z.number().min(80).max(100).optional(),
  lightnessMin: z.number().min(0).max(40).optional(),
  radius: z.union([z.literal(0), z.literal(0.125), z.literal(0.25), z.literal(0.375), z.literal(0.5)]).optional(),
}).strict()

const variantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/, 'Invalid variant id'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color'),
}).strict()

const createThemeSchema = z.object({
  name: z.string().trim().min(1).max(64),
  primary: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color'),
  config: themeConfigSchema.optional(),
  variants: z.array(variantSchema).max(6).optional(),
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
    data: {
      name: body.name,
      primary: body.primary.toLowerCase(),
      order: nextOrder,
      config: body.config ? JSON.stringify(body.config) : null,
      variants: body.variants?.length ? JSON.stringify(body.variants) : null,
    },
  })

  await recordAudit(event, { action: 'theme.created', targetType: 'theme', targetId: row.$id, targetName: body.name })
  setResponseStatus(event, 201)
  return { id: row.$id, name: body.name, primary: body.primary.toLowerCase(), order: nextOrder, config: body.config, variants: body.variants }
})

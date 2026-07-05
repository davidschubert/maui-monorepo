import { z } from 'zod'
import type { Models } from 'node-appwrite'

const themeConfigSchema = z.object({
  mode: z.enum(['perceived', 'linear']).optional(),
  anchor: z.union([z.literal('auto'), z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900), z.literal(950)])]).optional(),
  hueShift: z.number().min(-180).max(180).optional(),
  saturation: z.number().min(0).max(2).optional(),
  lightnessMax: z.number().min(80).max(100).optional(),
  lightnessMin: z.number().min(0).max(40).optional(),
  radius: z.union([z.literal(0), z.literal(0.125), z.literal(0.25), z.literal(0.375), z.literal(0.5)]).optional(),
  neutral: z.literal('tinted').optional(),
  darkAlias: z.union([z.literal(300), z.literal(400), z.literal(500)]).optional(),
  font: z.union([
    // Familien-Ids (neu) + v1-Paar-Ids (Import-Kompatibilität, Runtime mappt)
    z.enum(['inter', 'source-sans', 'source-serif', 'nunito-sans', 'sora', 'pt-sans', 'pt-serif', 'humanist', 'editorial', 'geometric', 'classic']),
    // individuelle Schrift: 'cf-<rowId>' (Verwaltung unter /dashboard/themes/fonts)
    z.string().regex(/^cf-[a-z0-9]{1,36}$/i),
  ]).optional(),
  fontHeading: z.union([
    z.enum(['inter', 'source-sans', 'source-serif', 'nunito-sans', 'sora', 'pt-sans', 'pt-serif']),
    z.string().regex(/^cf-[a-z0-9]{1,36}$/i),
  ]).optional(),
  headingWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  headingTracking: z.number().min(-3).max(6).optional(),
  headingUppercase: z.boolean().optional(),
}).strict()

const variantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/, 'Invalid variant id'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color'),
}).strict()

const updateThemeSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  primary: z.string().regex(/^#[0-9a-f]{6}$/i, 'Invalid hex color').optional(),
  order: z.number().int().min(0).max(1000).optional(),
  config: themeConfigSchema.optional(),
  variants: z.array(variantSchema).max(6).optional(),
})

/** Theme-Studio: eigenes Theme bearbeiten (Name/Farbe/Reihenfolge). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing theme id' })

  const body = await readValidatedBody(event, updateThemeSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 400, statusText: 'No fields to update' })
  }
  const { config: themeConfig, variants, ...rest } = body
  const data: Record<string, unknown> = { ...rest }
  if (typeof data.primary === 'string') data.primary = data.primary.toLowerCase()
  if (themeConfig !== undefined) data.config = JSON.stringify(themeConfig)
  if (variants !== undefined) data.variants = variants.length ? JSON.stringify(variants) : null

  const runtimeConfig = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow<Models.Row & { name: string }>({
    databaseId: runtimeConfig.public.appwriteDatabaseId,
    tableId: 'custom_themes',
    rowId: id,
    data,
  }).catch((error) => { throw toH3Error(error, 'Theme not found') })

  await recordAudit(event, { action: 'theme.updated', targetType: 'theme', targetId: id, targetName: String(row.name ?? '') })
  return { ok: true }
})

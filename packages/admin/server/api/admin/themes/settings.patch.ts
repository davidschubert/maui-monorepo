import { z } from 'zod'

const settingsSchema = z.object({
  defaultThemeId: z.string().max(64).optional(),
  defaultVariantId: z.string().regex(/^[a-z0-9-]{1,24}$/).optional(),
  builtins: z.record(
    z.string().max(32),
    z.object({
      name: z.string().trim().min(1).max(64).optional(),
      hidden: z.boolean().optional(),
      order: z.number().int().min(0).max(100).optional(),
    }).strict(),
  ).optional(),
}).strict()

/**
 * Theme-Studio: Instanz-weite Einstellungen (Default-Theme für Besucher ohne
 * Cookie, Built-ins umbenennen/ausblenden/umsortieren) — als JSON in
 * app_config.themeSettings (Migration system-011).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const body = await readValidatedBody(event, settingsSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  await admin.tablesDB.updateRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'app_config',
    rowId: 'global',
    data: { themeSettings: JSON.stringify(body) },
  }).catch((error) => { throw toH3Error(error, 'App config missing — run migrations') })

  await recordAudit(event, { action: 'theme.settings_updated', targetType: 'theme', targetId: 'settings' })
  return { ok: true }
})

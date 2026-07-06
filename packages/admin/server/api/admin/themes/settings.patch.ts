import { z } from 'zod'
import type { Models } from 'node-appwrite'

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
  const databaseId = config.public.appwriteDatabaseId

  // Vorher-Zustand für den Feed-Vergleich (nur der Instanz-Default zählt)
  const previous = await admin.tablesDB.getRow<Models.Row & { themeSettings?: string }>({
    databaseId, tableId: 'app_config', rowId: 'global',
  }).then((row) => {
    try { return JSON.parse(row.themeSettings || '{}') as { defaultThemeId?: string } }
    catch { return {} as { defaultThemeId?: string } }
  }).catch(() => ({} as { defaultThemeId?: string }))

  await admin.tablesDB.updateRow({
    databaseId,
    tableId: 'app_config',
    rowId: 'global',
    data: { themeSettings: JSON.stringify(body) },
  }).catch((error) => { throw toH3Error(error, 'App config missing — run migrations') })

  await recordAudit(event, { action: 'theme.settings_updated', targetType: 'theme', targetId: 'settings' })

  // Activity-Feed nur, wenn der Instanz-Default WECHSELT (Umbenennen/Sortieren
  // von Built-ins bleibt still) — alle offenen Fenster morphen live, der
  // Eintrag erklärt warum. Core-Vertrag, best-effort.
  if (body.defaultThemeId && body.defaultThemeId !== previous.defaultThemeId) {
    const user = event.context.user!
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'theme.default_changed',
      objectType: 'theme',
      objectId: body.defaultThemeId,
      link: '/',
      metadata: { snippet: body.defaultThemeId },
    })
  }

  return { ok: true }
})

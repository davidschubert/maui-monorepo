import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

type CustomThemeRow = Models.Row & { name: string, primary: string, order: number, config?: string | null }

/** config-JSON defensiv parsen — kaputte/fehlende Werte = Generator-Defaults */
function parseConfig(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Öffentliche Liste der Custom Themes (Theme-Studio) — wird beim App-Start
 * (themes-Plugin) geladen, damit die generierten Ramps SSR im Head landen.
 * Farben sind nicht schutzwürdig → kein Auth; degradiert auf [] (Apps ohne
 * angelegte Table). Bewusst im system-Layer: er besitzt die Table (A14).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  try {
    const res = await admin.tablesDB.listRows<CustomThemeRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'custom_themes',
      queries: [Query.orderAsc('order'), Query.limit(100)],
    })
    return res.rows.map(row => ({
      id: row.$id,
      name: row.name,
      primary: row.primary,
      order: row.order ?? 0,
      config: parseConfig(row.config),
    }))
  }
  catch {
    return []
  }
})

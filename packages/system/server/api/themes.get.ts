import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

type CustomThemeRow = Models.Row & { name: string, primary: string, order: number }

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
    }))
  }
  catch {
    return []
  }
})

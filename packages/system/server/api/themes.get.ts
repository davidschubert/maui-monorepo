import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

type CustomThemeRow = Models.Row & { name: string, primary: string, order: number, config?: string | null, variants?: string | null }

/** JSON defensiv parsen — kaputte/fehlende Werte = undefined (Generator-Defaults) */
function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as T
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Öffentliche Theme-Daten (Customize theme) — beim App-Start (themes-Plugin)
 * geladen: Custom Themes (generierte Ramps landen SSR im Head) + Instanz-
 * Einstellungen (Default-Theme, Built-in-Overrides). Farben/Namen sind nicht
 * schutzwürdig → kein Auth; degradiert vollständig (Apps ohne Tables).
 * Bewusst im system-Layer: er besitzt beide Tabellen (A14).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [rows, settingsRaw] = await Promise.all([
    admin.tablesDB.listRows<CustomThemeRow>({
      databaseId,
      tableId: 'custom_themes',
      queries: [Query.orderAsc('order'), Query.limit(100)],
    }).then(res => res.rows).catch(() => [] as CustomThemeRow[]),
    admin.tablesDB.getRow<Models.Row & { themeSettings?: string | null }>({
      databaseId,
      tableId: 'app_config',
      rowId: 'global',
    }).then(row => row.themeSettings).catch(() => null),
  ])

  const settings = parseJson<Record<string, unknown>>(settingsRaw) ?? {}

  // Branding PRO MANDANT (O5): im Pool teilen sich alle Communities dieses
  // Projekt und damit app_config.themeSettings — das Onboarding schreibt den
  // gewählten Vibe deshalb an den Tenant, und hier schlägt er die
  // Instanz-Einstellung. Ohne Tenant-Branding bleibt alles wie bisher.
  const tenant = event.context.tenant
  if (tenant?.theme) {
    settings.defaultThemeId = tenant.theme
    // Variante bewusst NUR setzen, wenn der Vibe eine hat: sonst würde eine
    // leere Variante die Instanz-Einstellung überschreiben und die Basisfarbe
    // erzwingen, wo vielleicht eine Variante gewollt war.
    if (tenant.variant) settings.defaultVariantId = tenant.variant
  }

  return {
    themes: rows.map(row => ({
      id: row.$id,
      name: row.name,
      primary: row.primary,
      order: row.order ?? 0,
      config: parseJson<Record<string, unknown>>(row.config),
      variants: parseJson<{ id: string, color: string }[]>(row.variants),
    })),
    settings,
  }
})

import type { CustomThemeDto, ThemeSettings } from '../../shared/ramp'

interface ThemeDataResponse {
  themes: CustomThemeDto[]
  settings: ThemeSettings
}

/**
 * Theme-Daten (Theme-Studio) — beim App-Start SSR-geladen (theme-Plugin),
 * via useState zum Client serialisiert: Custom Themes (Ramps → Head-Style)
 * und Instanz-Einstellungen (Default-Theme, Built-in-Overrides). useTheme
 * mischt beides in die Registry.
 */
export function useCustomThemesState() {
  return useState<CustomThemeDto[]>('maui-custom-themes', () => [])
}

export function useThemeSettingsState() {
  return useState<ThemeSettings>('maui-theme-settings', () => ({}))
}

/** Beide States vom Server holen (App-Start + nach CRUD im Studio) — best effort. */
export async function refreshCustomThemes(): Promise<void> {
  const customs = useCustomThemesState()
  const settings = useThemeSettingsState()
  try {
    const data = await $fetch<ThemeDataResponse>('/api/themes')
    customs.value = data.themes
    settings.value = data.settings ?? {}
  }
  catch { /* Anzeige behält den letzten Stand */ }
}

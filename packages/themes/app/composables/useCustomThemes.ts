import type { CustomThemeDto } from '../../shared/ramp'

/**
 * Custom Themes (Theme-Studio) — beim App-Start SSR-geladen (theme-Plugin),
 * via useState zum Client serialisiert. useTheme mischt sie in die Registry,
 * das Plugin rendert ihre generierten Ramps als <style> in den Head.
 */
export function useCustomThemesState() {
  return useState<CustomThemeDto[]>('maui-custom-themes', () => [])
}

/** Liste neu vom Server holen (nach CRUD im Theme-Studio) — best effort. */
export async function refreshCustomThemes(): Promise<void> {
  const state = useCustomThemesState()
  try {
    state.value = await $fetch<CustomThemeDto[]>('/api/themes')
  }
  catch { /* Anzeige behält den letzten Stand */ }
}

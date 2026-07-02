import { customThemeCss } from '../../shared/ramp'

/**
 * Universal (nicht .client): data-theme/data-variant und der Stylesheet-Link
 * des AKTIVEN Themes landen im SSR-Head — kein Theme-Flash, dynamisch
 * geladen wird nur die eine CSS-Datei (statische Assets aus public/themes/).
 *
 * Custom Themes (Theme-Studio): werden hier einmalig geladen (SSR → useState-
 * Payload) und ihre generierten Ramps als <style> in den Head gerendert —
 * ebenfalls flash-frei. Apps ohne system-Layer/Table: Route fehlt/leer → [].
 */
export default defineNuxtPlugin(async () => {
  const customThemes = useCustomThemesState()
  const themeSettings = useThemeSettingsState()
  await callOnce('maui-custom-themes', async () => {
    try {
      const data = await useRequestFetch()('/api/themes') as { themes: typeof customThemes.value, settings: typeof themeSettings.value }
      customThemes.value = data.themes ?? []
      themeSettings.value = data.settings ?? {}
    }
    catch {
      customThemes.value = []
    }
  })

  const { theme, variant, neutral } = useTheme()

  useHead({
    htmlAttrs: {
      // Built-ins mit CSS-Datei UND Custom Themes (id 'c-…', inline-Style) —
      // nur der Core-Default kommt ohne data-theme aus.
      'data-theme': () => (theme.value.id !== 'default' ? theme.value.id : undefined),
      'data-variant': () => variant.value ?? undefined,
      // neutral.css enthält alle Paletten und ist immer geladen → Attribut immer setzen
      'data-neutral': () => neutral.value,
    },
    link: () => [
      { rel: 'stylesheet', href: '/themes/neutral.css', id: 'maui-neutral-css' },
      ...(theme.value.file
        ? [{ rel: 'stylesheet', href: theme.value.file, id: 'maui-theme-css' }]
        : []),
    ],
    style: () => (customThemes.value.length
      ? [{ id: 'maui-custom-themes-css', textContent: customThemes.value.map(entry => customThemeCss(entry)).join('\n') }]
      : []),
  })
})

import { customThemeCss } from '../../shared/ramp'
import { customFontCss } from '../../shared/fonts'

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
  const customFonts = useCustomFontsState()
  await callOnce('maui-custom-themes', async () => {
    const [themeData, fontData] = await Promise.all([
      (useRequestFetch()('/api/themes') as Promise<{ themes: typeof customThemes.value, settings: typeof themeSettings.value }>).catch(() => null),
      (useRequestFetch()('/api/fonts') as Promise<{ fonts: typeof customFonts.value }>).catch(() => null),
    ])
    customThemes.value = themeData?.themes ?? []
    themeSettings.value = themeData?.settings ?? {}
    customFonts.value = fontData?.fonts ?? []
  })

  // Datei-URLs einmal am Plugin binden — der Head-Getter läuft auch außerhalb
  // des Setup-Kontexts
  const runtimeConfig = useRuntimeConfig()
  const fileUrl = (fileId: string) => `${runtimeConfig.public.appwriteEndpoint}/storage/buckets/fonts/files/${fileId}/view?project=${runtimeConfig.public.appwriteProjectId}`

  const { theme, variant, neutral, font } = useTheme()

  useHead({
    htmlAttrs: {
      // Built-ins mit CSS-Datei UND Custom Themes (id 'c-…', inline-Style) —
      // nur der Core-Default kommt ohne data-theme aus.
      'data-theme': () => (theme.value.id !== 'default' ? theme.value.id : undefined),
      'data-variant': () => variant.value ?? undefined,
      // neutral.css enthält alle Paletten und ist immer geladen → Attribut immer setzen
      'data-neutral': () => neutral.value,
      // Schriftpaar des aktiven Themes (fonts.css, build-prozessiert)
      'data-font': () => font.value,
    },
    link: () => [
      { rel: 'stylesheet', href: '/themes/neutral.css', id: 'maui-neutral-css' },
      ...(theme.value.file
        ? [{ rel: 'stylesheet', href: theme.value.file, id: 'maui-theme-css' }]
        : []),
    ],
    style: () => [
      ...(customThemes.value.length
        ? [{ id: 'maui-custom-themes-css', textContent: customThemes.value.map(entry => customThemeCss(entry)).join('\n') }]
        : []),
      // @font-face der individuellen Schriften — Runtime-Pendant zu fonts.css
      ...(customFonts.value.length
        ? [{ id: 'maui-custom-fonts-css', textContent: customFonts.value.map(entry => customFontCss(entry, fileUrl)).join('\n') }]
        : []),
    ],
  })
})

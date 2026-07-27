import { customThemeCss } from '../../shared/ramp'
import { customFontCss } from '../../shared/fonts'
import { resolveBrandColor } from '../../shared/brandMark'

/**
 * Universal (nicht .client): data-theme/data-variant und der Stylesheet-Link
 * des AKTIVEN Themes landen im SSR-Head — kein Theme-Flash, dynamisch
 * geladen wird nur die eine CSS-Datei (statische Assets aus public/themes/).
 *
 * Custom Themes (Theme-Studio): werden hier einmalig geladen (SSR → useState-
 * Payload) und ihre generierten Ramps als <style> in den Head gerendert —
 * ebenfalls flash-frei. Apps ohne system-Layer/Table: Route fehlt/leer → [].
 *
 * DOM-Ids (Audit-Befund K3): die Head-Elemente heißen `pk-*`, nicht mehr
 * `maui-*` — `maui` ist der interne Monorepo-/Layer-Name und hatte im Markup
 * einer Kunden-Community nichts zu suchen. Die Ids sind reine Anker für
 * useHead-Dedupe (kein Code liest sie); wer neue setzt, bleibt beim `pk-`-Präfix.
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

  const { themes, theme, variant, neutral, font, fontHeading } = useTheme()

  /**
   * Bildmarke der Community (Audit-Befund K2, Gate `maui.seo.tenantFavicon`,
   * Core-Default AUS): Mehr-Host-Apps verlinken das serverseitig generierte
   * `/favicon.svg` und färben die Browser-Oberfläche in derselben Farbe.
   * Silo-Apps lassen das Gate aus und behalten ihr eigenes Favicon.
   *
   * Die Farbe kommt aus dem VOREINGESTELLTEN Theme (settings.defaultThemeId —
   * `/api/themes` hat die Mandanten-Wahl dort schon eingesetzt), NICHT aus dem
   * Theme-Cookie des Besuchers: Marke und Tab-Farbe gehören der Community und
   * müssen zum öffentlich gecachten SVG passen.
   */
  const appConfig = useAppConfig() as { maui?: { seo?: { tenantFavicon?: boolean } } }
  const brandFavicon = appConfig.maui?.seo?.tenantFavicon === true
  const brandColor = computed(() => resolveBrandColor(
    themes.value,
    themeSettings.value.defaultThemeId,
    themeSettings.value.defaultVariantId,
  ))

  useHead({
    meta: () => (brandFavicon ? [{ name: 'theme-color', content: brandColor.value }] : []),
    htmlAttrs: {
      // Built-ins mit CSS-Datei UND Custom Themes (id 'c-…', inline-Style) —
      // nur der Core-Default kommt ohne data-theme aus.
      'data-theme': () => (theme.value.id !== 'default' ? theme.value.id : undefined),
      'data-variant': () => variant.value ?? undefined,
      // neutral.css enthält alle Paletten und ist immer geladen → Attribut immer setzen
      'data-neutral': () => neutral.value,
      // Schrift-Rollen des aktiven Themes (fonts.css, build-prozessiert):
      // Text + Überschriften (nur bei echter Abweichung gesetzt)
      'data-font': () => font.value,
      'data-font-heading': () => fontHeading.value,
    },
    link: () => [
      ...(brandFavicon ? [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] : []),
      { rel: 'stylesheet', href: '/themes/neutral.css', id: 'pk-neutral-css' },
      ...(theme.value.file
        ? [{ rel: 'stylesheet', href: theme.value.file, id: 'pk-theme-css' }]
        : []),
    ],
    style: () => [
      ...(customThemes.value.length
        ? [{ id: 'pk-custom-themes-css', textContent: customThemes.value.map(entry => customThemeCss(entry)).join('\n') }]
        : []),
      // @font-face der individuellen Schriften — Runtime-Pendant zu fonts.css
      ...(customFonts.value.length
        ? [{ id: 'pk-custom-fonts-css', textContent: customFonts.value.map(entry => customFontCss(entry, fileUrl)).join('\n') }]
        : []),
    ],
  })
})

import { customThemeCss } from '../../shared/ramp'
import { customFontCss } from '../../shared/fonts'
import { resolveBrandColor } from '../../shared/brandMark'
import { BRAND_CARD_HEIGHT, BRAND_CARD_WIDTH, brandCardKey, brandCardPath } from '../../shared/brandCard'
import {
  BRAND_ICON_DEFAULT_SIZE,
  BRAND_ICON_TOUCH_SIZE,
  brandIconKey,
  brandIconPath,
} from '../../shared/brandIcon'

/**
 * Universal (nicht .client): data-theme/data-variant und der Stylesheet-Link
 * des AKTIVEN Themes landen im SSR-Head — kein Theme-Flash, dynamisch
 * geladen wird nur die eine CSS-Datei (statische Assets aus public/themes/).
 *
 * Custom Themes (Customize theme): werden hier einmalig geladen (SSR → useState-
 * Payload) und ihre generierten Ramps als <style> in den Head gerendert —
 * ebenfalls flash-frei. Apps ohne system-Layer/Table: Route fehlt/leer → [].
 *
 * DOM-Ids (Audit-Befund K3): die Head-Elemente heißen `pk-*`, nicht mehr
 * `maui-*` — `maui` war der interne Monorepo-/Layer-Name und hatte im Markup
 * einer Kunden-Community nichts zu suchen. Die Ids sind reine Anker für
 * useHead-Dedupe (kein Code liest sie); wer neue setzt, bleibt beim `pk-`-Präfix.
 */
export default defineNuxtPlugin(async () => {
  const customThemes = useCustomThemesState()
  const themeSettings = useThemeSettingsState()
  const customFonts = useCustomFontsState()
  await callOnce('pukalani-custom-themes', async () => {
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
   * Bildmarke der Community (Audit-Befund K2, Gate `pukalani.seo.tenantFavicon`,
   * Core-Default AUS): Mehr-Host-Apps verlinken das serverseitig generierte
   * `/favicon.svg` und färben die Browser-Oberfläche in derselben Farbe.
   * Silo-Apps lassen das Gate aus und behalten ihr eigenes Favicon.
   *
   * Die Farbe kommt aus dem VOREINGESTELLTEN Theme (settings.defaultThemeId —
   * `/api/themes` hat die Mandanten-Wahl dort schon eingesetzt), NICHT aus dem
   * Theme-Cookie des Besuchers: Marke und Tab-Farbe gehören der Community und
   * müssen zum öffentlich gecachten SVG passen. Auf Mandanten-Hosts fällt das
   * seit dem 2026-07-29 (B5) ohnehin zusammen — dort ist die Community-Farbe
   * auch das, was die Seite zeigt.
   */
  const appConfig = useAppConfig() as { pukalani?: { seo?: { tenantFavicon?: boolean, tenantOgImage?: boolean, tenantAppIcon?: boolean } } }
  const brandFavicon = appConfig.pukalani?.seo?.tenantFavicon === true
  const brandColor = computed(() => resolveBrandColor(
    themes.value,
    themeSettings.value.defaultThemeId,
    themeSettings.value.defaultVariantId,
  ))
  // Einmal hier geholt, nicht in den Head-Gettern: die laufen außerhalb des
  // Setup-Kontexts, und eine Composable gehört nicht dorthin.
  const brandName = useBrandName()

  /**
   * App-Icon der Community für den Home-Bildschirm (OPEN-ITEMS C7, Gate
   * `pukalani.seo.tenantAppIcon`). Zwei Zeilen, mehr braucht es nicht: iOS
   * liest `apple-touch-icon` (180 px), Android/Chrome das PNG-`icon` mit
   * `sizes` (512 px). Das SVG-Favicon oben BLEIBT daneben stehen — es ist im
   * Tab die schärfere Wahl, und Browser suchen sich pro Zweck das passende.
   *
   * Der Schlüssel hängt wie bei der Vorschau-Karte an Farbe UND Name, aber an
   * einem EIGENEN Gestaltungs-Stand: eine Umgestaltung der Karte soll nicht
   * jedes Home-Bildschirm-Icon neu ausliefern.
   *
   * Auch auf einer Community „nur für Mitglieder": ein Icon liegt allein auf
   * dem Gerät dessen, der die Seite selbst dorthin gelegt hat, und trägt
   * nichts nach außen — anders als das og:image, das `useLocaleSeoHead()`
   * dort weglässt (C18).
   */
  const brandAppIcon = appConfig.pukalani?.seo?.tenantAppIcon === true
  const appIconKey = computed(() => (brandAppIcon ? brandIconKey(brandColor.value, brandName.value) : ''))

  /**
   * Vorschaubild für geteilte Links (og:image, Gate `pukalani.seo.tenantOgImage`,
   * OPEN-ITEMS B2). Dieser Layer sagt nur, WELCHES Bild gilt — geschrieben wird
   * der Tag zentral in `useLocaleSeoHead()` (core), damit die absolute URL
   * dieselbe Host-Rechnung nimmt wie canonical und og:url.
   *
   * Der Schlüssel im Pfad ist der Cache-Brecher: er hängt an Farbe UND Namen,
   * also holt WhatsApp nach einem Theme-Wechsel ein neues Bild — und bei
   * unverändertem Erscheinungsbild bleibt jeder geteilte Link ein Treffer.
   * Farbe = VOREINGESTELLTES Theme der Community (wie Favicon/theme-color),
   * nicht die Cookie-Wahl des Besuchers: sonst bekäme jeder Besucher eine
   * andere Bild-URL und der Cache wäre wertlos.
   *
   * EINE Zuweisung, bewusst kein watchEffect: og:image liest ausschließlich ein
   * Vorschau-Dienst, und der liest das SSR-HTML — zu diesem Zeitpunkt sind
   * Themes und Einstellungen oben schon geladen. Ein Watcher hier hinter dem
   * `await` wäre außerdem nicht mehr im Effekt-Scope des Plugins und würde auf
   * dem Server je Request hängen bleiben.
   */
  if (appConfig.pukalani?.seo?.tenantOgImage === true) {
    useBrandOgImage().value = {
      path: brandCardPath(brandCardKey(brandColor.value, brandName.value)),
      width: BRAND_CARD_WIDTH,
      height: BRAND_CARD_HEIGHT,
      type: 'image/png',
    }
  }

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
    // `rel` MUSS literal bleiben (`as const`): unhead 3 typisiert einen
    // link-Eintrag als über `rel` DISKRIMINIERTE Union — ein zu `string`
    // verbreitertes `rel` wählt kein Union-Mitglied mehr und wird zu `never`.
    // Verbreitert wird es hier durch die bedingten Spreads, die dem
    // Array-Literal den Kontext-Typ nehmen. Das ist reine Typ-Verengung auf
    // den Wert, der ohnehin dasteht — am gerenderten Head ändert sich nichts.
    link: () => [
      ...(brandFavicon ? [{ rel: 'icon' as const, type: 'image/svg+xml', href: '/favicon.svg' }] : []),
      ...(appIconKey.value
        ? [
            { rel: 'apple-touch-icon' as const, href: brandIconPath(appIconKey.value, BRAND_ICON_TOUCH_SIZE) },
            {
              rel: 'icon' as const,
              type: 'image/png',
              sizes: `${BRAND_ICON_DEFAULT_SIZE}x${BRAND_ICON_DEFAULT_SIZE}`,
              href: brandIconPath(appIconKey.value, BRAND_ICON_DEFAULT_SIZE),
            },
          ]
        : []),
      { rel: 'stylesheet' as const, href: '/themes/neutral.css', id: 'pk-neutral-css' },
      ...(theme.value.file
        ? [{ rel: 'stylesheet' as const, href: theme.value.file, id: 'pk-theme-css' }]
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

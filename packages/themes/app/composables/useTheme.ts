import { THEME_REGISTRY, DEFAULT_THEME_ID, NEUTRAL_REGISTRY, DEFAULT_NEUTRAL_ID, FONT_FAMILY_REGISTRY, resolveThemeFonts, type MauiNeutral, type MauiTheme } from '../utils/themeRegistry'
import { customThemeAttr } from '../../shared/ramp'
import { customFontAttr } from '../../shared/fonts'
import { resolveNeutralSelection, resolveThemeSelection, visitorMayChooseNeutral, visitorMayChooseTheme } from '../../shared/themeSelection'

/**
 * Theme-State mit Cookie-Persistenz (SSR liest den Cookie → data-theme
 * und der CSS-Link stehen bereits im SSR-HTML, kein Flash).
 * Ungültige Cookie-Werte fallen still auf den Default zurück.
 *
 * Die Registry ist zusammengesetzt: statische Built-ins (THEME_REGISTRY) +
 * im Theme-Studio angelegte Custom Themes (useCustomThemesState, id 'c-…',
 * Ramps als Inline-Style vom theme-Plugin). Wird ein gewähltes Custom Theme
 * gelöscht, fällt der Cookie-Wert still auf den Default zurück.
 *
 * VORRANG (Davids Entscheidung 2026-07-29, B5): auf einem MANDANTEN-Host
 * gewinnt die Farbwelt der Community, nicht das Cookie des Besuchers — die
 * Regel selbst steht pur und getestet in shared/themeSelection.ts. Das gilt für
 * BEIDE Achsen: Theme/Variante (`resolveThemeSelection`) und die Neutral-Palette
 * (`resolveNeutralSelection`, seit dem 2026-07-29 — vorher folgte sie weiter dem
 * Besucher, weil es dafür keine Community-Einstellung gab). Hier bleibt
 * nur, was Nuxt braucht: Cookies, Registry-Validierung, Fallback-Kette.
 * FLASH-FREI bleibt das, weil `branding` aus dem SSR-Payload kommt
 * (tenant-brand.server.ts läuft vor dem theme-Plugin und die Head-Getter
 * werden erst beim Rendern ausgewertet): der Server stempelt schon das
 * richtige data-theme, der Client rechnet dasselbe Ergebnis nach.
 */
export function useTheme() {
  const themeCookie = useCookie<string | null>('maui-theme', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  const variantCookie = useCookie<string | null>('maui-theme-variant', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  const neutralCookie = useCookie<string | null>('maui-neutral', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  const customThemes = useCustomThemesState()
  const settings = useThemeSettingsState()
  // Wahl DIESER Community (core, SSR-gespiegelt): null = kein Mandanten-Host.
  const { branding } = useTenantBranding()

  const themes = computed<MauiTheme[]>(() => {
    // Built-ins mit Instanz-Overrides (umbenennen/ausblenden/umsortieren)
    const overrides = settings.value.builtins ?? {}
    const builtins = THEME_REGISTRY
      .map((entry, index) => ({ entry, override: overrides[entry.id], index }))
      .filter(({ override }) => !override?.hidden)
      .sort((a, b) => (a.override?.order ?? a.index) - (b.override?.order ?? b.index))
      .map(({ entry, override }) => (override?.name ? { ...entry, name: override.name } : entry))
    const customs = [...customThemes.value]
      .sort((a, b) => a.order - b.order)
      .map(custom => ({
        id: customThemeAttr(custom.id),
        name: custom.name,
        file: null,
        color: custom.primary,
        variants: (custom.variants ?? []).map(v => ({ id: v.id, color: v.color })),
      }))
    return [...builtins, ...customs]
  })

  /**
   * Wer bestimmt hier die Farbwelt? Pure Vorrangregel (shared/themeSelection):
   * Mandanten-Host ⇒ Community bzw. Instanz-Einstellung, sonst Cookie des
   * Besuchers ⇒ Instanz-Einstellung.
   */
  const selection = computed(() => resolveThemeSelection({
    cookieTheme: themeCookie.value,
    cookieVariant: variantCookie.value,
    branding: branding.value,
    instanceTheme: settings.value.defaultThemeId,
    instanceVariant: settings.value.defaultVariantId,
  }))

  /** true = der Besucher darf das Theme umstellen (kein Mandanten-Host). */
  const canChooseTheme = computed(() => visitorMayChooseTheme(branding.value))
  /** true = der Besucher darf die Neutral-Palette umstellen (dito). */
  const canChooseNeutral = computed(() => visitorMayChooseNeutral(branding.value))

  // Fallback-Kette hinter der Vorrangregel: gewünschtes Theme → Core-Default →
  // erster Eintrag. Fängt gelöschte Custom Themes, ausgeblendete Built-ins und
  // alte Cookie-/Branding-Werte still ab.
  const theme = computed<MauiTheme>(() =>
    themes.value.find(entry => entry.id === selection.value.theme)
    ?? themes.value.find(entry => entry.id === DEFAULT_THEME_ID)
    ?? themes.value[0]!,
  )

  // Die Variante gehört zum Theme: eine, die es dort nicht gibt, fällt auf die
  // Basisfarbe zurück (die CSS-Regel [data-theme=x][data-variant=y] existiert
  // sonst nicht — ein Fehler ohne Symptom).
  const variant = computed<string | null>(() => {
    const wanted = selection.value.variant
    return wanted && theme.value.variants.some(v => v.id === wanted) ? wanted : null
  })

  function setTheme(id: string) {
    // Auf einem Mandanten-Host bewirkt das Cookie nichts mehr — dann wird auch
    // keins geschrieben (der Picker ist dort gar nicht sichtbar; das hier ist
    // das Netz für jeden anderen Aufrufer).
    if (!canChooseTheme.value) return
    themeCookie.value = themes.value.some(entry => entry.id === id) ? id : null
    variantCookie.value = null
  }

  function setVariant(value: string | null) {
    if (!canChooseTheme.value) return
    variantCookie.value = value && theme.value.variants.some(v => v.id === value) ? value : null
  }

  // Tinted Neutral: bietet das aktive Custom Theme eine brand-getönte
  // Neutral-Ramp an (config.neutral 'tinted'), erscheint sie als zusätzlicher
  // Eintrag (id = Theme-Attribut) und wird zum Neutral-DEFAULT dieses Themes —
  // der Cookie darf weiterhin eine Registry-Palette übersteuern.
  const activeTinted = computed<MauiNeutral | null>(() => {
    const custom = customThemes.value.find(c => customThemeAttr(c.id) === theme.value.id)
    if (custom?.config?.neutral !== 'tinted') return null
    return { id: theme.value.id, color: custom.primary, tinted: true }
  })

  const neutrals = computed<MauiNeutral[]>(() =>
    activeTinted.value ? [activeTinted.value, ...NEUTRAL_REGISTRY] : NEUTRAL_REGISTRY,
  )

  /**
   * Wessen Neutral-Palette gilt? Dieselbe pure Vorrangregel, eigene Achse
   * (shared/themeSelection): Mandanten-Host ⇒ `tenants.neutral`, sonst das
   * Cookie des Besuchers. Ergebnis '' = keine Vorgabe.
   */
  const neutralSelection = computed(() => resolveNeutralSelection({
    cookieNeutral: neutralCookie.value,
    branding: branding.value,
  }))

  // Neutral-Palette: data-neutral überschreibt die Ramp. Fallback-Kette hinter
  // der Vorrangregel: gewünschte Palette (gültig) → Tinted des aktiven Themes →
  // Registry-Default. Fängt gelöschte/umbenannte Paletten und alte Cookie-/
  // Branding-Werte still ab.
  const neutral = computed<string>(() => {
    const wanted = neutralSelection.value.neutral
    return wanted && neutrals.value.some(n => n.id === wanted)
      ? wanted
      : (activeTinted.value?.id ?? DEFAULT_NEUTRAL_ID)
  })

  function setNeutral(id: string) {
    // Auf einem Mandanten-Host bewirkt der Cookie nichts mehr — dann wird auch
    // keiner geschrieben (das Untermenü ist dort gar nicht sichtbar; das hier
    // ist das Netz für jeden anderen Aufrufer). Muster wie setTheme().
    if (!canChooseNeutral.value) return
    neutralCookie.value = neutrals.value.some(n => n.id === id) ? id : null
  }

  // Schrift-Rollen des aktiven Themes (config.font/fontHeading, inkl.
  // Legacy-Paar-Mapping) — Theme-Eigenschaft, kein User-Setting: data-font/
  // data-font-heading kommen vom Theme. Gültig sind Registry-Familien und
  // individuelle Schriften ('cf-<id>'); gelöschte Fonts fallen still auf die
  // App-Schrift zurück.
  const customFonts = useCustomFontsState()
  const validFontId = (id: string | undefined): string | undefined => {
    if (!id) return undefined
    if (FONT_FAMILY_REGISTRY.some(family => family.id === id)) return id
    if (customFonts.value.some(f => customFontAttr(f.id) === id)) return id
    return undefined
  }
  const themeFonts = computed(() => {
    const custom = customThemes.value.find(c => customThemeAttr(c.id) === theme.value.id)
    return resolveThemeFonts(custom?.config)
  })
  const font = computed<string | undefined>(() => validFontId(themeFonts.value.font))
  const fontHeading = computed<string | undefined>(() => {
    const id = validFontId(themeFonts.value.fontHeading)
    // 'Wie Text' braucht kein Attribut — nur echte Abweichungen rendern
    return id && id !== font.value ? id : undefined
  })

  return {
    font,
    fontHeading,
    themes,
    theme,
    variant,
    themeSource: computed(() => selection.value.source),
    canChooseTheme,
    setTheme,
    setVariant,
    neutrals,
    neutral,
    neutralSource: computed(() => neutralSelection.value.source),
    canChooseNeutral,
    setNeutral,
  }
}

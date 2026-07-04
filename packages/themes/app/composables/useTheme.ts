import { THEME_REGISTRY, DEFAULT_THEME_ID, NEUTRAL_REGISTRY, DEFAULT_NEUTRAL_ID, FONT_PAIR_REGISTRY, type MauiNeutral, type MauiTheme } from '../utils/themeRegistry'
import { customThemeAttr } from '../../shared/ramp'
import { customFontAttr } from '../../shared/fonts'

/**
 * Theme-State mit Cookie-Persistenz (SSR-liest den Cookie → data-theme
 * und der CSS-Link stehen bereits im SSR-HTML, kein Flash).
 * Ungültige Cookie-Werte fallen still auf den Default zurück.
 *
 * Die Registry ist zusammengesetzt: statische Built-ins (THEME_REGISTRY) +
 * im Theme-Studio angelegte Custom Themes (useCustomThemesState, id 'c-…',
 * Ramps als Inline-Style vom theme-Plugin). Wird ein gewähltes Custom Theme
 * gelöscht, fällt der Cookie-Wert still auf den Default zurück.
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

  // Instanz-Default (Besucher ohne/mit ungültigem Cookie) → Fallback-Kette:
  // Cookie → settings.defaultThemeId → Core-Default → erster Eintrag.
  const theme = computed<MauiTheme>(() =>
    themes.value.find(entry => entry.id === themeCookie.value)
    ?? themes.value.find(entry => entry.id === settings.value.defaultThemeId)
    ?? themes.value.find(entry => entry.id === DEFAULT_THEME_ID)
    ?? themes.value[0]!,
  )

  const variant = computed<string | null>(() => {
    if (variantCookie.value && theme.value.variants.some(v => v.id === variantCookie.value)) {
      return variantCookie.value
    }
    // Instanz-Default-Variante NUR für Besucher ohne eigene Theme-Wahl —
    // wer selbst wählt (auch die Basisfarbe), behält seine Wahl.
    if (
      !themeCookie.value
      && theme.value.id === settings.value.defaultThemeId
      && settings.value.defaultVariantId
      && theme.value.variants.some(v => v.id === settings.value.defaultVariantId)
    ) {
      return settings.value.defaultVariantId
    }
    return null
  })

  function setTheme(id: string) {
    themeCookie.value = themes.value.some(entry => entry.id === id) ? id : null
    variantCookie.value = null
  }

  function setVariant(value: string | null) {
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

  // Neutral-Palette: data-neutral überschreibt die Ramp. Fallback-Kette:
  // Cookie (gültig) → Tinted des aktiven Themes → Registry-Default.
  const neutral = computed<string>(() =>
    neutrals.value.some(n => n.id === neutralCookie.value)
      ? neutralCookie.value!
      : (activeTinted.value?.id ?? DEFAULT_NEUTRAL_ID),
  )

  function setNeutral(id: string) {
    neutralCookie.value = neutrals.value.some(n => n.id === id) ? id : null
  }

  // Schrift des aktiven Themes (config.font) — Theme-Eigenschaft, kein
  // User-Setting: data-font kommt vom Theme. Gültig sind Registry-Paare
  // und individuelle Schriften ('cf-<id>'); gelöschte Fonts fallen still
  // auf die App-Schrift zurück.
  const customFonts = useCustomFontsState()
  const font = computed<string | undefined>(() => {
    const custom = customThemes.value.find(c => customThemeAttr(c.id) === theme.value.id)
    const id = custom?.config?.font
    if (!id) return undefined
    if (FONT_PAIR_REGISTRY.some(pair => pair.id === id)) return id
    if (customFonts.value.some(f => customFontAttr(f.id) === id)) return id
    return undefined
  })

  return {
    font,
    themes,
    theme,
    variant,
    setTheme,
    setVariant,
    neutrals,
    neutral,
    setNeutral,
  }
}

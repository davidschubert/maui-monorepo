import { THEME_REGISTRY, DEFAULT_THEME_ID, NEUTRAL_REGISTRY, DEFAULT_NEUTRAL_ID, type MauiTheme } from '../utils/themeRegistry'
import { customThemeAttr } from '../../shared/ramp'

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

  const themes = computed<MauiTheme[]>(() => [
    ...THEME_REGISTRY,
    ...[...customThemes.value]
      .sort((a, b) => a.order - b.order)
      .map(custom => ({
        id: customThemeAttr(custom.id),
        name: custom.name,
        file: null,
        color: custom.primary,
        variants: [],
      })),
  ])

  const theme = computed<MauiTheme>(() =>
    themes.value.find(entry => entry.id === themeCookie.value)
    ?? themes.value.find(entry => entry.id === DEFAULT_THEME_ID)!,
  )

  const variant = computed<string | null>(() =>
    variantCookie.value && theme.value.variants.some(v => v.id === variantCookie.value)
      ? variantCookie.value
      : null,
  )

  function setTheme(id: string) {
    themeCookie.value = themes.value.some(entry => entry.id === id) ? id : null
    variantCookie.value = null
  }

  function setVariant(value: string | null) {
    variantCookie.value = value && theme.value.variants.some(v => v.id === value) ? value : null
  }

  // Neutral-Palette (unabhängig vom Theme): data-neutral überschreibt die Ramp.
  const neutral = computed<string>(() =>
    NEUTRAL_REGISTRY.some(n => n.id === neutralCookie.value)
      ? neutralCookie.value!
      : DEFAULT_NEUTRAL_ID,
  )

  function setNeutral(id: string) {
    neutralCookie.value = NEUTRAL_REGISTRY.some(n => n.id === id) ? id : null
  }

  return {
    themes,
    theme,
    variant,
    setTheme,
    setVariant,
    neutrals: NEUTRAL_REGISTRY,
    neutral,
    setNeutral,
  }
}

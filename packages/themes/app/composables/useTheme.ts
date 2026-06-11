import { THEME_REGISTRY, DEFAULT_THEME_ID, type MauiTheme } from '../utils/themeRegistry'

/**
 * Theme-State mit Cookie-Persistenz (SSR-liest den Cookie → data-theme
 * und der CSS-Link stehen bereits im SSR-HTML, kein Flash).
 * Ungültige Cookie-Werte fallen still auf den Default zurück.
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

  const theme = computed<MauiTheme>(() =>
    THEME_REGISTRY.find(entry => entry.id === themeCookie.value)
    ?? THEME_REGISTRY.find(entry => entry.id === DEFAULT_THEME_ID)!,
  )

  const variant = computed<string | null>(() =>
    variantCookie.value && theme.value.variants.includes(variantCookie.value)
      ? variantCookie.value
      : null,
  )

  function setTheme(id: string) {
    themeCookie.value = THEME_REGISTRY.some(entry => entry.id === id) ? id : null
    variantCookie.value = null
  }

  function setVariant(value: string | null) {
    variantCookie.value = value && theme.value.variants.includes(value) ? value : null
  }

  return { themes: THEME_REGISTRY, theme, variant, setTheme, setVariant }
}

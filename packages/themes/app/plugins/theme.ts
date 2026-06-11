/**
 * Universal (nicht .client): data-theme/data-variant und der Stylesheet-Link
 * des AKTIVEN Themes landen im SSR-Head — kein Theme-Flash, dynamisch
 * geladen wird nur die eine CSS-Datei (statische Assets aus public/themes/).
 */
export default defineNuxtPlugin(() => {
  const { theme, variant } = useTheme()

  useHead({
    htmlAttrs: {
      'data-theme': () => (theme.value.file ? theme.value.id : undefined),
      'data-variant': () => variant.value ?? undefined,
    },
    link: () => (theme.value.file
      ? [{ rel: 'stylesheet', href: theme.value.file, id: 'maui-theme-css' }]
      : []),
  })
})

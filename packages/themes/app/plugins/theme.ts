/**
 * Universal (nicht .client): data-theme/data-variant und der Stylesheet-Link
 * des AKTIVEN Themes landen im SSR-Head — kein Theme-Flash, dynamisch
 * geladen wird nur die eine CSS-Datei (statische Assets aus public/themes/).
 */
export default defineNuxtPlugin(() => {
  const { theme, variant, neutral } = useTheme()

  useHead({
    htmlAttrs: {
      'data-theme': () => (theme.value.file ? theme.value.id : undefined),
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
  })
})

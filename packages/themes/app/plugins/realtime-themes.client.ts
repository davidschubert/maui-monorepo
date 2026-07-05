/**
 * Propagiert Theme-/Schrift-Änderungen live an alle offenen Clients: Speichert
 * ein Admin ein Theme (custom_themes), eine Schrift (custom_fonts) oder die
 * Instanz-Einstellungen (app_config.themeSettings), refetcht jeder Client die
 * öffentlichen Routen — Head-Style und data-Attribute sind reaktiv, Farben und
 * Schriften MORPHEN an Ort und Stelle. Kein Reload, kein Hinweis-Banner nötig.
 *
 * Client-only, app-weit (detached EffectScope). Voraussetzung: Tables sind
 * read:any (custom_themes/custom_fonts: Migration system-013, app_config:
 * admin-005) — Row-Subscriptions funktionieren auch als Gast.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const scope = effectScope(true)

  // Debounce: CRUD-Bursts (z. B. Order-Tausch = 2 PATCHes) → EIN Refetch
  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleRefresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void refreshCustomThemes()
      void refreshCustomFonts()
    }, 400)
  }

  scope.run(() => {
    useRealtimeRows(config.public.appwriteDatabaseId, 'custom_themes', scheduleRefresh)
    useRealtimeRows(config.public.appwriteDatabaseId, 'custom_fonts', scheduleRefresh)
    // Instanz-Einstellungen (Default-Theme, Built-in-Overrides, Default-Variante)
    useRealtimeRows(config.public.appwriteDatabaseId, 'app_config', scheduleRefresh)
  })
})

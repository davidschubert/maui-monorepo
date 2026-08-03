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
 *
 * NICHT AUF EINEM HOST, DEN ES NICHT GIBT (2026-08-03): auf einem unbekannten
 * oder `abuse`-gesperrten Host antwortet jeder Pfad 404 — auch die Refetches
 * `/api/themes` und `/api/fonts`, die dieses Plugin auslöst. Regel + Messung:
 * `startWhenHostResolves` in core/app/utils/hostGate.ts.
 */
export default defineNuxtPlugin((nuxtApp) => {
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

  startWhenHostResolves(nuxtApp, () => scope.run(() => {
    useRealtimeRows(config.public.appwriteDatabaseId, 'custom_themes', scheduleRefresh)
    useRealtimeRows(config.public.appwriteDatabaseId, 'custom_fonts', scheduleRefresh)
    // Instanz-Einstellungen (Default-Theme, Built-in-Overrides, Default-Variante)
    useRealtimeRows(config.public.appwriteDatabaseId, 'app_config', scheduleRefresh)
  }))
})

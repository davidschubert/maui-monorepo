interface AnalyticsGlobals {
  plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void
  umami?: { track: (event: string, data?: Record<string, unknown>) => void }
}

/**
 * Event-Tracking, config-gated. No-op wenn Analytics aus ist, das Script
 * (noch) nicht geladen wurde oder wir im SSR-Kontext sind.
 */
export function useAnalytics() {
  const appConfig = useAppConfig()
  const enabled = computed(() => appConfig.maui?.analytics?.enabled === true)

  function track(event: string, props?: Record<string, unknown>) {
    if (import.meta.server || !enabled.value) return

    const globals = window as typeof window & AnalyticsGlobals

    if (appConfig.maui?.analytics?.provider === 'umami') {
      globals.umami?.track(event, props)
    }
    else {
      globals.plausible?.(event, props ? { props } : undefined)
    }
  }

  return { enabled, track }
}

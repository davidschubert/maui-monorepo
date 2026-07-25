import { isControlHost, resolveControlHosts } from '../../shared/controlCenter'

/**
 * Läuft diese Seite auf einem KONTROLL-Host (Kundenbereich/Onboarding)?
 *
 * Nutzt dieselbe pure Auflösung wie die Server-Middleware (shared/controlCenter.ts)
 * und denselben Request-Host — SSR und Client kommen damit zwangsläufig zum
 * gleichen Ergebnis, es gibt also keinen Hydration-Bruch (die Lektion aus den
 * Locale-Mismatches der Landingpage).
 */
export function useIsControlCenter(): boolean {
  const url = useRequestURL()
  const config = useRuntimeConfig()
  const appConfig = useAppConfig() as { maui?: { tenancy?: { controlHosts?: string[] } } }
  const hosts = resolveControlHosts(
    (config.public as { tenancy?: { controlHosts?: string } }).tenancy?.controlHosts,
    appConfig.maui?.tenancy?.controlHosts,
  )
  return isControlHost(url.hostname, hosts)
}

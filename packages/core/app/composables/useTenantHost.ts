import { isTenantHost, resolveControlHosts } from '../../shared/controlCenter'

/**
 * Rendert diese Seite auf einem MANDANTEN-Host (Community eines Kunden)?
 * Gegenstück zu useIsControlCenter() — für Seiten, die BETREIBER-Inhalt
 * zeigen und deshalb auf Kunden-Hosts nicht existieren dürfen (N7).
 *
 * Nutzt dieselbe pure Auflösung wie die Server-Middleware
 * (shared/controlCenter.ts) und denselben Request-Host: SSR und Client kommen
 * damit zwangsläufig zum gleichen Ergebnis, es gibt also keinen
 * Hydration-Bruch — und es muss kein neues Feld in die Nuxt-Payload wandern
 * (s. Spiegel-Inventar in plugins/tenant-brand.server.ts).
 */
export function useIsTenantHost(): boolean {
  const url = useRequestURL()
  const config = useRuntimeConfig()
  const appConfig = useAppConfig() as {
    maui?: { tenancy?: { enabled?: boolean, controlHosts?: string[] } }
  }
  const hosts = resolveControlHosts(
    (config.public as { tenancy?: { controlHosts?: string } }).tenancy?.controlHosts,
    appConfig.maui?.tenancy?.controlHosts,
  )
  return isTenantHost(appConfig.maui?.tenancy?.enabled === true, url.hostname, hosts)
}

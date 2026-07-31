import type { H3Event } from 'h3'
import { resolveControlHosts } from '../../shared/controlCenter'

/**
 * Server-Sicht auf die Kontroll-Hosts — die Regeln selbst sind pur und liegen
 * in shared/controlCenter.ts (dieselbe Wahrheit für Server und Browser).
 */
export function controlHosts(event?: H3Event): string[] {
  const config = useRuntimeConfig(event) as { public?: { tenancy?: { controlHosts?: string } } }
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { controlHosts?: string[] } } }
  return resolveControlHosts(config.public?.tenancy?.controlHosts, appConfig.pukalani?.tenancy?.controlHosts)
}

import { controlHomeTarget, isControlHost, resolveControlHosts, type ControlHomeTarget } from '../../shared/controlCenter'

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
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { controlHosts?: string[] } } }
  const hosts = resolveControlHosts(
    (config.public as { tenancy?: { controlHosts?: string } }).tenancy?.controlHosts,
    appConfig.pukalani?.tenancy?.controlHosts,
  )
  return isControlHost(url.hostname, hosts)
}

/**
 * Wohin gehört `/` auf DIESEM Kontroll-Host — Trichter oder Übersicht? (F12)
 *
 * Dieselbe Auflösungs-Reihenfolge wie oben (Env vor app.config) und dieselbe
 * pure Regel für SSR und Client, damit die Navigations-Entscheidung nicht
 * zwischen Server und Browser auseinanderläuft.
 *
 * `hasInviteCode` bleibt Sache des Aufrufers: nur die Middleware kennt die
 * Query der Ziel-Route, und ein Composable, das `useRoute()` liest, wäre in
 * genau dieser Middleware die falsche Quelle.
 */
export function useControlHomeTarget(hasInviteCode: boolean): ControlHomeTarget {
  const url = useRequestURL()
  const config = useRuntimeConfig()
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { wizardHosts?: string[] } } }
  const hosts = resolveControlHosts(
    (config.public as { tenancy?: { wizardHosts?: string } }).tenancy?.wizardHosts,
    appConfig.pukalani?.tenancy?.wizardHosts,
  )
  return controlHomeTarget(url.hostname, hosts, hasInviteCode)
}

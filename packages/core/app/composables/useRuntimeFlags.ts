import { DEFAULT_PUBLIC_APP_CONFIG, type PublicAppConfig } from '../../shared/types/config'

/**
 * Öffentliche Laufzeit-Produkt-Flags (registrationEnabled, commentsEnabled,
 * maintenanceMode, products) als geteilter, reaktiver State.
 *
 * Befüllt wird er einmal serverseitig vom Plugin `runtime-flags` (SSR → über
 * useState in den Client hydratisiert) und danach live vom Plugin
 * `realtime-config` aus den app_config-Realtime-Events aktualisiert.
 * Fällt ohne Befüllung auf permissive Defaults zurück.
 *
 * Der Typ ist bewusst `PublicAppConfig`, nicht `AppConfig` (Audit-Befund K5):
 * dieser State reist im __NUXT__-Payload JEDER Seite mit — auch
 * unauthentifiziert. Server-only-Felder wie `entitlementsDoc` haben hier
 * nichts zu suchen, und der Typ macht das Hineinschreiben unmöglich.
 */
export function useRuntimeFlags() {
  return useState<PublicAppConfig>('pukalani-runtime-flags', () => ({ ...DEFAULT_PUBLIC_APP_CONFIG }))
}

import { DEFAULT_APP_CONFIG, type AppConfig } from '../../shared/types/config'

/**
 * Öffentliche Laufzeit-Feature-Flags (registrationEnabled, commentsEnabled,
 * maintenanceMode) als geteilter, reaktiver State.
 *
 * Befüllt wird er einmal serverseitig vom Plugin `runtime-flags` (SSR → über
 * useState in den Client hydratisiert) und danach live vom Plugin
 * `realtime-config` aus den app_config-Realtime-Events aktualisiert.
 * Fällt ohne Befüllung auf permissive Defaults zurück.
 */
export function useRuntimeFlags() {
  return useState<AppConfig>('maui-runtime-flags', () => ({ ...DEFAULT_APP_CONFIG }))
}

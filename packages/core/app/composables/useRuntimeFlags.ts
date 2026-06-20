import { DEFAULT_APP_CONFIG, type AppConfig } from '../../shared/types/config'

/**
 * Öffentliche Laufzeit-Feature-Flags (registrationEnabled, maintenanceMode …)
 * für den Client. Über den Key dedupliziert (einmal pro Request geladen);
 * bei Fehler/fehlender Antwort permissive Defaults.
 */
export function useRuntimeFlags() {
  return useFetch<AppConfig>('/api/config', {
    key: 'maui-runtime-flags',
    default: () => ({ ...DEFAULT_APP_CONFIG }),
  })
}

/**
 * Laufzeit-Feature-Flags (app_config Table, Zeile 'global'). Die Table gehört
 * dem system-Layer; der Core liest sie nur und fällt auf Defaults zurück.
 */
export interface AppConfig {
  /** Neuregistrierungen erlaubt */
  registrationEnabled: boolean
  /** Neue Kommentare erlaubt */
  commentsEnabled: boolean
  /** Wartungsmodus — friert Schreibvorgänge (Registrierung + Kommentare) ein */
  maintenanceMode: boolean
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  registrationEnabled: true,
  commentsEnabled: true,
  maintenanceMode: false,
}

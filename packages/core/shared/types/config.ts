/**
 * Laufzeit-Feature-Flags (app_config Table, Zeile 'global'). Die Table gehört
 * dem system-Layer; der Core liest sie nur und fällt auf Defaults zurück.
 */

/**
 * Laufzeit-Zustand eines Features (Statusmaschine F2). M2 nutzt
 * active/inactive; provisioning/error kommen mit dem Provisioner (M3/M7) —
 * das Schema trägt sie schon, damit kein Umbau nötig wird.
 */
export type FeatureStatus = 'active' | 'inactive' | 'provisioning' | 'error'

export interface FeatureRuntimeState {
  enabled: boolean
  status: FeatureStatus
}

export interface AppConfig {
  /** Neuregistrierungen erlaubt */
  registrationEnabled: boolean
  /** Neue Kommentare erlaubt (Schreib-Erlaubnis — NICHT „Feature an/aus") */
  commentsEnabled: boolean
  /** Wartungsmodus — friert Schreibvorgänge (Registrierung + Kommentare) ein */
  maintenanceMode: boolean
  /**
   * Laufzeit-Feature-Gates (F2): Overrides pro Feature-Key. Fehlender
   * Eintrag = Feature AN (kompiliert = von der Site gewollt, Site-Manifest).
   * Persistiert als JSON-String in app_config.features (system-018).
   */
  features: Record<string, FeatureRuntimeState>
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  registrationEnabled: true,
  commentsEnabled: true,
  maintenanceMode: false,
  features: {},
}

/**
 * Parst die features-Spalte (JSON-String) fehlertolerant — kaputtes JSON
 * oder falsche Formen fallen auf {} zurück (= alles an), damit ein
 * Config-Schaden nie die Site lahmlegt.
 */
export function parseFeaturesColumn(raw: unknown): Record<string, FeatureRuntimeState> {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, FeatureRuntimeState> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const v = value as { enabled?: unknown, status?: unknown }
      const enabled = v.enabled !== false
      const status: FeatureStatus
        = v.status === 'inactive' || v.status === 'provisioning' || v.status === 'error'
          ? v.status
          : 'active'
      result[key] = { enabled, status }
    }
    return result
  }
  catch {
    return {}
  }
}

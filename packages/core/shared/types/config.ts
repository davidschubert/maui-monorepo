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

/**
 * Das EINE Laufzeit-Gate-Prädikat (F2): fehlender Eintrag = AN (kompiliert =
 * von der Site gewollt). Geteilt von useFeature (Client), featureGates
 * (Server) und der Dashboard-Nav — damit die Regel nie auseinanderläuft.
 */
export function isFeatureStateEnabled(state: FeatureRuntimeState | undefined): boolean {
  return state ? state.enabled && state.status === 'active' : true
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
 * Die Teilmenge der Laufzeit-Flags, die den Client SEHEN DARF (Audit-Befund
 * K5). Historie: `entitlementsDoc` (signiertes kaufmännisches Dokument —
 * siteProjectId, Feature-Zuteilung, `suspended`, Gültigkeitsfenster, `kid`)
 * war Teil dieses Typs und reiste über useState(`pukalani-runtime-flags`) im
 * Klartext in den __NUXT__-Payload JEDER Seite (auch unauthentifiziert, z. B.
 * /login) sowie über die öffentliche Route GET /api/config. K5 hat es aus der
 * Projektion genommen; N2 hat es ganz aus `app_config` herausgezogen — es
 * liegt seit system-020 in der server-only Tabelle `app_secrets`
 * (core/server/utils/entitlementsStore.ts) und ist kein AppConfig-Feld mehr.
 *
 * `Pick` statt `Omit`: neue AppConfig-Felder erscheinen NICHT automatisch im
 * Client. REGEL: neue Felder sind erst mal server-only; sie kommen nur dann
 * hier hinein, wenn es einen echten Client-Leser gibt. Sensible Werte gehören
 * gar nicht erst in app_config (Table-read(any), system-005), sondern in
 * app_secrets.
 */
export type PublicAppConfig = Pick<
  AppConfig,
  'registrationEnabled' | 'commentsEnabled' | 'maintenanceMode' | 'features'
>

export const DEFAULT_PUBLIC_APP_CONFIG: PublicAppConfig = {
  registrationEnabled: DEFAULT_APP_CONFIG.registrationEnabled,
  commentsEnabled: DEFAULT_APP_CONFIG.commentsEnabled,
  maintenanceMode: DEFAULT_APP_CONFIG.maintenanceMode,
  features: {},
}

/**
 * Projiziert die vollen Laufzeit-Flags auf die client-sichtbare Teilmenge.
 * Bewusst Feld-für-Feld (kein `delete`/Rest-Spread): ein neues, versehentlich
 * sensibles AppConfig-Feld rutscht so NICHT automatisch durch.
 */
export function toPublicAppConfig(config: AppConfig): PublicAppConfig {
  return {
    registrationEnabled: config.registrationEnabled,
    commentsEnabled: config.commentsEnabled,
    maintenanceMode: config.maintenanceMode,
    features: config.features,
  }
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

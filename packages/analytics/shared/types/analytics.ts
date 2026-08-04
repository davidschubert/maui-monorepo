import type { Models } from 'node-appwrite'

/** Table analytics_settings (Migration analytics-001). */
export const ANALYTICS_SETTINGS_TABLE = 'analytics_settings'

/**
 * EINE Row je Community (Pool) bzw. je Instanz (Silo/Einzelbetrieb,
 * communityId ''). Der Unique-Index liegt auf `communityId` — der Schlüssel
 * IST hier der Mandant, die Pool-Unique-Regel ist damit erfüllt.
 */
export interface AnalyticsSettingsRow extends Models.Row {
  communityId: string
  /** Plausible-Script-Id (`pa-…`) oder '' = Analytics aus. */
  plausibleScriptId: string
}

/** Antwort von GET /api/analytics/config — bewusst minimal (öffentlich). */
export interface AnalyticsConfigResponse {
  scriptId: string
}

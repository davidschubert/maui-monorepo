import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { DEFAULT_APP_CONFIG, parseFeaturesColumn, type AppConfig } from '../../shared/types/config'

/**
 * Liest die Laufzeit-Feature-Flags (app_config/global). Fällt bei fehlender
 * Zeile/Table oder Fehler auf permissive Defaults zurück, damit ein Config-
 * Problem die App nie blockiert. Die Table gehört dem admin-Layer.
 * event optional: Intervall-Plugins (entitlements-pull) rufen ohne
 * Request-Kontext auf — gleiches Muster wie createAdminClient().
 */
export async function getAppConfig(event?: H3Event): Promise<AppConfig> {
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const row = await admin.tablesDB.getRow<Models.Row & { features?: string, entitlements?: string } & Partial<Omit<AppConfig, 'features' | 'entitlementsDoc'>>>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    return {
      registrationEnabled: row.registrationEnabled ?? DEFAULT_APP_CONFIG.registrationEnabled,
      commentsEnabled: row.commentsEnabled ?? DEFAULT_APP_CONFIG.commentsEnabled,
      maintenanceMode: row.maintenanceMode ?? DEFAULT_APP_CONFIG.maintenanceMode,
      // Spalte ist ein JSON-String (system-018) — fehlertolerant geparst
      features: parseFeaturesColumn(row.features),
      // Rohes signiertes Dokument (system-019) — Prüfung macht featureGates
      entitlementsDoc: typeof row.entitlements === 'string' ? row.entitlements : '',
    }
  }
  catch {
    return { ...DEFAULT_APP_CONFIG }
  }
}

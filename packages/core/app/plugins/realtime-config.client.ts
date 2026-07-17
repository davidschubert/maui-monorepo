import type { AppwriteRow } from '../../shared/types/appwrite'
import { parseFeaturesColumn, type AppConfig } from '../../shared/types/config'

/**
 * Propagiert Änderungen der Laufzeit-Flags (app_config/global) live an alle
 * offenen Clients: Schaltet ein Admin Kommentare/Registrierung/Wartung um,
 * trägt das Realtime-Event die neuen Flags direkt in den useState → alle
 * useRuntimeFlags-Consumer (Composer-Gate, Register-Seite, Wartungs-Hinweis)
 * reagieren ohne Reload.
 *
 * Client-only, app-weit (detached EffectScope). Voraussetzung: app_config ist
 * read:any (Migration admin-005), sonst liefert Realtime keine Events.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const flags = useRuntimeFlags()
  const scope = effectScope(true)
  scope.run(() => {
    useRealtimeRows<AppwriteRow & { features?: string } & Partial<Omit<AppConfig, 'features'>>>(
      config.public.appwriteDatabaseId,
      'app_config',
      (event) => {
        flags.value = {
          registrationEnabled: event.payload.registrationEnabled ?? flags.value.registrationEnabled,
          commentsEnabled: event.payload.commentsEnabled ?? flags.value.commentsEnabled,
          maintenanceMode: event.payload.maintenanceMode ?? flags.value.maintenanceMode,
          // features-Spalte reist als JSON-String im Row-Payload mit (system-018)
          features: 'features' in event.payload ? parseFeaturesColumn(event.payload.features) : flags.value.features,
          // Entitlement-Dokument ist Server-Sache (featureGates) — Client trägt es nur durch
          entitlementsDoc: flags.value.entitlementsDoc,
        }
      },
    )
  })
})

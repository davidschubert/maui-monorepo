import { toPublicAppConfig } from '../../../../core/shared/types/config'

/**
 * Aktuelle Feature-Flags (Admin-Ansicht) + Core-KI-Zustand: aiEnabled
 * (Gate maui.ai), aiModel (Laufzeit-Override aus app_config, leer = Default),
 * aiDefaultModel (Build-Default als UI-Placeholder).
 *
 * Auch hier nur die client-sichtbare Teilmenge (Audit-Befund K5): die Antwort
 * landet über useFetch im __NUXT__-Payload von /dashboard/admin/config, und das
 * signierte `entitlementsDoc` hat dort — wie überall im Client — keinen Leser.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const [flags, ai] = await Promise.all([getAppConfig(event), getEffectiveAiConfig(event)])
  return {
    ...toPublicAppConfig(flags),
    aiEnabled: ai.enabled,
    // Leer, wenn kein Override aktiv ist — das UI zeigt dann den Placeholder
    aiModel: ai.model === ai.defaultModel ? '' : ai.model,
    aiDefaultModel: ai.defaultModel,
  }
})

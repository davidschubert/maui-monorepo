/**
 * Aktuelle Feature-Flags (Admin-Ansicht) + Core-KI-Zustand: aiEnabled
 * (Gate maui.ai), aiModel (Laufzeit-Override aus app_config, leer = Default),
 * aiDefaultModel (Build-Default als UI-Placeholder).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const [flags, ai] = await Promise.all([getAppConfig(event), getEffectiveAiConfig(event)])
  return {
    ...flags,
    aiEnabled: ai.enabled,
    // Leer, wenn kein Override aktiv ist — das UI zeigt dann den Placeholder
    aiModel: ai.model === ai.defaultModel ? '' : ai.model,
    aiDefaultModel: ai.defaultModel,
  }
})

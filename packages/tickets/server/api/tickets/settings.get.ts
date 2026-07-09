/**
 * Board-Einstellungen (P3-Ausbau): effektives KI-Modell + Build-Default —
 * fürs Einstellungen-Modal auf dem Board.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const config = await getEffectiveTicketsAiConfig(event)
  return {
    aiEnabled: config.enabled,
    model: config.model,
    defaultModel: config.defaultModel,
  }
})

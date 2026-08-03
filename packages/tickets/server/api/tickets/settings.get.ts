/**
 * Board-Einstellungen (P3-Ausbau): effektives KI-Modell + Build-Default —
 * fürs Einstellungen-Modal auf dem Board.
 *
 * LESEN bleibt `tickets.manage`: welches Modell die Triage nutzt, gehört zur
 * Board-Bedienung und trägt kein Geheimnis. SCHREIBEN verlangt seit dem
 * Paritäts-Audit (2026-08-02) `system.manage` — s. settings.patch.ts.
 * `canEditModel` sagt dem Modal, ob es die Knöpfe überhaupt anbieten darf;
 * ohne das Flag bekäme ein Moderator einen 403 erst NACH dem Klick.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const config = await getEffectiveTicketsAiConfig(event)
  return {
    aiEnabled: config.enabled,
    model: config.model,
    defaultModel: config.defaultModel,
    canEditModel: hasCapability(event.context.user?.labels, 'system.manage'),
  }
})

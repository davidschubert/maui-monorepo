/**
 * DIE EINE ROUTE, DIE EINEN NACHRICHTENTEXT AN EINEN MODERATOR AUSLIEFERT.
 *
 * ═══ WER HIER ETWAS ÄNDERT, ÄNDERT DIE ZUSAGE DES PRODUKTS ═══════════════
 * Das Konzept sagt zu: „niemand vom Stab liest proaktiv private Nachrichten."
 * Diese Zusage ruht auf drei Dingen, und keines davon ist ein
 * Permission-Wall — die Moderation liest über den Admin-Client, der
 * Row-Permissions absichtlich umgeht:
 *
 *  1. Es gibt GENAU DIESE EINE Route. Eine zweite Lese-Route weichte sie auf,
 *     ohne dass etwas rot würde.
 *  2. Sie verlangt eine OFFENE Meldung (`openReportsForTarget`). Ohne sie:
 *     404 `not_reported` — nicht 403, denn für den Moderator ist eine
 *     ungemeldete Nachricht schlicht nicht vorhanden.
 *  3. Sie liefert `reportedBody`, NIE `body`, und auch nicht ersatzweise.
 *
 * Das Netz darunter ist `packages/messages/scripts/verify-messages.mjs` — der
 * eine Beweis dieses Konzepts, den man nicht durch Lesen des Codes führen
 * kann, sondern nur durch einen Lauf gegen eine echte Instanz.
 *
 * ── UMFANG DER EINSICHT: DIE GEMELDETE NACHRICHT, SONST NICHTS ───────────
 * Kein Verlauf, kein Kontext — auch nicht „die drei davor" (Davids
 * Entscheidung 2). Ein Moderator, der Kontext braucht, fragt den Melder; was
 * der freiwillig beilegt, steht im `note`-Feld seiner Meldung.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  await requireCommunityPermission(event, 'reports.moderate')
  const id = getRouterParam(event, 'id') ?? ''

  return getReportedMessage(event, id)
})

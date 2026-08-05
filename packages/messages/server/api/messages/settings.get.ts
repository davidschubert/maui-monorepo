/**
 * DER OWNER-SCHALTER — lesen.
 *
 * Für das Dashboard. Bewusst OHNE Capability-Prüfung auf dem Lese-Weg: dass
 * eine Community private Nachrichten anbietet, ist eine Eigenschaft der
 * Community — sie steht ohnehin an jeder Fläche des Produkts. Was den Owner
 * auszeichnet, ist das SETZEN (settings.patch.ts).
 *
 * Angemeldet muss man trotzdem sein: ein Gast hat mit dem Produkt nichts zu
 * tun, und eine offene Auskunft wäre ein weiteres Merkmal zum Abgrasen von
 * Communities.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  return { enabled: await messagesEnabled(event) }
})

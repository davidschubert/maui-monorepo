/**
 * DIE KONVERSATION FÜR SICH ENTFERNEN (Davids Entscheidung 5: „unbegrenzt,
 * dafür selbst entfernbar").
 *
 * Es gibt bewusst KEINE Aufbewahrungsfrist und keinen Sweep: ein Gespräch, das
 * nach 90 Tagen verschwindet, ist für den Menschen ein Datenverlust und kein
 * Datenschutzgewinn — und Belegpflichten gibt es hier keine. Statt einer Frist
 * bekommt jede Seite den Knopf.
 *
 * ENTFERNT WIRD ZUERST NUR FÜR MICH. Erst wenn ALLE Teilnehmer es getan haben,
 * fällt die Zeile mitsamt ihren Nachrichten — genau Davids Formulierung
 * „gelöscht wird sie, wenn beide es getan haben". Alles andere wäre eine
 * Löschung fremder Texte durch einen Klick einer Seite.
 *
 * Und eine neue Nachricht holt den Verlauf zurück (`closedAfterMessage`):
 * sonst wäre „ich räume auf" dasselbe wie „ich schweige diese Person tot",
 * und der Absender bekäme keinen Hinweis, dass nichts ankommt.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const id = getRouterParam(event, 'id') ?? ''
  const conversation = await requireConversation(event, id, user.$id)

  return closeConversationFor(event, conversation, user.$id)
})

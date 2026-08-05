/**
 * ALS GELESEN MARKIEREN — für die offene Seite.
 *
 * Der Normalfall ist das Öffnen selbst (`GET /api/messages/[id]` markiert
 * mit). Diese Route gibt es für den Fall, dass eine BEREITS offene Seite live
 * eine Nachricht bekommt (useRealtimeRows) und der Mensch sie liest, ohne neu
 * zu laden — ohne sie bliebe der fettgedruckte Punkt stehen, bis jemand die
 * Seite wechselt.
 *
 * KEIN Owner-Schalter-Gate: wird das Produkt abgeschaltet, während jemand
 * liest, soll er seinen Posteingang trotzdem noch aufräumen können. Der
 * Schalter verhindert neue Gespräche, nicht das Wegklicken alter.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const id = getRouterParam(event, 'id') ?? ''
  const conversation = await requireConversation(event, id, user.$id)

  await markConversationRead(event, conversation, user.$id)
  return { ok: true }
})

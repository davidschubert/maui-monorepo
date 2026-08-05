/**
 * EINE SPERRE AUFHEBEN.
 *
 * Adressiert über die USER-Id des Gesperrten, nicht über die Row-Id: die Zeile
 * ist ein Implementierungsdetail, und der Mensch hebt eine Sperre gegen eine
 * PERSON auf. Fremde Zeilen sind für den Aufrufer nicht vorhanden — gefunden
 * wird ausschließlich, was er selbst gesetzt hat (`blockerId`).
 *
 * 404, wenn es nichts aufzuheben gibt: eine Sperre, die es nicht gibt, ist
 * nicht dasselbe wie eine, die man nicht aufheben darf.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const blockedId = getRouterParam(event, 'userId') ?? ''
  const removed = await unblockUser(event, user.$id, blockedId)
  if (!removed) throw createError({ status: 404, statusText: 'Block not found' })

  return { ok: true }
})

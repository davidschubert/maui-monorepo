/**
 * MEINE SPERREN in dieser Community.
 *
 * BEWUSST NUR DIE EIGENEN: wer MICH gesperrt hat, steht hier nicht. Die Sperre
 * wirkt zwar beidseitig, aber sie ist die Entscheidung des anderen — sie
 * anzuzeigen hieße, sie zu verraten (Konzept § 2.3: „Der Blockierte erfährt es
 * nicht").
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const rows = await listMyBlocks(event, user.$id)
  const [names, handles] = await Promise.all([
    resolveUserNames(event, rows.map(row => row.blockedId)),
    resolveUserHandles(event, rows.map(row => row.blockedId)),
  ])

  return {
    blocks: rows.map(row => ({
      id: row.$id,
      userId: row.blockedId,
      name: names.get(row.blockedId) ?? '',
      handle: handles.get(row.blockedId) ?? '',
      everywhere: row.scope === 'everywhere',
      createdAt: row.$createdAt,
    })),
  }
})

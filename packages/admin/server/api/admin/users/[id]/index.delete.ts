/**
 * DSGVO: einen User VOLLSTÄNDIG löschen (Admin) — nicht den eigenen Account.
 * Orchestriert über deleteUserCompletely (Snapshot → Sperren → Contributors →
 * Avatar/Presence → users.delete nur bei Voll-Erfolg). Bei Teilfehler bleibt
 * der User gesperrt und die Response nennt die fehlgeschlagenen Layer —
 * die Löschung ist idempotent wiederholbar.
 */
export default defineEventHandler(async (event) => {
  const adminUser = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }
  if (userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot delete your own account here' })
  }
  // Den letzten Admin nicht löschen
  await assertNotLastAdmin(event, userId)

  const admin = createAdminClient(event)
  // Existenz-Check VOR dem Orchestrator: die Route soll 404 liefern; der
  // Orchestrator selbst behandelt 404 als Orphan-Cleanup (Re-Run-Pfad).
  const exists = await admin.users.get({ userId }).catch(() => null)
  if (!exists) {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  const result = await deleteUserCompletely(event, userId, { actor: 'admin' })
    .catch((error) => { throw toH3Error(error, 'Could not delete user') })

  // Audit OHNE Klarnamen — der steht im Snapshot, nicht im dauerhaften Log
  await recordAudit(event, {
    action: 'user.deleted',
    targetType: 'user',
    targetId: userId,
    targetName: '',
    metadata: result.exportFileId ? { exportFileId: result.exportFileId } : undefined,
  })

  if (!result.ok) {
    throw createError({
      status: 500,
      statusText: 'User deletion incomplete — user is blocked, retry to finish cleanup',
      data: { results: result.results, exportFileId: result.exportFileId },
    })
  }

  return { ok: true, exportFileId: result.exportFileId }
})

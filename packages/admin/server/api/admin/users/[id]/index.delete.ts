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
    // S8: die rohen Layer-Fehler (regelmäßig AppwriteException-Texte mit
    // Tabellen-Ids) bleiben SERVERSEITIG. `deleteUserCompletely` loggt jeden
    // einzelnen strukturiert; hier kommt die Zusammenfassung dazu, damit ein
    // Teilfehler auch dann im Log steht, wenn niemand hinsieht.
    // Der Client bekommt die brauchbare Hälfte: WELCHE Layer offen sind (dort
    // setzt der Re-Run an) — nicht, woran sie gescheitert sind.
    const failed = result.results.filter(r => !r.ok).map(r => r.id)
    logEvent('error', 'gdpr.delete_incomplete', {
      userId,
      failed,
      results: result.results,
    })
    throw createError({
      status: 500,
      statusText: 'User deletion incomplete — user is blocked, retry to finish cleanup',
      data: { results: publicContributorResults(result.results), failed, exportFileId: result.exportFileId },
    })
  }

  return { ok: true, exportFileId: result.exportFileId }
})

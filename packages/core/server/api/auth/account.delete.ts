import { clearSessionCookie } from '../../lib/appwrite'

/**
 * Eigenen Account VOLLSTÄNDIG löschen (Art. 17 DSGVO) — orchestriert über
 * deleteUserCompletely: Pre-Delete-Snapshot (für Admins, 30 Tage), Sperren,
 * alle UserDataContributors (Kommentare→Tombstone, Votes/Reports/
 * Notifications→Hard-Delete, Audit→Pseudonymisierung), Avatar + Presence,
 * users.delete() als letzter Schritt NUR bei Voll-Erfolg. Unumkehrbar.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const userId = event.context.user.$id
  let result: Awaited<ReturnType<typeof deleteUserCompletely>>
  try {
    result = await deleteUserCompletely(event, userId, { actor: 'self' })
  }
  catch (error) {
    // z. B. Snapshot fehlgeschlagen → es wurde noch NICHTS gelöscht
    console.error('[gdpr] Self-Delete fehlgeschlagen (vor Cleanup):', error)
    throw createError({ status: 500, statusText: 'Account deletion failed' })
  }
  finally {
    // Session ist durch das Sperren ohnehin tot — Cookie IMMER entfernen
    clearSessionCookie(event)
  }

  if (!result.ok) {
    // Keine Interna an den (Ex-)User leaken (E7) — Details stehen im Log;
    // der Account ist gesperrt, ein Admin-Re-Run räumt den Rest ab.
    console.error('[gdpr] Self-Delete Teilfehler — Account gesperrt, Re-Run nötig:', JSON.stringify(result.results))
    throw createError({ status: 500, statusText: 'Account deletion failed' })
  }

  return { ok: true }
})

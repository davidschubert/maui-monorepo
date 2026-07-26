import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eigene Meldung zu einem Target zurückziehen. Per Target adressiert (der
 * Client kennt die Report-$id nicht). Läuft als der User (Session-Client) —
 * er sieht/löscht via Row-Security nur seine eigene Meldung.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const query = getQuery(event)
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  const targetId = typeof query.targetId === 'string' ? query.targetId : ''
  if (!targetType || !targetId) {
    throw createError({ status: 400, statusText: 'Missing target' })
  }

  // Datentür (member): derselbe Pool-User kann dasselbe Target auf ZWEI
  // Mandanten gemeldet haben (geteilter users-Namensraum) — die Tür zieht
  // die richtige Row.
  const db = tenantDb(event)
  const existing = await db.find<Report>(REPORTS_TABLE, [
    Query.equal('reporterId', user.$id),
    Query.equal('targetType', targetType),
    Query.equal('targetId', targetId),
  ])

  // Nichts zu tun, wenn keine eigene Meldung existiert (idempotent)
  if (existing) {
    await db.remove(REPORTS_TABLE, existing.$id)
  }

  return { ok: true }
})

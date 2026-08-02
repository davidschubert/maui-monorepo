import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eigene Meldung zu einem Target zurückziehen. Per Target adressiert (der
 * Client kennt die Report-$id nicht).
 *
 * ZURÜCKZIEHEN MUSS IMMER GEHEN (Moderations-Audit Befund 2, 2026-08-01).
 *
 * Der Befund war eine ASYMMETRIE: Melden lief über die Operator-Klinke (die
 * M13-Zahlungssperre greift dort nicht), Zurückziehen über die member-Klinke
 * (sie greift). In einer gesperrten Community bekam der Melder also 403 — und
 * die Oberfläche behauptete weiter „deine Meldung ist noch aktiv", während sie
 * es unabänderlich war.
 *
 * Die Richtung ist eindeutig: eine Meldung ist kein INHALT, sondern eine
 * AUSSAGE über andere. Sie abgeben zu dürfen, aber nicht zurücknehmen, ist die
 * falsche Hälfte. Also dieselbe Klinke wie beim Abgeben — nur-lesend heißt
 * „keine neuen Inhalte", nicht „deine Aussage bleibt stehen".
 *
 * SICHER TROTZ ADMIN-CLIENT: der Zugriff ist doppelt eingeengt, bevor gelöscht
 * wird — `find` filtert auf `reporterId = <Session-User>` UND die Tür hängt den
 * Mandanten-Filter an, `remove` belegt die Zugehörigkeit noch einmal. Ein
 * fremder Report ist auf diesem Weg nicht erreichbar.
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

  // Datentür als Operator (siehe Kopf: Zurückziehen darf die Sperre nicht
  // treffen). Der Mandanten-Filter der Tür bleibt: derselbe Pool-User kann
  // dasselbe Target auf ZWEI Mandanten gemeldet haben (geteilter
  // users-Namensraum) — die Tür zieht die richtige Row.
  //
  // KEIN `actor:` — dieselbe bewusste Ausnahme wie beim Abgeben
  // (index.post.ts): eine Meldung ist kein Inhalt, also greift die
  // Inhalts-Sperre hier nicht.
  const db = tenantDb(event, { as: 'operator' })
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

import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report, type ReportListResponse } from '../../../shared/types/report'

const PAGE_SIZE = 25

/**
 * Melde-Queue für Moderatoren. Liest über den AdminClient (Row-Security
 * umgangen — bewusst, der Melder soll fremde Meldungen nicht sehen) und ist
 * per `reports.moderate` gated. Filter: status (default 'open', 'all' = alle),
 * optional targetType.
 *
 * WARUM SIE STEHT, OBWOHL KEINE SEITE SIE RUFT (Moderations-Audit Befund 9,
 * 2026-08-01 — geprüft und BEHALTEN): die sichtbaren Queues gehören den
 * Produkt-Layern (comments, posts), weil sie Meldung UND Inhalt nebeneinander
 * zeigen müssen — moderation kennt weder Kommentare noch Beiträge (A14). Diese
 * Route ist die TYP-AGNOSTISCHE Sicht des Layers, dem die Tabelle gehört, und
 * sie hat zwei echte Aufgaben:
 *
 *  1. Sie ist die Autorisierungs-Probe der Beweis-Skripte: `verify-site-authz`
 *     und `verify-community-suspension` prüfen an ihr, dass `reports.moderate`
 *     an der Community klebt (Owner 200, Fremder 403). Sie zu löschen, hieße
 *     diesen Beweis zu löschen.
 *  2. Sie ist der Weg für jeden künftigen meldbaren Typ, der (noch) keine
 *     eigene Queue hat — der Fall, an dem Events aufgelaufen sind (Befund 4).
 *
 * Sie ist also keine tote Oberfläche, sondern eine unbenutzte. Der Unterschied
 * gehört hierher geschrieben, damit der nächste Audit nicht dieselbe Frage
 * noch einmal stellt.
 */
export default defineEventHandler(async (event): Promise<ReportListResponse> => {
  await requireCommunityPermission(event, 'reports.moderate')

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'open'
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  const page = Math.max(1, Number.parseInt(typeof query.page === 'string' ? query.page : '1', 10) || 1)

  const queries = [
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    Query.offset((page - 1) * PAGE_SIZE),
  ]
  if (status !== 'all') queries.push(Query.equal('status', status))
  if (targetType) queries.push(Query.equal('targetType', targetType))

  // Datentür als Operator: im Pool nur die Meldungen des aktuellen Mandanten
  const res = await tenantDb(event, { as: 'operator' }).list<Report>(REPORTS_TABLE, queries)
  return { total: res.total, rows: res.rows }
})

import { Query } from 'node-appwrite'
import {
  ABUSE_REPORTS_PAGE_SIZE,
  ABUSE_REPORTS_TABLE,
  abuseReportStatsFromCounts,
  parseAbuseReportsPage,
  projectAbuseReport,
  type AbuseReportListResponse,
  type AbuseReportRow,
  type AbuseReportStatus,
} from '../../../../shared/abuseReports'

/**
 * Betreiber: die Missbrauchs-Warteschlange (M13). Neueste zuerst — hier
 * arbeitet man von oben nach unten.
 *
 * SEITENWEISE, NICHT GEKAPPT. Vorher standen hier `Query.limit(100)` und ein
 * `console.warn`, wenn mehr da war. Eine Warnung in einem Server-Log ist keine
 * Grenze, die jemand bemerkt: die Oberfläche zeigte 100 Zeilen und sagte
 * nirgends, dass es mehr gibt — die 101. Meldung war für den Betreiber
 * unsichtbar, und ausgerechnet die älteste (also die am längsten wartende)
 * fällt bei „neueste zuerst" als Erstes hinten heraus.
 *
 * OFFSET, NICHT CURSOR. Der Cursor (`listAllRows`) kann nur „weiter" und ist
 * für vollständige Sweeps da; die Warteschlange ist eine `UTable` mit
 * `UPagination`, und die springt auf Seite N. Der bekannte Preis der
 * Offset-Zählung — eine neue Meldung oben schiebt alle Seiten um eine Zeile —
 * ist hier klein: aus dieser Liste VERSCHWINDET nichts, ein Statuswechsel
 * ändert die Zeile nur. Schlimmstenfalls rutscht eine Zeile beim Blättern
 * einmal auf die Nachbarseite.
 *
 * DIE KENNZAHLEN HABEN EINE EIGENE QUELLE und beschreiben immer die GANZE
 * Warteschlange (Herleitung an `abuseReportStatsFromCounts`). Zwei zusätzliche
 * Abfragen mit `Query.limit(1)` — gelesen wird nur deren `total`, die Zeilen
 * interessieren nicht; `idx_status` (control-034) deckt beide.
 */
export default defineEventHandler(async (event): Promise<AbuseReportListResponse> => {
  requirePermission(event, 'sites.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const page = parseAbuseReportsPage(getQuery(event).page)

  /** Zählt EINEN Zustand. Limit 1, weil nur `total` gebraucht wird. */
  const countByStatus = (status: AbuseReportStatus) => admin.tablesDB.listRows<AbuseReportRow>({
    databaseId,
    tableId: ABUSE_REPORTS_TABLE,
    queries: [Query.equal('status', status), Query.limit(1)],
  }).then(res => res.total)

  const [list, suspended, dismissed] = await Promise.all([
    admin.tablesDB.listRows<AbuseReportRow>({
      databaseId,
      tableId: ABUSE_REPORTS_TABLE,
      queries: [
        Query.orderDesc('$createdAt'),
        Query.limit(ABUSE_REPORTS_PAGE_SIZE),
        Query.offset((page - 1) * ABUSE_REPORTS_PAGE_SIZE),
      ],
    }),
    countByStatus('suspended'),
    countByStatus('dismissed'),
  ]).catch((error) => { throw toH3Error(error, 'Could not list reports') })

  return {
    total: list.total,
    page,
    pageSize: ABUSE_REPORTS_PAGE_SIZE,
    stats: abuseReportStatsFromCounts({ total: list.total, suspended, dismissed }),
    reports: list.rows.map(projectAbuseReport),
  }
})

import { Query } from 'node-appwrite'
import { COMMUNITIES_TABLE, normalizeTenantPlan, resolveTenantOpenRegistration, type TenantRow } from '../../../../shared/types/tenantRecord'
import { resolveCommunitySuspension } from '../../../../../core/shared/communitySuspension'

/** Betreiber: Tenants (Host→Mandant-Register) auflisten. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows, total } = await admin.tablesDB.listRows<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.orderAsc('host'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not list tenants') })
  if (total > rows.length) {
    console.warn(`[control] tenants-Liste gekappt: ${rows.length}/${total} — Pagination nachrüsten`)
  }
  return { total, tenants: rows.map(row => ({
    id: row.$id, name: row.name, host: row.host, mode: row.mode, projectId: row.projectId, tenantId: row.tenantId, status: row.status,
    wave: row.wave === '' || row.wave == null ? 'stable' as const : row.wave,
    plan: normalizeTenantPlan(row.plan),
    // S1: der Betreiber sieht den Zustand des Kunden-Schalters (Support-Blick)
    openRegistration: resolveTenantOpenRegistration(row.openRegistration),
    // M13: Sperrzustand + Grund + Zeitpunkt. Der Grund reist mit, weil die
    // Liste sonst „gesperrt" sagt und niemand mehr weiß, warum — und weil
    // genau dieser Text auch beim Owner steht.
    suspension: resolveCommunitySuspension(row.suspension),
    suspensionReason: row.suspensionReason ?? '',
    suspendedAt: row.suspendedAt ?? null,
    // Läuft gerade eine Frist? Die Liste zeigt daran, welche Community
    // demnächst von selbst zumacht — bevor der Kunde anruft.
    pastDueSince: row.pastDueSince ?? null,
  })) }
})

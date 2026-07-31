import { Query } from 'node-appwrite'
import {
  WORKSPACES_TABLE,
  type ControlPlanCatalog,
  type WorkspaceRow,
} from '../../../shared/types/workspace'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../shared/types/website'
import { normalizeTenantPlan } from '../../../shared/types/tenantRecord'
import { listOwnMemberships } from '../../utils/workspaceMembers'

/**
 * Kundenbereich (M9-T3): eigene Workspaces des eingeloggten Users —
 * Membership IST die Berechtigung (kein sites.manage). Sites bewusst
 * read-only-schlank (Name/URL/Health/Produkte-Snapshot); Betreiber-Details
 * (projectId, Endpoint, Entitlement-Pflege) bleiben im /dashboard.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const memberships = await listOwnMemberships(event)
  if (memberships.length === 0) {
    return { workspaces: [] }
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const appConfig = useAppConfig() as { pukalani?: { control?: { plans?: ControlPlanCatalog } } }
  const plans = appConfig.pukalani?.control?.plans ?? {}

  const workspaces = await Promise.all(memberships.map(async (member) => {
    const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
      databaseId, tableId: WORKSPACES_TABLE, rowId: member.workspaceId,
    }).catch(() => null)
    if (!workspace) return null

    const { rows: sites } = await admin.tablesDB.listRows<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.equal('workspaceId', workspace.$id), Query.limit(100)],
    }).catch(() => ({ rows: [] as WebsiteRow[] }))

    return {
      id: workspace.$id,
      name: workspace.name,
      plan: workspace.plan,
      planProducts: plans[normalizeTenantPlan(workspace.plan)]?.products ?? [],
      status: workspace.status,
      role: member.role,
      sites: sites.map(site => ({
        name: site.name,
        appUrl: site.appUrl,
        healthStatus: site.healthStatus,
      })),
    }
  }))

  return { workspaces: workspaces.filter(workspace => workspace !== null) }
})

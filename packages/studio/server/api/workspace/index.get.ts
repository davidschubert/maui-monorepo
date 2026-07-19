import { Query } from 'node-appwrite'
import {
  WORKSPACES_TABLE,
  type StudioPlanCatalog,
  type WorkspaceRow,
} from '../../../shared/types/workspace'
import { SITES_TABLE, type SiteRow } from '../../../shared/types/site'
import { listOwnMemberships } from '../../utils/workspaceMembers'

/**
 * Kundenbereich (M9-T3): eigene Workspaces des eingeloggten Users —
 * Membership IST die Berechtigung (kein sites.manage). Sites bewusst
 * read-only-schlank (Name/URL/Health/Features-Snapshot); Betreiber-Details
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
  const appConfig = useAppConfig() as { maui?: { studio?: { plans?: StudioPlanCatalog } } }
  const plans = appConfig.maui?.studio?.plans ?? {}

  const workspaces = await Promise.all(memberships.map(async (member) => {
    const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
      databaseId, tableId: WORKSPACES_TABLE, rowId: member.workspaceId,
    }).catch(() => null)
    if (!workspace) return null

    const { rows: sites } = await admin.tablesDB.listRows<SiteRow>({
      databaseId, tableId: SITES_TABLE,
      queries: [Query.equal('workspaceId', workspace.$id), Query.limit(100)],
    }).catch(() => ({ rows: [] as SiteRow[] }))

    return {
      id: workspace.$id,
      name: workspace.name,
      plan: workspace.plan,
      planFeatures: plans[workspace.plan]?.features ?? [],
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

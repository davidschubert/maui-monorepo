import { Query } from 'node-appwrite'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../../../shared/types/workspace'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'

/**
 * Workspace-Register (sites.manage) — M8-T2: Liste aller Workspaces samt
 * zugeordneter Sites (Zählung + Slugs für die Übersicht).
 */
export default defineEventHandler(async (event): Promise<{ workspaces: (WorkspaceRow & { siteSlugs: string[] })[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [workspaces, sites] = await Promise.all([
    admin.tablesDB.listRows<WorkspaceRow>({
      databaseId, tableId: WORKSPACES_TABLE,
      queries: [Query.orderAsc('name'), Query.limit(100)],
    }),
    admin.tablesDB.listRows<SiteRow>({
      databaseId, tableId: SITES_TABLE,
      queries: [Query.limit(100)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Workspaces missing — run migrations') })

  const slugsByWorkspace = new Map<string, string[]>()
  for (const site of sites.rows) {
    if (!site.workspaceId) continue
    const list = slugsByWorkspace.get(site.workspaceId) ?? []
    list.push(site.slug)
    slugsByWorkspace.set(site.workspaceId, list)
  }

  return {
    workspaces: workspaces.rows.map(workspace => ({
      ...workspace,
      siteSlugs: (slugsByWorkspace.get(workspace.$id) ?? []).sort(),
    })),
  }
})

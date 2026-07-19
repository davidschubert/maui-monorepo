import { Query } from 'node-appwrite'
import {
  WORKSPACE_INVITES_TABLE,
  WORKSPACE_MEMBERS_TABLE,
  WORKSPACES_TABLE,
  type WorkspaceInviteRow,
  type WorkspaceMemberRow,
  type WorkspaceRow,
} from '../../../../shared/types/workspace'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'

/**
 * Workspace-Register (sites.manage) — M8-T2: Liste aller Workspaces samt
 * zugeordneter Sites; M9-T2: plus Owner-Status (Mitglieder + offene
 * Einladung). Die M9-Tables degradieren vor ihrer Migration auf leer.
 */
export default defineEventHandler(async (event): Promise<{ workspaces: (WorkspaceRow & { siteSlugs: string[], memberCount: number, pendingInvite: boolean })[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [workspaces, sites, members, invites] = await Promise.all([
    admin.tablesDB.listRows<WorkspaceRow>({
      databaseId, tableId: WORKSPACES_TABLE,
      queries: [Query.orderAsc('name'), Query.limit(100)],
    }),
    admin.tablesDB.listRows<SiteRow>({
      databaseId, tableId: SITES_TABLE,
      queries: [Query.limit(100)],
    }),
    admin.tablesDB.listRows<WorkspaceMemberRow>({
      databaseId, tableId: WORKSPACE_MEMBERS_TABLE,
      queries: [Query.limit(1000)],
    }).catch(() => ({ rows: [] as WorkspaceMemberRow[] })),
    admin.tablesDB.listRows<WorkspaceInviteRow>({
      databaseId, tableId: WORKSPACE_INVITES_TABLE,
      queries: [Query.equal('status', 'pending'), Query.limit(100)],
    }).catch(() => ({ rows: [] as WorkspaceInviteRow[] })),
  ]).catch((error) => { throw toH3Error(error, 'Workspaces missing — run migrations') })

  const slugsByWorkspace = new Map<string, string[]>()
  for (const site of sites.rows) {
    if (!site.workspaceId) continue
    const list = slugsByWorkspace.get(site.workspaceId) ?? []
    list.push(site.slug)
    slugsByWorkspace.set(site.workspaceId, list)
  }
  const memberCount = new Map<string, number>()
  for (const member of members.rows) {
    memberCount.set(member.workspaceId, (memberCount.get(member.workspaceId) ?? 0) + 1)
  }
  const pendingInviteFor = new Set(invites.rows
    .filter(invite => Date.parse(invite.expiresAt) > Date.now())
    .map(invite => invite.workspaceId))

  return {
    workspaces: workspaces.rows.map(workspace => ({
      ...workspace,
      siteSlugs: (slugsByWorkspace.get(workspace.$id) ?? []).sort(),
      memberCount: memberCount.get(workspace.$id) ?? 0,
      pendingInvite: pendingInviteFor.has(workspace.$id),
    })),
  }
})

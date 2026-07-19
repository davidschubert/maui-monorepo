import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  WORKSPACE_INVITES_TABLE,
  WORKSPACE_MEMBERS_TABLE,
  WORKSPACES_TABLE,
  type WorkspaceInviteRow,
  type WorkspaceMemberRow,
  type WorkspaceRow,
} from '../../shared/types/workspace'

/**
 * GDPR-Contributor des studio-Layers (M9-T1 — löst den M8-Aufschub ein:
 * mit workspace_members sind Workspace-Daten jetzt userId-keyed).
 * Export: Mitgliedschaften + zugehörige Workspace-Namen + angenommene
 * Einladungen. Löschung: Membership-Rows + Invite-Bindung entfernen —
 * der Workspace SELBST bleibt (kaufmännische Daten des Betreibers;
 * ownerEmail-Löschung ist ein manueller Betreiber-Vorgang, s. Typ-Doku).
 * Idempotent (Re-Run findet nichts mehr).
 */
export async function studioExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows: memberships } = await admin.tablesDB.listRows<WorkspaceMemberRow>({
    databaseId, tableId: WORKSPACE_MEMBERS_TABLE,
    queries: [Query.equal('userId', userId), Query.limit(100)],
  }).catch(() => ({ rows: [] as WorkspaceMemberRow[] }))

  const workspaces = await Promise.all(memberships.map(member =>
    admin.tablesDB.getRow<WorkspaceRow>({ databaseId, tableId: WORKSPACES_TABLE, rowId: member.workspaceId })
      .then(workspace => ({ name: workspace.name, plan: workspace.plan, role: member.role, since: member.$createdAt }))
      .catch(() => ({ name: member.workspaceId, plan: 'unknown', role: member.role, since: member.$createdAt })),
  ))

  const { rows: invites } = await admin.tablesDB.listRows<WorkspaceInviteRow>({
    databaseId, tableId: WORKSPACE_INVITES_TABLE,
    queries: [Query.equal('acceptedBy', userId), Query.limit(100)],
  }).catch(() => ({ rows: [] as WorkspaceInviteRow[] }))

  return {
    workspaceMemberships: workspaces,
    acceptedInvites: invites.map(invite => ({ email: invite.email, acceptedAt: invite.$updatedAt })),
  }
}

export async function studioDeleteUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0

  const { rows: memberships } = await admin.tablesDB.listRows<WorkspaceMemberRow>({
    databaseId, tableId: WORKSPACE_MEMBERS_TABLE,
    queries: [Query.equal('userId', userId), Query.limit(100)],
  }).catch(() => ({ rows: [] as WorkspaceMemberRow[] }))
  for (const member of memberships) {
    await admin.tablesDB.deleteRow({ databaseId, tableId: WORKSPACE_MEMBERS_TABLE, rowId: member.$id })
    deleted++
  }

  // Angenommene Einladungen: personenbezogene Bindung (E-Mail + userId) kappen
  const { rows: invites } = await admin.tablesDB.listRows<WorkspaceInviteRow>({
    databaseId, tableId: WORKSPACE_INVITES_TABLE,
    queries: [Query.equal('acceptedBy', userId), Query.limit(100)],
  }).catch(() => ({ rows: [] as WorkspaceInviteRow[] }))
  for (const invite of invites) {
    await admin.tablesDB.deleteRow({ databaseId, tableId: WORKSPACE_INVITES_TABLE, rowId: invite.$id })
    deleted++
  }

  return { deleted, anonymized: 0 }
}

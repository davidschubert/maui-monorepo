import { createHash } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  WORKSPACE_MEMBERS_TABLE,
  WORKSPACES_TABLE,
  type WorkspaceMemberRow,
  type WorkspaceRow,
} from '../../shared/types/workspace'

/** SHA-256-Hex eines Invite-Tokens — die DB kennt nur den Hash (studio-008). */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Mitgliedschaften des eingeloggten Users (M9: Membership IST die Berechtigung). */
export async function listOwnMemberships(event: H3Event): Promise<WorkspaceMemberRow[]> {
  const user = event.context.user
  if (!user) return []
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<WorkspaceMemberRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACE_MEMBERS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.limit(25)],
  })
  return rows
}

/**
 * Guard des Kundenbereichs: 401 ohne Session, 403 ohne Membership.
 * Liefert Membership + Workspace — die Routen unter /api/workspace/*
 * arbeiten IMMER nur auf diesen Rows (nie auf Client-IDs vertrauen).
 */
export async function requireWorkspaceMember(event: H3Event, workspaceId: string): Promise<{ member: WorkspaceMemberRow, workspace: WorkspaceRow }> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const memberships = await listOwnMemberships(event)
  const member = memberships.find(row => row.workspaceId === workspaceId)
  if (!member) {
    throw createError({ status: 403, statusText: 'Not a workspace member' })
  }
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: workspaceId,
  }).catch((error) => { throw toH3Error(error, 'Workspace not found') })
  return { member, workspace }
}

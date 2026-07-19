import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import {
  WORKSPACE_INVITES_TABLE,
  WORKSPACE_MEMBERS_TABLE,
  type WorkspaceInviteRow,
  type WorkspaceMemberRow,
} from '../../../shared/types/workspace'
import { hashInviteToken } from '../../utils/workspaceMembers'

const acceptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

/**
 * Einladung annehmen (M9-T2) — Session-Pflicht (der OTP-Login legt den User
 * an), und die E-Mail des eingeloggten Users MUSS der eingeladenen Adresse
 * entsprechen (weitergeleitete Links binden nicht den falschen Account).
 * Einmalig: Token-Hash → pending + nicht abgelaufen; Annahme legt die
 * Membership an (Unique-409 = schon Mitglied, idempotent ok) und markiert
 * die Einladung als accepted. Fehler bewusst generisch (kein Token-Orakel).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { token } = await readValidatedBody(event, acceptSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows } = await admin.tablesDB.listRows<WorkspaceInviteRow>({
    databaseId, tableId: WORKSPACE_INVITES_TABLE,
    queries: [Query.equal('tokenHash', hashInviteToken(token)), Query.limit(1)],
  })
  const invite = rows[0]
  const expired = invite && Date.parse(invite.expiresAt) < Date.now()
  if (!invite || invite.status !== 'pending' || expired) {
    throw createError({ status: 400, statusText: 'Invalid or expired invitation' })
  }
  if (invite.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    throw createError({ status: 403, statusText: 'Invitation was issued for a different email address' })
  }

  try {
    await admin.tablesDB.createRow<WorkspaceMemberRow>({
      databaseId, tableId: WORKSPACE_MEMBERS_TABLE, rowId: ID.unique(),
      data: { workspaceId: invite.workspaceId, userId: user.$id, role: 'owner' },
    })
  }
  catch (error) {
    // Unique (workspaceId,userId) → bereits Mitglied: idempotent weiter
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 409)) {
      throw toH3Error(error, 'Could not create membership')
    }
  }

  await admin.tablesDB.updateRow({
    databaseId, tableId: WORKSPACE_INVITES_TABLE, rowId: invite.$id,
    data: { status: 'accepted', acceptedBy: user.$id },
  })

  await logAuthEvent(event, 'user.login', { userId: user.$id, method: 'workspace-invite' })
  return { ok: true, workspaceId: invite.workspaceId }
})

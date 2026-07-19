import { randomBytes } from 'node:crypto'
import { ID, Query } from 'node-appwrite'
import {
  WORKSPACE_INVITES_TABLE,
  WORKSPACES_TABLE,
  type WorkspaceInviteRow,
  type WorkspaceRow,
} from '../../../../../shared/types/workspace'
import { hashInviteToken } from '../../../../utils/workspaceMembers'

const INVITE_TTL_MS = 7 * 24 * 3_600_000

/**
 * Owner-Einladung verschicken (sites.manage) — M9-T2. Geht IMMER an die
 * ownerEmail des Workspace (kein freies Empfänger-Feld: die Einladung ist
 * die Bindung genau dieser kaufmännischen Identität). Frühere pending-
 * Invites werden ersetzt (alte Links sterben). Klartext-Token nur im
 * Mail-Link; DB hält den SHA-256-Hash. Betreiber-only → kein eigenes
 * Rate-Limit nötig. Ohne SMTP (Mailer aus) → 503, nichts angelegt.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing workspace id' })
  }

  const config = useRuntimeConfig(event)
  if (!config.public.appUrl) {
    throw createError({ status: 503, statusText: 'Invites unavailable (appUrl missing)' })
  }

  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
    databaseId, tableId: WORKSPACES_TABLE, rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Workspace not found') })

  // Alte pending-Invites des Workspace ersetzen — genau EIN gültiger Link
  const { rows: previous } = await admin.tablesDB.listRows<WorkspaceInviteRow>({
    databaseId, tableId: WORKSPACE_INVITES_TABLE,
    queries: [Query.equal('workspaceId', id), Query.equal('status', 'pending'), Query.limit(25)],
  })

  const token = randomBytes(32).toString('hex')
  const acceptUrl = `${config.public.appUrl}/workspace/accept?token=${token}`

  const sent = await sendMail(event, {
    to: workspace.ownerEmail,
    subject: `Einladung zu Ihrem Workspace „${workspace.name}“ · Workspace invitation`,
    text: [
      `Sie wurden als Inhaber/in des Workspace „${workspace.name}“ eingeladen.`,
      `Einladung annehmen (7 Tage gültig): ${acceptUrl}`,
      '',
      `You have been invited as the owner of the workspace “${workspace.name}”.`,
      `Accept the invitation (valid for 7 days): ${acceptUrl}`,
    ].join('\n'),
  })
  if (!sent) {
    throw createError({ status: 503, statusText: 'Mailer not configured' })
  }

  for (const invite of previous) {
    await admin.tablesDB.deleteRow({ databaseId, tableId: WORKSPACE_INVITES_TABLE, rowId: invite.$id })
  }
  await admin.tablesDB.createRow<WorkspaceInviteRow>({
    databaseId, tableId: WORKSPACE_INVITES_TABLE, rowId: ID.unique(),
    data: {
      workspaceId: id,
      email: workspace.ownerEmail,
      tokenHash: hashInviteToken(token),
      status: 'pending',
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      acceptedBy: '',
    },
  })

  return { ok: true, email: workspace.ownerEmail }
})

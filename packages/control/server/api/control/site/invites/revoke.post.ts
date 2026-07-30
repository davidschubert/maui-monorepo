import { z } from 'zod'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { listSiteInvites, requireSiteTeamContext } from '../../../../utils/siteTeam'

/**
 * Eine offene Einladung widerrufen — der Link stirbt sofort.
 *
 * Die Row wird auf 'revoked' gesetzt, nicht gelöscht: die Spur „wer hat wen
 * eingeladen und es wieder zurückgenommen" ist bei einem Missbrauchsverdacht
 * genau das, was man sucht. Angezeigt wird sie nicht mehr (die Liste zeigt nur
 * pending).
 *
 * Die inviteId wird gegen die GESCOPTE Liste dieser Site geprüft, nie per getRow
 * geholt — eine fremde Id findet sich hier einfach nicht (404).
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  inviteId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireSiteTeamContext(event, body, 'team.manage')

  const invites = await listSiteInvites(event, body.communityId)
  const invite = invites.find(row => row.$id === body.inviteId)
  if (!invite) {
    throw createError({ status: 404, statusText: 'Invitation not found' })
  }

  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<CommunityInviteRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    rowId: invite.$id,
    data: { status: 'revoked' },
  }).catch((error) => { throw toH3Error(error, 'Could not revoke invitation') })

  logEvent('info', 'site.invite_revoked', {
    communityId: body.communityId,
    inviteId: row.$id,
    actor: context.identity.userId,
  })

  return { ok: true, inviteId: row.$id, status: row.status }
})

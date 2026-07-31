import { callControlPlane } from '../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../utils/communityTeamGate'

/** Eine offene Einladung widerrufen — der Link stirbt sofort. */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'team.manage')
  const inviteId = getRouterParam(event, 'id')
  if (!inviteId) {
    throw createError({ status: 400, statusText: 'Missing invitation id' })
  }

  return await callControlPlane<{ ok: boolean, inviteId: string, status: string }>(
    event,
    '/api/control/community/invites/revoke',
    { jwt, communityId, inviteId },
  )
})

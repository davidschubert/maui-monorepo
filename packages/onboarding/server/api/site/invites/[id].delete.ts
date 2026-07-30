import { callControlPlane } from '../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../utils/siteTeamGate'

/** Eine offene Einladung widerrufen — der Link stirbt sofort. */
export default defineEventHandler(async (event) => {
  const { siteId, jwt } = await requireSiteTeamGate(event, 'team.manage')
  const inviteId = getRouterParam(event, 'id')
  if (!inviteId) {
    throw createError({ status: 400, statusText: 'Missing invitation id' })
  }

  return await callControlPlane<{ ok: boolean, inviteId: string, status: string }>(
    event,
    '/api/control/site/invites/revoke',
    { jwt, siteId, inviteId },
  )
})

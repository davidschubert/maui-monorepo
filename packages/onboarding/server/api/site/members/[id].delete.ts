import { callControlPlane } from '../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../utils/siteTeamGate'

/**
 * Einem Mitglied den Zugang entziehen.
 *
 * DELETE als Methode, aber KEIN Löschen: die Mitgliedschaft wird auf
 * status='removed' gesetzt, Inhalte und Namen bleiben (Davids Entscheidung 1 vom
 * 2026-07-29). Die Methode beschreibt, was der Betreiber tut („diesen Zugang
 * weg"), nicht was in der Zeile passiert — die Begründung steht in
 * control/api/control/site/members/remove.post.ts.
 */
export default defineEventHandler(async (event) => {
  const { siteId, jwt } = await requireSiteTeamGate(event, 'team.manage')
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }

  return await callControlPlane<{ ok: boolean, memberId: string, status: string }>(
    event,
    '/api/control/site/members/remove',
    { jwt, siteId, memberId },
  )
})

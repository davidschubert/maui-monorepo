import { z } from 'zod'
import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'

/**
 * Einladung annehmen — der Klick der eingeladenen Person (nicht des Betreibers).
 *
 * Deshalb bewusst OHNE Site-Rollen-Gate: hier ENTSTEHT die Mitgliedschaft, ein
 * `requireSitePermission` würde sich selbst den Weg versperren. Was bleibt:
 * Login-Pflicht, Mandanten-Kontext und die Adressprüfung im Control Plane
 * (weitergeleitete Links binden nicht den falschen Account).
 *
 * Entweder `token` (aus dem Mail-Link) oder `inviteId` (aus der eigenen
 * Einladungs-Liste) — nie beides.
 */
const bodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  inviteId: z.string().min(1).max(36).optional(),
}).strict().refine(body => Boolean(body.token) !== Boolean(body.inviteId), {
  message: 'Either token or inviteId',
})

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const tenant = useTenant(event)
  if (!tenant?.siteId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const jwt = await mintRuntimeJwt(event)

  const result = await callControlPlane<{ ok: boolean, siteId: string, host: string, role: string }>(
    event,
    '/api/control/site/members/accept',
    { jwt, ...(body.token ? { token: body.token } : { inviteId: body.inviteId }) },
  )

  /**
   * Das Lese-Publikum SOFORT, nicht erst in 30 Sekunden (A5).
   *
   * Die Label-Middleware würde es beim nächsten Request auch vergeben — aber
   * erst, wenn der Rollen-Resolver die neue Mitgliedschaft sieht, und der hat für
   * diesen Nutzer gerade „keine Rolle" gecacht (30 s). Für die annehmende Person
   * wäre das eine halbe Minute, in der sie drin ist und trotzdem niemanden sieht:
   * kein Anwesender, kein Activity-Feed. Ein Klick, der wirkt, muss wirken.
   *
   * Nur wenn die Einladung zu DIESER Community gehört: `siteId` kommt aus der
   * Einladung (nie aus dem Body), ein Link für eine andere Community darf hier
   * kein Label setzen.
   */
  if (result.siteId === tenant.siteId) {
    // Rückkehr nach einem Entzug: die „gerade entzogen"-Notiz muss weg, sonst
    // zieht die Label-Middleware das Publikum bis zu einer Minute lang wieder ab
    // (siehe rememberSiteAccessRevoked).
    const userId = event.context.user?.$id
    if (userId) forgetSiteAccessDecision(result.siteId, userId)
    await grantSiteLabel(event, result.siteId)
  }

  return result
})

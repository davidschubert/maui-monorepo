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

  return await callControlPlane<{ ok: boolean, siteId: string, host: string, role: string }>(
    event,
    '/api/control/site/members/accept',
    { jwt, ...(body.token ? { token: body.token } : { inviteId: body.inviteId }) },
  )
})

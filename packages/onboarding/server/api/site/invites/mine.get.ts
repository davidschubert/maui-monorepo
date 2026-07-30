import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'

/**
 * Offene Einladungen des EINGELOGGTEN Nutzers in DIESE Community.
 *
 * Kein `requireSitePermission`: wer eingeladen ist, hat per Definition noch keine
 * Rolle — ein Rollen-Gate würde genau die Personen aussperren, für die die Seite
 * existiert. Die Grenze ist die geprüfte eigene Adresse (das Control Plane
 * vergleicht sie gegen die Einladung), plus Login-Pflicht.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const tenant = useTenant(event)
  if (!tenant?.siteId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  return await callControlPlane<{ invites: { id: string, role: string, expiresAt: string }[], siteName: string }>(
    event,
    '/api/control/site/invites/mine',
    { jwt, siteId: tenant.siteId },
  )
})

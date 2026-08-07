import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'
import { removeAppwriteWebPlatforms } from '../../../utils/appwritePlatform'
import type { CustomDomainState } from '../../../../../control/server/utils/customDomainService'

/**
 * Die eigene Domain wieder abgeben (control-035).
 *
 * REIHENFOLGE WIE IM CONTROL PLANE, und aus demselben Grund: erst die WAHRHEIT
 * (die `communities`-Zeile, über die Naht), dann das Aufräumen. Sobald die
 * Zeile leer ist, löst der Host bei uns nicht mehr auf und die Subdomain hört
 * auf, dorthin umzuleiten. Umgekehrt gäbe es ein Fenster, in dem die Community
 * auf eine Adresse zeigt, die niemand mehr bedient.
 *
 * Die Appwrite-Web-Platform räumt DIESE App ab (Schlüsselgrenze wie beim
 * Anlegen), die ploi-Tenants das Control Plane. Beides fail-soft: die Adresse
 * ist schon weg, der Rest ist Hausarbeit.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')

  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  // Die Formen VORHER holen — nach dem Entfernen weiß niemand mehr, welche
  // Hostnamen abzuräumen sind (die Antwort trägt bewusst den leeren Zustand).
  const before = await callControlPlane<CustomDomainState>(
    event,
    '/api/control/community/domain/state',
    { jwt, communityId: tenant.communityId },
  )

  const jwt2 = await mintRuntimeJwt(event)
  const after = await callControlPlane<CustomDomainState>(
    event,
    '/api/control/community/domain/remove',
    { jwt: jwt2, communityId: tenant.communityId },
  )

  if (before.forms.length) {
    await removeAppwriteWebPlatforms(event, before.forms).catch(() => null)
  }
  return after
})

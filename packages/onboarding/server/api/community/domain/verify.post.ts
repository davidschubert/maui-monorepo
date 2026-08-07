import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'
import { ensureAppwriteWebPlatforms } from '../../../utils/appwritePlatform'
import type { CustomDomainState } from '../../../../../control/server/utils/customDomainService'

/**
 * „Prüfen" — der eine Knopf des Ablaufs, von der Runtime aus gesehen
 * (control-035).
 *
 * ZWEI HÄNDE, EINE BEWEGUNG. Die Freischaltung braucht zwei Dinge aus zwei
 * verschiedenen Appwrite-PROJEKTEN, und keine Seite hat den Schlüssel der
 * anderen:
 *
 *   Das CONTROL PLANE besitzt die `communities`-Zeile und prüft DNS +
 *   Zertifikat. Es kann im Pool-Projekt nichts registrieren (kein Schlüssel —
 *   dieselbe Grenze wie bei `revokeCommunityLabel`, A5).
 *
 *   DIESE APP läuft IM Pool-Projekt und kann dort die Appwrite-Web-Platform
 *   für die Kundendomain anlegen (F45 — ohne sie ist dort jede Realtime tot,
 *   und der WebSocket-Handschlag verrät es nicht). Sie darf die Zeile aber
 *   nicht schreiben.
 *
 * Also: Naht rufen → wenn das Control Plane `needsPlatformRegistration`
 * meldet, die Platform anlegen → das Ergebnis über `domain/activate`
 * zurückmelden. Die zweite Naht-Runde ist kein Umweg, sondern die Quittung:
 * das Control Plane setzt `active` NUR aus `pending_platform` heraus, also
 * nur nachdem es selbst gemessen hat.
 *
 * FAIL-SOFT MIT EHRLICHEM STATUS: scheitert die Registrierung, wird der Grund
 * mitgeschickt und die Domain bleibt sichtbar in `pending_platform` stehen.
 * Nie „aktiv" — eine aktive Domain zieht den 301 der Subdomain nach sich, und
 * dann säße der Kunde auf einer Adresse ohne Live-Aktualisierung.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')

  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  const checked = await callControlPlane<CustomDomainState & { needsPlatformRegistration?: boolean }>(
    event,
    '/api/control/community/domain/verify',
    { jwt, communityId: tenant.communityId },
  )
  if (!checked.needsPlatformRegistration) return checked

  const platforms = await ensureAppwriteWebPlatforms(event, checked.forms)
  if (platforms.added.length) {
    logEvent('info', 'community.custom_domain_platforms_added', {
      communityId: tenant.communityId,
      hosts: platforms.added.join(','),
    })
  }

  // ZWEITES JWT: das erste ist 120 s gültig und hat den Weg über DNS, ploi und
  // Appwrite hinter sich — es kann abgelaufen sein. Ein neues zu prägen kostet
  // einen Appwrite-Aufruf, ein abgelaufenes kostet die Freischaltung.
  const jwt2 = await mintRuntimeJwt(event)
  return await callControlPlane<CustomDomainState>(
    event,
    '/api/control/community/domain/activate',
    {
      jwt: jwt2,
      communityId: tenant.communityId,
      ...(platforms.ok ? {} : { error: platforms.message }),
    },
  )
})

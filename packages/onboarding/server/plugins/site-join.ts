import { callControlPlane, mintRuntimeJwt } from '../utils/controlPlane'
import type { SiteJoinOutcome } from '../../../core/shared/siteJoin'

/**
 * A5 — der core-Vertrag „diese Person macht jetzt mit" wird hier mit der
 * Service-Naht zum Control Plane verdrahtet.
 *
 * Warum in DIESEM Layer: `community_members` gehört dem Control Plane, und der
 * einzige Schreibkanal dorthin ist die Naht dieses Layers (Secret + JWT,
 * utils/controlPlane.ts). Core darf sie nicht kennen (A14: ein Fundament-Layer
 * hängt nie an einem Produkt), also registriert der Layer den Handler — dasselbe
 * Muster wie der Rollen-Resolver in apps/platform/server/plugins.
 *
 * Ohne diesen Layer (Silo-App comments, Playground) ist kein Handler registriert
 * und der Beitritt ein No-Op — dort ist das PROJEKT die Grenze und es gibt
 * nichts beizutreten.
 *
 * FEHLER GEHEN NACH OBEN, aber nur bis joinSite(): das fängt jeden ab und macht
 * 'unavailable' daraus. Hier wird deshalb nichts geglättet — ein 503 der Naht
 * soll ein 503 bleiben und im Log auftauchen, nicht als „geschlossene
 * Community" missgedeutet werden.
 */
export default defineNitroPlugin(() => {
  registerSiteJoinHandler(async (event, request): Promise<SiteJoinOutcome> => {
    const jwt = await mintRuntimeJwt(event, request.sessionSecret)
    const result = await callControlPlane<{ outcome: SiteJoinOutcome, role: string | null }>(
      event,
      '/api/control/site/members/join',
      { jwt, communityId: request.communityId, trigger: request.trigger },
    )
    return result.outcome
  })
})

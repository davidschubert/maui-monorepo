import type { H3Event } from 'h3'
import type { Capability } from '../../../core/shared/types/authz'
import { mintRuntimeJwt } from './controlPlane'

/**
 * Der gemeinsame Vorraum der Mitglieder-Routen IM KUNDEN-DASHBOARD (Runtime).
 *
 * Drei Dinge, jedes Mal in dieser Reihenfolge — und deshalb an genau einer Stelle:
 *
 *  1. `await requireCommunityPermission(event, capability)`. Das `await` ist PFLICHT:
 *     die Funktion ist bewusst asynchron (die Rollen-Auflösung liest
 *     cross-Projekt), ohne await wäre der Gate fail-OPEN — ein Promise ist
 *     wahrheitswertig, und der Request liefe einfach weiter.
 *  2. Mandanten-Kontext. Ohne Community gibt es kein Team: 404 wie eine fehlende
 *     Route (Silo-App, Kontroll-Host, Einzelbetrieb — dort verwaltet der
 *     Betreiber Nutzer über /dashboard/users).
 *  3. Kurzlebiges JWT des Handelnden. Es beweist dem Control Plane, WER handelt;
 *     das Service-Secret beweist nur, WELCHES Deployment fragt.
 *
 * `communityId` kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem Body —
 * sonst könnte ein durchgereichter Wert das Team einer fremden Community
 * umbauen. Das Control Plane prüft die Rolle danach ohnehin noch selbst; diese
 * Prüfung hier ist die schnelle, die 403 gibt, bevor ein JWT geprägt wird.
 */
export interface CommunityTeamGate {
  communityId: string
  jwt: string
}

export async function requireCommunityTeamGate(event: H3Event, capability: Capability): Promise<CommunityTeamGate> {
  await requireCommunityPermission(event, capability)

  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  return { communityId: tenant.communityId, jwt }
}

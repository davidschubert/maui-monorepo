import type { H3Event } from 'h3'
import type { Capability } from '../../../core/shared/types/authz'
import { mintRuntimeJwt } from './controlPlane'

/**
 * Der gemeinsame Vorraum der Mitglieder-Routen IM KUNDEN-DASHBOARD (Runtime).
 *
 * Drei Dinge, jedes Mal in dieser Reihenfolge — und deshalb an genau einer Stelle:
 *
 *  1. `await requireSitePermission(event, capability)`. Das `await` ist PFLICHT:
 *     die Funktion ist bewusst asynchron (die Rollen-Auflösung liest
 *     cross-Projekt), ohne await wäre der Gate fail-OPEN — ein Promise ist
 *     wahrheitswertig, und der Request liefe einfach weiter.
 *  2. Mandanten-Kontext. Ohne Community gibt es kein Team: 404 wie eine fehlende
 *     Route (Silo-App, Kontroll-Host, Einzelbetrieb — dort verwaltet der
 *     Betreiber Nutzer über /dashboard/users).
 *  3. Kurzlebiges JWT des Handelnden. Es beweist dem Control Plane, WER handelt;
 *     das Service-Secret beweist nur, WELCHES Deployment fragt.
 *
 * `siteId` kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem Body —
 * sonst könnte ein durchgereichter Wert das Team einer fremden Community
 * umbauen. Das Control Plane prüft die Rolle danach ohnehin noch selbst; diese
 * Prüfung hier ist die schnelle, die 403 gibt, bevor ein JWT geprägt wird.
 */
export interface SiteTeamGate {
  siteId: string
  jwt: string
}

export async function requireSiteTeamGate(event: H3Event, capability: Capability): Promise<SiteTeamGate> {
  await requireSitePermission(event, capability)

  const tenant = useTenant(event)
  if (!tenant?.siteId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  return { siteId: tenant.siteId, jwt }
}

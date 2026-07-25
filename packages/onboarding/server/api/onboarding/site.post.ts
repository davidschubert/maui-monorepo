// Cross-Layer als EXPLIZITER Vertrag (A14): der Onboarding-Vertrag gehört dem
// Control Plane (es besitzt tenants/site_members) — dieser Layer konsumiert ihn,
// definiert ihn aber nicht. Reine Zod-/Daten-Module, kein Laufzeit-Coupling.
import { onboardingSiteSchema } from '../../../../studio/schemas/onboarding'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * Community anlegen — der öffentliche Abschluss des Wizards (Schritt 7).
 *
 * Diese Route erzeugt selbst NICHTS: sie beweist die Session, mintet ein
 * kurzlebiges JWT und lässt das Control Plane anlegen. Damit bleibt genau eine
 * Stelle im System schreibberechtigt auf das Mandanten-Register.
 */
export interface CreatedSite {
  siteId: string
  host: string
  url: string
  plan: string
  trialEndsAt: string | null
  workspaceId: string
  reused: boolean
}

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const site = await readValidatedBody(event, onboardingSiteSchema.parse)
  const jwt = await mintRuntimeJwt(event)

  const result = await callControlPlane<CreatedSite>(event, '/api/studio/onboarding/site', { jwt, site })

  logEvent('info', 'onboarding.site_requested', {
    siteId: result.siteId,
    host: result.host,
    reused: result.reused,
  })
  return result
})

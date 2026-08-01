// Cross-Layer als EXPLIZITER Vertrag (A14): der Umschlag gehört dem Control
// Plane (es besitzt communities/community_members) — dieser Layer konsumiert
// ihn. Reiner Typ-Import, kein Laufzeit-Coupling.
import type { MyCommunitiesResponse } from '../../../../control/shared/myCommunities'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * „Deine Communities" für den eingeloggten Nutzer (F12) — die Datenquelle der
 * Kunden-Übersicht auf `my.pukalani.app`.
 *
 * KEIN NEUER PRÄFIX NÖTIG, und das ist eine Entscheidung, keine Bequemlichkeit:
 * `/api/onboarding/` steht schon in `pukalani.tenancy.controlApiPrefixes`, und
 * diese Route gehört dort auch hin. Der Grund für die Liste ist Datentrennung —
 * auf einem Host OHNE Mandanten scopt `scopeQuery` nicht, eine tenant-gescopte
 * Route würde quer über alle Communities des Pool-Projekts lesen. Diese Route
 * berührt KEINE Tabelle des Runtime-Projekts: sie beweist die Session, mintet
 * ein kurzlebiges JWT und lässt das Control Plane antworten, das seinerseits nur
 * nach der Identität aus genau diesem JWT sucht. Es gibt hier also nichts zu
 * scopen — wie bei allen Geschwistern unter `/api/onboarding/`.
 *
 * NUR AUF EINEM KONTROLL-HOST (404 sonst): auf einer Kunden-Community wäre eine
 * Liste der ANDEREN Communities des Betrachters ein Fremdkörper — dieselbe
 * Trennung, die auch den Wizard dort unerreichbar macht. Die Navigations-Hälfte
 * (`/communities` → 404) steht in control-center.global.ts; das hier ist die
 * Server-Hälfte, denn eine Seite zu verstecken sperrt keine Route.
 */
export default defineEventHandler(async (event): Promise<MyCommunitiesResponse> => {
  if (!event.context.controlCenter) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const jwt = await mintRuntimeJwt(event)
  return await callControlPlane<MyCommunitiesResponse>(event, '/api/control/community/mine', { jwt })
})

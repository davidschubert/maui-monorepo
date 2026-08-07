import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'
import type { CustomDomainState } from '../../../../../control/server/utils/customDomainService'

/**
 * Stand der eigenen Domain lesen (control-035).
 *
 * DIESELBE KETTE WIE BRANDING UND REGISTRIERUNG, und aus demselben Grund:
 * `communities` gehört dem CONTROL PLANE, die Platform-App hat dorthin nur
 * einen READ-ONLY-Key auf die Tabelle. Der Domain-Zustand ist aber mehr als
 * eine Spalte — er trägt das Verifikations-TOKEN, und das darf nur der Owner
 * dieser Community sehen. Also über die Naht (Secret + JWT), wo drei Prüfungen
 * hintereinander stehen, statt den Lese-Key zu erweitern.
 *
 * OHNE PLAN-SPERRE: ein Basic-Owner soll die Seite sehen und erfahren, was
 * ihm fehlt (`planAllows` in der Antwort sagt der Seite, ob sie die Eingabe
 * anbietet). Es gibt dort nichts zu leaken — der Zustand ist „keine Domain".
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')

  // Ohne Mandanten-Kontext gibt es keine Community, die eine Adresse haben
  // könnte (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine fehlende
  // Route — dort ist das kein Produkt, das „gerade nicht geht".
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const jwt = await mintRuntimeJwt(event)
  // communityId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem
  // Body — sonst läse ein durchgereichter Wert das Token einer fremden
  // Community.
  return await callControlPlane<CustomDomainState>(
    event,
    '/api/control/community/domain/state',
    { jwt, communityId: tenant.communityId },
  )
})

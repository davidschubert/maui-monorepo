import { z } from 'zod'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * „Offene Registrierung" DIESER Community umschalten (Audit-Befund S1, Davids
 * Entscheidung 4 vom 2026-07-27). Aufrufer ist das Kunden-Dashboard auf dem
 * Mandanten-Host (der USwitch in /dashboard/settings/community).
 *
 * WARUM DIESE ROUTE IM ONBOARDING-LAYER LIEGT: `tenants` gehört dem Control
 * Plane, und die Platform-App hat dorthin nur einen READ-ONLY-Key. Der einzige
 * vorgesehene Schreibkanal ist die Service-Naht dieses Layers
 * (utils/controlPlane.ts: Secret + JWT) — sie hier zu benutzen ist billiger und
 * ehrlicher, als einen zweiten Kanal zu erfinden oder den Lese-Key zu
 * erweitern. Die UI dazu lebt im admin-Layer (Kunden-Dashboard); der Vertrag
 * zwischen beiden ist dieser Pfad, siehe dort den Gegenkommentar.
 *
 * AUTORISIERUNG: `requireSitePermission` (Site-Rolle owner/admin über
 * `team.manage`, dann protokollierter Operator-Break-Glass) — NIE
 * requirePermission, das ist synchron und für Betreiber-/Instanz-Routen. Das
 * Control Plane prüft die Rolle DANACH noch einmal selbst; diese Prüfung hier
 * ist die schnelle, die schon 403 gibt, bevor ein JWT geprägt wird.
 */
const bodySchema = z.object({ openRegistration: z.boolean() }).strict()

export default defineEventHandler(async (event) => {
  await requireSitePermission(event, 'team.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, die man schalten könnte
  // (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine fehlende Route —
  // dort ist der Schalter kein Feature, das „gerade nicht geht".
  const tenant = useTenant(event)
  if (!tenant?.siteId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const jwt = await mintRuntimeJwt(event)

  // siteId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem Body —
  // sonst könnte ein durchgereichter Wert eine fremde Community schalten.
  return await callControlPlane<{ siteId: string, openRegistration: boolean }>(
    event,
    '/api/control/site/registration',
    { jwt, siteId: tenant.siteId, openRegistration: body.openRegistration },
  )
})

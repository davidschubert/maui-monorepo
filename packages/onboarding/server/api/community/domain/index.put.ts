import { z } from 'zod'
import { validateCustomDomain } from '../../../../../control/shared/customDomain'
import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'
import type { CustomDomainState } from '../../../../../control/server/utils/customDomainService'

/**
 * Eine eigene Domain eintragen (control-035, Davids Entscheidung 3).
 *
 * DIE PRÜFUNG HIER IST DIE SCHNELLE, NICHT DIE MASSGEBLICHE. Sie spart dem
 * Kunden den Weg über die Naht bei einem Tippfehler und liefert denselben
 * `reason`-Schlüssel, den die Seite ohnehin übersetzt. Die AUTORITÄT ist das
 * Control Plane: es prüft dieselbe pure Regel noch einmal selbst, dazu Plan
 * und Eindeutigkeit über beide Formen. Genau das ist der Punkt einer Naht —
 * sie glaubt dem Aufrufer nichts, auch nicht seiner Validierung.
 *
 * PUT und nicht POST: die Domain ist EINE Eigenschaft der Community, kein
 * Vorgang, den man mehrfach anlegt. Ein zweiter Aufruf mit einem anderen Wert
 * ersetzt den ersten.
 */
const bodySchema = z.object({ domain: z.string().min(1).max(300) }).strict()

export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')

  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const check = validateCustomDomain(body.domain)
  if (!check.ok) {
    throw createError({ status: 400, statusText: 'Invalid domain', data: { code: `domain_${check.reason}` } })
  }

  const jwt = await mintRuntimeJwt(event)
  return await callControlPlane<CustomDomainState>(
    event,
    '/api/control/community/domain/set',
    { jwt, communityId: tenant.communityId, domain: check.domain },
  )
})

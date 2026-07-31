import { z } from 'zod'
import { callControlPlane } from '../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../utils/communityTeamGate'

/**
 * A6 Schritt 3 — der Kauf-Knopf der Community (Platform-Seite der Naht).
 *
 * WARUM DIESER LAYER: Stripe-Schlüssel und `tenants` liegen im CONTROL PLANE,
 * die Platform-App hat dorthin nur einen Read-only-Key. Gekauft wird trotzdem
 * IM DASHBOARD DER COMMUNITY — also läuft der Ruf über dieselbe Service-Naht
 * wie die Mitglieder-Verwaltung: `requireCommunityTeamGate` prüft die Capability und
 * prägt ein kurzlebiges JWT, `callControlPlane` legt das Service-Secret dazu.
 * Zwei Beweise, zwei Fragen: das Secret sagt WELCHES Deployment fragt, das JWT
 * WER handelt. Das Control Plane prüft beides noch einmal selbst.
 *
 * `communityId` kommt NIE aus dem Body (siehe communityTeamGate) — sonst kaufte
 * jemand ein Abo auf Kosten einer fremden Community.
 *
 * `billing.manage` trägt nur der OWNER (Davids Entscheidung 2 vom 2026-07-30,
 * packages/core/shared/communityAuthz.ts): das Abo hängt an der Community, und wer
 * es abschließt, geht einen Vertrag ein.
 *
 * ZOD lässt bewusst NUR personal/pro zu, obwohl das Control Plane das ganze
 * Plan-Enum annimmt: `basic` ist der kostenlose Ausgangszustand und hat keinen
 * Stripe-Price — ein Checkout darauf wäre erst dort ein 400. Herunterstufen
 * läuft über das Portal (Proration), nicht über einen zweiten Kauf.
 *
 * Fehler reisen unverändert weiter (callControlPlane): 409 mit
 * `data.code = 'already_subscribed'` ist eine Aussage für den Nutzer, kein Bug.
 */
const bodySchema = z.object({
  plan: z.enum(['personal', 'pro']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
}).strict()

export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'community.billing')
  const body = await readValidatedBody(event, bodySchema.parse)

  const { url } = await callControlPlane<{ url: string }>(
    event,
    '/api/control/billing/community/checkout',
    { jwt, communityId, plan: body.plan, interval: body.interval },
  )

  // Nur die Ziel-URL zurück — die Antwort des Control Plane trägt sonst nichts,
  // was der Browser wissen müsste.
  return { url }
})

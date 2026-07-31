import { callControlPlane } from '../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../utils/siteTeamGate'

/**
 * A6 Schritt 3 — das Stripe-Portal der Community (Platform-Seite der Naht).
 *
 * Gleiche Naht, gleiche Autorisierung wie der Checkout (Service-Secret +
 * Owner-JWT, `billing.manage`); nur ohne Eingabe — es gibt nichts zu wählen.
 * Im Portal erledigt der Owner Rechnungen, Zahlungsmethode, Plan- und
 * Intervall-Wechsel sowie die Kündigung. Deshalb gibt es hier bewusst KEINE
 * eigenen Routen für „herunterstufen" oder „kündigen": Proration, Steuern und
 * Fristen rechnet Stripe, und zwei Wege zum selben Vertrag wären zwei
 * Wahrheiten.
 *
 * Kein Body-Schema: der Aufrufer hat nichts beizutragen, `communityId` kommt
 * aus dem Server-Kontext.
 *
 * 409 („No billing account yet") reicht das Control Plane durch, wenn diese
 * Community nie gekauft hat — ohne Stripe-Customer gibt es kein Portal. Die
 * Oberfläche macht daraus einen Satz, keinen Fehler.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireSiteTeamGate(event, 'billing.manage')

  const { url } = await callControlPlane<{ url: string }>(
    event,
    '/api/control/billing/community/portal',
    { jwt, communityId },
  )

  return { url }
})

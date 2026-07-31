import { z } from 'zod'
import { requireCommunityTeamContext } from '../../../../../../../packages/control/server/utils/communityTeam'
import { createCommunityPortalUrl } from '../../../../utils/communityCheckout'

/**
 * A6 Schritt 3 — Stripe-Portal der Community: Rechnungen, Zahlungsmethode,
 * Plan-/Intervall-Wechsel, Kündigung. Gleiche Naht und gleiche Autorisierung
 * wie der Checkout (Service-Secret + Owner-JWT, billing.manage).
 * 409 ohne Customer: wer nie gekauft hat, hat kein Portal.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'community.billing')

  const url = await createCommunityPortalUrl(event, context.tenant)
  return { url }
})

import { z } from 'zod'
import { TENANT_PLANS } from '../../../../../../../packages/control/shared/types/tenantRecord'
import { requireSiteTeamContext } from '../../../../../../../packages/control/server/utils/siteTeam'
import { communityHasLiveSubscription, createCommunityCheckoutUrl } from '../../../../utils/communityCheckout'

/**
 * A6 Schritt 3 — Community-Checkout (Geldfluss 1): SERVICE-Route, Aufrufer ist
 * die Platform-App (Service-Secret) im Namen des OWNERS (JWT). Dieselbe Naht
 * wie die Mitglieder-Verwaltung: requireSiteTeamContext verifiziert das JWT,
 * prüft die Capability (billing.manage = nur Owner, tenantAuthz) und liefert
 * die tenants-Row des richtigen Projekts.
 *
 * Doppelabo-Schutz: eine Community mit lebendem Abo bekommt kein zweites —
 * Plan-/Intervall-Wechsel läuft übers Stripe-Portal (Proration).
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  plan: z.enum(TENANT_PLANS),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireSiteTeamContext(event, body, 'site.billing')

  if (communityHasLiveSubscription(context.tenant)) {
    throw createError({
      status: 409,
      statusText: 'Community already has a subscription — use the billing portal to change it',
      data: { code: 'already_subscribed' },
    })
  }

  const url = await createCommunityCheckoutUrl(event, {
    tenant: context.tenant,
    ownerEmail: context.identity.email,
    ownerUserId: context.identity.userId,
    plan: body.plan,
    interval: body.interval,
  })

  logEvent('info', 'billing.community_checkout_started', {
    communityId: body.communityId,
    plan: body.plan,
    interval: body.interval,
    runtimeUserId: context.identity.userId,
  })
  return { url }
})

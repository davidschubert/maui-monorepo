import { z } from 'zod'
import type { StudioPlanCatalog } from '../../../../../../packages/studio/shared/types/workspace'
import { pickLookupKey } from '../../../../../../packages/studio/shared/workspaceBilling'

const checkoutSchema = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9-]*$/),
  interval: z.enum(['monthly', 'yearly']).optional(),
  locale: z.enum(['de', 'en']).optional(),
}).strict()

/**
 * Owner-Checkout (M9-T3) — APP-Route (A14: studio-Guard + billing-Utility).
 * Anders als die Betreiber-Route (/api/studio/...): der Guard ist die
 * MEMBERSHIP des eingeloggten Users, und der Stripe-Customer ist der
 * Owner selbst (ensureCustomer in der billing-Utility) — der Betreiber
 * hört auf, Checkout-Stellvertreter zu sein. Redirects in den Kundenbereich.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing workspace id' })
  }
  const body = await readValidatedBody(event, checkoutSchema.parse)

  const { workspace } = await requireWorkspaceMember(event, id)

  const appConfig = useAppConfig() as { maui?: { studio?: { plans?: StudioPlanCatalog } } }
  const plan = appConfig.maui?.studio?.plans?.[body.plan]
  if (!plan) {
    throw createError({ status: 400, statusText: 'Unknown plan' })
  }
  const interval = body.interval ?? 'monthly'
  const lookupKey = pickLookupKey(plan, interval)
  if (!lookupKey) {
    throw createError({ status: 400, statusText: 'Plan has no checkout (free)' })
  }

  const origin = getRequestURL(event).origin
  const localePrefix = body.locale === 'de' ? '/de' : ''
  const url = await createSubscriptionCheckoutSession(event, {
    lookupKey,
    metadata: { workspaceId: workspace.$id, plan: body.plan, interval },
    successUrl: `${origin}${localePrefix}/workspace?checkout=success`,
    cancelUrl: `${origin}${localePrefix}/workspace?checkout=cancel`,
  })

  return { url }
})

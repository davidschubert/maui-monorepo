import { z } from 'zod'
import type { StudioPlanCatalog } from '../../../../../../packages/studio/shared/types/workspace'
import { isPaidPlanKey, pickLookupKey } from '../../../../../../packages/studio/shared/workspaceBilling'

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
  const plans = appConfig.maui?.studio?.plans ?? {}
  // Doppelabo-Schutz: ein bereits bezahlter Workspace darf keinen ZWEITEN Checkout
  // starten (das legte ein zweites Stripe-Abo an → Doppelabrechnung). Plan-/
  // Intervall-Wechsel läuft übers Stripe-Portal (Proration). free → bezahlt bleibt ok.
  if (isPaidPlanKey(workspace.plan, plans)) {
    throw createError({ status: 409, statusText: 'Workspace already on a paid plan — use the billing portal to change it' })
  }
  const plan = plans[body.plan]
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
  // #7a: Abo hängt am WORKSPACE-Customer (nicht am eingeloggten User) — nur so
  // funktioniert das Owner-Portal unabhängig davon, wer den Checkout auslöste.
  const stripeCustomerId = await ensureWorkspaceCustomer(event, workspace)
  const url = await createSubscriptionCheckoutSession(event, {
    lookupKey,
    stripeCustomerId,
    metadata: { workspaceId: workspace.$id, plan: body.plan, interval },
    successUrl: `${origin}${localePrefix}/workspace?checkout=success`,
    cancelUrl: `${origin}${localePrefix}/workspace?checkout=cancel`,
  })

  return { url }
})

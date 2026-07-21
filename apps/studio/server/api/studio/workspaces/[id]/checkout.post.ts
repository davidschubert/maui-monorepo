import { z } from 'zod'
import { WORKSPACES_TABLE, type StudioPlanCatalog, type WorkspaceRow } from '../../../../../../../packages/studio/shared/types/workspace'
import { pickLookupKey } from '../../../../../../../packages/studio/shared/workspaceBilling'

const checkoutSchema = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9-]*$/),
  interval: z.enum(['monthly', 'yearly']).optional(),
  locale: z.enum(['de', 'en']).optional(),
}).strict()

/**
 * Workspace-Checkout (M8-T3) — APP-Route (A14: komponiert studio-Validierung
 * mit der billing-Checkout-Utility, die Layer kennen sich nicht). Erzeugt
 * eine Stripe-hosted Subscription-Checkout-Session mit workspaceId+plan als
 * Subscription-Metadata — der Webhook ordnet spätere Lifecycle-Events darüber
 * zu. v1 (Check-in): der Betreiber checkt selbst aus; free hat keinen
 * Checkout (Downgrade läuft über Kündigung → free-Fallback).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing workspace id' })
  }
  const body = await readValidatedBody(event, checkoutSchema.parse)

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

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Workspace not found') })

  const origin = getRequestURL(event).origin
  const localePrefix = body.locale === 'de' ? '/de' : ''
  const url = await createSubscriptionCheckoutSession(event, {
    lookupKey,
    metadata: { workspaceId: workspace.$id, plan: body.plan, interval },
    successUrl: `${origin}${localePrefix}/dashboard/workspaces?checkout=success`,
    cancelUrl: `${origin}${localePrefix}/dashboard/workspaces?checkout=cancel`,
  })

  return { url }
})

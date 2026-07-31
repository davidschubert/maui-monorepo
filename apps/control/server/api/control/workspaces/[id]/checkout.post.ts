import { z } from 'zod'
import { WORKSPACES_TABLE, type ControlPlanCatalog, type WorkspaceRow } from '../../../../../../../packages/control/shared/types/workspace'
import { isPaidPlanKey, pickLookupKey } from '../../../../../../../packages/control/shared/workspaceBilling'

const checkoutSchema = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9-]*$/),
  interval: z.enum(['monthly', 'yearly']).optional(),
  locale: z.enum(['de', 'en']).optional(),
}).strict()

/**
 * Workspace-Checkout (M8-T3) — APP-Route (A14: komponiert control-Validierung
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

  const appConfig = useAppConfig() as { pukalani?: { control?: { plans?: ControlPlanCatalog } } }
  const plans = appConfig.pukalani?.control?.plans ?? {}
  const plan = plans[body.plan]
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

  // Doppelabo-Schutz (per Workspace): auch die Betreiber-Route legt für einen
  // bereits bezahlten Workspace kein zweites Abo an (Wechsel läuft übers Portal).
  if (isPaidPlanKey(workspace.plan, plans)) {
    throw createError({ status: 409, statusText: 'Workspace already on a paid plan — change it in the billing portal' })
  }

  const origin = getRequestURL(event).origin
  const localePrefix = body.locale === 'de' ? '/de' : ''
  // #7a: auch der Betreiber-Checkout bindet ans WORKSPACE-Customer — der Owner
  // kann das Abo danach selbst im Portal verwalten (kein Customer-Mismatch mehr).
  const stripeCustomerId = await ensureWorkspaceCustomer(event, workspace)
  const url = await createSubscriptionCheckoutSession(event, {
    lookupKey,
    stripeCustomerId,
    metadata: { workspaceId: workspace.$id, plan: body.plan, interval },
    successUrl: `${origin}${localePrefix}/dashboard/workspaces?checkout=success`,
    cancelUrl: `${origin}${localePrefix}/dashboard/workspaces?checkout=cancel`,
  })

  return { url }
})

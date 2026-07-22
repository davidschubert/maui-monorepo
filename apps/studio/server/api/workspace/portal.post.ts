import { WORKSPACES_TABLE, type WorkspaceRow } from '../../../../../packages/studio/shared/types/workspace'

/**
 * Stripe-Kundenportal für Workspace-Owner (M9-T3) — APP-Route (A14).
 * Kündigung/Zahlungsmethode/Rechnungen laufen über das seit M8 konfigurierte
 * Portal. Der Customer ist seit #7a der WORKSPACE-Customer
 * (workspace.stripeCustomerId) — nicht mehr der billing_customers-Lookup per
 * userId, der 404te, wenn der BETREIBER den Checkout ausgelöst hatte
 * (Customer hing dann am Operator statt am Owner). Voraussetzung bleibt:
 * Membership (403) und ein Customer vom ersten Checkout (404).
 * Rückkehr in den Kundenbereich.
 */
export default defineEventHandler(async (event) => {
  await requireBillingEnabled(event)
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const memberships = await listOwnMemberships(event)
  if (memberships.length === 0) {
    throw createError({ status: 403, statusText: 'Not a workspace member' })
  }

  // v1: ein Owner gehört zu genau einem Workspace (accept legt 'owner' an) —
  // die erste Membership ist der Kundenbereichs-Kontext (wie /workspace selbst).
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: memberships[0]!.workspaceId,
  }).catch((error) => { throw toH3Error(error, 'Workspace not found') })

  if (!workspace.stripeCustomerId) {
    throw createError({ status: 404, statusText: 'No billing account yet' })
  }

  const origin = getRequestURL(event).origin
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''
  const stripe = useStripe(event)
  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${origin}${localePrefix}/workspace`,
  }).catch(error => toStripeSafeError(error, 'billingPortal.sessions.create (workspace) fehlgeschlagen'))

  return { url: session.url }
})

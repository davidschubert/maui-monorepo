import type { H3Event } from 'h3'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../../../packages/studio/shared/types/workspace'

/**
 * Workspace-eigener Stripe-Customer (#7a) — APP-Utility (A14: komponiert
 * studio-Datenmodell mit der billing-Stripe-Utility). Der Customer hängt am
 * WORKSPACE (nicht am eingeloggten User): so verwaltet der Owner sein Abo im
 * Portal, egal ob er selbst oder der Betreiber den Checkout ausgelöst hat.
 * Lazy beim ersten Checkout; Race-Dedupe nach dem B11-Muster (Re-Read nach
 * dem Write — verliert unser Create, nutzen wir den Gewinner und räumen
 * unseren Doppel-Customer bei Stripe best-effort weg).
 */
export async function ensureWorkspaceCustomer(event: H3Event, workspace: WorkspaceRow): Promise<string> {
  if (workspace.stripeCustomerId) return workspace.stripeCustomerId

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const customerId = await createStandaloneCustomer(event, {
    email: workspace.ownerEmail,
    name: workspace.name,
    metadata: { workspaceId: workspace.$id },
  })

  await admin.tablesDB.updateRow<WorkspaceRow>({
    databaseId, tableId: WORKSPACES_TABLE, rowId: workspace.$id,
    data: { stripeCustomerId: customerId },
  })
  // Re-Read: hat ein paralleler Checkout gewonnen, zählt DESSEN Customer —
  // unseren bei Stripe wieder aufräumen (best-effort), damit kein Abo je auf
  // einem verwaisten Customer landet.
  const fresh = await admin.tablesDB.getRow<WorkspaceRow>({
    databaseId, tableId: WORKSPACES_TABLE, rowId: workspace.$id,
  })
  if (fresh.stripeCustomerId && fresh.stripeCustomerId !== customerId) {
    const stripe = useStripe(event)
    await stripe.customers.del(customerId).catch(() => {})
    return fresh.stripeCustomerId
  }
  return customerId
}

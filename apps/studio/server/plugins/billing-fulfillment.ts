/**
 * A14-Komposition (Vorbild apps/comments für Event-Tickets): verbindet den
 * Abo-Lifecycle-Vertrag des billing-Layers mit dem Workspace-Billing des
 * studio-Layers — die Layer kennen sich nicht, die APP schon. Policy +
 * Ausführung liegen im studio-Layer (handleWorkspaceSubscriptionUpdate,
 * idempotent); billing liefert nur verifizierte, nicht-stale Updates.
 *
 * Cross-Sub-Autorität (#6b): die App reicht dem studio-Handler einen Check
 * durch, der DIREKT bei Stripe nachsieht, ob für den Workspace noch ein
 * anderes lebendes Abo existiert — der lokale stripeSubscriptionId-Speicher
 * kann durch out-of-order-Webhooks stale sein, Stripe selbst nicht. Nur so
 * kann das Kündigen eines alten Abos ein neueres nie mehr kannibalisieren.
 */

// Stati, in denen ein Abo den Workspace-Plan noch trägt (Dunning inklusive —
// past_due/unpaid degradieren bewusst nicht, siehe subscriptionUpdateToAction).
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])

export default defineNitroPlugin(() => {
  registerSubscriptionFulfillment(async (event, update) => {
    await handleWorkspaceSubscriptionUpdate(event, update, {
      hasOtherActiveSubscription: async (event, input) => {
        const subscriptions = await listCustomerSubscriptionSummaries(event, input.stripeCustomerId)
        return subscriptions.some(subscription =>
          subscription.id !== input.exceptSubscriptionId
          && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
          && subscription.metadata.workspaceId === input.workspaceId,
        )
      },
    })
  })
})

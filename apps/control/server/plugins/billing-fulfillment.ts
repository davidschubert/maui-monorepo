/**
 * A14-Komposition (Vorbild apps/comments für Event-Tickets): verbindet den
 * Abo-Lifecycle-Vertrag des billing-Layers mit dem Workspace-Billing des
 * control-Layers — die Layer kennen sich nicht, die APP schon. Policy +
 * Ausführung liegen im control-Layer (handleWorkspaceSubscriptionUpdate,
 * idempotent); billing liefert nur verifizierte, nicht-stale Updates.
 *
 * Cross-Sub-Autorität (#6b): die App reicht dem control-Handler einen Check
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
    // A6-Übergang: BEIDE Pfade nebeneinander. Alte Abos tragen
    // workspaceId-Metadata, neue (Community-Checkout, Geldfluss 1)
    // communityId — jeder Handler ignoriert fremde Events selbst. Der
    // Workspace-Pfad fällt mit A6 Schritt 5.
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
    await handleCommunitySubscriptionUpdate(event, update, {
      hasOtherActiveSubscription: async (event, input) => {
        const subscriptions = await listCustomerSubscriptionSummaries(event, input.stripeCustomerId)
        return subscriptions.some(subscription =>
          subscription.id !== input.exceptSubscriptionId
          && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
          && subscription.metadata.communityId === input.communityId,
        )
      },
    })
  })
})

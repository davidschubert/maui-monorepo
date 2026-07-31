/**
 * A14-Komposition (Vorbild apps/comments für Event-Tickets): verbindet den
 * Abo-Lifecycle-Vertrag des billing-Layers mit dem COMMUNITY-Billing des
 * control-Layers — die Layer kennen sich nicht, die APP schon. Policy +
 * Ausführung liegen im control-Layer (handleCommunitySubscriptionUpdate,
 * idempotent); billing liefert nur verifizierte, nicht-stale Updates.
 *
 * Seit A6 Schritt 5 gibt es hier genau EINEN Handler. Bis dahin lief daneben
 * der Workspace-Pfad (Abos mit `workspaceId`-Metadata) — der Behälter ist weg,
 * und mit ihm der Handler. Ein Alt-Abo mit workspaceId-Metadata würde heute
 * von diesem Handler ignoriert (keine `communityId`); es gibt keines
 * (Migration control-031 bricht ab, falls doch).
 *
 * Cross-Sub-Autorität (#6b): die App reicht dem control-Handler einen Check
 * durch, der DIREKT bei Stripe nachsieht, ob für die Community noch ein
 * anderes lebendes Abo existiert — der lokale stripeSubscriptionId-Speicher
 * kann durch out-of-order-Webhooks stale sein, Stripe selbst nicht. Nur so
 * kann das Kündigen eines alten Abos ein neueres nie mehr kannibalisieren.
 */

// Stati, in denen ein Abo den Plan noch trägt (Dunning inklusive —
// past_due/unpaid degradieren bewusst nicht, siehe
// subscriptionUpdateToCommunityAction).
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])

export default defineNitroPlugin(() => {
  registerSubscriptionFulfillment(async (event, update) => {
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

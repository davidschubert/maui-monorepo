/**
 * A14-Komposition (Vorbild apps/comments für Event-Tickets): verbindet den
 * Abo-Lifecycle-Vertrag des billing-Layers mit dem Workspace-Billing des
 * studio-Layers — die Layer kennen sich nicht, die APP schon. Policy +
 * Ausführung liegen im studio-Layer (handleWorkspaceSubscriptionUpdate,
 * idempotent); billing liefert nur verifizierte, nicht-stale Updates.
 */
export default defineNitroPlugin(() => {
  registerSubscriptionFulfillment(async (event, update) => {
    await handleWorkspaceSubscriptionUpdate(event, update)
  })
})

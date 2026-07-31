import type { H3Event } from 'h3'
import { shouldApplyFreeFallback, subscriptionUpdateToCommunityAction, type CommunitySubscriptionUpdate } from '../../shared/communityBilling'
import { COMMUNITIES_TABLE, type TenantPlan, type TenantRow } from '../../shared/types/tenantRecord'
import type { ControlPlanCatalog } from '../../shared/types/planCatalog'

/**
 * A6 — verifiziertes Abo-Update → COMMUNITY-Wirkung: hier kommt eine Zahlung
 * beim Kunden an (`tenants.plan` steuert Quota + Produkt-Sichtbarkeit). Seit
 * A6 Schritt 5 der EINZIGE Fulfillment-Handler; der Workspace-Zwilling
 * (handleWorkspaceSubscriptionUpdate) ist mit seinem Behälter gefallen.
 *
 * Idempotent und Webhook-Retry-sicher; transiente Fehler WERFEN (billing
 * antwortet 500 → Stripe stellt erneut zu — ein verschluckter Webhook ist
 * ein verlorener Kauf, Regel aus dem Cross-Sub-Fix).
 */

/** Autoritäts-Check (#6b), von der APP verdrahtet (A14: control kennt billing/
 *  Stripe nicht): existiert für die Community ein ANDERES lebendes Abo? */
export type OtherActiveCommunitySubscriptionCheck = (event: H3Event, input: {
  stripeCustomerId: string
  communityId: string
  exceptSubscriptionId: string
}) => Promise<boolean>

export async function handleCommunitySubscriptionUpdate(event: H3Event, update: CommunitySubscriptionUpdate, options?: {
  hasOtherActiveSubscription?: OtherActiveCommunitySubscriptionCheck
}): Promise<void> {
  const appConfig = useAppConfig() as { pukalani?: { control?: { plans?: ControlPlanCatalog } } }
  const plans = appConfig.pukalani?.control?.plans ?? {}
  const action = subscriptionUpdateToCommunityAction(update, plans)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  switch (action.kind) {
    case 'ignore':
      return
    case 'apply-plan': {
      await admin.tablesDB.updateRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
        data: {
          plan: action.plan as TenantPlan,
          billingStatus: 'active',
          stripeCustomerId: action.stripeCustomerId,
          // Diese Sub wird die maßgebliche für die Community (Cross-Sub-Guard #6).
          stripeSubscriptionId: action.stripeSubscriptionId,
          // Ein bezahltes Abo LÖST die Testphase ab — sonst würde der
          // Trial-Sweep später einen zahlenden Kunden herabstufen wollen
          // (das Abo-Veto in shouldEndTrial ist das zweite Netz).
          trialEndsAt: null,
        },
      })
      console.info(`[control] Community ${action.communityId} → Plan ${action.plan} (Abo ${action.stripeSubscriptionId})`)
      return
    }
    case 'past-due':
      await admin.tablesDB.updateRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
        data: { billingStatus: 'past_due' },
      })
      console.warn(`[control] Community ${action.communityId} → past_due (Plan bleibt, Stripe-Dunning läuft)`)
      return
    case 'free-fallback': {
      const tenant = await admin.tablesDB.getRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
      }).catch((error) => {
        // 404 = Community gelöscht → legitim nichts zu tun. Alles andere ist
        // transient → rethrow (Webhook 500 → Stripe retryt; nur so kommt das
        // Event wieder — ein stilles 200 würde den Fallback verschlucken).
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) return null
        console.error(`[control] Community ${action.communityId}: Lesefehler im free-Fallback — abgebrochen (fail-closed)`, error)
        throw error
      })
      if (!tenant) return

      // Cross-Sub-Guard (#6): nur wenn die gekündigte Sub die aktuell
      // hinterlegte ist (oder keine hinterlegt) — sonst hat ein NEUERES Abo
      // die Community bereits hochgestuft und die alte Kündigung ist stale.
      const storedSub = tenant.stripeSubscriptionId ?? ''
      if (!shouldApplyFreeFallback(storedSub, action.stripeSubscriptionId)) {
        console.warn(`[control] Community ${action.communityId}: Kündigung von ${action.stripeSubscriptionId} ignoriert — aktuell gilt ${storedSub} (Cross-Sub-Guard)`)
        return
      }

      // Autoritäts-Check bei STRIPE (#6b): der lokale Speicher kann durch
      // out-of-order-Events rebinden — Stripe selbst nicht. FAIL-CLOSED:
      // schlägt der Check fehl, NICHT degradieren (Stripe retryt).
      if (options?.hasOtherActiveSubscription && update.stripeCustomerId) {
        try {
          const other = await options.hasOtherActiveSubscription(event, {
            stripeCustomerId: update.stripeCustomerId,
            communityId: action.communityId,
            exceptSubscriptionId: action.stripeSubscriptionId,
          })
          if (other) {
            console.warn(`[control] Community ${action.communityId}: free-Fallback übersprungen — ein anderes Abo lebt noch bei Stripe (Cross-Sub-Autorität)`)
            return
          }
        }
        catch (error) {
          console.error(`[control] Community ${action.communityId}: Cross-Sub-Autoritäts-Check fehlgeschlagen — Downgrade abgebrochen (fail-closed)`, error)
          throw error
        }
      }

      await admin.tablesDB.updateRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
        data: {
          // Rückfall auf den kostenlosen Tarif — NIE auf nichts (ein
          // gekündigter Kunde ist nie schlechter gestellt als einer, der nie
          // gezahlt hat). Abo-Bezug lösen; der Customer bleibt (Rechnungen).
          plan: 'basic',
          billingStatus: 'canceled',
          stripeSubscriptionId: '',
        },
      })
      console.info(`[control] Community ${action.communityId} → free-Fallback nach Kündigung`)
    }
  }
}

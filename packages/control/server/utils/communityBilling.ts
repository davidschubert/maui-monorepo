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
      // Zahlung ist da: eine laufende BILLING-Sperre fällt im selben Schreibvorgang
      // (Davids Entscheidung vom 2026-08-02 — „Zahlung ausgeglichen ⇒ Sperre fällt
      // automatisch"). Eine `abuse`-Sperre bleibt bestehen: die endet nur durch
      // eine Betreiber-Entscheidung, nicht durch Geld. Deshalb wird der Wert
      // GELESEN und nicht blind auf '' gesetzt.
      const current = await admin.tablesDB.getRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
      }).catch((error) => {
        // 404 = Community gelöscht → nichts zu tun ist hier falsch (das Abo
        // gehört zu ihr), aber auch nichts zu retten. Alles andere ist transient
        // → rethrow, damit Stripe erneut zustellt (Webhook-Regel).
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) return null
        throw error
      })
      if (!current) return
      const liftsSuspension = current.suspension === 'billing'

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
          // Die Uhr der 14-Tage-Frist wird abgeräumt, nicht nur angehalten:
          // ein späterer Verzug soll bei null anfangen.
          pastDueSince: null,
          ...(liftsSuspension ? { suspension: '', suspensionReason: '', suspendedAt: null } : {}),
        },
      })
      console.info(`[control] Community ${action.communityId} → Plan ${action.plan} (Abo ${action.stripeSubscriptionId})`)
      if (liftsSuspension) console.info(`[control] Community ${action.communityId}: Zahlungs-Sperre aufgehoben (Zahlung eingegangen)`)
      return
    }
    case 'past-due': {
      // NICHT SOFORT SPERREN (Davids Entscheidung): der Webhook stempelt nur den
      // BEGINN des Verzugs, die Sperre fällt 14 Tage später im Sweep. Ein
      // Webhook, der sperrt, wäre die falsche Stelle — er muss bei transienten
      // Fehlern werfen (Stripe stellt erneut zu), und ein Retry darf keine
      // zweite Sperre auslösen.
      //
      // Der Stempel wird NUR gesetzt, wenn noch keiner steht. Stripe schickt
      // während des Dunnings mehrere `past_due`-Events; jedes davon würde die
      // Frist sonst neu starten, und sie liefe nie ab.
      const current = await admin.tablesDB.getRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
      }).catch((error) => {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) return null
        throw error
      })
      if (!current) return
      const alreadyStamped = !!current.pastDueSince

      await admin.tablesDB.updateRow<TenantRow>({
        databaseId, tableId: COMMUNITIES_TABLE, rowId: action.communityId,
        data: {
          billingStatus: 'past_due',
          ...(alreadyStamped ? {} : { pastDueSince: new Date().toISOString() }),
        },
      })
      console.warn(`[control] Community ${action.communityId} → past_due (Plan bleibt, Frist läuft${alreadyStamped ? ' seit ' + current.pastDueSince : ' ab jetzt'})`)
      return
    }
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
          // Kündigung beendet den Verzug: was nicht mehr geschuldet wird, kann
          // nicht überfällig sein. Eine BILLING-Sperre fällt deshalb mit —
          // sonst bliebe ein Kunde für immer nur-lesend, obwohl er auf dem
          // kostenlosen Tarif nichts mehr schuldet. Eine `abuse`-Sperre bleibt.
          pastDueSince: null,
          ...(tenant.suspension === 'billing' ? { suspension: '', suspensionReason: '', suspendedAt: null } : {}),
        },
      })
      console.info(`[control] Community ${action.communityId} → free-Fallback nach Kündigung`)
    }
  }
}

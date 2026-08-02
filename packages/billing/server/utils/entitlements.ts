import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { BILLING_SUBSCRIPTIONS_TABLE, ENTITLED_STATUSES, type BillingSubscriptionRow } from '../../shared/types/billing'

/**
 * Entitlement-Fundament (B6): EINE indizierte Query nach userId, pro Request
 * memoized am event.context. „Aktiv" = status ∈ ENTITLED_STATUSES (§6:
 * past_due behält Zugriff — Stripe-Dunning arbeitet).
 */
export async function getActiveSubscription(event: H3Event): Promise<BillingSubscriptionRow | null> {
  const user = event.context.user
  if (!user) return null

  const ctx = event.context as { _billingSubscription?: BillingSubscriptionRow | null }
  if (ctx._billingSubscription !== undefined) return ctx._billingSubscription

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<BillingSubscriptionRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_SUBSCRIPTIONS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.orderDesc('$updatedAt'), Query.limit(5)],
  }).catch(() => ({ rows: [] as BillingSubscriptionRow[] }))

  const active = res.rows.find(row => (ENTITLED_STATUSES as readonly string[]).includes(row.status)) ?? null
  ctx._billingSubscription = active
  return active
}

/** Produkte des aktiven Plans (aus pukalani.billing.plans aufgelöst) */
export async function getEntitledProducts(event: H3Event): Promise<string[]> {
  const subscription = await getActiveSubscription(event)
  if (!subscription) return []
  const config = await getBillingConfig(event)
  return config.plans.find(plan => plan.id === subscription.planId)?.products ?? []
}

/**
 * HIER STAND `requireEntitlement()` — ENTFERNT am 2026-08-02 (Audit-Befund:
 * totes Gate im Geldpfad).
 *
 * Es hatte seit seiner Entstehung keinen einzigen Aufrufer, und das war kein
 * Versehen: der EINE echte Konsument der Entitlements ist der Kurs-Zugangs-
 * Guard (`apps/comments/server/plugins/course-access.ts`), und ein Guard
 * braucht eine ANTWORT (`boolean`), keinen Wurf — `getEntitledProducts()`
 * liefert genau die. Ein zweites, werfendes Gate daneben ist kein Netz,
 * sondern eine Abzweigung: es antwortete 402 „Upgrade required" ohne
 * fachlichen `data.code` und damit ohne `reason` im Envelope — genau die
 * Bauart, die dieses Projekt sonst als „tote Fehlerhälfte" behandelt (der
 * Kurs-Guard trägt COURSE_UPGRADE_REQUIRED_CODE, weil die Oberfläche „hier
 * hilft ein Upgrade" von „diese Instanz verkauft gar nichts" unterscheiden
 * muss).
 *
 * Wer ein neues zahlungspflichtiges Produkt gatet, nimmt `getEntitledProducts`
 * und wirft SELBST — mit einem Grund, den die eigene Oberfläche übersetzen kann.
 */

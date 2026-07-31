import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { closeOverRequires, shouldApplyFreeFallback, subscriptionUpdateToAction } from '../../shared/workspaceBilling'
import { WEBSITES_TABLE, type WebsiteRow } from '../../shared/types/website'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../shared/types/entitlement'
import { PRODUCT_CATALOG_TABLE, type ProductCatalogRow } from '../../shared/types/job'
import { WORKSPACES_TABLE, type ControlPlanCatalog, type WorkspaceRow, type WorkspaceStatus } from '../../shared/types/workspace'

/**
 * Grant-Set einer Site deklarativ ERSETZEN (fehlende Rows anlegen, nicht
 * mehr gewollte löschen) — gemeinsame Logik von manueller Pflege
 * (entitlements.put) und Workspace-Billing-Sync (M8-T3). Idempotent.
 */
export async function replaceSiteGrants(event: H3Event, siteProjectId: string, products: readonly string[]): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // ALLE Grants der Site paginieren (No-silent-caps): das deklarative ERSETZEN
  // muss das vollständige Ist-Set sehen, sonst blieben >100 Rows unberührt.
  const existing: EntitlementRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<EntitlementRow>({
      databaseId, tableId: ENTITLEMENTS_TABLE,
      queries: [Query.equal('siteProjectId', siteProjectId), Query.limit(100), Query.offset(offset)],
    })
    existing.push(...page.rows)
    if (page.rows.length < 100) break
  }

  const wanted = new Set(products)
  const have = new Set(existing.map(row => row.productKey))

  const operations: Promise<unknown>[] = []
  for (const product of wanted) {
    if (!have.has(product)) {
      operations.push(admin.tablesDB.createRow<EntitlementRow>({
        databaseId, tableId: ENTITLEMENTS_TABLE, rowId: ID.unique(),
        // featureKey: Übergang bis zum Zusammenziehen (E11) — die alte Spalte
        // ist required (control-003), ohne sie schlägt jeder Insert fehl.
        data: { siteProjectId, productKey: product, featureKey: product, status: 'active', notes: '' },
      }))
    }
  }
  for (const row of existing) {
    if (!wanted.has(row.productKey)) {
      operations.push(admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: row.$id }))
    }
  }
  await Promise.all(operations)
}

/**
 * Workspace auf einen Plan setzen (M8-T3): Workspace-Row patchen und die
 * Grant-Sets ALLER zugeordneten Sites auf das requires-geschlossene
 * Plan-Set ersetzen. Nicht-grantbare Katalog-Keys (core/system/control)
 * kommen im Plan-Katalog nicht vor; unbekannte Keys lassen closeOverRequires
 * werfen (Katalog = Autorität, F7). Idempotent (Webhook-Retry-sicher).
 */
export async function applyWorkspacePlan(event: H3Event, input: {
  workspaceId: string
  plan: string
  planProducts: readonly string[]
  status: WorkspaceStatus
  stripeCustomerId?: string
  /** Aktuelle Stripe-Subscription auf der Row hinterlegen (Cross-Sub-Guard #6).
   *  '' löscht den Bezug (nach free-Fallback), undefined lässt ihn unberührt
   *  (z. B. manuelle Plan-Pflege). */
  stripeSubscriptionId?: string
}): Promise<{ sites: number, products: string[] }> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows: catalog } = await admin.tablesDB.listRows<ProductCatalogRow>({
    databaseId, tableId: PRODUCT_CATALOG_TABLE, queries: [Query.limit(100)],
  })
  // requires DEFENSIV parsen: ungültiges JSON in EINER Katalog-Row darf nicht
  // den ganzen Abo-Lifecycle blockieren (sonst Webhook-500 → Stripe-Retry-Schleife).
  // Kaputte Row → leere requires + Log; Betreiber sieht es und korrigiert die Daten.
  const catalogEntries = catalog.map((row) => {
    try {
      return { key: row.$id, requires: JSON.parse(row.requires || '[]') as string[] }
    }
    catch {
      console.error(`[control] product_catalog "${row.$id}": ungültiges requires-JSON — als [] behandelt`)
      return { key: row.$id, requires: [] as string[] }
    }
  })
  const products = closeOverRequires(input.planProducts, catalogEntries)

  // ALLE Sites des Workspace paginieren — ein Abo-Update darf NIE still nur
  // die ersten 100 Sites syncen und den Rest ungrantet lassen (No-silent-caps).
  const sites: WebsiteRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.equal('workspaceId', input.workspaceId), Query.limit(100), Query.offset(offset)],
    })
    sites.push(...page.rows)
    if (page.rows.length < 100) break
  }

  for (const site of sites) {
    await replaceSiteGrants(event, site.projectId, products)
  }

  await admin.tablesDB.updateRow<WorkspaceRow>({
    databaseId, tableId: WORKSPACES_TABLE, rowId: input.workspaceId,
    data: {
      plan: input.plan,
      status: input.status,
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
      // '' (Fallback) muss geschrieben werden → auf undefined prüfen, nicht truthy
      ...(input.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    },
  })

  return { sites: sites.length, products }
}

/** Nur den Workspace-Status setzen (past_due) — Grants bleiben unberührt. */
export async function setWorkspaceStatus(event: H3Event, workspaceId: string, status: WorkspaceStatus): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.updateRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: workspaceId,
    data: { status },
  })
}

/**
 * Verifiziertes Abo-Update → Workspace-Wirkung (M8-T3). Wird vom App-Plugin
 * (A14: die App verdrahtet billing↔control) an registerSubscriptionFulfillment
 * gehängt. Policy pure + getestet (subscriptionUpdateToAction); Ausführung
 * deklarativ/idempotent — Webhook-Retries sind gefahrlos. Kündigungs-Timing
 * macht Stripe (cancel_at_period_end → 'canceled' erst zum echten Ende);
 * danach fällt der Workspace aufs free-Set zurück, NIE auf null Produkte.
 */
/** Autoritäts-Check (#6b), von der APP verdrahtet (A14: control kennt billing/
 *  Stripe nicht): existiert für den Workspace ein ANDERES lebendes Abo? */
export type OtherActiveSubscriptionCheck = (event: H3Event, input: {
  stripeCustomerId: string
  workspaceId: string
  exceptSubscriptionId: string
}) => Promise<boolean>

export async function handleWorkspaceSubscriptionUpdate(event: H3Event, update: {
  status: string
  metadata: Record<string, string>
  stripeCustomerId: string
  stripeSubscriptionId: string
}, options?: {
  hasOtherActiveSubscription?: OtherActiveSubscriptionCheck
}): Promise<void> {
  const appConfig = useAppConfig() as { pukalani?: { control?: { plans?: ControlPlanCatalog } } }
  const plans = appConfig.pukalani?.control?.plans ?? {}
  const action = subscriptionUpdateToAction(update, plans)

  switch (action.kind) {
    case 'ignore':
      return
    case 'apply-plan': {
      const result = await applyWorkspacePlan(event, {
        workspaceId: action.workspaceId,
        plan: action.plan,
        planProducts: plans[action.plan]!.products,
        status: 'active',
        stripeCustomerId: update.stripeCustomerId,
        // Diese Sub wird die maßgebliche für den Workspace (Cross-Sub-Guard #6).
        stripeSubscriptionId: action.stripeSubscriptionId,
      })
      console.info(`[control] Workspace ${action.workspaceId} → Plan ${action.plan} (${result.sites} Sites, Produkte: ${result.products.join(', ')})`)
      return
    }
    case 'past-due':
      await setWorkspaceStatus(event, action.workspaceId, 'past_due')
      console.warn(`[control] Workspace ${action.workspaceId} → past_due (Grants bleiben, Stripe-Dunning läuft)`)
      return
    case 'free-fallback': {
      const free = plans.basic
      if (!free) {
        console.error('[control] basic-Plan fehlt im Katalog — Fallback übersprungen')
        return
      }
      // Cross-Sub-Guard (#6): nur wenn die gekündigte Sub die aktuell
      // hinterlegte ist (oder keine hinterlegt) — sonst hat ein NEUERES Abo
      // den Workspace bereits hochgestuft und die alte Kündigung ist stale.
      const config = useRuntimeConfig(event)
      const admin = createAdminClient(event)
      const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: WORKSPACES_TABLE,
        rowId: action.workspaceId,
      }).catch((error) => {
        // 404 = Workspace gelöscht → legitim nichts zu tun. Alles andere ist
        // transient → rethrow (Webhook 500 → Stripe retryt; nur so kommt das
        // Event wieder — ein stilles 200 würde den Fallback verschlucken).
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) return null
        console.error(`[control] Workspace ${action.workspaceId}: Lesefehler im free-Fallback — abgebrochen (fail-closed)`, error)
        throw error
      })
      if (!workspace) return
      const storedSub = workspace.stripeSubscriptionId ?? ''
      if (!shouldApplyFreeFallback(storedSub, action.stripeSubscriptionId)) {
        console.warn(`[control] Workspace ${action.workspaceId}: Kündigung von ${action.stripeSubscriptionId} ignoriert — aktuell gilt ${storedSub} (Cross-Sub-Guard)`)
        return
      }
      // Autoritäts-Check bei STRIPE (#6b): der lokale stripeSubscriptionId-
      // Speicher kann durch out-of-order-Events rebinden (last-writer-wins im
      // apply-Pfad) — Stripe selbst nicht. Lebt für diesen Workspace noch ein
      // anderes Abo, wäre der free-Fallback Kannibalisierung → überspringen.
      // FAIL-CLOSED: schlägt der Check fehl, NICHT degradieren (Stripe retryt).
      if (options?.hasOtherActiveSubscription && update.stripeCustomerId) {
        try {
          const other = await options.hasOtherActiveSubscription(event, {
            stripeCustomerId: update.stripeCustomerId,
            workspaceId: action.workspaceId,
            exceptSubscriptionId: action.stripeSubscriptionId,
          })
          if (other) {
            console.warn(`[control] Workspace ${action.workspaceId}: free-Fallback übersprungen — ein anderes Abo lebt noch bei Stripe (Cross-Sub-Autorität)`)
            return
          }
        }
        catch (error) {
          // Rethrow → Webhook 500 → Stripe stellt das Event erneut zu und der
          // Check läuft später gegen eine gesunde API (nur so retryt Stripe).
          console.error(`[control] Workspace ${action.workspaceId}: Cross-Sub-Autoritäts-Check fehlgeschlagen — Downgrade abgebrochen (fail-closed)`, error)
          throw error
        }
      }
      const result = await applyWorkspacePlan(event, {
        workspaceId: action.workspaceId,
        plan: 'basic',
        planProducts: free.products,
        status: 'active',
        // Abo-Bezug lösen: der Workspace hat kein aktives Abo mehr.
        stripeSubscriptionId: '',
      })
      console.info(`[control] Workspace ${action.workspaceId} → free-Fallback nach Kündigung (${result.sites} Sites)`)
    }
  }
}

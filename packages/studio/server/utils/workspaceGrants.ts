import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { closeOverRequires, shouldApplyFreeFallback, subscriptionUpdateToAction } from '../../shared/workspaceBilling'
import { SITES_TABLE, type SiteRow } from '../../shared/types/site'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../shared/types/entitlement'
import { FEATURE_CATALOG_TABLE, type FeatureCatalogRow } from '../../shared/types/job'
import { WORKSPACES_TABLE, type StudioPlanCatalog, type WorkspaceRow, type WorkspaceStatus } from '../../shared/types/workspace'

/**
 * Grant-Set einer Site deklarativ ERSETZEN (fehlende Rows anlegen, nicht
 * mehr gewollte löschen) — gemeinsame Logik von manueller Pflege
 * (entitlements.put) und Workspace-Billing-Sync (M8-T3). Idempotent.
 */
export async function replaceSiteGrants(event: H3Event, siteProjectId: string, features: readonly string[]): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows: existing } = await admin.tablesDB.listRows<EntitlementRow>({
    databaseId, tableId: ENTITLEMENTS_TABLE,
    queries: [Query.equal('siteProjectId', siteProjectId), Query.limit(100)],
  })

  const wanted = new Set(features)
  const have = new Set(existing.map(row => row.featureKey))

  const operations: Promise<unknown>[] = []
  for (const feature of wanted) {
    if (!have.has(feature)) {
      operations.push(admin.tablesDB.createRow<EntitlementRow>({
        databaseId, tableId: ENTITLEMENTS_TABLE, rowId: ID.unique(),
        data: { siteProjectId, featureKey: feature, status: 'active', notes: '' },
      }))
    }
  }
  for (const row of existing) {
    if (!wanted.has(row.featureKey)) {
      operations.push(admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: row.$id }))
    }
  }
  await Promise.all(operations)
}

/**
 * Workspace auf einen Plan setzen (M8-T3): Workspace-Row patchen und die
 * Grant-Sets ALLER zugeordneten Sites auf das requires-geschlossene
 * Plan-Set ersetzen. Nicht-grantbare Katalog-Keys (core/system/studio)
 * kommen im Plan-Katalog nicht vor; unbekannte Keys lassen closeOverRequires
 * werfen (Katalog = Autorität, F7). Idempotent (Webhook-Retry-sicher).
 */
export async function applyWorkspacePlan(event: H3Event, input: {
  workspaceId: string
  plan: string
  planFeatures: readonly string[]
  status: WorkspaceStatus
  stripeCustomerId?: string
  /** Aktuelle Stripe-Subscription auf der Row hinterlegen (Cross-Sub-Guard #6).
   *  '' löscht den Bezug (nach free-Fallback), undefined lässt ihn unberührt
   *  (z. B. manuelle Plan-Pflege). */
  stripeSubscriptionId?: string
}): Promise<{ sites: number, features: string[] }> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows: catalog } = await admin.tablesDB.listRows<FeatureCatalogRow>({
    databaseId, tableId: FEATURE_CATALOG_TABLE, queries: [Query.limit(100)],
  })
  // requires DEFENSIV parsen: ungültiges JSON in EINER Katalog-Row darf nicht
  // den ganzen Abo-Lifecycle blockieren (sonst Webhook-500 → Stripe-Retry-Schleife).
  // Kaputte Row → leere requires + Log; Betreiber sieht es und korrigiert die Daten.
  const catalogEntries = catalog.map((row) => {
    try {
      return { key: row.$id, requires: JSON.parse(row.requires || '[]') as string[] }
    }
    catch {
      console.error(`[studio] feature_catalog "${row.$id}": ungültiges requires-JSON — als [] behandelt`)
      return { key: row.$id, requires: [] as string[] }
    }
  })
  const features = closeOverRequires(input.planFeatures, catalogEntries)

  // ALLE Sites des Workspace paginieren — ein Abo-Update darf NIE still nur
  // die ersten 100 Sites syncen und den Rest ungrantet lassen (No-silent-caps).
  const sites: SiteRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<SiteRow>({
      databaseId, tableId: SITES_TABLE,
      queries: [Query.equal('workspaceId', input.workspaceId), Query.limit(100), Query.offset(offset)],
    })
    sites.push(...page.rows)
    if (page.rows.length < 100) break
  }

  for (const site of sites) {
    await replaceSiteGrants(event, site.projectId, features)
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

  return { sites: sites.length, features }
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
 * (A14: die App verdrahtet billing↔studio) an registerSubscriptionFulfillment
 * gehängt. Policy pure + getestet (subscriptionUpdateToAction); Ausführung
 * deklarativ/idempotent — Webhook-Retries sind gefahrlos. Kündigungs-Timing
 * macht Stripe (cancel_at_period_end → 'canceled' erst zum echten Ende);
 * danach fällt der Workspace aufs free-Set zurück, NIE auf null Features.
 */
export async function handleWorkspaceSubscriptionUpdate(event: H3Event, update: {
  status: string
  metadata: Record<string, string>
  stripeCustomerId: string
  stripeSubscriptionId: string
}): Promise<void> {
  const appConfig = useAppConfig() as { maui?: { studio?: { plans?: StudioPlanCatalog } } }
  const plans = appConfig.maui?.studio?.plans ?? {}
  const action = subscriptionUpdateToAction(update, plans)

  switch (action.kind) {
    case 'ignore':
      return
    case 'apply-plan': {
      const result = await applyWorkspacePlan(event, {
        workspaceId: action.workspaceId,
        plan: action.plan,
        planFeatures: plans[action.plan]!.features,
        status: 'active',
        stripeCustomerId: update.stripeCustomerId,
        // Diese Sub wird die maßgebliche für den Workspace (Cross-Sub-Guard #6).
        stripeSubscriptionId: action.stripeSubscriptionId,
      })
      console.info(`[studio] Workspace ${action.workspaceId} → Plan ${action.plan} (${result.sites} Sites, Features: ${result.features.join(', ')})`)
      return
    }
    case 'past-due':
      await setWorkspaceStatus(event, action.workspaceId, 'past_due')
      console.warn(`[studio] Workspace ${action.workspaceId} → past_due (Grants bleiben, Stripe-Dunning läuft)`)
      return
    case 'free-fallback': {
      const free = plans.free
      if (!free) {
        console.error('[studio] free-Plan fehlt im Katalog — Fallback übersprungen')
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
      }).catch(() => null)
      const storedSub = workspace?.stripeSubscriptionId ?? ''
      if (!shouldApplyFreeFallback(storedSub, action.stripeSubscriptionId)) {
        console.warn(`[studio] Workspace ${action.workspaceId}: Kündigung von ${action.stripeSubscriptionId} ignoriert — aktuell gilt ${storedSub} (Cross-Sub-Guard)`)
        return
      }
      const result = await applyWorkspacePlan(event, {
        workspaceId: action.workspaceId,
        plan: 'free',
        planFeatures: free.features,
        status: 'active',
        // Abo-Bezug lösen: der Workspace hat kein aktives Abo mehr.
        stripeSubscriptionId: '',
      })
      console.info(`[studio] Workspace ${action.workspaceId} → free-Fallback nach Kündigung (${result.sites} Sites)`)
    }
  }
}

import { Query } from 'node-appwrite'
import { TRIAL_FALLBACK_PLAN, TRIAL_PLAN } from '../../shared/onboarding'
import { TENANTS_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../shared/types/workspace'

/**
 * Ende der Testphase (O6): abgelaufene Trials fallen auf den kostenlosen Tarif.
 *
 * Das ist die Einlösung des Versprechens aus dem Wizard — „danach läuft deine
 * Community im kostenlosen Tarif weiter, nichts wird gesperrt, nichts
 * gelöscht". Ohne diesen Sweep wäre die Aussage falsch: der Tenant behielte
 * Pro-Limits für immer.
 *
 * Herabgestuft wird NUR die Quota-Stufe (`tenants.plan`). Status, Inhalte und
 * Zugänge bleiben unangetastet (F3-Grundsatz: Kill-Switch ist nie destruktiv).
 */

/**
 * PURE (unit-getestet): Ist diese Testphase fällig?
 *
 * Der Workspace-Plan ist das Veto: er spiegelt Stripe. Wer inzwischen wirklich
 * Pro gekauft hat, darf NICHT herabgestuft werden, nur weil sein Trial-Datum
 * in der Vergangenheit liegt — das wäre ein bezahlter Kunde, dem wir Limits
 * kürzen.
 */
export function shouldEndTrial(
  tenant: Pick<TenantRow, 'plan' | 'trialEndsAt' | 'status'>,
  workspacePlan: string | null,
  now: number,
): boolean {
  if (tenant.status !== 'active') return false
  if (tenant.plan !== TRIAL_PLAN) return false
  if (!tenant.trialEndsAt) return false
  const end = Date.parse(tenant.trialEndsAt)
  if (!Number.isFinite(end) || end > now) return false
  // Bezahlt = Hände weg.
  return !workspacePlan || workspacePlan === 'free'
}

export interface TrialSweepResult {
  checked: number
  downgraded: string[]
}

export async function runTrialSweep(now: number = Date.now()): Promise<TrialSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  // Range-Query über die echte Datetime-Spalte (studio-016 legt idx_trial an) —
  // kein Full-Scan über alle Tenants.
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: TENANTS_TABLE,
    queries: [
      Query.equal('plan', TRIAL_PLAN),
      Query.lessThanEqual('trialEndsAt', new Date(now).toISOString()),
      Query.limit(100),
    ],
  })

  const downgraded: string[] = []
  for (const tenant of rows) {
    let workspacePlan: string | null = null
    if (tenant.workspaceId) {
      const workspace = await admin.tablesDB.getRow<WorkspaceRow>({
        databaseId, tableId: WORKSPACES_TABLE, rowId: tenant.workspaceId,
      }).catch(() => null)
      // Workspace nicht lesbar → als „nicht bezahlt" behandeln wäre riskant
      // (könnte einen zahlenden Kunden treffen). Also überspringen und beim
      // nächsten Lauf erneut versuchen.
      if (!workspace) continue
      workspacePlan = workspace.plan
    }

    if (!shouldEndTrial(tenant, workspacePlan, now)) continue

    await admin.tablesDB.updateRow<TenantRow>({
      databaseId, tableId: TENANTS_TABLE, rowId: tenant.$id,
      data: { plan: TRIAL_FALLBACK_PLAN },
    }).then(() => {
      downgraded.push(tenant.host)
      logEvent('info', 'trial.ended', { siteId: tenant.$id, host: tenant.host })
    }).catch((error) => {
      logEvent('error', 'trial.end_failed', {
        siteId: tenant.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return { checked: rows.length, downgraded }
}

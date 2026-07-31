import { Query } from 'node-appwrite'
import { TRIAL_FALLBACK_PLAN, TRIAL_PLAN } from '../../shared/onboarding'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

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
 * Das Veto ist der `billingStatus` der COMMUNITY selbst: wer inzwischen
 * wirklich bezahlt hat, darf NICHT herabgestuft werden, nur weil sein
 * Trial-Datum in der Vergangenheit liegt — das wäre ein bezahlter Kunde, dem
 * wir Limits kürzen. Bis A6 Schritt 5 stand hier ein ZWEITES Veto (der Plan
 * des abrechnenden Workspace); es ist mit dem Workspace gefallen, und das ist
 * kein Verlust: das Abo hängt seither an der Community, also steht die
 * Wahrheit in derselben Row.
 */
export function shouldEndTrial(
  tenant: Pick<TenantRow, 'plan' | 'trialEndsAt' | 'status'> & Partial<Pick<TenantRow, 'billingStatus'>>,
  now: number,
): boolean {
  if (tenant.status !== 'active') return false
  // A6: ein lebendes Community-Abo ist das Veto — wer bezahlt hat, wird nie
  // herabgestuft, auch nicht bei Pro-kauft-Pro (der Kauf löscht trialEndsAt,
  // aber dieses Netz hält auch ohne). past_due zählt als lebend: Dunning ist
  // die Grace-Periode, kein Downgrade-Grund.
  if (tenant.billingStatus === 'active' || tenant.billingStatus === 'past_due') return false
  if (tenant.plan !== TRIAL_PLAN) return false
  if (!tenant.trialEndsAt) return false
  const end = Date.parse(tenant.trialEndsAt)
  if (!Number.isFinite(end) || end > now) return false
  return true
}

export interface TrialSweepResult {
  checked: number
  downgraded: string[]
}

export async function runTrialSweep(now: number = Date.now()): Promise<TrialSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  // Range-Query über die echte Datetime-Spalte (control-016 legt idx_trial an) —
  // kein Full-Scan über alle Tenants.
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [
      Query.equal('plan', TRIAL_PLAN),
      Query.lessThanEqual('trialEndsAt', new Date(now).toISOString()),
      Query.limit(100),
    ],
  })

  const downgraded: string[] = []
  for (const tenant of rows) {
    if (!shouldEndTrial(tenant, now)) continue

    await admin.tablesDB.updateRow<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE, rowId: tenant.$id,
      data: { plan: TRIAL_FALLBACK_PLAN },
    }).then(() => {
      downgraded.push(tenant.host)
      logEvent('info', 'trial.ended', { communityId: tenant.$id, host: tenant.host })
    }).catch((error) => {
      logEvent('error', 'trial.end_failed', {
        communityId: tenant.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return { checked: rows.length, downgraded }
}

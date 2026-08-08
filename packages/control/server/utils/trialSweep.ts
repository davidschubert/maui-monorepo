import { Query } from 'node-appwrite'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import { TRIAL_FALLBACK_PLAN } from '../../shared/onboarding'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Ende der Testphase: die Community wird NUR-LESEND (F49, Davids Entscheidung
 * vom 2026-08-07).
 *
 * Das hebt das O6-Versprechen aus dem Wizard BEWUSST auf. Dort stand „danach
 * läuft deine Community im kostenlosen Tarif weiter, nichts wird gesperrt" —
 * und genau dieser funktionsfähige Gratis-Tarif ist gestrichen: eine eigene
 * Community setzt jetzt faktisch Personal voraus. Umgesetzt wird das nicht mit
 * einem neuen Mechanismus, sondern mit der vorhandenen M13-Sperre
 * `suspension: 'billing'` — Inhalte einfrieren, Owner-Einstellungen und
 * Moderation offen lassen. NIE DESTRUKTIV: nichts wird gelöscht, und ein Abo
 * öffnet die Community im selben Atemzug wieder (der Webhook hebt die Sperre
 * auf, `handleCommunitySubscriptionUpdate`).
 *
 * `plan: 'basic'` wird trotzdem weiter gesetzt: der Plan ist der QUOTA-Anker
 * (Kontingente, Produkt-Sichtbarkeit) und darf nicht auf 'pro' stehen bleiben,
 * nur weil die Community nebenbei zugesperrt ist.
 *
 * RÜCKWIRKEND (Davids Entscheidung 2, gleiche Runde): der Bestand mit
 * abgelaufenem Trial steht heute auf plan 'basic' und läuft normal weiter. Er
 * wird von diesem Lauf mitgenommen — siehe den fehlenden plan-Filter unten.
 */

/**
 * PURE (unit-getestet): Ist diese Testphase fällig?
 *
 * Vier Bedingungen, jede aus einem eigenen Grund:
 *  - `status === 'active'` — eine stillgelegte Community ist schon offline.
 *  - `suspension === ''` — eine bestehende Sperre wird NIE überschrieben: eine
 *    `abuse`-Sperre dürfte dieser Lauf nicht stillschweigend auf „nur-lesend"
 *    herunterstufen, und eine bestehende `billing`-Sperre ist bereits erledigt
 *    (das ist zugleich die Idempotenz des Laufs).
 *  - der `billingStatus` der COMMUNITY ist weder 'active' noch 'past_due' — wer
 *    bezahlt hat, wird nie gesperrt, nur weil sein Trial-Datum in der
 *    Vergangenheit liegt. `past_due` gehört dem pastDueSweep: Dunning ist die
 *    Grace-Periode, und die Sperre dort trägt den richtigen Grund.
 *  - `trialEndsAt` ist lesbar UND abgelaufen. Ein unlesbares oder leeres Datum
 *    sperrt NICHT (fail-open) — lieber eine Sperre zu spät als eine Community
 *    zu Unrecht zugemacht.
 *
 * DEN PLAN-FILTER GIBT ES BEWUSST NICHT MEHR. Bis F49 stieg die Funktion bei
 * `plan !== TRIAL_PLAN` aus, weil der Lauf nur das Herabstufen 'pro' → 'basic'
 * zu erledigen hatte. Genau dieser Ausstieg hätte die Rückwirkung verhindert:
 * der Bestand mit abgelaufenem Trial steht längst auf 'basic' und wäre für
 * immer durchgerutscht. Das Abo-Veto oben ist das, was zahlende Kunden schützt —
 * nicht der Plan.
 */
export function shouldEndTrial(
  tenant: Pick<TenantRow, 'trialEndsAt' | 'status'> & Partial<Pick<TenantRow, 'billingStatus' | 'suspension'>>,
  now: number,
): boolean {
  if (tenant.status !== 'active') return false
  if ((tenant.suspension ?? '') !== '') return false
  if (tenant.billingStatus === 'active' || tenant.billingStatus === 'past_due') return false
  if (!tenant.trialEndsAt) return false
  const end = Date.parse(tenant.trialEndsAt)
  if (!Number.isFinite(end) || end > now) return false
  return true
}

export interface TrialSweepResult {
  checked: number
  suspended: string[]
}

/** Der Text, den der Owner im Hinweis liest. Kein Vorwurf, keine Frist — hier
 *  steht nur, was passiert ist und was es wieder aufmacht. Deutsch, weil
 *  dieselbe Spalte auch die von Hand getippten Gründe trägt und eine halb
 *  übersetzte Spalte schlimmer wäre als eine einsprachige (gleiche Begründung
 *  wie bei PAST_DUE_SUSPENSION_REASON in pastDueSweep.ts). */
export const TRIAL_ENDED_SUSPENSION_REASON
  = 'Die Testphase ist beendet. Mit einem Abo (Personal oder Pro) öffnet sich '
    + 'die Community sofort wieder — Inhalte und Einstellungen bleiben erhalten.'

export async function runTrialSweep(now: number = Date.now()): Promise<TrialSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  // Range-Query über die echte Datetime-Spalte (control-016 legt idx_trial an) —
  // kein Full-Scan über alle Tenants. OHNE plan-Filter (siehe shouldEndTrial):
  // der Bestand steht auf 'basic' und soll mitgenommen werden.
  //
  // ERST LESEN, DANN SCHREIBEN, und VOLLSTÄNDIG statt `Query.limit(100)` —
  // dieselbe Begründung wie in pastDueSweep.ts: der Lauf ÄNDERT die Spalte, nach
  // der die nächste Runde filtert (`suspension`), und eine stille Kappung bei
  // 100 hieße, dass Community 101 aufwärts nie geprüft wird. `listAllRows`
  // (core) läuft per Cursor bis zur Teilseite und WIRFT bei 50.000 Zeilen,
  // statt unvollständig zurückzukehren.
  const rows = await listAllRows<TenantRow>(admin.tablesDB, databaseId, COMMUNITIES_TABLE, [
    Query.lessThanEqual('trialEndsAt', new Date(now).toISOString()),
  ])

  const suspended: string[] = []
  for (const tenant of rows) {
    if (!shouldEndTrial(tenant, now)) continue

    await admin.tablesDB.updateRow<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE, rowId: tenant.$id,
      data: {
        // Der Plan bleibt der Quota-Anker, auch wenn gerade niemand schreiben darf.
        plan: TRIAL_FALLBACK_PLAN,
        suspension: 'billing',
        suspensionReason: TRIAL_ENDED_SUSPENSION_REASON,
        suspendedAt: new Date(now).toISOString(),
      },
    }).then(() => {
      suspended.push(tenant.host)
      logEvent('info', 'trial.ended', { communityId: tenant.$id, host: tenant.host })
    }).catch((error) => {
      logEvent('error', 'trial.end_failed', {
        communityId: tenant.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return { checked: rows.length, suspended }
}

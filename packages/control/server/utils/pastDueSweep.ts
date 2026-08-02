import { Query } from 'node-appwrite'
import { PAST_DUE_GRACE_DAYS, shouldLiftBillingSuspension, shouldSuspendForPastDue } from '../../shared/communityBilling'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Zahlungsverzug → Sperre (M13, Davids Entscheidung vom 2026-08-02, Auslöser 2).
 *
 * WARUM EIN SWEEP UND NICHT DER WEBHOOK: der Webhook muss bei transienten
 * Fehlern WERFEN, damit Stripe erneut zustellt (Regel aus dem Cross-Sub-Fix) —
 * und ein erneut zugestelltes Event darf keine zweite Sperre auslösen. Er
 * stempelt deshalb nur `pastDueSince`; hier fällt die Entscheidung, und zwar
 * genau einmal pro Community (`suspension !== ''` ist die Bedingung, die den
 * zweiten Lauf zum No-Op macht).
 *
 * ZWEI RICHTUNGEN, EIN LAUF:
 *  - sperren, wenn die Frist abgelaufen ist,
 *  - eine BILLING-Sperre wieder aufheben, wenn kein Verzug mehr besteht. Das ist
 *    das NETZ unter dem Webhook (der hebt sie beim `active`-Event sofort auf) —
 *    für den Fall, dass ein Webhook einmal nicht ankommt. Ohne diese Hälfte
 *    hinge eine bezahlte Community an einem verlorenen HTTP-Request.
 *
 * NIE DESTRUKTIV: gesperrt heißt nur-lesend. Inhalte, Mitglieder, Plan und
 * Zugänge bleiben unangetastet (F3-Grundsatz), und Entsperren stellt exakt den
 * vorherigen Zustand wieder her.
 */

export interface PastDueSweepResult {
  checked: number
  suspended: string[]
  lifted: string[]
}

/** Der Text, den der Owner im Hinweis liest. Bewusst KEIN Vorwurf und kein
 *  Betrag — die Zahlen stehen bei Stripe, hier steht der nächste Schritt.
 *  Deutsch, weil dieselbe Spalte auch die von Hand getippten Gründe trägt und
 *  eine halb übersetzte Spalte schlimmer wäre als eine einsprachige. */
export const PAST_DUE_SUSPENSION_REASON
  = `Offene Zahlung seit mehr als ${PAST_DUE_GRACE_DAYS} Tagen. `
    + 'Sobald die Zahlung ankommt, wird die Community automatisch wieder freigeschaltet.'

export async function runPastDueSweep(now: number = Date.now()): Promise<PastDueSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  // Zwei Abfragen statt eines Full-Scans über alle Communities — beide über
  // eigene Indizes (`idx_billing_status`, `idx_suspension`, control-034). Ohne
  // Index antwortet Appwrite mit „index not found", und der Sweep wäre still
  // wirkungslos.
  const [overdue, suspended] = await Promise.all([
    admin.tablesDB.listRows<TenantRow>({
      databaseId,
      tableId: COMMUNITIES_TABLE,
      queries: [Query.equal('billingStatus', 'past_due'), Query.limit(100)],
    }),
    admin.tablesDB.listRows<TenantRow>({
      databaseId,
      tableId: COMMUNITIES_TABLE,
      queries: [Query.equal('suspension', 'billing'), Query.limit(100)],
    }),
  ])

  const result: PastDueSweepResult = { checked: overdue.rows.length + suspended.rows.length, suspended: [], lifted: [] }

  for (const community of overdue.rows) {
    if (!shouldSuspendForPastDue({
      status: community.status,
      billingStatus: community.billingStatus ?? '',
      suspension: community.suspension ?? '',
      pastDueSince: community.pastDueSince,
    }, now)) continue

    await admin.tablesDB.updateRow<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE, rowId: community.$id,
      data: {
        suspension: 'billing',
        suspensionReason: PAST_DUE_SUSPENSION_REASON,
        suspendedAt: new Date(now).toISOString(),
      },
    }).then(() => {
      result.suspended.push(community.host)
      logEvent('warn', 'community.suspended', { communityId: community.$id, host: community.host, kind: 'billing', trigger: 'past_due_sweep' })
    }).catch((error) => {
      logEvent('error', 'community.suspend_failed', {
        communityId: community.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  for (const community of suspended.rows) {
    if (!shouldLiftBillingSuspension({
      billingStatus: community.billingStatus ?? '',
      suspension: community.suspension ?? '',
    })) continue

    await admin.tablesDB.updateRow<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE, rowId: community.$id,
      data: { suspension: '', suspensionReason: '', suspendedAt: null, pastDueSince: null },
    }).then(() => {
      result.lifted.push(community.host)
      logEvent('info', 'community.unsuspended', { communityId: community.$id, host: community.host, trigger: 'past_due_sweep' })
    }).catch((error) => {
      logEvent('error', 'community.unsuspend_failed', {
        communityId: community.$id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return result
}

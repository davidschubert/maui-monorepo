import { Query } from 'node-appwrite'
import type { TablesDB } from 'node-appwrite'
import { listAllRows } from '../../../core/server/utils/listAllRows'
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

/**
 * Die beiden Arbeitsvorräte des Laufs — VOLLSTÄNDIG, nicht die erste Seite.
 *
 * Hier stand `Query.limit(100)`, und das war die gefährlichere Hälfte einer
 * stillen Kappung (Audit-Befund): Community 101 aufwärts wurde nie geprüft.
 * Nach oben fehlte damit nur eine verspätete Sperre — nach UNTEN aber blieb
 * jemand gesperrt, der längst bezahlt hat, und niemand hätte es gemerkt. Genau
 * diese Hälfte ist das Netz unter dem Webhook; ein Netz mit einem Loch bei 100
 * ist keins.
 *
 * `listAllRows` (core) ist der hauseigene Cursor-Sammler: er läuft bis eine
 * Teilseite kommt und WIRFT bei 50.000 Zeilen, statt unvollständig
 * zurückzukehren. Ein Warn-Log wäre hier die falsche Antwort gewesen — es
 * ändert nichts daran, dass der Lauf jemanden übersieht.
 *
 * ERST LESEN, DANN SCHREIBEN, und das ist kein Zufall: der Lauf ÄNDERT genau
 * die Spalten, nach denen er filtert. Würde er seitenweise lesen und dabei
 * schreiben, verließe eine bearbeitete Zeile die Ergebnismenge und verschöbe
 * alles Nachfolgende — bei Offset-Pagination überspränge er dabei Zeilen. Beide
 * Vorräte stehen deshalb vollständig fest, bevor die erste Zeile angefasst wird.
 *
 * Beide Abfragen laufen über eigene Indizes (`idx_billing_status`,
 * `idx_suspension`, control-034). Ohne Index antwortet Appwrite mit „index not
 * found", und der Sweep wäre still wirkungslos.
 */
export async function collectPastDueWork(
  tablesDB: TablesDB,
  databaseId: string,
): Promise<{ overdue: TenantRow[], suspended: TenantRow[] }> {
  const [overdue, suspended] = await Promise.all([
    listAllRows<TenantRow>(tablesDB, databaseId, COMMUNITIES_TABLE, [Query.equal('billingStatus', 'past_due')]),
    listAllRows<TenantRow>(tablesDB, databaseId, COMMUNITIES_TABLE, [Query.equal('suspension', 'billing')]),
  ])
  return { overdue, suspended }
}

export async function runPastDueSweep(now: number = Date.now()): Promise<PastDueSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  const { overdue, suspended } = await collectPastDueWork(admin.tablesDB, databaseId)

  const result: PastDueSweepResult = { checked: overdue.length + suspended.length, suspended: [], lifted: [] }

  for (const community of overdue) {
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

  for (const community of suspended) {
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

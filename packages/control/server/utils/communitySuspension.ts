import type { H3Event } from 'h3'
import { resolveCommunitySuspension, type CommunitySuspension } from '../../../core/shared/communitySuspension'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Sperren und Entsperren einer Community (M13) — der EINE Schreibvorgang.
 *
 * Es gibt genau diese Stelle, an der sich `communities.suspension` von Hand
 * ändert: die Betreiber-Route ruft sie, die Missbrauchs-Warteschlange ruft sie
 * („Meldung berechtigt → sperren" ist ein Klick, kein zweiter Weg), und beide
 * bekommen dadurch dasselbe Protokoll. Der automatische Weg (Zahlungsverzug)
 * läuft bewusst NICHT hier durch — der Sweep hat keinen Betreiber, den er
 * protokollieren könnte, und schreibt seinen eigenen `logEvent`.
 *
 * PROTOKOLL: `recordAudit` (admin-Layer, Tabelle `audit_logs`) — dasselbe
 * Protokoll, in dem schon Nutzer-Sperren, Themes und Produkt-Schalter stehen.
 * Kein neues Log erfinden: eine zweite Historie wäre eine zweite Stelle, an der
 * man nachsieht, und die erste, die man vergisst. `apps/control` bindet den
 * admin- UND den system-Layer ein (`extends`), die Tabelle existiert dort also.
 * `recordAudit` ist best-effort und wirft nie — die Sperre selbst darf nicht an
 * einem Protokolleintrag scheitern.
 *
 * NICHT DESTRUKTIV (F3-Grundsatz): Inhalte, Mitglieder, Plan, Abo und Zugänge
 * bleiben unangetastet. Entsperren räumt Grund und Zeitpunkt weg und stellt
 * damit exakt den vorherigen Zustand wieder her.
 */

export interface SetCommunitySuspensionInput {
  communityId: string
  suspension: CommunitySuspension
  /** Der Text, den DER OWNER liest. Beim Entsperren leer. */
  reason: string
}

export interface CommunitySuspensionResult {
  id: string
  host: string
  suspension: CommunitySuspension
  suspensionReason: string
  suspendedAt: string | null
}

export async function setCommunitySuspension(
  event: H3Event,
  input: SetCommunitySuspensionInput,
): Promise<CommunitySuspensionResult> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const before = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: input.communityId,
  }).catch((error) => { throw toH3Error(error, 'Community not found') })

  const now = new Date().toISOString()
  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: input.communityId,
    data: input.suspension === ''
      ? {
          suspension: '',
          suspensionReason: '',
          suspendedAt: null,
          // Von Hand entsperren räumt AUCH die Verzugs-Uhr ab. Sonst sperrte der
          // Sweep dieselbe Community eine Stunde später wieder zu, weil die
          // Frist längst abgelaufen ist — eine Betreiber-Entscheidung, die sich
          // von selbst zurücknimmt, wäre schlimmer als keine.
          pastDueSince: null,
        }
      : {
          suspension: input.suspension,
          suspensionReason: input.reason,
          suspendedAt: now,
        },
  }).catch((error) => { throw toH3Error(error, 'Could not update suspension') })

  // Der Grund wandert MIT ins Protokoll: die Row trägt immer nur den Grund der
  // AKTUELLEN Sperre, das Protokoll die Geschichte.
  await recordAudit(event, {
    action: input.suspension === '' ? 'community.unsuspended' : 'community.suspended',
    targetType: 'community',
    targetId: row.$id,
    targetName: row.host,
    metadata: {
      kind: input.suspension || 'none',
      previous: resolveCommunitySuspension(before.suspension) || 'none',
      ...(input.reason ? { reason: input.reason.slice(0, 300) } : {}),
    },
  })

  logEvent(input.suspension === '' ? 'info' : 'warn',
    input.suspension === '' ? 'community.unsuspended' : 'community.suspended',
    { communityId: row.$id, host: row.host, kind: input.suspension || 'none', trigger: 'operator' })

  return {
    id: row.$id,
    host: row.host,
    suspension: resolveCommunitySuspension(row.suspension),
    suspensionReason: row.suspensionReason ?? '',
    suspendedAt: row.suspendedAt ?? null,
  }
}

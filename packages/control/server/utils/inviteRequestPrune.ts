import { Query } from 'node-appwrite'
import { INVITE_REQUESTS_TABLE, type InviteRequestRow } from '../../shared/types/inviteRequest'

/**
 * Aufräumen erledigter Anfragen (studio-017).
 *
 * Eine Anfrage ist eine E-Mail-Adresse von jemandem, der etwas wollte — also
 * ein personenbezogenes Datum ohne Vertrag. Es darf nicht liegen bleiben, „bis
 * jemand aufräumt": abgelehnte Anfragen verschwinden nach 30 Tagen, eingelöste
 * nach 90 (so lange ist der Trichter noch auswertbar, danach reicht die
 * Community selbst als Beleg).
 *
 * NICHT gelöscht wird, was noch offen ist (`new`, `assigned`, `deferred`) —
 * dort wartet jemand auf eine Antwort.
 */
export const PRUNE_AFTER_DAYS = { declined: 30, redeemed: 90 } as const

/** PURE (unit-getestet): Ist diese Zeile fällig? */
export function shouldPruneRequest(
  row: Pick<InviteRequestRow, 'status' | 'redeemedAt'> & { $updatedAt?: string },
  now: number,
): boolean {
  const status = row.status || 'new'
  if (status !== 'declined' && status !== 'redeemed') return false
  const days = PRUNE_AFTER_DAYS[status]
  // Bezugspunkt ist die letzte Änderung — bei „eingelöst" also der Moment, in
  // dem die Community entstand.
  const stamp = row.redeemedAt || row.$updatedAt
  if (!stamp) return false
  const parsed = Date.parse(stamp)
  if (!Number.isFinite(parsed)) return false
  return now - parsed >= days * 24 * 60 * 60 * 1000
}

export interface PruneResult {
  checked: number
  deleted: number
}

export async function pruneInviteRequests(now: number = Date.now()): Promise<PruneResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  const { rows } = await admin.tablesDB.listRows<InviteRequestRow>({
    databaseId,
    tableId: INVITE_REQUESTS_TABLE,
    queries: [Query.equal('status', ['declined', 'redeemed']), Query.limit(100)],
  })

  let deleted = 0
  for (const row of rows) {
    if (!shouldPruneRequest(row, now)) continue
    await admin.tablesDB.deleteRow({ databaseId, tableId: INVITE_REQUESTS_TABLE, rowId: row.$id })
      .then(() => { deleted += 1 })
      .catch(error => logEvent('warn', 'invite.prune_failed', {
        requestId: row.$id, message: error instanceof Error ? error.message : String(error),
      }))
  }

  return { checked: rows.length, deleted }
}

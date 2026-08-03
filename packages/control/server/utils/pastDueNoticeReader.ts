import { Client, Query, TablesDB } from 'node-appwrite'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import { communityNeedsPastDueNotice, type PastDueCommunityNotice } from '../../shared/pastDueNotice'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'

/**
 * LESER der überfälligen Communities — dieselbe Bauart wie
 * `createTenantsTableResolver` und `createCommunityMembersResolver`:
 * Cross-Projekt-Read mit dem read-only-Key (Scope `rows.read`), Verbindungsdaten
 * EXPLIZIT bei der Registrierung statt aus `useRuntimeConfig`.
 *
 * WARUM EXPLIZIT UND OHNE `H3Event`: der einzige Aufrufer ist ein
 * Intervall-Plugin der Platform-App — es gibt keinen Request, aus dem sich
 * etwas ableiten ließe. Genau wie beim Host-Resolver (D5).
 *
 * WARUM DIESER LAYER: `communities` und `community_members` gehören dem Control
 * Plane (A14). Die Platform-App darf sie LESEN, aber nicht wissen, wie sie
 * gebaut sind — sie bekommt fertige `PastDueCommunityNotice`-Zeilen.
 *
 * BEWUSST KEIN CACHE, im Unterschied zu den Nachbarn: die laufen pro Request und
 * müssen einen Ansturm dämpfen. Dieser Leser läuft einmal pro Stunde; ein Cache
 * wäre hier nur eine Stelle, an der eine frisch bezahlte Rechnung noch alt
 * aussieht.
 */

export interface PastDueNoticeReaderOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
}

/** Viele Zeilen raus, ein Argument rein: das Runtime-Projekt, dessen Nutzer
 *  die Meldung lesen sollen (der Pool dieser App). */
export type PastDueNoticeReader = (runtimeProjectId: string) => Promise<PastDueCommunityNotice[]>

export function createPastDueNoticeReader(options: PastDueNoticeReaderOptions): PastDueNoticeReader {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )

  return async (runtimeProjectId: string): Promise<PastDueCommunityNotice[]> => {
    if (!runtimeProjectId) return []

    // VOLLSTÄNDIG, nicht die erste Seite — dieselbe Begründung wie in
    // collectPastDueWork: eine Community, die der Lauf übersieht, bekommt nie
    // eine Warnung und wird trotzdem nach 14 Tagen nur-lesend. Der Index
    // `idx_billing_status` (control-034) trägt die Abfrage; die übrigen
    // Bedingungen sind zu wenige Zeilen, um sie der Datenbank zu erklären.
    const communities = await listAllRows<TenantRow>(
      tablesDB, options.databaseId, COMMUNITIES_TABLE, [Query.equal('billingStatus', 'past_due')],
    )
    const due = communities.filter(row => communityNeedsPastDueNotice(row, runtimeProjectId))
    if (due.length === 0) return []

    // EINE Abfrage für alle Owner statt einer je Community (N+1 über
    // Projektgrenzen — dieselbe Falle wie beim Ehemaligen-Resolver, N9).
    // `Query.equal` nimmt maximal 100 Werte.
    const owners = new Map<string, string[]>()
    for (let i = 0; i < due.length; i += 100) {
      const chunk = due.slice(i, i + 100)
      const rows = await listAllRows<CommunityMemberRow>(
        tablesDB, options.databaseId, COMMUNITY_MEMBERS_TABLE, [
          Query.equal('communityId', chunk.map(row => row.$id)),
          Query.equal('runtimeProjectId', runtimeProjectId),
          Query.equal('role', 'owner'),
          Query.equal('status', 'active'),
        ],
      )
      for (const row of rows) {
        const list = owners.get(row.communityId) ?? []
        list.push(row.runtimeUserId)
        owners.set(row.communityId, list)
      }
    }

    return due.map(row => ({
      communityId: row.$id,
      tenantId: row.tenantId,
      host: row.host,
      name: row.name ?? '',
      plan: row.plan || '',
      pastDueSince: row.pastDueSince!,
      ownerUserIds: owners.get(row.$id) ?? [],
    }))
  }
}

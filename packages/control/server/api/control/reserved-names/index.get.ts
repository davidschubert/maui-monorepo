import { Query } from 'node-appwrite'
import { RESERVED_SUBDOMAINS } from '../../../../schemas/tenant'
import { RESERVED_NAMES_TABLE, type ReservedNameRow } from '../../../utils/reservedNames'

/**
 * Betreiber: alles, was gesperrt ist (sites.manage).
 *
 * BEIDE Quellen in einer Antwort, getrennt nach Herkunft — sonst könnte die
 * Oberfläche nicht zeigen, was löschbar ist. `system` kommt aus dem Code
 * (unveränderlich, unlöschbar), `custom` aus der Tabelle (control-027).
 *
 * Die Liste ist kurz und bleibt es: sie ist eine Sperrliste, kein Datensatz.
 * 500 ist deshalb eine Obergrenze mit viel Luft und kein Paginierungs-Ersatz.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<ReservedNameRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RESERVED_NAMES_TABLE,
    // Die Row-Id IST der Name — nach ihr sortieren heißt alphabetisch sortieren.
    queries: [Query.orderAsc('$id'), Query.limit(500)],
  }).catch((error) => { throw toH3Error(error, 'Could not list reserved names') })

  return {
    system: [...RESERVED_SUBDOMAINS].sort(),
    custom: rows.map(row => ({
      name: row.$id,
      note: row.note ?? '',
      createdAt: row.$createdAt,
    })),
  }
})

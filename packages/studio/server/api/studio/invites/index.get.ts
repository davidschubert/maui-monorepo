import { Query } from 'node-appwrite'
import { INVITE_CODES_TABLE, inviteCodeState, summarizeStock, type InviteCodeRow } from '../../../../shared/types/inviteCode'
import { TENANTS_TABLE } from '../../../../shared/types/tenantRecord'

/**
 * Betreiber: ausgestellte Einladungs-Codes (sites.manage).
 *
 * Der Hash wird bewusst NICHT mitgeliefert. Er ist zwar nicht umkehrbar, aber
 * er ist auch für nichts im UI nötig — und was nicht raus muss, geht nicht raus.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  // Die Statistik muss über ALLE Zeilen gehen, nicht über die erste Seite —
  // sonst meldet sie „12 frei", während 50 im Vorrat liegen. 1000 ist die
  // Appwrite-Obergrenze pro Abruf; darüber wird die Kappung ausgewiesen
  // (STOCK_SCAN), statt sie stillschweigend als Wahrheit zu verkaufen.
  const STOCK_SCAN = 1000
  const { rows, total } = await admin.tablesDB.listRows<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(STOCK_SCAN)],
  })

  // Der Trichter in Zahlen: aus dem Vorrat werden Zuweisungen, daraus
  // Communities. Die Community-Zahl kommt aus dem Register und ist damit die
  // einzige, die nicht geschätzt ist.
  const communities = await admin.tablesDB.listRows({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    queries: [Query.limit(1)],
  }).then(res => res.total).catch(() => 0)

  const now = Date.now()

  // Freie Plätze trägt die Statistik; in der Liste wären sie 50-mal dasselbe
  // Nichts. Gezeigt wird, was einen Vorgang hat.
  const listed = rows.filter(row => inviteCodeState(row, now) !== 'free').slice(0, 100)

  return {
    total,
    stock: summarizeStock(rows, now),
    /** true = mehr Codes als ein Abruf fasst; die Zahlen sind dann eine
     *  Untergrenze, keine Wahrheit. */
    truncated: total > STOCK_SCAN,
    communities,
    codes: listed.map(row => ({
      id: row.$id,
      label: row.label,
      maxUses: row.maxUses,
      uses: row.uses,
      expiresAt: row.expiresAt,
      status: row.status || 'active',
      createdAt: row.$createdAt,
      // Was der Betreiber wirklich wissen will — an wen ging er, ist er
      // angekommen? Der Klartext existiert nicht mehr und taucht hier nie auf.
      state: inviteCodeState(row, now),
      boundEmail: row.boundEmail ?? '',
      redeemedAt: row.redeemedAt ?? null,
    })),
  }
})

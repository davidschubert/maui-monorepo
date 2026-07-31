import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../shared/types/entitlement'

/**
 * Lizenz-Mechanik der Studio-Seite, GEPARKT — der schreibende Teil.
 *
 * Der Rechnungs-Behälter dieser Mechanik war der Workspace, und der ist mit
 * A6 Schritt 5 weg. Die Mechanik selbst bleibt bewusst stehen (Davids
 * A6-Entscheidung 3): sie beantwortet „welche Produkte darf DIESE
 * INSTALLATION betreiben?" und ist der einzige Hebel, einem Studio-Kunden mit
 * eigener Installation Produkte freizugeben oder zu entziehen. Sie ist NICHT
 * Teil der Abrechnung (das ist seit A6 der Community-Geldpfad,
 * shared/communityBilling.ts + server/utils/communityBilling.ts).
 *
 * Heute hat sie genau EINEN Aufrufer: die manuelle Pflege im Betreiber-
 * Dashboard (`control/websites/[id]/entitlements.put.ts`). Der automatische
 * Plan-Sync (applyWorkspacePlan) ist mit dem Workspace gefallen — die puren
 * Bausteine dafür (closeOverRequires/planToGrants) liegen weiter in
 * shared/entitlementPlan.ts, falls der erste Studio-Kunde kommt.
 */

/**
 * Grant-Set einer Site deklarativ ERSETZEN (fehlende Rows anlegen, nicht
 * mehr gewollte löschen). Idempotent.
 */
export async function replaceSiteGrants(event: H3Event, siteProjectId: string, products: readonly string[]): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // ALLE Grants der Site paginieren (No-silent-caps): das deklarative ERSETZEN
  // muss das vollständige Ist-Set sehen, sonst blieben >100 Rows unberührt.
  const existing: EntitlementRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<EntitlementRow>({
      databaseId, tableId: ENTITLEMENTS_TABLE,
      queries: [Query.equal('siteProjectId', siteProjectId), Query.limit(100), Query.offset(offset)],
    })
    existing.push(...page.rows)
    if (page.rows.length < 100) break
  }

  const wanted = new Set(products)
  const have = new Set(existing.map(row => row.productKey))

  const operations: Promise<unknown>[] = []
  for (const product of wanted) {
    if (!have.has(product)) {
      operations.push(admin.tablesDB.createRow<EntitlementRow>({
        databaseId, tableId: ENTITLEMENTS_TABLE, rowId: ID.unique(),
        data: { siteProjectId, productKey: product, status: 'active', notes: '' },
      }))
    }
  }
  for (const row of existing) {
    if (!wanted.has(row.productKey)) {
      operations.push(admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: row.$id }))
    }
  }
  await Promise.all(operations)
}

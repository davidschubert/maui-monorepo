/**
 * Spike S5 — Pool+Silo Mandanten-Kern (Wegwerf, KEIN Produkt-Code).
 *
 * Modelliert die drei tragenden Nähte aus
 * docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md OHNE echtes Appwrite, damit die
 * Isolations-Garantie — inklusive Defense-in-Depth — auf Fakten steht, bevor
 * Produktions-Umbau beginnt.
 *
 *  Naht 1  resolveTenant()          Host → TenantContext (pool | silo | null)
 *  Naht 3  scopeQuery()/scopeRow()  Pool erzwingt tenantId, Silo = No-Op
 *  Naht 4  FakeTablesDB             Row-Permissions als ZWEITE Verteidigungslinie
 *
 * Kernaussage, die der Test beweist: selbst wenn ein Feature-Autor scopeQuery
 * VERGISST (Naht 3), leakt die Permission-Ebene (Naht 4) keine Fremdmandanten-
 * Zeilen. Genau das rechtfertigt Row-Permissions statt „shared-DB nackt".
 */

// --- Naht 1: Tenant-Auflösung (Host -> TenantContext) -----------------------
// register: { [host]: { mode:'pool', projectId, tenantId } | { mode:'silo', projectId } }
export function resolveTenant(host, register) {
  const rec = register[host]
  if (!rec) return null // KEINE Default-Site (wie S0): unbekannter Host → nichts
  if (rec.mode === 'silo') return Object.freeze({ mode: 'silo', projectId: rec.projectId })
  if (rec.mode === 'pool') {
    if (!rec.tenantId) throw new Error(`Pool-Host ${host} ohne tenantId`)
    return Object.freeze({ mode: 'pool', projectId: rec.projectId, tenantId: rec.tenantId })
  }
  throw new Error(`Unbekannter Tenant-Modus für ${host}: ${rec.mode}`)
}

// --- Naht 3: Tenant-Scope-Helper --------------------------------------------
// Query-Modell = Liste von {field,value}-equal-Filtern (Miniatur von Appwrite Query).
export function scopeQuery(ctx, queries = []) {
  if (!ctx) throw new Error('scopeQuery ohne Tenant-Context')
  if (ctx.mode === 'pool') return [...queries, { field: 'tenantId', value: ctx.tenantId }]
  return [...queries] // silo: Isolation liegt am Projekt, kein Scope nötig
}
export function scopeRow(ctx, data) {
  if (!ctx) throw new Error('scopeRow ohne Tenant-Context')
  if (ctx.mode === 'pool') return { ...data, tenantId: ctx.tenantId }
  return { ...data }
}

// --- Naht 4: Fake-TablesDB mit Row-Permissions ------------------------------
// Jede Zeile trägt _read: string[] (erlaubte Rollen/Labels). Ein Session-Client
// bringt eigene Labels mit; listRows liefert NUR Zeilen, deren _read die Client-
// Labels schneidet UND die den equal-Filtern genügen.
export class FakeTablesDB {
  constructor() { this.rows = [] }

  createRow(data, readLabels) {
    if (!Array.isArray(readLabels) || readLabels.length === 0) {
      throw new Error('Zeile ohne read-Permission wäre unsichtbar — Bug im Aufrufer')
    }
    const row = { $id: 'r' + (this.rows.length + 1), ...data, _read: readLabels }
    this.rows.push(row)
    return row
  }

  // clientLabels = Rollen des Session-Clients, z.B. ['tenant:acme'] (pool) oder ['any'] (silo)
  listRows(queries, clientLabels) {
    return this.rows.filter((row) => {
      const permitted = row._read.some((l) => clientLabels.includes(l))
      if (!permitted) return false
      return queries.every((q) => row[q.field] === q.value)
    })
  }
}

// Die Labels, die ein Client im jeweiligen Modus trägt (Naht 4).
export function clientLabels(ctx) {
  if (!ctx) return []
  if (ctx.mode === 'pool') return [`tenant:${ctx.tenantId}`]
  return ['any'] // silo: innerhalb des eigenen Projekts frei
}

// Die read-Labels, die eine NEU geschriebene Zeile bekommt (Naht 4, beim Create).
export function rowReadLabels(ctx) {
  if (ctx.mode === 'pool') return [`tenant:${ctx.tenantId}`]
  return ['any']
}

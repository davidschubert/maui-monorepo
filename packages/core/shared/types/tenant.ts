/**
 * Horizont-3 (Pool+Silo) — Mandanten-Kontext pro Request.
 * Siehe docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md (Naht 1).
 *
 * RUHEND: Heute setzt NICHTS `event.context.tenant` — ohne Kontext läuft alles
 * wie bisher (Single-Tenant pro Deployment). Der Typ + die Helfer stehen als
 * getestetes Fundament bereit; die Verdrahtung in die Client-Factories +
 * Auflösungs-Middleware kommt als eigener, bewusster Schritt.
 */
export type TenantContext =
  /** Eigenes Appwrite-Projekt (Isolation am Projekt) — Spezial-/Enterprise-Kunde. */
  | { mode: 'silo', projectId: string }
  /**
   * Geteiltes Projekt, Zeilen-Scope über tenantId — Standard-SaaS-Kunde.
   * `plan` (free/pro/business, Default free) staffelt die Quota — core bleibt
   * plan-name-agnostisch (nur ein String-Key in den quota.plans-Katalog).
   * `limits` (optional): vom Resolver bereits AUFGELÖSTE Quota-Limits je
   * kind (z. B. aus dem editierbaren tenant_plans-Katalog des Control Plane)
   * — hat Vorrang vor dem statischen app.config-Katalog (Fallback-Kette in
   * assertPoolWriteQuota).
   */
  | { mode: 'pool', projectId: string, tenantId: string, plan?: string, limits?: Record<string, { perDay?: number, total?: number }> }

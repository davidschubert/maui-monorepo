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
  /** Geteiltes Projekt, Zeilen-Scope über tenantId — Standard-SaaS-Kunde. */
  | { mode: 'pool', projectId: string, tenantId: string }

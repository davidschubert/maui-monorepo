import { Query } from 'node-appwrite'
import type { AdminStats } from '../../../shared/types/admin'

/**
 * Übersichts-Zahlen: Users-API total + Kennzahlen der registrierten
 * DashboardStatsContributors (comments/moderation via Nitro-Plugin, CONCEPT
 * A14) — admin kennt keine Feature-Tabellen mehr; fehlende Layer liefern
 * schlicht keine Kennzahl (0-Default).
 *
 * NUTZERZAHL IM POOL (Audit-Befund B2, 2026-07-27): `users.list()` zählt alle
 * Konten des geteilten Appwrite-PROJEKTS — im Pool ist das die Summe aller
 * Communities, nicht „Nutzer dieser Site". Mandantengenau wäre nur ein Count
 * über `site_members` im Control Plane; das ist ein neuer Cross-Projekt-Vertrag
 * (heute gibt es dort nur den Einzel-Lookup des SiteRoleResolvers) und für eine
 * Übersichtszahl nicht angemessen. Deshalb: im Pool KEINE Zahl (`null`) statt
 * einer fremden — die Karte entfällt im Dashboard. Silo/Einzelbetrieb bleibt
 * unverändert, dort IST das Projekt die Site.
 */
export default defineEventHandler(async (event): Promise<AdminStats> => {
  requirePermission(event, 'dashboard.access')

  const poolTenant = useTenant(event)?.mode === 'pool'
  const admin = createAdminClient(event)

  const [users, stats] = await Promise.all([
    poolTenant ? Promise.resolve(null) : admin.users.list({ queries: [Query.limit(1)] }),
    collectDashboardStats(event),
  ])

  return {
    usersTotal: users?.total ?? null,
    commentsTotal: stats.commentsTotal ?? 0,
    commentsReported: stats.commentsReported ?? 0,
  }
})

import { Query } from 'node-appwrite'
import type { AdminStats } from '../../../shared/types/admin'
import { decideSiteAccess } from '../../../../core/shared/siteAccess'

/**
 * Übersichts-Zahlen: Users-API total + Kennzahlen der registrierten
 * DashboardStatsContributors (comments/moderation via Nitro-Plugin, CONCEPT
 * A14) — admin kennt keine Feature-Tabellen mehr; fehlende Layer liefern
 * schlicht keine Kennzahl (0-Default).
 *
 * AUTORISIERUNG (C1): `await requireSitePermission(event, 'dashboard.access')`.
 * Vorher stand hier das label-only `requirePermission` — ein Kunden-Owner hat
 * kein globales Label, bekam 403 und sah eine Übersicht aus lauter Nullen.
 *
 * WARUM `dashboard.access` und nicht enger: das sind die Zahlen DER
 * Dashboard-Startseite, und laut Rollen-Matrix (tenantAuthz.ts) tragen ALLE
 * fünf Site-Rollen `dashboard.access` — sie landen also alle auf dieser Seite.
 * Eine engere Capability (z. B. `comments.moderate`) würde die leeren Kacheln
 * für Editor UND Viewer exakt reproduzieren, also den Befund nur verschieben.
 * Der Gate belegt darum die MITGLIEDSCHAFT in dieser Site; was von den Zahlen
 * jemand sehen darf, entscheidet die Kennzahl selbst (s. u.).
 *
 * NUTZERZAHL IM POOL (Audit-Befund B2, 2026-07-27): `users.list()` zählt alle
 * Konten des geteilten Appwrite-PROJEKTS — im Pool ist das die Summe aller
 * Communities, nicht „Nutzer dieser Site". Mandantengenau wäre nur ein Count
 * über `community_members` im Control Plane; das ist ein neuer Cross-Projekt-Vertrag
 * (heute gibt es dort nur den Einzel-Lookup des SiteRoleResolvers) und für eine
 * Übersichtszahl nicht angemessen. Deshalb: im Pool KEINE Zahl (`null`) statt
 * einer fremden — die Karte entfällt im Dashboard. Silo/Einzelbetrieb bleibt
 * unverändert, dort IST das Projekt die Site.
 *
 * GEMELDETE KOMMENTARE (C1): offene Meldungen sind Moderations-Wissen, kein
 * Gemeingut der Community — ein `viewer` oder `editor` soll nicht ablesen
 * können, wie viel gerade in der Warteschlange liegt. Die Zahl kommt deshalb
 * nur mit `comments.moderate` (Site-Rolle ODER Operator-Label, dieselbe
 * Entscheidung wie am Gate); sonst `null` → die Kachel entfällt, passend dazu,
 * dass die Schnellmoderation auf der Seite ebenfalls verschwindet.
 */
export default defineEventHandler(async (event): Promise<AdminStats> => {
  const { user, role } = await requireSitePermission(event, 'dashboard.access')

  const tenant = useTenant(event)
  const poolTenant = tenant?.mode === 'pool'
  const canModerate = decideSiteAccess({
    capability: 'comments.moderate',
    labels: user.labels ?? [],
    tenantScoped: Boolean(tenant),
    role,
  }).allowed

  const admin = createAdminClient(event)

  const [users, stats] = await Promise.all([
    poolTenant ? Promise.resolve(null) : admin.users.list({ queries: [Query.limit(1)] }),
    collectDashboardStats(event),
  ])

  return {
    usersTotal: users?.total ?? null,
    commentsTotal: stats.commentsTotal ?? 0,
    commentsReported: canModerate ? stats.commentsReported ?? 0 : null,
  }
})

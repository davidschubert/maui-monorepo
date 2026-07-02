import type { H3Event } from 'h3'

/**
 * Dashboard-Stats-Vertrag (analog UserDataContributor/maui.admin.modules):
 * Feature-Layer registrieren ihre Kennzahlen per Nitro-Plugin — die admin-
 * Übersicht sammelt sie ein, ohne Feature-Tabellen hart zu kennen. Apps ohne
 * einen Layer haben dessen Plugin nicht → Kennzahl fehlt einfach (0-Default
 * beim Konsumenten), kein 500 mehr durch fehlende Tables.
 */
export interface DashboardStatsContributor {
  /** stabil + eindeutig, z. B. 'comments', 'moderation' */
  id: string
  /** Kennzahlen (Name → Zahl); MUSS degradieren (catch → {}), nie werfen */
  collect(event: H3Event): Promise<Record<string, number>>
}

const contributors = new Map<string, DashboardStatsContributor>()

export function registerDashboardStatsContributor(contributor: DashboardStatsContributor): void {
  contributors.set(contributor.id, contributor)
}

/** Alle registrierten Kennzahlen einsammeln (parallel, Teilfehler = leer). */
export async function collectDashboardStats(event: H3Event): Promise<Record<string, number>> {
  const results = await Promise.all(
    [...contributors.values()].map(contributor =>
      contributor.collect(event).catch(() => ({} as Record<string, number>)),
    ),
  )
  return Object.assign({}, ...results)
}

/**
 * WAS VERBRAUCHT DIESE COMMUNITY? — der Vertrag hinter dem Reiter „Speicher"
 * (F51 Paket 2, 2026-08-07).
 *
 * Die Frage „wie viele Kommentare/Termine/Bilder hat dieser Mandant?" kann nur
 * beantworten, wer die TABELLEN kennt. Die kennt aber jeder Produkt-Layer nur
 * für sich, und der onboarding-Layer, dem die Seite gehört, kennt keine davon
 * (A14 — er dürfte `COMMENTS_TABLE` gar nicht importieren). Deshalb dasselbe
 * Muster wie bei `registerDashboardStatsContributor` und
 * `registerUserDataContributor`: der Produkt-Layer meldet sich per Nitro-Plugin
 * selbst an, der Konsument zählt.
 *
 * WAS HIER BEWUSST NICHT DRINSTEHT: die ZAHLEN. Ein Kontingent ist eine
 * Tarif-Frage und lebt im Katalog (`pukalani.tenancy.quota.plans` bzw. der
 * editierbare `community_plans`-Katalog des Control Plane) — aufgelöst wird es
 * an EINER Stelle, `tenantLimitsFor()` in tenantQuota.ts. Ein Counter sagt nur,
 * WO gezählt wird.
 *
 * DER `kind` MUSS DERSELBE SEIN wie im `assertPoolWriteQuota`-Aufruf des
 * Layers — sonst zeigt die Seite einen Posten, den die Bremse nicht kennt (oder
 * umgekehrt). Beides steht deshalb im selben Layer, wenige Zeilen auseinander.
 *
 * Eine App ohne den Layer hat dessen Plugin nicht → der Posten fehlt einfach.
 * Das ist der fail-soft-Fall und kein Fehler: apps/photos hat keine Kommentare.
 */
export interface CommunityUsageCounter {
  /**
   * Quota-Posten — derselbe Schlüssel wie in
   * `assertPoolWriteQuota(event, { kind })` und im Katalog `quota.plans`.
   */
  kind: string
  /** Tabelle, deren Zeilen für diesen Posten gezählt werden. */
  tableId: string
}

const counters = new Map<string, CommunityUsageCounter>()

export function registerCommunityUsageCounter(counter: CommunityUsageCounter): void {
  counters.set(counter.kind, counter)
}

/** Alle angemeldeten Posten, stabil nach `kind` sortiert. */
export function listCommunityUsageCounters(): CommunityUsageCounter[] {
  return [...counters.values()].sort((a, b) => a.kind.localeCompare(b.kind))
}

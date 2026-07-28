/**
 * Kennzahlen des comments-Layers für die Dashboard-Übersicht (Stats-Vertrag,
 * CONCEPT A14) — Gesamtzahl + distinkte gemeldete Kommentare (offene Meldungen,
 * über den moderation-Vertrag openReportsByTarget; der targetType 'comment'
 * ist Konsumenten-Wissen und gehört deshalb HIERHER, nicht in den target-
 * agnostischen moderation-Layer). Degradiert still auf {}.
 *
 * MANDANTENDICHT (Audit-Befund B2, 2026-07-27): die Zählung lief bis hierher
 * ungescopt über den Admin-Client und zeigte im Dashboard EINES Kunden die
 * Kommentare ALLER Pool-Mandanten. Sie geht deshalb durch die Datentür —
 * `as: 'operator'` behält den Admin-Client (die Kennzahl soll auch
 * ausgeblendete Kommentare mitzählen, die Row-Permissions dürfen sie also
 * nicht filtern), die Tür hängt den tenantId-Filter an. Im Silo/Einzelbetrieb
 * ist das ein No-Op — Verhalten unverändert.
 */
export default defineNitroPlugin(() => {
  registerDashboardStatsContributor({
    id: 'comments',
    async collect(event) {
      const stats: Record<string, number> = {
        commentsTotal: await tenantDb(event, { as: 'operator' }).count('comments'),
      }
      try {
        const reported = await openReportsByTarget(event, 'comment')
        stats.commentsReported = reported.order.length
      }
      catch { /* moderation-Layer/reports-Tabelle nicht komponiert → Kennzahl entfällt */ }
      return stats
    },
  })
})

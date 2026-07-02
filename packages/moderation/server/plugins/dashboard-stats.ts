/**
 * Kennzahl des moderation-Layers für die Dashboard-Übersicht (Stats-Vertrag,
 * CONCEPT A14) — distinkte gemeldete Kommentare (offene Meldungen), konsistent
 * mit dem Header der Moderations-Queue. Degradiert still auf {}.
 */
export default defineNitroPlugin(() => {
  registerDashboardStatsContributor({
    id: 'moderation',
    async collect(event) {
      const reported = await openReportsByTarget(event, 'comment')
      return { commentsReported: reported.order.length }
    },
  })
})

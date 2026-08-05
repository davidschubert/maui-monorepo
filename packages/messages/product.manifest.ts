import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'messages',
  tier: 'optional',
  /**
   * ZWEI ECHTE ABHÄNGIGKEITEN, keine Höflichkeit (Konzept § 4):
   *  - `moderation` trägt den Melde-Weg (`registerReportTarget`,
   *    `registerReportEscalationHandler`, die `reports`-Tabelle). Ein
   *    Nachrichtenkanal ohne Meldeweg ist laut Konzept gar nicht erst
   *    auslieferbar.
   *  - `posts` besitzt `member_counters` und damit die Vertrauensstufe
   *    (posts-013/016). Ohne posts gibt es keine Stufe, ohne Stufe kein TL1,
   *    ohne TL1 keinen Absender — das Produkt wäre ein Menüpunkt ohne Wirkung.
   */
  requires: ['moderation', 'posts'],
  hasMigrations: true,
  apiPrefixes: ['/api/messages'],
  title: { en: 'Private messages', de: 'Private Nachrichten' },
  description: {
    en: 'Direct 1:1 messages between two members of the same community — with reporting, blocking, trust-level gate and an owner switch.',
    de: 'Direkte 1:1-Nachrichten zwischen zwei Mitgliedern derselben Community — mit Meldeweg, Sperre, Vertrauensstufen-Schwelle und Owner-Schalter.',
  },
  icon: 'i-ph-envelope-simple',
} satisfies ProductManifest

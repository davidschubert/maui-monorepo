import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * `hasMigrations: false` seit E10 — und das ist die kürzeste Zusammenfassung
 * dessen, was sich geändert hat: der Layer BESITZT keine Appwrite-Tables mehr.
 * Die Zeilen des zentralen Kunden-Feedbacks leben im Control Plane
 * (Migration control-032), dieser Layer hält Widget, Oberfläche und die
 * Proxy-Routen dorthin. Gleiche Bauart wie der onboarding-Layer.
 *
 * Die frühere Silo-Tabelle `feedback` (Migrationen feedback-001/002) bleibt in
 * den Projekten stehen, in denen sie angelegt wurde — Davids Entscheidung 6:
 * nicht migrieren, nicht löschen. Gesichert wird ihr Bestand vorher mit
 * scripts/backup-feedback.mjs.
 */
export default {
  key: 'feedback',
  tier: 'optional',
  hasMigrations: false,
  apiPrefixes: ['/api/feedback'],
  title: { en: 'Customer Feedback', de: 'Kunden-Feedback' },
  description: {
    en: 'Central feedback across all communities: submit, vote, discuss, roadmap.',
    de: 'Zentrales Feedback aus allen Communities: senden, wählen, mitreden, Roadmap.',
  },
  icon: 'i-ph-megaphone',
} satisfies ProductManifest

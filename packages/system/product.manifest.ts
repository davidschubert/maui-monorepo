import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'system',
  tier: 'foundation',
  hasMigrations: true,
  title: { en: 'System', de: 'System' },
  // Der Katalog-Text nannte bis zum 2026-08-02 `changelog` (gehört dem
  // admin-Layer) und verschwieg `app_secrets` + `community_branding`. Diese
  // Zeilen sind betreiber-sichtbar (scripts/control-jobs.mjs liest die
  // Manifeste) — sie müssen die Besitzverhältnisse richtig wiedergeben.
  description: {
    en: 'Infrastructure tables: app config, audit log, notifications, activities, secrets, community branding and custom themes/fonts storage.',
    de: 'Infra-Tabellen: App-Config, Audit-Log, Benachrichtigungen, Aktivitäten, Secrets, Community-Branding sowie Custom-Themes/-Fonts-Speicher.',
  },
  icon: 'i-ph-gear',
} satisfies ProductManifest

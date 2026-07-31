import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'system',
  tier: 'foundation',
  hasMigrations: true,
  title: { en: 'System', de: 'System' },
  description: {
    en: 'Infrastructure tables: app config, audit log, notifications, activities, changelog and custom themes/fonts storage.',
    de: 'Infra-Tabellen: App-Config, Audit-Log, Benachrichtigungen, Activities, Changelog sowie Custom-Themes/-Fonts-Speicher.',
  },
  icon: 'i-ph-gear',
} satisfies FeatureManifest

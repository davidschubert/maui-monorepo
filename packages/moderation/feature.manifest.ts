import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'moderation',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/reports'],
  title: { en: 'Moderation', de: 'Moderation' },
  description: {
    en: 'Reports, escalation handling and moderator workflows. Activated automatically by content features like comments and posts.',
    de: 'Meldungen, Eskalations-Handling und Moderations-Workflows. Wird von Content-Features wie Kommentaren und Posts automatisch mitaktiviert.',
  },
  icon: 'i-ph-shield-check',
} satisfies FeatureManifest

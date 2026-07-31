import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'moderation',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/reports'],
  title: { en: 'Moderation', de: 'Moderation' },
  description: {
    en: 'Reports, escalation handling and moderator workflows. Activated automatically by content products like comments and posts.',
    de: 'Meldungen, Eskalations-Handling und Moderations-Workflows. Wird von Content-Produkte wie Kommentaren und Posts automatisch mitaktiviert.',
  },
  icon: 'i-ph-shield-check',
} satisfies ProductManifest

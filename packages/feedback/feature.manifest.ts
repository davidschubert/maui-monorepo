import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'feedback',
  tier: 'optional',
  hasMigrations: true,
  title: { en: 'Feedback', de: 'Feedback' },
  description: {
    en: 'Collect user feedback with status workflow and admin triage.',
    de: 'Nutzer-Feedback einsammeln, mit Status-Workflow und Admin-Triage.',
  },
  icon: 'i-ph-megaphone',
} satisfies FeatureManifest

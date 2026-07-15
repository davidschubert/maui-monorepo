import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'posts',
  tier: 'optional',
  requires: ['moderation'],
  hasMigrations: true,
  title: { en: 'Posts', de: 'Beiträge' },
  description: {
    en: 'User-generated posts with markdown, moderation assist and activity feed integration.',
    de: 'Nutzer-Beiträge mit Markdown, Moderations-Assist und Anbindung an den Activity-Feed.',
  },
  icon: 'i-ph-note-pencil',
} satisfies FeatureManifest

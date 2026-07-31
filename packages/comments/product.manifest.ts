import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'comments',
  tier: 'optional',
  requires: ['moderation'],
  hasMigrations: true,
  apiPrefixes: ['/api/comments'],
  title: { en: 'Comments', de: 'Kommentare' },
  description: {
    en: 'Threaded comments with realtime updates, votes, mentions, markdown, guest reading and an embeddable widget.',
    de: 'Verschachtelte Kommentare mit Realtime, Votes, @-Mentions, Markdown, Gast-Lesezugriff und Embed-Widget.',
  },
  icon: 'i-ph-chat-circle',
} satisfies FeatureManifest

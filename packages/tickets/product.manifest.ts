import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'tickets',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/tickets'],
  title: { en: 'Support Tickets', de: 'Support-Tickets' },
  description: {
    en: 'Support ticket board with assignment, notifications and optional AI triage.',
    de: 'Support-Ticket-Board mit Zuweisung, Benachrichtigungen und optionaler KI-Triage.',
  },
  icon: 'i-ph-lifebuoy',
} satisfies FeatureManifest

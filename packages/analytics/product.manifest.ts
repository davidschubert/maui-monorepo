import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'analytics',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/analytics'],
  title: { en: 'Analytics', de: 'Analytics' },
  description: {
    en: 'Cookieless visitor statistics with Plausible: paste the script id of your site on our instance, the pages report themselves.',
    de: 'Cookielose Besucherstatistik mit Plausible: Script-Id der eigenen Site auf unserer Instanz eintragen, die Seiten melden sich selbst.',
  },
  icon: 'i-ph-chart-line-up',
} satisfies ProductManifest

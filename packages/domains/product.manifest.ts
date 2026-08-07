import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'domains',
  tier: 'optional',
  hasMigrations: false,
  apiPrefixes: ['/api/site/domain'],
  title: { en: 'Own domain', de: 'Eigene Domain' },
  description: {
    en: 'Serve this site under its own domain: enter it, the system proves ownership over DNS, orders the certificate and switches over. The Pukalani address stays as a fallback.',
    de: 'Diese Site unter einer eigenen Domain betreiben: eintragen, das System weist den Besitz über DNS nach, bestellt das Zertifikat und schaltet um. Die Pukalani-Adresse bleibt als Rückfall.',
  },
  icon: 'i-ph-globe-hemisphere-west',
} satisfies ProductManifest

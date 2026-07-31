import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'pages',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/pages'],
  title: { en: 'Pages', de: 'Seiten' },
  description: {
    en: 'Editable content pages (Imprint, Terms, Privacy) with a WYSIWYG editor and per-language versions.',
    de: 'Editierbare Inhaltsseiten (Impressum, AGB, Datenschutz) mit WYSIWYG-Editor und Sprachversionen.',
  },
  icon: 'i-ph-file-text',
} satisfies FeatureManifest

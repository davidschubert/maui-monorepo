import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'media',
  tier: 'optional',
  hasMigrations: true,
  apiPrefixes: ['/api/media'],
  title: { en: 'Media Gallery', de: 'Medien-Galerie' },
  description: {
    en: 'Managed image gallery: upload, captions, ordering and publish state — the content source for photo and portfolio pages.',
    de: 'Verwaltete Bild-Galerie: Upload, Bildunterschriften, Sortierung und Publish-Status — die Inhalts-Quelle für Foto- und Portfolio-Seiten.',
  },
  icon: 'i-ph-images',
} satisfies FeatureManifest

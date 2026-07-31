import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'courses',
  tier: 'optional',
  // KEIN requires auf billing: der Layer kennt billing bewusst nicht —
  // die App registriert den Access-Guard (courseAccess-Vertrag).
  hasMigrations: true,
  apiPrefixes: ['/api/courses', '/api/lessons'],
  title: { en: 'Courses', de: 'Kurse' },
  description: {
    en: 'Courses with lessons and progress tracking; paid access plugs in via the app-level access guard.',
    de: 'Kurse mit Lektionen und Fortschritt; Bezahl-Zugang dockt über den App-seitigen Access-Guard an.',
  },
  icon: 'i-ph-graduation-cap',
} satisfies FeatureManifest

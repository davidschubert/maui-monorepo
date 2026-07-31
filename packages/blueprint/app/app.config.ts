/**
 * blueprint registriert die Produkt-Kompositions-Einträge in der
 * Chrome-Registry (pukalani.chrome.nav, Objekt-Map — s. core/shared/types/
 * chrome.ts): der Feed-Link gehört zur Feed+Kommentare-Komposition und
 * existiert damit überall, wo blueprint extended ist (Pool UND Silo) —
 * vorher stand er nur im platform-Layout (Audit S9).
 */
export default defineAppConfig({
  pukalani: {
    chrome: {
      nav: {
        // Label/Text gehört dem posts-Layer (blueprint hat keine Locales);
        // planProduct: im Pool erst ab Personal sichtbar (P4) + Demo-Badge.
        feed: { labelKey: 'posts.feed.title', to: '/feed', icon: 'i-ph-users-three', order: 10, featureKey: 'posts', planProduct: 'posts' },
      },
    },
  },
})

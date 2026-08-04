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
        feed: { labelKey: 'posts.feed.title', to: '/feed', icon: 'i-ph-users-three', order: 10, productKey: 'posts', planProduct: 'posts' },
        // F1: Discussions sitzt auf demselben Produkt wie der Feed (`posts`) —
        // es ist die nach Kategorien gegliederte Sicht auf denselben Bestand,
        // kein eigenes Produkt. Deshalb hier dieselben Gates; wer den Feed
        // sieht, sieht auch die Diskussionen.
        discussions: { labelKey: 'posts.discussions.title', to: '/discussions', icon: 'i-ph-chats-circle', order: 11, productKey: 'posts', planProduct: 'posts' },
      },
    },
  },
})

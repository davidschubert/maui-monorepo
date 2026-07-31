export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  // feedback (E10): der Feedback-Knopf gehört laut Plan auf JEDE Community-
  // und Website-Seite, und der Feedback-Bereich ist Bestandteil ALLER
  // Dashboards. Der Layer besitzt hier keine Tabellen — er ruft das Control
  // Plane über die Service-Naht (Davids Entscheidung 1).
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/blueprint', '../../packages/comments', '../../packages/posts', '../../packages/events', '../../packages/feedback', '../../packages/courses', '../../packages/moderation', '../../packages/pages', '../../packages/onboarding', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 comments, 3002+ weitere)
  devServer: {
    port: 3006,
  },

  vite: {
    server: {
      /**
       * NUR DEV. Diese App wird PRO HOSTNAME anders bedient, und die vom
       * Onboarding erzeugten Communities heißen `<slug>.pukalani.app` — auch
       * lokal, weil der Server den Host baut. Vite lässt von Haus aus nur
       * `localhost` und `*.localhost` durch (Schutz vor DNS-Rebinding) und
       * antwortet sonst mit 403 „Blocked request"; ohne diesen Eintrag ist eine
       * frisch angelegte Community lokal nicht testbar, und der Fehler sieht
       * wie ein Mandanten-Bug aus. Produktion ist nicht betroffen (Nitro-Build
       * ohne Vite).
       */
      allowedHosts: ['.localhost', '.pukalani.app'],
    },
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

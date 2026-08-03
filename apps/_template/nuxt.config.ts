export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json + aus
  // site.manifest.ts streichen); core + system bilden das Fundament und
  // bleiben immer.
  //
  // `blueprint` steht VOR den Produkt-Layern und muss dort bleiben: seine
  // Kompositionen (Feed+Kommentare, Event+Kommentare, Lektion+Kommentare)
  // überlagern die nackten Produktseiten nur, solange er höhere Priorität hat.
  // Begründung, warum er überhaupt in der Vorlage steht: site.manifest.ts.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/blueprint', '../../packages/comments', '../../packages/posts', '../../packages/events', '../../packages/courses', '../../packages/moderation', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 comments, 3002+ weitere)
  devServer: {
    port: 3002,
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

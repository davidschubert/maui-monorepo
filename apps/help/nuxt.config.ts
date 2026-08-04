export default defineNuxtConfig({
  // Öffentliche Hilfe-Site für Community-Betreiber (Ziel-Host
  // help.pukalani.app — Annahme, siehe site.manifest.ts; heute Dev-only).
  // Bewusst NUR das Fundament (core + system) — kein admin/themes/comments:
  // die Seite ist öffentlich, liest nichts aus Appwrite und rendert
  // ausschließlich Markdown aus `content/`. Das Fundament liefert trotzdem
  // Fehlerseite (CoreErrorPage), Security-Header, Rate-Limits und i18n.
  extends: ['../../packages/core', '../../packages/system'],

  // @nuxt/ui, @pinia/nuxt und @nuxtjs/i18n kommen aus dem Core-Layer.
  modules: ['@nuxt/content'],

  // Port pro App eindeutig (3001 comments · 3002 template · 3003 photos ·
  // 3004 control · 3005 portfolio · 3006 platform · 3007 marketing).
  // 3005 war in der Tagesliste genannt, ist aber von portfolio belegt.
  devServer: {
    port: 3008,
  },

  /**
   * KEINE routeRules mehr für `/anleitung/produkte/diskussionen`.
   *
   * Die Seite über den Kommentar-Baustein hieß bis zum 2026-08-04
   * „Diskussionen"; die Umbenennung nach `/anleitung/produkte/kommentare` ließ
   * am selben Tag einen 301 auf dem alten Pfad zurück. Wenige Stunden später
   * bekam das ECHTE Produkt Discussions seine Hilfe-Seite — und die gehört
   * laut Davids Entscheidung genau dorthin.
   *
   * Beides gleichzeitig geht nicht: eine routeRule gewinnt gegen die Seite, der
   * 301 hätte die neue Seite unerreichbar gemacht. Die Wahl fiel auf die Seite,
   * weil der Pfad den ZUTREFFENDEN Inhalt tragen soll — der Umweg war einen
   * halben Tag alt, die interne Verlinkung zeigt längst auf `kommentare`, und
   * wer über einen alten externen Link hereinkommt, findet oben auf der neuen
   * Seite einen Hinweis samt Link auf die Kommentare. Ein 301 auf eine Adresse,
   * unter der seither ein anderes Produkt erklärt wird, wäre die schlechtere
   * Lüge.
   */

  content: {
    build: {
      markdown: {
        toc: { searchDepth: 1 },
      },
    },
    experimental: {
      // node:sqlite (Node 22.5+) — kein nativer better-sqlite3-Build nötig
      sqliteConnector: 'native',
    },
  },

  /**
   * BEWUSSTE, von David freigegebene Abweichung vom Hausmuster
   * 'prefix_except_default' (CLAUDE.md „Coding Rules"): die Hilfe-Inhalte gibt
   * es NUR auf Deutsch (eine Content-Sammlung, keine Sprachvarianten). Mit dem
   * Prefix-Modus läge derselbe deutsche Text unter `/anleitung` UND
   * `/de/anleitung` — doppelter Inhalt, geteilter Suchindex, und der
   * Browser-Sprach-Redirect (redirectOn: 'all') schöbe Leser zwischen beiden
   * hin und her. `no_prefix` hält Route und Content-Pfad deckungsgleich
   * (`queryCollection().path(route.path)`).
   *
   * PREIS der Abweichung, bewusst akzeptiert: ohne Locale-Prefixe gibt es
   * keine unterscheidbaren URLs je Sprache — `useLocaleSeoHead()` liefert hier
   * also lang/dir + canonical, aber KEINE hreflang-Alternates. Das ist korrekt,
   * solange es die Inhalte nur auf Deutsch gibt. Sobald echte englische
   * Inhalte dazukommen, MUSS diese Site auf 'prefix_except_default'
   * zurückgeführt werden (sonst wäre EN unsichtbar für Suchmaschinen).
   *
   * Die Oberfläche (Kopf/Fuß/Suche) bleibt zweisprachig — die Keys liegen
   * wie üblich in i18n/locales und mergen mit den Core-Locales.
   */
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'de',
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

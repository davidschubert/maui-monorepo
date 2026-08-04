export default defineNuxtConfig({
  // Marketing-Startseite von pukalani.app (Wurzel). Bewusst NUR das Fundament
  // (core + system) — kein admin/themes/comments: die Seite ist öffentlich +
  // statisch, das Licht-Motiv ist eigenständiges CSS, und die Farbwelten-
  // Vorschau liest später die statische Theme-Registry direkt (kein
  // Dashboard-Layer nötig).
  extends: ['../../packages/core', '../../packages/system'],

  // Port pro App eindeutig (3001 comments · 3004 platform · 3005 portfolio · 3007 marketing)
  devServer: {
    port: 3007,
  },

  // puka-theme.css = Theme-Brücke (eigene `puka`-Palette + --ui-primary), MUSS
  // vor marketing.css stehen; marketing.css = Licht-Dramaturgie (§6.3 des
  // Konzepts), gescopet auf body.marketing-site, damit sie nicht in
  // Login/Dashboard-Layouts der Layer blutet.
  css: ['~/assets/css/puka-theme.css', '~/assets/css/marketing.css'],

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  // Die Produkt-Unterseiten lagen bis 2026-07-30 unter /features/* bzw.
  // /de/features/* und waren in dieser Form schon veröffentlicht (Links,
  // Index). Kundensprache ist „Produkte" — das Segment heißt jetzt
  // /products/* (EN) bzw. /de/produkte/* (DE). 301 statt 302, damit
  // Suchmaschinen die Adresse dauerhaft übernehmen.
  //
  // Ebenso die Anwendungsfall-Seiten (Davids Entscheidung 2026-07-30): sie
  // trugen je Sprache ein eigenes Segment (/for/* · /de/fuer/*) und liegen
  // jetzt für beide Sprachen unter /use-cases/* bzw. /de/use-cases/*.
  //
  // ACHTUNG: die QUELL-Muster ('/features', '/de/features', '/for',
  // '/de/fuer') sind HISTORISCHE, veröffentlichte URLs — sie dürfen bei
  // Vokabular-Renames NIEMALS mit umbenannt werden. Eine Weiterleitung
  // beschreibt die VERGANGENHEIT; nur ihr ZIEL folgt dem heutigen Wort.
  // 2026-07-31 live passiert: aus '/features/**' → '/products/**' wurde ein
  // Self-Redirect '/products/**' → '/products/**' — alle EN-Produktseiten
  // waren tot (Weiterleitungsschleife), und '/de/products/**' bewachte eine
  // Quell-URL, die es nie gegeben hat.
  // Dritte Welle (Davids Entscheidung 2026-07-31): auf der ENGLISCHEN Seite
  // ist jetzt auch der SLUG übersetzt (`/products/courses` statt
  // `/products/kurse`). Betroffen sind genau die drei Produkte, deren Wort
  // sich unterscheidet — moderation, branding und events heißen in beiden
  // Sprachen gleich und brauchen nichts. Exakte Pfade genügen: es sind sechs
  // feste Seiten, kein Muster (`/products/**` würde ins Ziel selbst greifen).
  // Die DEUTSCHEN Adressen ändern sich NICHT.
  routeRules: {
    '/features/**': { redirect: { to: '/products/**', statusCode: 301 } },
    '/de/features/**': { redirect: { to: '/de/produkte/**', statusCode: 301 } },
    '/for/**': { redirect: { to: '/use-cases/**', statusCode: 301 } },
    '/de/fuer/**': { redirect: { to: '/de/use-cases/**', statusCode: 301 } },
    // Zwei Sprünge für die ältesten Adressen (`/features/kurse` → `/products/
    // kurse` → `/products/courses`) sind bewusst in Kauf genommen: eine Kette
    // aus zwei 301 wertet Google wie eine, und je Produkt eine zweite
    // Sonderregel zu führen kostet mehr Klarheit als sie einbringt.
    // Kommentar-Baustein: seit 2026-08-04 unter /products/comments — beide
    // Altpfade zeigen DIREKT dorthin (keine 301-Ketten), der DE-Pfad ebenso.
    '/products/diskussionen': { redirect: { to: '/products/comments', statusCode: 301 } },
    '/products/discussions': { redirect: { to: '/products/comments', statusCode: 301 } },
    '/de/produkte/diskussionen': { redirect: { to: '/de/produkte/kommentare', statusCode: 301 } },
    '/products/beitraege': { redirect: { to: '/products/posts', statusCode: 301 } },
    '/products/kurse': { redirect: { to: '/products/courses', statusCode: 301 } },
    // Vierte Welle, dieselbe Entscheidung für die Anwendungsfälle: auf der
    // ENGLISCHEN Seite ist auch dort der Slug übersetzt. Betroffen sind genau
    // die drei, deren Wort sich unterscheidet — `coaches` heißt in beiden
    // Sprachen gleich und braucht KEINE Regel (sie wäre ein Self-Redirect).
    // Die DEUTSCHEN Adressen (/de/use-cases/kurse …) ändern sich NICHT und
    // dürfen deshalb NICHT mit umgeleitet werden: die Muster hier sind exakte
    // Pfade OHNE /de-Präfix und treffen sie nicht. `/for/kurse` springt
    // entsprechend zweimal (→ /use-cases/kurse → /use-cases/course-creators),
    // aus demselben Grund wie oben bei den Produkten.
    '/use-cases/kurse': { redirect: { to: '/use-cases/course-creators', statusCode: 301 } },
    '/use-cases/creator': { redirect: { to: '/use-cases/creators', statusCode: 301 } },
    '/use-cases/vereine': { redirect: { to: '/use-cases/clubs', statusCode: 301 } },
  },

  // Ziel-Links der Marketing-CTAs (useProductLinks). Die Werte sind die
  // PROD-Hosts; lokal/Staging per Env überschreibbar — ohne Skeleton-Key
  // mappt die Env-Var ins Leere (gleiches Muster wie appUrl im Core).
  // Env: NUXT_PUBLIC_MARKETING_START_URL / _SIGN_IN_URL / _DEMO_URL
  runtimeConfig: {
    public: {
      // Kundenbereich (Umbenennung 2026-07-25, vorher app.pukalani.app)
      marketingStartUrl: 'https://my.pukalani.app/register',
      marketingSignInUrl: 'https://my.pukalani.app/login',
      marketingDemoUrl: 'https://demo.pukalani.app',
    },
  },

  // DIE HELL-KLEMME IST WEG (Davids Entscheidung B7, 2026-08-01).
  //
  // Sie bestand aus DREI Teilen, und alle drei mussten fallen: (1) `preference:
  // 'light'`, (2) ein `pages:extend`-Hook, der JEDER Seite `meta.colorMode =
  // 'light'` gab (color-mode 4 → `forced`, schlug im Inline-Skript sogar den
  // gespeicherten localStorage-Wert), und (3) das Fehlen eines `.dark`-Zweiges
  // in app/assets/css/marketing.css. Teil 3 war der eigentliche Grund: ohne ihn
  // mischten sich dunkle Nuxt-UI-Elemente in die festen Licht-Töne der
  // Licht-Dramaturgie. Der Zweig steht jetzt (dort auch die Farbwerte), damit
  // darf die Wahl wieder dem Besucher gehören.
  //
  // `system` = die System-Präferenz entscheidet; der sichtbare Umschalter sitzt
  // in der Fuß-Basiszeile neben dem Sprachwähler (MarketingFooter.vue) — dort,
  // wo diese Seite ihre Einstellungen schon versammelt. `fallback: 'light'`
  // bleibt: signal-lose Abrufe (Crawler, OG-Scraper) bekommen die helle Seite.
  colorMode: {
    preference: 'system',
    fallback: 'light',
  },

  // App-Keys mergen mit den Core-Locales (gleicher code).
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

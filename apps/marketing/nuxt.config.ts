import type { NuxtPage } from '@nuxt/schema'

/**
 * Route-Meta `colorMode` (color-mode 4 → `forced`) auf JEDER Seite. Warum nicht
 * `definePageMeta` je Datei: die nächste neue Seite würde das Loch wieder
 * aufreißen — hier gilt es zentral und ausnahmslos.
 */
function forceLightColorMode(pages: NuxtPage[]): void {
  for (const page of pages) {
    page.meta = { ...page.meta, colorMode: 'light' }
    if (page.children?.length) forceLightColorMode(page.children)
  }
}

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
    '/products/diskussionen': { redirect: { to: '/products/discussions', statusCode: 301 } },
    '/products/beitraege': { redirect: { to: '/products/posts', statusCode: 301 } },
    '/products/kurse': { redirect: { to: '/products/courses', statusCode: 301 } },
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

  // Diese App ist bewusst HELL — die Licht-Dramaturgie (§6.3, Kopf-Kommentar in
  // app/assets/css/marketing.css) nagelt ihre Licht-Töne fest und hat
  // keinen .dark-Zweig. color-mode kommt über Nuxt UI mit und stand auf
  // 'system': OS-Dark-Besucher bekamen dunkle Nuxt-UI-Elemente auf heller
  // Fläche + dunklen <html>-Overscroll. Eine Dark-Variante kann später mit der
  // Nuxt-UI-Migration kommen; bis dahin ist Hell die einzige Wahrheit.
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },

  hooks: {
    // preference/fallback allein reichen NICHT: das Inline-Skript von
    // color-mode liest zuerst den gespeicherten Wert (localStorage
    // 'nuxt-color-mode'), und wer die Seite vorher besucht hat, hat dort
    // 'system' stehen. Die Route-Meta setzt data-color-mode-forced ins
    // SSR-HTML, und GENAU das schlägt im Skript den Storage-Wert — also
    // flash-frei statt „erst dunkel, dann hell".
    'pages:extend': forceLightColorMode,
  },

  // App-Keys mergen mit den Core-Locales (gleicher code).
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

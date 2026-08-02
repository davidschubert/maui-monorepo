// Geteilte Flat Config für das gesamte Monorepo — ESLint findet sie von
// jedem Package aus (Lookup in Eltern-Verzeichnissen).
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Layer-Grenzen-Durchsetzung (CONCEPT.md A14, Stufe 2 / Backstop).
// Verhindert KÜNFTIGE explizite Cross-Layer-Imports. Implizite Kopplung
// (Auto-Import, tableId-Strings) fängt das NICHT — die löst Stufe 1 (Verträge).
// Jeweils Paketname + Subpfade (`/**`) abdecken.
const pkg = name => [`@pukalani/${name}`, `@pukalani/${name}/**`]
const featureLayers = [...pkg('comments'), ...pkg('admin'), ...pkg('themes'), ...pkg('feed'), ...pkg('posts'), ...pkg('events'), ...pkg('feedback'), ...pkg('billing'), ...pkg('courses'), ...pkg('tickets')]
const allPukalaniFeatures = [...featureLayers, ...pkg('moderation')]

export default createConfigForNuxt({
  features: {
    stylistic: false,
  },
}).append({
  ignores: [
    '**/.nuxt/**',
    '**/.output/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/.playground/.nuxt/**',
  ],
}).append({
  // Nuxt benennt diese Dateien per Konvention einwortig (login.vue, auth.vue,
  // error.vue) — die Default-Ausnahmen der Nuxt-Config greifen für
  // Layer-Pfade (packages/*/app/…) nicht
  files: ['**/app/pages/**/*.vue', '**/app/layouts/**/*.vue', '**/app/error.vue'],
  rules: {
    'vue/multi-word-component-names': 'off',
  },
}).append({
  // themes ist rein visuell: keine Appwrite-, keine Feature-/Layer-Imports.
  files: ['packages/themes/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['appwrite', 'node-appwrite', ...allPukalaniFeatures, ...pkg('core')],
          message: 'themes ist rein visuell — keine Appwrite-/Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
  },
}).append({
  // Feature-Layer importieren keine ANDEREN Feature-Layer. Fundament
  // (core, künftig moderation) wird per Auto-Import genutzt, nicht via @pukalani/*.
  files: ['packages/comments/**', 'packages/admin/**', 'packages/feed/**', 'packages/posts/**', 'packages/events/**', 'packages/feedback/**', 'packages/billing/**', 'packages/courses/**', 'packages/tickets/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: featureLayers,
          message: 'Feature-Layer importieren keine anderen Feature-Layer (CONCEPT.md A14). Fundament nur über Auto-Import.' },
      ],
    }],
  },
}).append({
  // Fundament-Layer dürfen NIE von Features abhängen (azyklisch).
  // moderation zählt dazu (CLAUDE.md/A14) — ohne diesen Scope wäre es der
  // einzige Layer ganz ohne Import-Backstop.
  files: ['packages/core/**', 'packages/system/**', 'packages/moderation/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: featureLayers,
          message: 'Fundament-Layer (core/system/moderation) dürfen nicht von Feature-Layern abhängen (CONCEPT.md A14).' },
      ],
    }],
  },
}).append({
  // DATENTÜR-BACKSTOP (CLAUDE.md „Mandanten-Isolation: EINE Datentür"): in
  // server/api/** UND server/plugins/** der gepoolten Layer geht Datenzugriff
  // NUR über tenantDb — rohes `.tablesDB` der Client-Factories umgeht Scoping,
  // tenantId-Stempel und Zugehörigkeitsbeleg. Genau so sind am 2026-07-26/27
  // vier echte Cross-Tenant-Lecks entstanden bzw. gefunden worden (drei
  // Moderations-Routen, mentions, embed-sites). Neue Pool-Layer kommen in
  // diese Liste, sobald ihre Tabellen tenantId tragen.
  //
  // WARUM server/plugins DAZUGEHÖRT (Audit-Befund B2, 2026-07-27): der
  // Dashboard-Stats-Contributor von comments liegt in server/plugins, nicht in
  // server/api — er zählte deshalb ungebremst pool-weit und lieferte die Zahl
  // an eine Kunden-Ansicht. Plugins, die einen H3Event bekommen, bedienen einen
  // REQUEST und gehören damit hinter dieselbe Tür wie eine Route.
  //
  // AUSSERHALB dieser beiden Verzeichnisse bleibt rohes tablesDB erlaubt
  // (Migrationen, Sweeps, GDPR-Contributors in server/utils, Control Plane —
  // die Ausnahmen aus CLAUDE.md), deshalb ist der Scope bewusst eng. Ein
  // eventloser Sweep-Plugin bräuchte künftig eine begründete
  // eslint-disable-next-line — nicht eine Aufweichung der Regel.
  files: [
    'packages/comments/server/api/**',
    'packages/comments/server/plugins/**',
    'packages/posts/server/api/**',
    'packages/posts/server/plugins/**',
    'packages/events/server/api/**',
    'packages/events/server/plugins/**',
    'packages/courses/server/api/**',
    'packages/courses/server/plugins/**',
    'packages/pages/server/api/**',
    'packages/pages/server/plugins/**',
    'packages/moderation/server/api/**',
    'packages/moderation/server/plugins/**',
    'packages/media/server/api/**',
    'packages/media/server/plugins/**',
    'packages/activity/server/api/**',
    'packages/activity/server/plugins/**',
    // admin kam am 2026-08-01 dazu (Audit-Befund): der Layer besitzt zwar keine
    // mandantenfähigen Tabellen, seine Routen LESEN aber fremde (die
    // Nutzer-Detailseite zog `comments` ungescopt pool-weit). Wer in einer
    // host-gebundenen Ansicht fremde Zeilen liest, gehört hinter dieselbe Tür.
    'packages/admin/server/api/**',
  ],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'MemberExpression[property.name="tablesDB"]',
        message: 'Datenzugriff in server/api gepoolter Layer NUR über tenantDb(event) — rohes tablesDB umgeht die Mandanten-Tür (CLAUDE.md).' },
      { selector: 'ObjectPattern > Property[key.name="tablesDB"]',
        message: 'Kein Destructuring von tablesDB aus den Client-Factories — Datenzugriff über tenantDb(event) (CLAUDE.md).' },
    ],
  },
}).append({
  /**
   * DIE BETREIBER-TABELLEN DES ADMIN-LAYERS — EINE Begründung statt zwanzig
   * eslint-disable-Zeilen.
   *
   * `app_config`, `custom_themes`, `custom_fonts`, `changelog` und `audit_log`
   * sind PROJEKT-global, nicht mandantenfähig: sie tragen keine
   * `communityId`-Spalte, und im Pool gilt bewusst EINE Zeile für das ganze
   * Projekt (CLAUDE.md: „`app_config.themeSettings` ist EINE Row pro Projekt").
   * Die Tür hätte hier nichts zu scopen — sie würde nur `list` mit einem Filter
   * auf eine Spalte belegen, die es nicht gibt.
   *
   * Der Ausschluss ist deshalb nach TABELLE begründet und nach ORDNER gezogen,
   * und er ist eng: alles ANDERE unter `packages/admin/server/api/**` trifft die
   * Regel weiterhin. Wer hier eine neue Route mit rohem tablesDB anlegt, muss
   * also erst entscheiden, ob seine Tabelle wirklich in diese Aufzählung
   * gehört — genau die Entscheidung, die bei der Nutzer-Detailseite ausgefallen
   * ist.
   */
  files: [
    'packages/admin/server/api/admin/config.patch.ts',
    'packages/admin/server/api/admin/audit.get.ts',
    'packages/admin/server/api/admin/products/**',
    'packages/admin/server/api/admin/changelog/**',
    'packages/admin/server/api/admin/fonts/**',
    'packages/admin/server/api/admin/themes/**',
  ],
  rules: {
    'no-restricted-syntax': 'off',
  },
}).append({
  /**
   * INDEX-ANLAGE NUR ÜBER DIE FABRIK (F19-Nachlese, 2026-08-02).
   *
   * Der Cache-Anstoß gegen `column_not_available` war zuerst ein OPTIONALES
   * Argument von `indexStep`. Ergebnis nach einem Tag: 2 von 63 Migrationen
   * reichten ihn durch, 61 nicht — und eine davon (posts-004) legte die CI-E2E
   * lahm. Seitdem ruft `createIndexSteps(tablesDB, databaseId)` das
   * `createIndex` selbst; vergessen kann man den Anstoß nicht mehr.
   *
   * Diese Regel schließt den letzten Weg daran vorbei: `tablesDB.createIndex`
   * von Hand. Sie ist der einzige greifende Wächter für Migrationen — die
   * Dateien liegen in KEINER tsconfig (weder `nuxi typecheck` der Apps noch
   * das Playground des Cores nimmt die scripts-Ordner der Layer auf), ein
   * Typfehler würde also nirgends auffallen — `eslint .` jedes Layers sieht sie
   * sehr wohl.
   */
  files: ['packages/*/scripts/migrations/**'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'CallExpression > MemberExpression[property.name="createIndex"]',
        message: 'Indizes in Migrationen NUR über createIndexSteps(tablesDB, databaseId) anlegen — der Cache-Anstoß gegen column_not_available gehört in die Schnittstelle, nicht in die Disziplin (CLAUDE.md, scripts/migrations-lib/indexRetry.mts).' },
    ],
  },
})

// Geteilte Flat Config für das gesamte Monorepo — ESLint findet sie von
// jedem Package aus (Lookup in Eltern-Verzeichnissen).
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Layer-Grenzen-Durchsetzung (CONCEPT.md A14, Stufe 2 / Backstop).
// Verhindert KÜNFTIGE explizite Cross-Layer-Imports. Implizite Kopplung
// (Auto-Import, tableId-Strings) fängt das NICHT — die löst Stufe 1 (Verträge).
// Jeweils Paketname + Subpfade (`/**`) abdecken.
const pkg = name => [`@maui/${name}`, `@maui/${name}/**`]
const featureLayers = [...pkg('comments'), ...pkg('admin'), ...pkg('themes'), ...pkg('feed'), ...pkg('posts'), ...pkg('events'), ...pkg('feedback'), ...pkg('billing'), ...pkg('courses'), ...pkg('tickets')]
const allMauiFeatures = [...featureLayers, ...pkg('moderation')]

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
        { group: ['appwrite', 'node-appwrite', ...allMauiFeatures, ...pkg('core')],
          message: 'themes ist rein visuell — keine Appwrite-/Layer-Imports (CONCEPT.md A14).' },
      ],
    }],
  },
}).append({
  // Feature-Layer importieren keine ANDEREN Feature-Layer. Fundament
  // (core, künftig moderation) wird per Auto-Import genutzt, nicht via @maui/*.
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
})

import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site — Single Source of Truth. Beim Ableiten einer
 * neuen App zuerst HIER die Produkte wählen, dann `extends` (nuxt.config.ts)
 * und die @pukalani/*-Dependencies (package.json) anpassen —
 * `pnpm check:manifests` meldet jede Abweichung. core + system sind
 * implizit immer dabei; comments zieht moderation zwingend mit (requires).
 *
 * Die Reihenfolge HIER ist egal (Menge, keine Rangfolge) — die
 * Prioritäts-Reihenfolge in `extends` diktiert die kanonische
 * EXTENDS_ORDER in scripts/check-manifests.mjs.
 *
 * WARUM `blueprint` IN DER VORLAGE STEHT (Paritäts-Audit 2026-08-02):
 * Produkt-Layer kennen sich bewusst nicht (A14) — die Verdrahtung
 * (Feed+Kommentare, Event+Kommentare, Lektion+Kommentare) liegt EINMAL im
 * Bauplan. Ohne ihn liefert eine abgeleitete App die „nackten" Produktseiten
 * aus (`posts/app/pages/feed.vue` statt `blueprint/app/pages/feed.vue`) und
 * steht damit vom ersten Tag an außerhalb der Zusage „Pool zeigt dasselbe wie
 * Silo". Die Falle war still: die Vorlage mit `comments` allein hatte nichts
 * zu komponieren, und wer als Nächstes `posts` dazunahm, blieb bei GRÜNEM
 * `check:manifests` auf dem nackten Feed sitzen (nachgestellt am 2026-08-02).
 *
 * Der Bauplan zieht seine Kompositionen per `requires` mit (posts, comments,
 * events, courses). Wer die abgeleitete App kleiner will, streicht Produkte
 * UND `blueprint` gemeinsam — `check:manifests` erzwingt genau diese
 * bewusste Entscheidung, statt sie zu verschlucken.
 */
export default {
  siteId: 'template',
  products: [
    'themes',
    'admin',
    'blueprint',
    'comments',
    'posts',
    'events',
    'courses',
    'moderation',
  ],
} satisfies SiteManifest

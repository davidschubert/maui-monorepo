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
 */
export default {
  siteId: 'platform',
  products: [
    'themes',
    'admin',
    // Bauplan: die EINE Produkt-Komposition (Feed+Kommentare, …) — Pool und
    // Silo zeigen damit identisches Produktverhalten (PRODUKT-BILANZ.md)
    'blueprint',
    'comments',
    'posts',
    // Events im Pool (Entscheidung 8, 2026-07-27) — Produkt-Gate: ab Plan pro
    // (pukalani.tenancy.products), Datenzugriff durch die Datentür (events-006)
    'events',
    // Mediathek im Pool (Davids Entscheidung 2026-08-02) — Produkt-Gate: ab
    // Plan personal (pukalani.tenancy.products, bestätigt 2026-08-03),
    // Datenzugriff durch
    // die Datentür (media-004). Bringt Table `media_items` UND Bucket `media`
    // mit: die Migration braucht Storage-Rechte am Migrations-Schlüssel (F36).
    'media',
    // E10: zentrales Kunden-Feedback — Knopf auf jeder Seite, Bereich in
    // jedem Dashboard. Ohne eigene Tabellen (Naht ins Control Plane).
    'feedback',
    // Kurse im Pool (Entscheidung 15, 2026-07-27) — Produkt-Gate: ab Plan pro
    // (pukalani.tenancy.products), Datenzugriff durch die Datentür (courses-002)
    'courses',
    // Activity-Feed im Pool (Davids Entscheidung 2026-08-02) — Produkt-Gate:
    // ab Plan basic (also frei; bestätigt 2026-08-03). Der Layer bringt KEINE eigenen
    // Migrationen mit: die Table `activities` gehört system (A14) und läuft
    // auf jeder Instanz mit. BESTAND ohne communityId bleibt unsichtbar —
    // siehe Kopf von packages/activity/nuxt.config.ts.
    'activity',
    'moderation',
    'pages',
    // Der öffentliche Trichter — läuft nur auf den Kontroll-Hosts dieser App
    // (pukalani.tenancy.controlHosts), nicht auf den Community-Hosts.
    'onboarding',
  ],
} satisfies SiteManifest

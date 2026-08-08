/**
 * admin registriert seine öffentlichen Chrome-Bausteine (pukalani.chrome,
 * Objekt-Map — s. core/shared/types/chrome.ts): den „Was ist neu?"-Button
 * im Header und den Footer-Link auf die /changelog-Seite, die beide diesem
 * Layer gehören. Apps können einzelne Einträge abschalten (platform:
 * whatsNew/changelogLink aus — Operator-Changelog ist kein Tenant-Inhalt).
 *
 * Seit F51 Paket 2 (2026-08-07) meldet er zusätzlich die INSTANZ-Sicht am
 * Community-Hub an — s. der Kommentar an `communityTabs` unten.
 */
export default defineAppConfig({
  pukalani: {
    chrome: {
      utilities: {
        whatsNew: { component: 'WhatsNewButton', order: 20 },
      },
      changelogLink: true,
    },
    admin: {
      /**
       * DIE INSTANZ-SICHT IM COMMUNITY-HUB (F51 Paket 2, 2026-08-07 — Davids
       * Ebenen-Entscheidung, DECISION-LOG „Community-Settings-Hub": Pool-Owner
       * sehen die Community-Sicht, System entfällt im Pool; das SILO zeigt die
       * volle Instanz-Sicht).
       *
       * WARUM DIESER LAYER: dieselbe Regel wie überall in dieser Registry —
       * wer die SEITEN besitzt, registriert den Einstieg. /dashboard/admin/
       * config, /dashboard/admin/products, /dashboard/storage und
       * /dashboard/system gehören alle vier dem admin-Layer.
       *
       * ── DIESE VIER REITER VERLASSEN DIE HÜLLE, UND ZWAR ABSICHTLICH ───────
       * Ihre Ziele liegen NICHT unter /dashboard/community/*, sondern sind
       * eigenständige `UDashboardPanel`-Seiten. Ein Klick führt also aus dem
       * Hub heraus statt in einen Reiter hinein — sichtbar daran, dass die
       * Reiter-Zeile danach verschwindet.
       *
       * Das ist der bewusst gewählte Preis. Die Alternative wäre, die vier
       * Seiten unter die Hülle zu ziehen — aber sie leben auch in apps/control
       * (Betreiber-Konsole) und apps/photos, wo es diesen Hub GAR NICHT gibt
       * (s. `instanceTabs` unten). Ein Umzug hätte dort vier tote Adressen
       * hinterlassen, um hier eine Reiter-Zeile zu retten. Der Hub ist im Silo
       * damit ein VERZEICHNIS der Instanz-Verwaltung, keine Hülle um sie.
       *
       * ── UND DESHALB HÄNGEN SIE AN EINEM SCHALTER ─────────────────────────
       * `configFlag: 'admin.instanceTabs'` (Core-Default AUS, an nur in
       * apps/comments). `scope: 'operator'` allein reicht NICHT: es hält die
       * Reiter zwar von jedem Mandanten-Host fern — genau Davids „System
       * entfällt im Pool" —, lässt sie aber im Kundenbereich
       * my.pukalani.app (`place: 'control'`) und in apps/control/apps/photos
       * (`place: 'single-tenant'`) stehen. Die vollständige Begründung steht
       * am Schalter in packages/core/app/app.config.ts.
       *
       * Die HARTEN bottomLinks „Speicher" und „System" in
       * packages/admin/app/layouts/dashboard.vue bleiben unangetastet: sie sind
       * der einzige Weg dorthin in apps/control, und dort gibt es keinen Hub.
       * Im Silo stehen beide Wege nebeneinander — ein Verzeichnis darf auf
       * etwas zeigen, das auch direkt erreichbar ist.
       */
      communityTabs: [
        {
          /** Produkt-Katalog der INSTANZ — mit Schaltern, anders als der
           *  gleichnamige Pool-Reiter des onboarding-Layers (der nur zeigt,
           *  was der Tarif enthält). Beide tragen `order: 90` und begegnen
           *  sich trotzdem nie: keine App zieht beide Layer mit gesetztem
           *  Schalter, und auf einem Mandanten-Host fällt dieser hier ohnehin
           *  weg (`scope: 'operator'`). */
          id: 'instance-products',
          scope: 'operator',
          labelKey: 'admin.nav.products',
          icon: 'i-ph-puzzle-piece',
          to: '/dashboard/admin/products',
          requiredCapability: 'system.manage',
          configFlag: 'admin.instanceTabs',
          order: 90,
        },
        {
          /** Speicher der INSTANZ (Appwrite-Buckets, `storage.manage`) — nicht
           *  zu verwechseln mit dem Pool-Reiter „Speicher", der den Verbrauch
           *  EINER Community gegen ihren Tarif zeigt. */
          id: 'instance-storage',
          scope: 'operator',
          labelKey: 'admin.nav.storage',
          icon: 'i-ph-folder',
          to: '/dashboard/storage',
          requiredCapability: 'storage.manage',
          configFlag: 'admin.instanceTabs',
          order: 100,
        },
        {
          id: 'instance-config',
          scope: 'operator',
          labelKey: 'admin.nav.config',
          icon: 'i-ph-sliders',
          to: '/dashboard/admin/config',
          requiredCapability: 'system.manage',
          configFlag: 'admin.instanceTabs',
          order: 110,
        },
        {
          id: 'instance-system',
          scope: 'operator',
          labelKey: 'admin.nav.system',
          icon: 'i-ph-cpu',
          to: '/dashboard/system',
          requiredCapability: 'system.manage',
          configFlag: 'admin.instanceTabs',
          order: 120,
        },
      ],
    },
  },
})

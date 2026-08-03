/**
 * comments meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      // Form entspricht PukalaniAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          // E9: die Moderations-Warteschlange gehört in Davids Struktur unter
          // „Settings · Community" — sie regelt, was in DIESER Community
          // stehen bleibt. scope 'community'; im Silo (apps/comments) ist es
          // dieselbe Seite für den Betreiber, dort greift die Ausnahme
          // „ohne Mandanten sichtbar per Operator-Capability".
          id: 'comments',
          scope: 'community',
          productKey: 'comments',
          labelKey: 'admin.nav.comments',
          icon: 'i-ph-chat-circle',
          to: '/dashboard/comments',
          requiredCapability: 'comments.moderate',
          group: 'settings',
          order: 2,
        },
        {
          /**
           * E3 Site-Registry: registrierte Einbetter-Domains des Widgets.
           *
           * F37 (2026-08-02) — ZWEI Korrekturen an einem Eintrag:
           *
           * 1. `community.embed` statt `system.manage`. Der Eintrag stand bei
           *    „Settings · Community", verlangte aber ein INSTANZ-Label. Im
           *    Silo stimmte das (der Betreiber IST der Einbetter); im Pool war
           *    die Fläche für den Kunden-Owner unerreichbar — und mit ihr die
           *    Seite und die drei Routen. Die neue Capability trägt der Owner
           *    (communityAuthz.ts) UND der Operator-Admin (ALL_CAPABILITIES),
           *    der Silo-Weg bleibt also unverändert.
           * 2. `configFlag`. Das Widget ist ein Produkt mit Bau-Schalter
           *    (`pukalani.comments.embed.enabled`, Core-Default aus). Ohne
           *    Bindung stand der Menüpunkt in JEDER App, die den Layer zieht —
           *    und die Seite dahinter antwortet dort 404. Ein Menüpunkt, der
           *    ins Nichts führt, ist schlimmer als keiner.
           */
          id: 'embed-sites',
          scope: 'community',
          productKey: 'comments',
          configFlag: 'comments.embed.enabled',
          labelKey: 'admin.nav.embedSites',
          icon: 'i-ph-plug',
          to: '/dashboard/embed',
          requiredCapability: 'community.embed',
          group: 'settings',
          order: 3,
        },
      ],
    },
    comments: {
      /** targetTypes, deren Kommentare NUR Operatoren (admin/moderator)
       *  schreiben und lesen — z. B. 'ticket' (Board-Diskussionen).
       *  Andere Layer/Apps tragen sich hier ein (Array wird konkateniert). */
      operatorTargets: [] as string[],
      /** Auto-Hide-Threshold: ab so vielen OFFENEN Meldungen wird ein Kommentar
       *  automatisch (zweiphasig + Cascade) ausgeblendet — Meldungen bleiben
       *  offen, der Moderator entscheidet final. 0 = aus (Default). */
      autoHideReports: 0,
      /** iframe-Embed (Disqus-Modell, docs/archiv/EMBED-WIDGET.md): /embed-Seite
       *  + public/embed.js. Default aus — die App aktiviert explizit. */
      embed: {
        enabled: false,
        /** Einbetter-Origins für frame-ancestors (zusätzlich zu 'self').
         *  Leer = nur 'self' (kein Fremd-Framing) · ['*'] = jede Seite darf
         *  einbetten (bewusste Betreiber-Entscheidung, Embed-Plan E7). */
        allowedOrigins: [] as string[],
        /** Gast-Kommentare im Widget (Embed-Plan E4, Task 20): Kommentieren
         *  ohne Account (Name+E-Mail, keine Verifikation). Default aus — die
         *  App aktiviert bewusst; greift nur zusätzlich zu `enabled`. */
        guests: false,
      },
    },
  },
})

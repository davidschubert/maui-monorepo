/**
 * comments meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (maui.admin.modules, deep-merged). Das Admin-Layout rendert sie capability-
 * gefiltert — admin muss diesen Eintrag NICHT hart kennen (Layer-Grenze A14).
 */
export default defineAppConfig({
  maui: {
    admin: {
      // Form entspricht MauiAdminModule (core/shared) — der Typ ist in app.config
      // nicht auto-importiert; das Layout liest die Registry typisiert (core-Default).
      modules: [
        {
          id: 'comments',
          featureKey: 'comments',
          labelKey: 'admin.nav.comments',
          icon: 'i-ph-chat-circle',
          to: '/dashboard/comments',
          requiredCapability: 'comments.moderate',
          group: 'products',
          order: 5,
        },
        {
          // E3 Site-Registry: registrierte Einbetter-Domains des Widgets
          id: 'embed-sites',
          featureKey: 'comments',
          labelKey: 'admin.nav.embedSites',
          icon: 'i-ph-plug',
          to: '/dashboard/embed',
          requiredCapability: 'system.manage',
          group: 'products',
          order: 6,
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
      /** iframe-Embed (Disqus-Modell, docs/plans/EMBED-WIDGET.md): /embed-Seite
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

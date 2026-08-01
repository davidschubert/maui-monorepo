/**
 * posts meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — das Admin-Layout rendert sie
 * capability-gefiltert (Layer-Grenze A14).
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          // E9: Inhalte einer Community (Gruppe „Produkte"). Im Silo dieselbe
          // Seite für den Betreiber — die Ausnahme ohne Mandanten trägt das.
          id: 'posts',
          scope: 'community',
          productKey: 'posts',
          labelKey: 'admin.nav.posts',
          icon: 'i-ph-users-three',
          to: '/dashboard/posts',
          requiredCapability: 'posts.moderate',
          group: 'products',
          order: 1,
        },
        {
          // C16: ZWEI Einträge auf dasselbe Produkt, und das ist kein Versehen.
          // Eine Registrierung trägt genau EINE `requiredCapability` — und die
          // beiden Zielgruppen überschneiden sich nicht: ein Editor hat
          // `posts.write` OHNE `posts.moderate`, ein Moderator umgekehrt
          // (communityAuthz.ts — Editor und Moderator sind Geschwister, kein
          // Chain). Ein einzelner Eintrag müsste sich für eine der beiden
          // entscheiden und ließe die andere Rolle vor einer Wand stehen; genau
          // so war `posts.write` bis hierher eine Capability ohne jede Fläche.
          // Admin und Owner halten beide Capabilities und sehen deshalb beide
          // Einträge — das ist richtig so, es sind zwei verschiedene Aufgaben
          // (fremde Beiträge moderieren vs. eigene verwalten).
          id: 'posts-mine',
          scope: 'community',
          productKey: 'posts',
          labelKey: 'admin.nav.myPosts',
          icon: 'i-ph-article',
          to: '/dashboard/my-posts',
          requiredCapability: 'posts.write',
          group: 'products',
          order: 2,
        },
      ],
    },
  },
})

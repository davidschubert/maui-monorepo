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
          // C2: im Pool erst ab Personal — dieselbe Zuordnung, die
          // `requirePlanProduct` an /api/posts durchsetzt, und dieselbe, die
          // der öffentliche Feed-Eintrag schon trägt (blueprint app.config).
          planProduct: 'posts',
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
          planProduct: 'posts',
          labelKey: 'admin.nav.myPosts',
          icon: 'i-ph-article',
          to: '/dashboard/my-posts',
          requiredCapability: 'posts.write',
          group: 'products',
          order: 2,
        },
        {
          // F1 Stufe 1: die STRUKTUR der Discussions. Dritter Eintrag auf
          // dasselbe Produkt, aus demselben Grund wie der zweite (C16): eine
          // Registrierung trägt genau EINE `requiredCapability`, und
          // `posts.manage` hat weder der Editor noch der Moderator — sie
          // gehört dem Admin (communityAuthz.ts). Ein Eintrag, der sich eine
          // der drei Capabilities aussuchen müsste, ließe zwei Rollen vor
          // einer Wand stehen.
          id: 'posts-categories',
          scope: 'community',
          productKey: 'posts',
          planProduct: 'posts',
          labelKey: 'posts.nav.categories',
          icon: 'i-ph-chats-circle',
          to: '/dashboard/discussions',
          requiredCapability: 'posts.manage',
          group: 'products',
          order: 3,
        },
      ],
    },
  },
})

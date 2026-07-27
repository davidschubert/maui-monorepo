/**
 * admin registriert seine öffentlichen Chrome-Bausteine (maui.chrome,
 * Objekt-Map — s. core/shared/types/chrome.ts): den „Was ist neu?"-Button
 * im Header und den Footer-Link auf die /changelog-Seite, die beide diesem
 * Layer gehören. Apps können einzelne Einträge abschalten (platform:
 * whatsNew/changelogLink aus — Operator-Changelog ist kein Tenant-Inhalt).
 */
export default defineAppConfig({
  maui: {
    chrome: {
      utilities: {
        whatsNew: { component: 'WhatsNewButton', order: 20 },
      },
      changelogLink: true,
    },
  },
})

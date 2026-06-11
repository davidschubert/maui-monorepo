export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // Auth-Gates bleiben aus, bis OAuth-Provider in der Console konfiguriert
  // sind bzw. eine AGB-Seite existiert:
  // maui: { auth: { providers: ['github'], termsUrl: '/agb' } }
  ui: {},
})

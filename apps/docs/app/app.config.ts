export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Hilfe-Site ist
  // öffentlich, kontenlos und datensparsam — keine Analytics, kein Consent.
  maui: {
    brand: { name: 'Pukalani' },
  },
  ui: {},
})

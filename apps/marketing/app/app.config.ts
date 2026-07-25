export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Marketing-Seite
  // ist öffentlich + datensparsam — keine Analytics, kein Consent, kein Auth.
  maui: {},
  ui: {},
})

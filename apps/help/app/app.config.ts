export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Hilfe-Site ist
  // öffentlich, kontenlos und datensparsam — keine Analytics, kein Consent.
  pukalani: {
    // Der Brand-Name ist die EINE Quelle für Seitentitel („… · Pukalani Hilfe",
    // useBrandTitle) UND die Fehlerseite/404 (CoreErrorPage über useBrandName).
    // Deshalb steht hier „Pukalani Hilfe" und nicht bloß „Pukalani": sonst
    // hießen die Seiten anders als die Site, die der Leser gerade offen hat.
    brand: { name: 'Pukalani Hilfe' },
  },
  ui: {},
})

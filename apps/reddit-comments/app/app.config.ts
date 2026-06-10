export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // Analytics/Consent bleiben aus (Core-Default) — Aktivierung wenn gebraucht:
  // maui: { analytics: { enabled: true, provider: 'plausible', domain: '…' }, consent: { enabled: true } }
  ui: {},
})

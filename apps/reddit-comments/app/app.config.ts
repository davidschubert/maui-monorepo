export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core).
  // OAuth-Provider/AGB bleiben aus, bis Console-Config bzw. AGB-Seite existiert:
  // maui: { auth: { providers: ['github'], termsUrl: '/agb' } }
  maui: {
    auth: {
      // Passwortloser Code-Login (Phase 19) — Email-OTP ist instanzseitig aktiv
      otp: true,
    },
    observability: {
      // Strukturierte 5xx-Server-Logs + Client-Error-Inbox (Core-Default: aus)
      enabled: true,
      clientErrors: true,
    },
  },
  ui: {},
})

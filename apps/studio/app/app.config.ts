export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // maui: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  maui: {
    // Betreiber-Login per OTP-Code (H2-Live): der Studio-Admin braucht kein
    // Passwort — Prod-Konto wurde server-seitig ohne Passwort angelegt.
    auth: { otp: true, termsUrl: '/terms' },
    // M8: Stripe-Transport des billing-Layers für WORKSPACE-Billing aktivieren.
    // plans bleibt leer — das Studio verkauft keine Site-Abos an Endnutzer;
    // die Workspace-Pläne leben in maui.studio.plans (lookup_keys).
    billing: { enabled: true },
  },
  ui: {},
})

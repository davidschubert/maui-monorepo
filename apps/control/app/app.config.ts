export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // pukalani: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  pukalani: {
    brand: { name: 'Pukalani Control' },
    // Betreiber-Login per OTP-Code (H2-Live): der Control-Admin braucht kein
    // Passwort — Prod-Konto wurde server-seitig ohne Passwort angelegt.
    auth: { otp: true, termsUrl: '/terms' },
    // M8: Stripe-Transport des billing-Layers für WORKSPACE-Billing aktivieren.
    // plans bleibt leer — das Control verkauft keine Site-Abos an Endnutzer;
    // die Workspace-Pläne leben in pukalani.studio.plans (lookup_keys).
    billing: { enabled: true },
    // Interne Projekt-Doku (/docs) in der Betreiber-Nav. Kein featureKey —
    // die Doku gehört keinem Feature-Layer, sie ist Teil DIESER App; die
    // Autorität bleibt server/middleware/docs-guard.ts.
    admin: {
      modules: [
        {
          id: 'internal-docs',
          labelKey: 'control.docs.nav',
          icon: 'i-ph-book-open-text',
          to: '/docs',
          requiredCapability: 'dashboard.access',
          group: 'management',
          order: 9,
        },
      ],
    },
    // C17: DIESE App ist der Leser der kontobezogenen Meldungen. Beide
    // `scope: 'account'`-Absender leben hier (Stripe-Webhook im billing-Layer,
    // Early-Access-Anfragen im control-Layer) und schreiben in DIESES
    // Appwrite-Projekt — die Empfänger sind Konten dieses Projekts (Workspace-
    // Owner unter /workspace, Betreiber unter /dashboard). Ohne blueprint gibt
    // es hier kein Community-Chrome, das die Glocke registriert; der Schalter
    // hängt sie in beide Shells (core-default-Layout + Dashboard).
    chrome: { accountBell: true },
    // Footer-Rechtslinks → die editierbaren pages-Seiten (Layer pages).
    legalLinks: [
      { to: '/imprint', labelKey: 'legal.imprint' },
      { to: '/terms', labelKey: 'legal.terms' },
      { to: '/privacy', labelKey: 'legal.privacy' },
    ],
  },
  ui: {},
})

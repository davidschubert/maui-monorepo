/**
 * Config-Gate pukalani.billing (B7): Layer-Defaults — TOT, bis die App enabled
 * setzt und Pläne deklariert. Admin-Modul via Registry (A14-Vertrag).
 */
export default defineAppConfig({
  pukalani: {
    // Chrome-Registry (S9): öffentlicher Pricing-Link — bewusst hohe Order,
    // Preise stehen am Ende der Nav (nach Produkten und CMS-Seiten).
    chrome: {
      nav: {
        pricing: { labelKey: 'billing.pricing.title', to: '/pricing', icon: 'i-ph-tag', order: 90 },
      },
    },
    billing: {
      enabled: false,
      currency: 'eur',
      // §6-Entscheidung (2026-07-08): kein Trial in v1
      trialDays: 0,
      plans: [],
    },
    admin: {
      modules: [
        {
          id: 'billing',
          featureKey: 'billing',
          labelKey: 'admin.nav.billing',
          icon: 'i-ph-credit-card',
          to: '/dashboard/billing',
          requiredCapability: 'billing.manage',
          // Konto-naher Bereich: sitzt im Account-Menü über den Einstellungen
          placement: 'userMenu',
        },
      ],
    },
  },
})

/**
 * Config-Gate maui.billing (B7): Layer-Defaults — TOT, bis die App enabled
 * setzt und Pläne deklariert. Admin-Modul via Registry (A14-Vertrag).
 */
export default defineAppConfig({
  maui: {
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
          labelKey: 'admin.nav.billing',
          icon: 'i-ph-credit-card',
          to: '/dashboard/billing',
          requiredCapability: 'billing.manage',
        },
      ],
    },
  },
})

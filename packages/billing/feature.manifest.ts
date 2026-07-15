import type { FeatureManifest } from '../core/shared/types/manifest'

export default {
  key: 'billing',
  tier: 'foundation',
  hasMigrations: true,
  title: { en: 'Billing', de: 'Billing' },
  description: {
    en: 'Stripe subscriptions: hosted checkout and portal, signed webhooks and entitlements for paid features.',
    de: 'Stripe-Abos: Hosted Checkout und Portal, signierte Webhooks und Entitlements für kostenpflichtige Inhalte.',
  },
  icon: 'i-ph-credit-card',
} satisfies FeatureManifest

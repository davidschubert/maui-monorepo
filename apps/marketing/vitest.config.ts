import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Das test-Script läuft als `nuxi prepare && vitest run`: Vites oxc-Transform
// lädt die tsconfig.json der App, und die referenziert .nuxt/tsconfig.*.json —
// ohne prepare (frischer Checkout, CI) stirbt sonst jeder Transform an
// „Tsconfig not found".
export default defineConfig({
  resolve: {
    alias: {
      // Nuxt löst #shared selbst auf; Vitest braucht dieselbe Abbildung von
      // Hand, weil server/utils/marketingRoutes.ts darüber importiert.
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})

export default defineAppConfig({
  // Override-Test Phase 2: App > Core. Nur primary wird überschrieben,
  // alle anderen Tokens (neutral: slate etc.) kommen weiter aus dem Core.
  ui: {
    colors: {
      primary: 'orange',
    },
  },
})

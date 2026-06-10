export default defineNuxtConfig({
  // früher gelistet = höhere Priorität; Feature Layers kommen in Phase 10 davor
  extends: ['../../packages/core'],

  devServer: {
    port: 3001,
  },
})

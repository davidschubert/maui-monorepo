export default defineAppConfig({
  // Maui Default Theme — Apps überschreiben gezielt via tiefem Merge (App > Core).
  // Radius: Nuxt UI 4 steuert ihn über die CSS-Variable --ui-radius in main.css,
  // nicht über app.config (siehe app/assets/css/main.css).
  ui: {
    colors: {
      primary: 'teal',
      secondary: 'blue',
      neutral: 'slate',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'sky',
    },
  },
})

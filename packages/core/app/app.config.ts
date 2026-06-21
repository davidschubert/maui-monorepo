export default defineAppConfig({
  // maui.* Config-Gates: Core-Default ist IMMER aus — Apps aktivieren explizit.
  // Interne Tools bleiben komplett clean, öffentliche Seiten brauchen 3 Zeilen.
  maui: {
    auth: {
      /** Social-Login-Buttons (z.B. ['github', 'google']) — leer = keine Buttons.
       *  Provider müssen in der Appwrite Console konfiguriert sein! */
      providers: [] as string[],
      /** AGB-URL — gesetzt = Pflicht-Checkbox im Register-Formular */
      termsUrl: '',
      /** Passwortloser Login per E-Mail-Code (Appwrite Email-OTP) —
       *  Ergänzung zum Passwort-Login, kein Ersatz */
      otp: false,
    },
    analytics: {
      enabled: false,
      provider: 'plausible' as 'plausible' | 'umami',
      /** plausible: data-domain · umami: data-website-id */
      domain: '',
      websiteId: '',
      /** Eigene Script-URL (z.B. self-hosted) — leer = Provider-Default */
      src: '',
    },
    consent: {
      enabled: false,
    },
  },
  ui: {
    // Nuxt UI v4 gibt Buttons per Default KEINEN Pointer-Cursor — global nachrüsten,
    // damit anklickbare Buttons (inkl. variant="link" wie "Code erneut senden") sich
    // auch wie klickbar anfühlen. Im disabled-Zustand greift weiterhin not-allowed.
    button: {
      slots: {
        base: 'cursor-pointer'
      }
    },
    colors: {
      primary: 'sky',
      // getöntes Neutral (Nuxt UI v4): kühles Grau mit leichtem Blau statt rein achromatisch
      neutral: 'mist'
    },
    icons: {
      arrowDown: 'i-ph-arrow-down',
      arrowLeft: 'i-ph-arrow-left',
      arrowRight: 'i-ph-arrow-right',
      arrowUp: 'i-ph-arrow-up',
      caution: 'i-ph-warning-circle',
      check: 'i-ph-check',
      chevronDoubleLeft: 'i-ph-caret-double-left',
      chevronDoubleRight: 'i-ph-caret-double-right',
      chevronDown: 'i-ph-caret-down',
      chevronLeft: 'i-ph-caret-left',
      chevronRight: 'i-ph-caret-right',
      chevronUp: 'i-ph-caret-up',
      close: 'i-ph-x',
      copy: 'i-ph-copy',
      copyCheck: 'i-ph-check-circle',
      dark: 'i-ph-moon',
      drag: 'i-ph-dots-six-vertical',
      ellipsis: 'i-ph-dots-three',
      error: 'i-ph-x-circle',
      external: 'i-ph-arrow-up-right',
      eye: 'i-ph-eye',
      eyeOff: 'i-ph-eye-slash',
      file: 'i-ph-file',
      folder: 'i-ph-folder',
      folderOpen: 'i-ph-folder-open',
      hash: 'i-ph-hash',
      info: 'i-ph-info',
      light: 'i-ph-sun',
      loading: 'i-ph-circle-notch',
      menu: 'i-ph-list',
      minus: 'i-ph-minus',
      panelClose: 'i-ph-sidebar-simple',
      panelOpen: 'i-ph-sidebar-simple',
      plus: 'i-ph-plus',
      reload: 'i-ph-arrow-counter-clockwise',
      search: 'i-ph-magnifying-glass',
      stop: 'i-ph-square',
      success: 'i-ph-check-circle',
      system: 'i-ph-monitor',
      tip: 'i-ph-lightbulb',
      upload: 'i-ph-upload',
      warning: 'i-ph-warning'
    }
  }
})

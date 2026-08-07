/**
 * Produkt Layer: Control — das Control Plane der Multi-Site-Plattform (M6):
 * Sites-Register (Table `sites`, Migration control-001; eigener Schema-Owner
 * nach A14), Health-Übersicht, später Site-Erstellungs-Flow + Entitlements.
 * Läuft NUR in apps/control (control.pukalani.app) — besitzt bewusst KEINE
 * Site-Inhalte und keine Site-Sessions (Vertrauensgrenze, Strategie § 8).
 */
export default defineNuxtConfig({
  runtimeConfig: {
    // server-only! Aussteller-Schlüssel der Entitlement-Zustellung (F3):
    // Ed25519 PKCS8-DER base64 + kid — erzeugt scripts/entitlements-keygen.mjs.
    // Env: NUXT_ENTITLEMENTS_PRIVATE_KEY / NUXT_ENTITLEMENTS_KID.
    // Leer = GET /api/platform/entitlements/:projectId antwortet 503.
    entitlementsPrivateKey: '',
    entitlementsKid: '',
    // server-only! Service-Secret des Self-Service-Onboardings (SAAS-ROADMAP #1):
    // beweist, dass der Aufrufer von /api/control/onboarding/* unser eigenes
    // Platform-Deployment ist. Env: NUXT_CONTROL_ONBOARDING_SECRET (dasselbe
    // Geheimnis dort als NUXT_ONBOARDING_SERVICE_SECRET).
    // LEER = die Onboarding-Routen existieren nicht (404) — Default-aus, damit
    // ein vergessenes Secret nicht in einen offenen Trichter mündet.
    controlOnboardingSecret: '',
    // Wohin die Einladungs-Mail verlinkt (Kundenbereich, nicht das Control).
    // Env: NUXT_ONBOARDING_START_URL — Default zeigt auf die Prod-Adresse.
    // Umbenennung 2026-07-25: der Kunde bekommt den Kurz-Link. `start` ist ein
    // Kontroll-Host derselben Platform-App, die Weiterleitung auf den Wizard
    // macht die control-center-Middleware.
    onboardingStartUrl: 'https://start.pukalani.app',
    /**
     * EIGENE DOMAINS (control-035, Davids Entscheidungen vom 2026-08-07).
     *
     * server-only! Der ploi-Token darf ALLES auf allen Servern des Kontos —
     * Sites anlegen, Deploys auslösen, nginx tauschen. Er gehört deshalb
     * ausschließlich ins Control Plane (das ist der Maschinenraum) und NIE in
     * eine App, die Kunden-Traffic bedient.
     *
     * LEER = das Merkmal läuft, aber der Zertifikatsschritt hält an: der Status
     * bleibt ehrlich auf `pending_cert` mit dem Text „ploi ist nicht
     * konfiguriert". Default-aus wie bei allen scharfen Gates — nur eben ohne
     * das Produkt ganz zu verstecken, weil DNS und Nachweis auch ohne ploi
     * schon etwas beweisen.
     *
     * Env: NUXT_PLOI_TOKEN / NUXT_PLOI_SERVER_ID / NUXT_PLOI_SITE_ID.
     */
    ploiToken: '',
    ploiBaseUrl: 'https://ploi.io/api',
    /** Server + Site, an die Kundendomains als ploi-TENANTS gehängt werden.
     *  KONFIGURIERBAR und nicht hartkodiert: die `platform`-Site kann umziehen,
     *  und ein Umzug darf kein Deploy dieses Layers kosten. */
    ploiServerId: '',
    ploiSiteId: '',
    /**
     * TROCKENLAUF (NUXT_CUSTOM_DOMAIN_DRY_RUN=1): alle Zustandsübergänge
     * laufen, ploi wird nicht angefasst und die HTTPS-Probe entfällt. Das ist
     * der Modus für den lokalen Beweis — die echte Zertifikatskette braucht
     * echtes DNS und echtes Let's Encrypt und wird beim ersten Kunden bewiesen
     * (docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md).
     */
    customDomainDryRun: '',
    /**
     * Wohin der Kunde zeigen soll. Der Default ist die heutige `app-prod`-IP
     * bzw. der Host der `platform`-Site — beides steht ohnehin öffentlich im
     * Repo und in jedem DNS. Env-Override, weil ein Server-Umzug sonst ein
     * Deploy kostet: NUXT_CUSTOM_DOMAIN_SERVER_IPS (kommagetrennt, mehrere
     * erlaubt) / NUXT_CUSTOM_DOMAIN_CNAME_TARGET.
     *
     * FAIL-CLOSED (domainPointsToUs): steht hier nichts, zeigt keine Domain
     * auf uns und keine wird aktiv. Eine vergessene Konfiguration darf nicht
     * „alles ist in Ordnung" bedeuten.
     */
    customDomainServerIps: '49.13.211.173',
    customDomainCnameTarget: 'platform.pukalani.app',
    /** Welche Resolver gefragt werden (kommagetrennt). Leer = Cloudflare +
     *  Google. NIE die des Betriebssystems: deren Negativ-Cache hält eine
     *  frisch angelegte Zone minutenlang für nicht existent, und der Kunde
     *  legt seinen Record dreimal an. */
    customDomainDnsServers: '',
    public: {
      // Laufzeit-Override des Pool-Projekts (Muster wie getEffectiveAiConfig:
      // app.config = Build-Default, Env = Umgebung). NÖTIG, weil das Pool-
      // Projekt pro Umgebung anders heißt — lokal 'reddit-comments', in Prod
      // 'pool'. Ein hartkodierter Default hätte lokal gegen ein nicht
      // existierendes Projekt provisioniert.
      // Env: NUXT_PUBLIC_CONTROL_POOL_PROJECT. Leer = app.config-Default.
      controlPoolProject: '',
    },
  },
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

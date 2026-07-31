/**
 * Produkt Layer: zentrales Kunden-Feedback (E10,
 * docs/plans/CUSTOMER-FEEDBACK.md).
 *
 * Auf jeder Community- und Website-Seite sitzt unten links ein Feedback-Knopf;
 * was dort eingeht, läuft ZENTRAL im Control Plane auf — aus allen
 * Communities, an einer Stelle. Der Feedback-Bereich (Liste + Roadmap) ist
 * Bestandteil ALLER Dashboards: dort wird gewählt und mitgeredet.
 *
 * BESITZT KEINE Appwrite-Tables. Alles liegt im Control Plane (Migration
 * control-032) und wird über die Service-Naht erreicht — Davids Entscheidung
 * 1: „jedes Dashboard fragt seinen EIGENEN Server, der über dieselbe
 * Service-Naht bei control nachfragt." Gleiche Bauart wie der onboarding-Layer.
 *
 * Auch Gäste dürfen SENDEN (Rate-Limit-Bucket feedback:create im Core);
 * wählen und kommentieren geht nur eingeloggt (Entscheidung 4). Extended den
 * Core NICHT selbst.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * Dieselben zwei Schlüssel, die der onboarding-Layer schon deklariert
     * (`NUXT_ONBOARDING_SERVICE_SECRET` / `NUXT_ONBOARDING_CONTROL_URL`) —
     * hier nochmal, weil dieser Layer auch in Apps OHNE onboarding steckt und
     * ein nicht deklarierter Schlüssel als Env-Var still ins Leere mappt. Der
     * Deep-Merge macht daraus in apps/platform genau einen Wert.
     *
     * Leer = die Naht ist nicht konfiguriert. Der Feedback-Bereich zeigt dann
     * einen Hinweis und reißt das übrige Dashboard NICHT mit (Entscheidung 1
     * nennt das ausdrücklich als Bedingung). In apps/control bleiben beide
     * bewusst leer: dort läuft die Gegenseite in-process.
     */
    onboardingServiceSecret: '',
    onboardingControlUrl: '',
  },
  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

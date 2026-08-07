/**
 * Layer `domains` — EIGENE DOMAIN FÜR EINE SILO-APP (control-036, 2026-08-07).
 *
 * Davids Auftrag: er will nie wieder von Hand an ploi- oder DNS-Panels. Für
 * Pool-Communities steht das seit control-035 (Layer `onboarding`); dieser
 * Layer ist dasselbe Versprechen für die andere Sorte Site — die Silos
 * (portfolio, comments), die kein Mandanten-Modell haben.
 *
 * ── WARUM EIN EIGENER LAYER UND NICHT `admin` ─────────────────────────────
 * Das war die eine Stelle, an der es keine billige Lösung gab. Die Seite
 * heißt in beiden Welten `/dashboard/settings/domain` — im Pool liegt sie in
 * `onboarding`. Legte man die Silo-Fassung in `admin`, gäbe es zwei Dateien
 * für denselben Pfad, und in `apps/platform` gewänne `admin`: es steht in der
 * extends-Liste an Stelle 2, `onboarding` an Stelle 14 (früher = höhere
 * Priorität). Die Pool-Seite wäre damit still verschwunden — dieselbe Sorte
 * Fehler, die man erst beim Kunden bemerkt.
 *
 * Ein eigener Layer, den NUR Silo-Apps ziehen, hat das Problem nicht: in der
 * Platform-App gibt es weder diese Seite noch ihre Routen. Das ist zugleich
 * die schärfere Aussage — `/api/site/domain/*` arbeitet auf einer
 * `websites`-Zeile, und die gibt es für eine Pool-Community nicht.
 *
 * ── WAS DIESER LAYER *NICHT* DARF ────────────────────────────────────────
 * Er darf den `control`-Layer nicht kennen (A14, und praktisch: eine Silo-App
 * liefert ihn gar nicht mit). Alles, was er vom Control Plane braucht, geht
 * über die Naht — Transport aus core (`callControlService`, Secret + JWT), der
 * gemeinsame Vertrag als reiner Typ in `core/shared/types/siteDomain.ts`.
 * Die REGELN (was gilt als Domain, wie sieht der Nachweis aus) bleiben
 * vollständig im Control Plane; dieser Layer prüft nichts nach und rechnet
 * nichts aus. Er zeigt an, was die Naht sagt.
 *
 * ── KEIN EIGENES DATENMODELL ─────────────────────────────────────────────
 * `hasMigrations: false`. Die Wahrheit über eine Domain liegt im
 * Control-Plane-Projekt (`websites`), nicht im Runtime-Projekt der App —
 * dort hat sie nichts zu suchen, weil das Anlegen von nginx-Aliassen und
 * Zertifikaten ohnehin nur das Control Plane kann (es hat den ploi-Token).
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * Dieselben zwei Schlüssel, die `onboarding` und `feedback` schon
     * deklarieren (`NUXT_ONBOARDING_CONTROL_URL` /
     * `NUXT_ONBOARDING_SERVICE_SECRET`) — hier noch einmal, weil dieser Layer
     * in Apps steckt, die weder das eine noch das andere mitliefern, und ein
     * NICHT DEKLARIERTER Schlüssel als Env-Var still ins Leere mappt. Der
     * Deep-Merge macht daraus in jeder App genau einen Wert.
     *
     * BEWUSST KEIN ZWEITES SECRET, obwohl dieser Layer die Naht in BEIDE
     * Richtungen benutzt (die App fragt das Control Plane; die
     * Betreiber-Konsole ruft `/api/site/domain/settle` zurück). Es ist
     * dieselbe Vertrauensbeziehung — unser Code gegen unser Control Plane —,
     * und ein zweites Geheimnis wäre vor allem ein zweiter Ort, an dem es auf
     * einer Maschine fehlen kann (F44: eine fehlende Env-Variable wird nicht
     * rot).
     *
     * Leer = die Naht ist nicht konfiguriert. Dann gibt es keine eigene
     * Domain, und — wichtiger — es gibt auch KEINE Umleitung: die App
     * antwortet weiter unter ihrer Pukalani-Adresse, als hätte es das Merkmal
     * nie gegeben.
     */
    onboardingServiceSecret: '',
    onboardingControlUrl: '',
  },

  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})

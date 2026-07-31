import type { ManifestText } from '../../../core/shared/types/manifest'

/**
 * Eine Wahlmöglichkeit im Feld „Welches Produkt" (Davids Entscheidung 5).
 *
 * Bewusst eine EIGENE, schmale Form statt des ganzen `ProductManifest`: das
 * Formular braucht Key, Titel und Icon — Tier, requires, apiPrefixes und
 * Migrations-Flag sind Betriebsdetails, die nichts im Browser verloren haben.
 *
 * Die Texte kommen zweisprachig aus dem Manifest und laufen NICHT über i18n:
 * Produkt-Titel sind Eigennamen des Katalogs, und der Katalog ist die Quelle,
 * damit ein neuer Layer automatisch zur Wahl steht.
 */
export interface FeedbackProductOption {
  key: string
  title: ManifestText
  icon: string
}

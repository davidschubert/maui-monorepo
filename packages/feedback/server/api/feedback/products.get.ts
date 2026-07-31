import type { FeedbackProductOption } from '../../../shared/types/feedbackProducts'

/**
 * Die Produkt-Auswahl des Feedback-Formulars (Davids Entscheidung 5: ZWEI
 * Felder statt einer Liste — „Bereich" und, nur bei „Ein Produkt", welches).
 *
 * Quelle ist der BESTEHENDE Katalog: die Laufzeit-Registry der Produkt-
 * Manifeste dieser App (registerProductManifest, F2). Damit veraltet keine
 * zweite Liste getrennt — ein neuer Layer steht automatisch zur Wahl.
 *
 * BEWUSST DIE PRODUKTE DIESER APP und nicht der ganzen Plattform: ein Kunde
 * kann nur über das reden, was er vor sich hat, und eine Auswahlliste mit
 * Produkten, die er nie gesehen hat, erzeugt Feedback zu Fantasie-Funktionen.
 * Der Betreiber sieht in apps/control seinen eigenen (größeren) Katalog.
 *
 * Ohne Locale-Wahl hier: die Titel kommen zweisprachig aus dem Manifest, die
 * Oberfläche nimmt sich die passende.
 */
export default defineEventHandler((): { products: FeedbackProductOption[] } => {
  const products: FeedbackProductOption[] = []
  for (const manifest of getProductRegistry().values()) {
    products.push({ key: manifest.key, title: manifest.title, icon: manifest.icon ?? '' })
  }
  products.sort((a, b) => a.key.localeCompare(b.key))
  return { products }
})

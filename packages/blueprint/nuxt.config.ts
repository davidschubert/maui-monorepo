/**
 * Kompositions-Layer „Bauplan" (blueprint) — s. product.manifest.ts.
 *
 * Hier liegt das ZUSAMMENSTECKEN der Produkte genau einmal: Seiten, die
 * Produkt-Slots füllen (z. B. Feed + CommentSection), damit Pool- und
 * Silo-Sites identisch aussehen. Keine eigene Datenhaltung, kein server/,
 * keine eigenen Locales (die Texte gehören den Produkt-Layern).
 *
 * WICHTIG für konsumierende Apps: blueprint in `extends` VOR den
 * Produkt-Layern listen (früher = höhere Priorität), sonst gewinnen deren
 * „nackte" Seiten. Kanonische Reihenfolge: scripts/check-manifests.mjs.
 */
export default defineNuxtConfig({})

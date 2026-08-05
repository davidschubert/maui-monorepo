/**
 * Der EMPFÄNGER der Inhalts-Meldungen (F1 Teilpaket 2): der posts-Layer besitzt
 * den Abzeichen-Katalog und macht deshalb aus „diese Antwort hat jetzt 10
 * Stimmen" eine Verleihung — `registerContentUpvoteHandler` in core.
 *
 * EINER je Deployment, und er gehört zu dem KATALOG, nicht zu der Route, die
 * gerade meldet. Genau deshalb kann `comments` melden, ohne `posts` zu kennen
 * (A14): es nennt eine Form und zwei Zahlen, keinen Nachbarn.
 *
 * Fehlt dieser Layer (Silo-App ohne Discussions, Playground), ist der Vertrag
 * unbesetzt und jede Meldung verpufft — dieselbe gutmütige Richtung wie beim
 * Zähl-Vertrag.
 */
export default defineNitroPlugin(() => {
  registerContentUpvoteHandler(awardContentBadges)
})

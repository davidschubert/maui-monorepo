/**
 * Eigene Community-Rolle des eingeloggten Users auf DIESEM Mandanten-Host (N1).
 *
 * Konsument ist der Auth-Store nach einem CLIENT-Login (der SSR-Spiegel aus
 * tenant-brand.server.ts ist dann veraltet, weil die Seite nicht neu lädt).
 * Gibt bewusst NUR den eigenen Rollen-String zurück — keine fremden Daten,
 * die Capabilities leitet der Client aus der geteilten Matrix ab.
 *
 * SEIT F1 TEILPAKET 3 KOMMT DIE VERTRAUENSSTUFE MIT, und aus demselben Grund:
 * sie ist die zweite Quelle derselben Capabilities. Zwei Routen dafür wären
 * zwei Gelegenheiten, eine davon nach einem Client-Login zu vergessen — und der
 * Fehler wäre unsichtbar (ein Knopf, den nur derjenige nicht sieht, der ihn
 * gerade verdient hat). Es ist die EIGENE Stufe, kein fremdes Datum.
 *
 * Fail-closed wie resolveCommunityRole: Gast, kein Tenant, kein Resolver oder
 * Resolver-Fehler ⇒ { role: null, trustLevel: 0 }. Kein 401/403 — „keine Rolle"
 * ist hier eine gültige Antwort, kein Fehler (Silo-Apps/Kontroll-Hosts
 * inklusive).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) return { role: null, trustLevel: 0 }
  try {
    // `resolveTrustLevel` wirft nie und antwortet im Zweifel mit 0 — es steht
    // trotzdem im selben try, damit ein Fehler der ROLLE nicht eine halbe
    // Antwort erzeugt.
    const [role, trustLevel] = await Promise.all([
      resolveCommunityRole(event),
      resolveTrustLevel(event),
    ])
    return { role, trustLevel }
  }
  catch {
    return { role: null, trustLevel: 0 }
  }
})

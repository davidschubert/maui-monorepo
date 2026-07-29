/**
 * Site-Label-Vergabe (A4, „Presence-Grenze" Weg (c)) — läuft alphabetisch NACH
 * `00.tenant.ts` (Mandant) und `auth.ts` (User) und VOR `site-role.ts`.
 *
 * WAS SIE ENTSCHEIDET: wann jemand „Mitglied" einer Community ist. Die Antwort
 * musste her, weil Mitgliedschaft bei uns kaum als Daten existiert —
 * `site_members` liegt im Control Plane und trägt im Produktivbetrieb NUR den
 * Gründer (eine einzige Schreibstelle: onboardingProvision.ts). Wer sich bei
 * offener Registrierung anmeldet, bekäme nie eine Zeile, nie ein Label und
 * damit nie eine Anwesenheitsanzeige — der Verschluss wäre wertlos, weil
 * niemand mehr irgendwen sähe.
 *
 * DIE REGEL: **wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied.** Das
 * ist keine Verlegenheitslösung, sondern die ehrliche Abbildung des heutigen
 * Produkts (offene Registrierung, kein Beitritt als Ereignis): wer hier
 * eingeloggt unterwegs ist, sieht Inhalte und Kommentierende ohnehin. Der
 * geschlossene Befund lautet nicht „Fremde sehen zu viel", sondern „Kunde A
 * sieht Kunde B" — und genau das kann jetzt nicht mehr passieren, weil A das
 * Label von B nicht trägt. Kommen geschlossene Communities, wandert der
 * `grantSiteLabel`-Aufruf an die Beitrittsstelle; der Rest bleibt.
 *
 * WARUM SO FRÜH (und nicht erst im Presence-Heartbeat): das Label muss stehen,
 * BEVOR sich der Realtime-WS des Browsers verbindet. Appwrite berechnet die
 * Rollen einer OFFENEN WS-Verbindung bei einer Label-Änderung NICHT neu (anders
 * als bei Team-Mitgliedschaften) — ein zu spät vergebenes Label wirkte erst nach
 * einem Reconnect. Hier greift es beim SSR-Request, also lange vor der
 * Hydration. (Der Rest-Fall ist in docs/archiv/PRESENCE-GRENZE.md notiert.)
 *
 * KOSTEN: nach dem ersten Kontakt ein `includes()` auf dem ohnehin geladenen
 * User — kein zusätzlicher Appwrite-Aufruf. Genau einmal je (Nutzer, Site) ein
 * `users.updateLabels`.
 *
 * SILO / KONTROLL-HOST / SINGLE-TENANT: No-Op. Dort ist das Projekt die Grenze,
 * ein Label wäre reine Zeremonie.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.$id) return

  const tenant = event.context.tenant
  if (tenant?.mode !== 'pool' || !tenant.siteId) return

  // Interne Nuxt-Pfade (/_nuxt, /_i18n, …) tragen zwar das Cookie, sind aber
  // kein „Benutzen der Community" — und der erste echte Request (Seite oder
  // /api/*) kommt ohnehin unmittelbar davor oder danach.
  if (event.path.startsWith('/_')) return

  // Wirft NIE: grantSiteLabel protokolliert und schluckt. Ein Fehlschlag heißt
  // „noch nicht sichtbar" (fail-closed), nie „Seite kaputt".
  await grantSiteLabel(event, tenant.siteId)
})

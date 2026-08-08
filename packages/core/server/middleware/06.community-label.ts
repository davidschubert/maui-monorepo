import { communityRoleHasCapability } from '../../shared/communityAuthz'
import { communityModeratorLabel } from '../../shared/communityModeratorLabel'

/**
 * Community-Label-Vergabe (H3-Naht 4) — läuft nach Dateiname NACH
 * `00.tenant.ts` (Mandant), `02.auth.ts` (User), `03.csrf-origin.ts` und
 * `05.rate-limit.ts`, und VOR `07.community-role.ts`.
 *
 * WARUM ZAHL-PRÄFIXE (E8-4, 2026-07-30): Nitro sortiert die Middleware
 * lexikografisch (`localeCompare` über den Dateinamen). Die Umbenennung
 * `site-label` → `community-label` hätte diese Datei damit VOR csrf-origin und
 * rate-limit gezogen — ein abgewiesener oder gedrosselter Request hätte dann
 * trotzdem eine Rollen-Auflösung und womöglich einen Beitritt ausgelöst. Die
 * Reihenfolge ist jetzt an die Zahl gebunden statt an einen Zufall des Namens.
 *
 * WAS SIE ENTSCHEIDET: wer das Lese-Publikum einer Community trägt. Seit A5
 * (2026-07-29) ist das keine eigene Regel mehr, sondern eine ABLEITUNG:
 *
 *   **Label = es gibt eine `community_members`-Zeile mit Zugang.**
 *
 * VORHER (A4) stand hier „wer eingeloggt einen Mandanten-Host benutzt, ist
 * Mitglied". Das war ehrlich, solange es keinen Beitritt gab — mit
 * /dashboard/community/members (C16) wurde es falsch: „Zugang entziehen" nahm nur die
 * ROLLE, das Label vergab diese Middleware beim nächsten Besuch neu, und die
 * entfernte Person las weiter mit. Die Mitgliedschaft ist jetzt ein Ereignis
 * (shared/communityJoin.ts, utils/communityJoin.ts) — hier wird sie nur noch
 * vollzogen.
 *
 * WARUM SO FRÜH (und nicht erst im Presence-Heartbeat): das Label muss stehen,
 * BEVOR sich der Realtime-WS des Browsers verbindet. Appwrite berechnet die
 * Rollen einer OFFENEN WS-Verbindung bei einer Label-Änderung NICHT neu (anders
 * als bei Team-Mitgliedschaften) — ein zu spät vergebenes Label wirkte erst nach
 * einem Reconnect. Hier greift es beim SSR-Request, also lange vor der
 * Hydration. Für den Beitritt MITTEN in der Sitzung (Auslöser `contribution`)
 * gilt der in shared/communityJoin.ts notierte Weg: Heartbeat + 20-s-Leser-Poll.
 *
 * KOSTEN: eine Rollen-Auflösung aus dem 30-s-Cache des Resolvers (meist ohne
 * Netzwerk, dieselbe Auflösung, die `07.community-role.ts` gleich danach
 * braucht) und ein `includes()` auf dem ohnehin geladenen User. Genau einmal je (Nutzer,
 * Community) ein `users.updateLabels`.
 *
 * SILO / KONTROLL-HOST / SINGLE-TENANT: No-Op. Dort ist das Projekt die Grenze,
 * ein Label wäre reine Zeremonie.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user?.$id) return

  const tenant = event.context.tenant
  if (tenant?.mode !== 'pool' || !tenant.communityId) return

  // Interne Nuxt-Pfade (/_nuxt, /_i18n, …) tragen zwar das Cookie, sind aber
  // kein „Benutzen der Community" — und der erste echte Request (Seite oder
  // /api/*) kommt ohnehin unmittelbar davor oder danach.
  if (event.path.startsWith('/_')) return

  // Fail-closed wie überall bei der Rollen-Auflösung: ein transienter Fehler
  // heißt „keine Rolle für diesen Request", nie ein 500 fürs SSR. Ob die
  // Auflösung ÜBERHAUPT stattfand, wird getrennt gemerkt — siehe unten beim
  // Moderations-Label.
  let resolved = true
  const role = await resolveCommunityRole(event).catch(() => {
    resolved = false
    return null
  })

  // Gerade selbst entzogen? Dann NICHT der Rolle glauben. Der Rollen-Resolver
  // cacht 30 s — ohne diese Frage hätte „Zugang entziehen" ein halbminütiges
  // Loch, in dem dieselbe Middleware das Publikum wieder vergibt.
  // (revokeCommunityLabel nimmt Zugehörigkeit UND Moderations-Label zusammen.)
  if (communityAccessRecentlyDenied(tenant.communityId, user.$id)) {
    await revokeCommunityLabel(event, tenant.communityId)
    return
  }

  if (role) {
    // Mitglied. Wirft NIE: grantCommunityLabel protokolliert und schluckt. Ein
    // Fehlschlag heißt „noch nicht sichtbar", nie „Seite kaputt".
    await grantCommunityLabel(event, tenant.communityId)

    /**
     * DAS MODERATIONS-LABEL (Moderations-Audit Befund 1, 2026-08-01) —
     * `mod<communityId>`, das Lese-Publikum der `reports`-Zeilen.
     *
     * Es hängt an der ROLLE, nicht an der Mitgliedschaft, und wird deshalb hier
     * bei JEDEM Request nachgezogen: eine Beförderung wirkt nach ≤30 s
     * (Rollen-Cache), eine Degradierung ebenso. Zwei Labels statt einem, weil
     * Appwrite nur ODER-Rollen kennt — „Mitglied UND Moderator" gibt es dort
     * nicht (Begründung: shared/communityModeratorLabel.ts).
     *
     * NUR bei erfolgreicher Auflösung: `resolved === false` heißt „ich weiß es
     * gerade nicht". Ein Entzug auf Verdacht würde bei jedem Netz-Schluckauf
     * das Publikum eines Moderators wegnehmen und beim nächsten Request wieder
     * vergeben — Flackern statt Grenze.
     */
    if (resolved) {
      await setCommunityModeratorLabel(
        event, tenant.communityId, communityRoleHasCapability(role, 'reports.moderate'),
      )
    }
    return
  }

  /**
   * KEINE Mitgliedschaft, aber das Label ist da — der BESTAND aus der A4-Zeit
   * (Davids Auftrag: „Fail-closed ist hier ein Rückschritt für echte Nutzer").
   *
   * Diese Menschen sind heute Mitglieder im Wortsinn: sie lesen, kommentieren
   * und werden gesehen — nur steht es in keiner Zeile. Ein Backfill-Skript wäre
   * der naheliegende Weg, hätte aber ein Problem: die Wahrheit („trägt das
   * Label") lebt im RUNTIME-Projekt, die Zeile im Control Plane, und ein Skript
   * bräuchte beide Schlüssel plus einen Scan über alle Pool-Nutzer. Also
   * übernimmt der Bestand sich selbst, beim nächsten Besuch, einmal:
   *
   *  - Zeile fehlt → sie entsteht (`trigger: 'legacy'`, umgeht bewusst den
   *    Registrierungs-Schalter: wer schon drin war, wird nicht durch eine
   *    inzwischen geschlossene Tür ausgesperrt). Danach ist er ein normales
   *    Mitglied — sichtbar in der Liste und entziehbar.
   *  - Zeile ist ENTZOGEN → das Label wird eingezogen. Das ist die
   *    Selbstheilung für den Fall, dass der Entzug in `members/remove` das
   *    Label nicht erwischt hat, und die Antwort auf „kommt es beim nächsten
   *    Besuch zurück?": nein.
   *
   * Der Vorgang schließt sich von selbst: Label ohne Zeile kann ab jetzt nicht
   * mehr entstehen (vergeben wird nur mit Mitgliedschaft), die Menge schrumpft
   * also auf null. `unavailable` (Naht gestört) lässt das Label bewusst stehen —
   * lieber eine Minute alter Zustand als ein echtes Mitglied ausgesperrt.
   */
  if ((user.labels ?? []).includes(tenant.communityId)) {
    await joinCommunity(event, 'legacy')
    return
  }

  /**
   * Keine Rolle UND keine Zugehörigkeit — aber noch ein Moderations-Label?
   * Dann ist es ein Rest (Rolle entzogen, während die Zugehörigkeit auf einem
   * anderen Weg fiel). Es einzuziehen ist die Selbstheilung, die dafür sorgt,
   * dass „Zugang entziehen" auch das Lese-Publikum der Meldungen mitnimmt.
   * Wieder nur bei erfolgreicher Auflösung.
   */
  if (resolved) {
    const modLabel = communityModeratorLabel(tenant.communityId)
    if (modLabel && (user.labels ?? []).includes(modLabel)) {
      await setCommunityModeratorLabel(event, tenant.communityId, false)
    }
  }
})

/**
 * DAS MODERATIONS-LABEL EINER COMMUNITY — die Rolle, die Appwrite selbst kennt.
 *
 * WARUM ES DAS BRAUCHT (Moderations-Audit Befund 1, 2026-08-01): eine
 * `reports`-Zeile darf im Pool von genau einer Menge Menschen gelesen werden —
 * dem Moderations-Team DIESER Community. Appwrite kennt aber nur ODER-Rollen:
 *
 *  - `read("label:<communityId>")` wäre JEDES Mitglied. Eine Meldung ist kein
 *    Community-Inhalt: sie trägt den Melder, den Grund und seine Notiz über
 *    einen anderen Menschen. Das Mitglieder-Publikum ist hier ein Leck.
 *  - `read("label:admin")` / `read("label:moderator")` sind die GLOBALEN
 *    Betreiber-Rollen (authz.ts). Im Pool trägt sie kein Kunden-Moderator —
 *    er stand also vor seiner eigenen Queue ohne Leserecht (kein Realtime) —,
 *    und ein Betreiber-Label liest damit die Meldungen ALLER Communities.
 *
 * Der Schnitt „Moderator UND diese Community" existiert als Appwrite-Rolle
 * nicht. Also bekommt er einen eigenen Schlüssel: ein zweites, ABGELEITETES
 * Label je Community, das nur trägt, wer dort `reports.moderate` hat
 * (server/middleware/06.community-label.ts vergibt und zieht es ein).
 *
 * ABGELEITET, NICHT GESPEICHERT: der Wert ist eine reine Funktion der
 * communityId. Es gibt keine zweite Wahrheit, die veralten könnte — die
 * Wahrheit bleibt die Rolle in `community_members`.
 *
 * WARUM EIN PRÄFIX UND KEIN SUFFIX: ein Label muss alphanumerisch und ≤36
 * Zeichen sein (Appwrite). `tenants.$id` kommt aus `ID.unique()` (20 Zeichen),
 * also passt `mod` + Id bequem. Wächst eine Id doch einmal über 33 Zeichen,
 * gibt es KEIN Label — und das Read-Set fällt fail-CLOSED auf „niemand"
 * zurück, nie auf ein weiteres Publikum.
 *
 * KOLLISIONSFREI: `mod<id>` ist 23 Zeichen lang, eine communityId 20 — ein
 * Moderations-Label kann also nie versehentlich das Mitglieder-Label einer
 * anderen Community sein. Zusätzlich weist `labelUsable` (communityLabel.ts)
 * alles ab, was eine Betreiber-Rolle ist.
 *
 * PURE (unit-getestet): keine Nuxt-/Appwrite-Abhängigkeit, damit Server-Code
 * und Tests dieselbe Ableitung benutzen.
 */

/** Präfix des abgeleiteten Moderations-Labels. Nie ändern — bestehende Zeilen
 *  tragen die Permission mit genau diesem Wert. */
export const MODERATOR_LABEL_PREFIX = 'mod'

/** Appwrite-Grenze für Labels: alphanumerisch, höchstens 36 Zeichen. */
const MAX_LABEL_LENGTH = 36
const ALNUM = /^[a-zA-Z0-9]+$/

/**
 * Das Moderations-Label dieser Community — oder `null`, wenn sich keines
 * bilden lässt (keine communityId, nicht alphanumerisch, zu lang).
 *
 * `null` heißt an jeder Aufrufstelle „kein Publikum", nie „alle".
 */
export function communityModeratorLabel(communityId: string | null | undefined): string | null {
  if (!communityId) return null
  if (!ALNUM.test(communityId)) return null
  const label = `${MODERATOR_LABEL_PREFIX}${communityId}`
  return label.length <= MAX_LABEL_LENGTH ? label : null
}

/** Ist dieses Label ein abgeleitetes Moderations-Label? (Aufräum-/Prüf-Pfade) */
export function isCommunityModeratorLabel(label: string): boolean {
  return label.startsWith(MODERATOR_LABEL_PREFIX)
    && label.length > MODERATOR_LABEL_PREFIX.length
    && ALNUM.test(label)
}

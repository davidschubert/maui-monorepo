/**
 * WER DARF EINE MELDUNG LESEN? — als PURE Optionen, damit die Antwort geprüft
 * werden kann und nicht in einer Route versteckt liegt.
 *
 * Moderations-Audit Befund 1 (2026-08-01): `/api/reports` setzte die Row-
 * Permissions von Hand — `read(label:admin)` und `read(label:moderator)`, die
 * GLOBALEN Betreiber-Rollen. Damit war die `reports`-Tabelle die einzige
 * Pool-Tabelle ohne die zweite Verteidigungslinie (tenantRowPermissionsFor),
 * und zwar in beide Richtungen falsch:
 *
 *   - Ein Kunden-Moderator trägt diese Labels NICHT (seine Rolle steht in
 *     `community_members`). Appwrite lieferte ihm deshalb keine Realtime-
 *     Ereignisse — die Queue behauptete „live" und lud nur beim Neuladen.
 *   - Ein globales Betreiber-Label las per Realtime die Meldungen ALLER
 *     Communities, quer durch das geteilte Pool-Projekt.
 *
 * DIE ANTWORT: das Moderations-Team DIESER Community (`read: 'moderators'`,
 * core/server/utils/tenantRowPermissions.ts) plus der Melder selbst. Eine
 * Meldung ist ausdrücklich KEIN Mitglieder-Inhalt: sie nennt einen Menschen,
 * einen Vorwurf und eine Notiz.
 *
 * Der MELDER bekommt `read` (er soll seine eigene Meldung sehen) und über
 * `ownerUserId` `update`/`delete` — das Zurückziehen ist seine Sache
 * (Befund 2). Die Rolle-String-Form entspricht `Permission.read(Role.user(id))`
 * aus node-appwrite; hier steht sie als reiner String, damit diese Datei ohne
 * SDK importierbar und der Test an `tenantRowPermissionsFor` genagelt ist.
 */

/** Read-Rolle des Melders, identisch zu `Permission.read(Role.user(id))`. */
export function reporterReadRole(reporterId: string): string {
  return `read("user:${reporterId}")`
}

/**
 * Die Optionen, mit denen `/api/reports` eine Meldung anlegt. EINE Stelle —
 * die Route benutzt sie, der Test prüft sie.
 */
export function reportRowPermissionOptions(reporterId: string): {
  read: 'moderators'
  ownerUserId: string
  extraRead: string[]
} {
  return {
    read: 'moderators',
    ownerUserId: reporterId,
    extraRead: [reporterReadRole(reporterId)],
  }
}

/**
 * Die Permissions EINER Presence-Zeile — als PURE Strings, damit Client und
 * Server dieselbe Grenze schreiben (A4, „Presence-Grenze", Weg (c)).
 *
 * WARUM ES DIESE DATEI GIBT: die Presence wird an ZWEI Stellen geschrieben —
 * server-seitig im Heartbeat (Admin-Client, `tenantRowPermissionsFor`) und
 * client-seitig per WS-Upsert (der EINZIGE Weg, der ein Realtime-Ereignis
 * auslöst). Der WS-Upsert ERSETZT die metadata UND die Permissions; schriebe er
 * andere Rechte als der Server, wäre die Grenze zwischen zwei Heartbeats offen.
 * Der Browser kann `node-appwrite` (Permission/Role) nicht laden, deshalb hier
 * die reinen Strings — und `tests/presencePermissions.test.ts` nagelt sie Zeile
 * für Zeile an `tenantRowPermissionsFor` fest. Keine zweite Variante, sondern
 * dieselbe, bewiesen gleich.
 *
 * Die Grenze selbst (Analyse: docs/archiv/PRESENCE-GRENZE.md):
 *  - Pool  → `read("label:<communityId>")`. Im geteilten Projekt hieß `read("users")`
 *    „jeder eingeloggte Nutzer ALLER Communities": wer `presences.list()` von
 *    Hand ruft, sah Name/Avatar/Aktivität aller Kunden. Das Label trägt nur, wer
 *    MITGLIED dieser Community ist — eine community_members-Zeile mit Zugang, seit A5
 *    (server/middleware/06.community-label.ts, shared/communityJoin.ts).
 *  - Pool OHNE communityId (Datenfehler) → gar kein read. Fail-CLOSED: lieber
 *    niemand sieht jemanden, als dass alle alle sehen.
 *  - Silo / kein Mandant → `read("users")` wie bisher; dort IST das Projekt die
 *    Grenze, ein Label wäre reine Zeremonie.
 *
 * update/delete für den Besitzer sind PFLICHT (nicht Kosmetik): Appwrites
 * Realtime-Presence-Handler UPDATEt die Zeile beim Verarbeiten des WS-Upserts
 * und wirft ohne diese Rechte „No permissions for action 'update'".
 */

/** Read-Rollen einer Presence. `pool` = geteiltes Projekt (Mandanten-Host). */
export function presenceReadRoles(pool: boolean, communityId?: string | null): string[] {
  if (!pool) return ['read("users")']
  return communityId ? [`read("label:${communityId}")`] : []
}

/** Vollständiges Permission-Array einer Presence (Read-Publikum + Owner). */
export function presencePermissions(pool: boolean, communityId: string | null | undefined, userId: string): string[] {
  return [
    ...presenceReadRoles(pool, communityId),
    `update("user:${userId}")`,
    `delete("user:${userId}")`,
  ]
}

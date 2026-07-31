/**
 * Mandant DIESES Hosts, clientseitig — vom tenant-brand-Plugin in den Payload
 * gespiegelt (`pukalani-tenant-id`). null = Silo, Kontroll-Host, Playground.
 *
 * WOFÜR ES DA IST — und wofür NICHT: ausschließlich als Mandanten-Filter für
 * die wenigen Client-Leser, die DIREKT gegen Appwrite lesen (Presence-API,
 * Realtime-Row-Streams: Activity-Feed und NotificationBell) und deshalb selbst
 * scopen müssen. Alles, was über eine
 * server/api-Route geht, ist schon durch die Datentür gescopt und darf diese Id
 * NICHT anfassen — sie ist kein allgemeiner „aktueller Mandant"-Getter für UI-
 * Logik. Das Spiegel-Inventar in app/plugins/tenant-brand.server.ts führt die
 * erlaubten Leser namentlich; ein neuer Leser gehört dort hinein.
 *
 * Der EXPLIZITE Vertrag existiert, damit Produkt-Layer nicht den State-Key als
 * String nachbauen (impliziter Auto-Import/String-Coupling, CONCEPT A14).
 */
export function useTenantId() {
  return useState<string | null>('pukalani-tenant-id', () => null)
}

/**
 * Die Site-Id DIESES Hosts (= tenants.$id), clientseitig — gespiegelt als
 * `pukalani-site-id`. null = Silo, Kontroll-Host, Playground.
 *
 * WARUM ES SIE ZUSÄTZLICH ZU useTenantId() GIBT: sie sind NICHT dasselbe.
 * `tenantId` ist der Zeilen-Scope (Spalte in jeder Tabelle), `communityId` der
 * Appwrite-LABEL-Schlüssel — nur die Row-$id garantiert Alphanumerik, und
 * Appwrite erlaubt in Labels nichts anderes.
 *
 * DER EINZIGE ERLAUBTE LESER ist der WS-Presence-Upsert in usePresenceState()
 * (A4): er ersetzt die Permissions der eigenen Presence und muss deshalb
 * dieselbe Grenze schreiben wie der Server (`read("label:<communityId>")`, siehe
 * shared/presencePermissions.ts). Kein Geheimnis — der Nutzer trägt dieselbe Id
 * als Label in seinem eigenen Account-Objekt. Trotzdem eng halten: alles, was
 * über eine server/api-Route geht, hat hier nichts zu suchen.
 */
export function useSiteId() {
  return useState<string | null>('pukalani-site-id', () => null)
}

/**
 * Gehört diese Row auf diesen Host? PURE Ausschluss-Rechnung, fail-closed in
 * BEIDE Richtungen (spiegelt rowBelongsToTenant auf dem Server): ohne tenantId
 * gehört sie nicht auf einen Mandanten-Host, mit tenantId nicht auf einen
 * Kontroll-/Silo-Host. Gedacht als `where`-Sicherheitsnetz für useRealtimeRows
 * — die harte Grenze bleiben die Row-Permissions (Role.label(communityId) im Pool),
 * dieser Filter fängt den Fall, dass jemand in ZWEI Communities Mitglied ist
 * und deshalb beide Streams zugestellt bekommt.
 */
export function rowBelongsToHost(row: { communityId?: string }, tenantId: string | null): boolean {
  return (row.communityId ?? '') === (tenantId ?? '')
}

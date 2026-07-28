/**
 * Mandant DIESES Hosts, clientseitig — vom tenant-brand-Plugin in den Payload
 * gespiegelt (`maui-tenant-id`). null = Silo, Kontroll-Host, Playground.
 *
 * WOFÜR ES DA IST — und wofür NICHT: ausschließlich als Mandanten-Filter für
 * die wenigen Client-Leser, die DIREKT gegen Appwrite lesen (Presence-API,
 * Realtime-Row-Streams) und deshalb selbst scopen müssen. Alles, was über eine
 * server/api-Route geht, ist schon durch die Datentür gescopt und darf diese Id
 * NICHT anfassen — sie ist kein allgemeiner „aktueller Mandant"-Getter für UI-
 * Logik. Das Spiegel-Inventar in app/plugins/tenant-brand.server.ts führt die
 * erlaubten Leser namentlich; ein neuer Leser gehört dort hinein.
 *
 * Der EXPLIZITE Vertrag existiert, damit Feature-Layer nicht den State-Key als
 * String nachbauen (impliziter Auto-Import/String-Coupling, CONCEPT A14).
 */
export function useTenantId() {
  return useState<string | null>('maui-tenant-id', () => null)
}

/**
 * Gehört diese Row auf diesen Host? PURE Ausschluss-Rechnung, fail-closed in
 * BEIDE Richtungen (spiegelt rowBelongsToTenant auf dem Server): ohne tenantId
 * gehört sie nicht auf einen Mandanten-Host, mit tenantId nicht auf einen
 * Kontroll-/Silo-Host. Gedacht als `where`-Sicherheitsnetz für useRealtimeRows
 * — die harte Grenze bleiben die Row-Permissions (Role.label(siteId) im Pool),
 * dieser Filter fängt den Fall, dass jemand in ZWEI Communities Mitglied ist
 * und deshalb beide Streams zugestellt bekommt.
 */
export function rowBelongsToHost(row: { tenantId?: string }, tenantId: string | null): boolean {
  return (row.tenantId ?? '') === (tenantId ?? '')
}

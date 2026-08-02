import { EVENTS_TABLE, EVENT_COVERS_BUCKET } from '../../shared/types/event'

/**
 * C18 — die Tabellen des events-Layers, deren Zeilen eine
 * Veröffentlichungs-Permission tragen (core-Vertrag
 * registerAudienceRepermissionTable).
 *
 * NUR `events`: RSVPs, Tickets und Stimmen gehören der einzelnen Person
 * (`read(user:…)`) und waren nie öffentlich.
 *
 * MIT DEM TITELBILD (Audit-Befund 2026-08-02): der Umzug meldete
 * `complete: true`, während jedes Cover per Roh-URL weiter für alle abrufbar
 * blieb — der Bucket war bucket-weit `read("any")`. Seit Migration events-009
 * ist er ein fileSecurity-Bucket, und die Datei zieht hier mit der Row um
 * (`bucket`, dasselbe Permission-Array — genau die Naht, die core an
 * audienceRepermission.ts vorsieht und die media schon nutzt).
 *
 * REIHENFOLGE: erst Migration events-009 (Bucket umstellen + Bestand
 * nachziehen), dann wirkt diese Zeile. Vorher ist sie folgenlos, nicht falsch:
 * `updateFile` mit Permissions ist auch auf einem read(any)-Bucket erlaubt,
 * sie werden nur nicht ausgewertet.
 */
export default defineNitroPlugin(() => {
  registerAudienceRepermissionTable({
    layer: 'events',
    table: EVENTS_TABLE,
    bucket: { bucketId: EVENT_COVERS_BUCKET, fileIdKey: 'coverFileId' },
  })
})

import { MEDIA_BUCKET, MEDIA_TABLE } from '../../shared/types/media'

/**
 * C18 — die Medien-Einträge ziehen beim Umschalten der Sichtbarkeit mit
 * (core-Vertrag registerAudienceRepermissionTable).
 *
 * BESONDERHEIT: das Leserecht liegt auf ZWEI Dingen — der Row UND der Datei im
 * `media`-Bucket (fileSecurity, seit Migration media-002). Deshalb meldet
 * dieser Layer als einziger einen `bucket` mit: der Umzug schreibt dasselbe
 * Permission-Array auf beide. Ein Bild, dessen Row zu ist, dessen Datei man
 * aber mit der fileId weiter abrufen kann, wäre kein Schutz.
 */
export default defineNitroPlugin(() => {
  registerAudienceRepermissionTable({
    layer: 'media',
    table: MEDIA_TABLE,
    bucket: { bucketId: MEDIA_BUCKET, fileIdKey: 'fileId' },
  })
})

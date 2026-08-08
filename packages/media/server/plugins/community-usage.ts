import { MEDIA_TABLE } from '../../shared/types/media'

/**
 * Verbrauchs-Posten des media-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Derselbe `kind` wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'media', … })`,
 * server/api/media/index.post.ts).
 *
 * GEZÄHLT WERDEN ZEILEN, NICHT BYTES — dieselbe Einschränkung wie bei der
 * Bremse und aus demselben Grund (Begründung an der `media`-Zeile in
 * apps/platform/app/app.config.ts): die echten Kosten sind die Datei auf der
 * geteilten Platte, das Kontingent ist ein Stellvertreter dafür. Die Seite
 * darf deshalb „Bilder", nicht „Speicherplatz" behaupten.
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'media', tableId: MEDIA_TABLE })
})

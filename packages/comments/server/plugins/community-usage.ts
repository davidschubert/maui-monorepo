import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * Verbrauchs-Posten des comments-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Der `kind` ist DERSELBE wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'comments', … })` in
 * server/api/comments/index.post.ts und guest.post.ts) — die Anzeige zeigt
 * genau den Posten, den die Bremse zumacht. Wer den einen umbenennt,
 * benennt den anderen mit.
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'comments', tableId: COMMENTS_TABLE })
})

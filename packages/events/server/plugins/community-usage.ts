import { EVENTS_TABLE } from '../../shared/types/event'

/**
 * Verbrauchs-Posten des events-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Derselbe `kind` wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'events', … })`, sowohl in
 * server/api/events/index.post.ts als auch in der Serien-Ausdehnung
 * server/utils/eventSeries.ts).
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'events', tableId: EVENTS_TABLE })
})

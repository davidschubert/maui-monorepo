import { POSTS_TABLE } from '../../shared/types/post'

/**
 * Verbrauchs-Posten des posts-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Derselbe `kind` wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'posts', … })`,
 * server/api/posts/index.post.ts).
 *
 * ANMERKUNG: der Katalog (`pukalani.tenancy.quota.plans`) nennt für `posts`
 * heute KEINE Zahlen — die Bremse ist damit ein No-Op und die Seite zeigt den
 * Posten nicht an. Die Anmeldung steht trotzdem hier: sobald jemand Zahlen
 * einträgt (auch ohne Deploy, über `community_plans`), erscheint der Posten
 * von selbst. Ein Kontingent ohne Anzeige wäre sonst genau die stille Grenze,
 * über die ein Kunde stolpert.
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'posts', tableId: POSTS_TABLE })
})

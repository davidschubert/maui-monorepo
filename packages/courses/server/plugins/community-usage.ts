import { COURSES_TABLE } from '../../shared/types/course'

/**
 * Verbrauchs-Posten des courses-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Derselbe `kind` wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'courses', … })`,
 * server/api/courses/index.post.ts).
 *
 * ANMERKUNG wie bei `posts`: der Katalog nennt für `courses` heute keine
 * Zahlen, die Bremse ist ein No-Op und der Posten erscheint nicht. Sobald
 * Zahlen hinterlegt sind (auch ohne Deploy über `community_plans`), zeigt die
 * Seite ihn ohne weitere Änderung.
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'courses', tableId: COURSES_TABLE })
})

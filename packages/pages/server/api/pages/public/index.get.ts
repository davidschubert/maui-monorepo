import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow } from '../../../../shared/types/page'

/** Nav-Eintrag einer veröffentlichten Seite — bewusst OHNE body. */
export interface PublicPageNavItem {
  slug: string
  title: string
  sortOrder: number
}

/**
 * Öffentlich: Liste der VERÖFFENTLICHTEN Seiten für die Hauptnavigation
 * (P3, Tenant-Header). Locale-Auswahl wie [slug].get: gewünschte Locale,
 * Fallback en, sonst erste. `home` wird mitgeliefert — der Konsument
 * entscheidet, ob er sie zeigt (der Header verlinkt home über das Logo).
 * Gleiches Lese-Muster wie [slug].get: operator-Tür + published-Filter,
 * Entwürfe verlassen den Server nie — und dieselbe C18-Wache: `pages`-Rows
 * tragen keine Row-Permissions, also hält hier nur diese Zeile Gäste von den
 * Seiten einer geschlossenen Community fern. Leere Liste statt 404 wäre die
 * falsche Antwort: die Navigation eines Mandanten ohne Seiten sieht genauso
 * aus, und ein Fehler soll ein Fehler bleiben.
 */
export default defineEventHandler(async (event): Promise<PublicPageNavItem[]> => {
  assertCommunityContentReadable(event, 'Pages not found')

  const requested = String(getQuery(event).locale || 'en').slice(0, 8)

  const res = await tenantDb(event, { as: 'operator' }).list<PageRow>(PAGES_TABLE, [
    Query.equal('status', 'published'),
    Query.orderAsc('sortOrder'),
    Query.limit(50),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load pages')
  })

  const bySlug = new Map<string, PageRow[]>()
  for (const row of res.rows) {
    const list = bySlug.get(row.slug) ?? []
    list.push(row)
    bySlug.set(row.slug, list)
  }

  return [...bySlug.values()].map((rows) => {
    const row = rows.find(r => r.locale === requested)
      ?? rows.find(r => r.locale === 'en')
      ?? rows[0]!
    return { slug: row.slug, title: row.title, sortOrder: row.sortOrder }
  }).sort((a, b) => a.sortOrder - b.sortOrder)
})

import { Query } from 'node-appwrite'
import { guidelinesFallbackNavItem } from '../../../../shared/guidelinesFallback'
// PublicPageNavItem liegt seit dem 2026-08-02 in shared/types/page.ts: der
// Konsument ist App-Code (blueprint-Layout), und der darf keine Nitro-Route
// importieren. Begründung dort.
import { GUIDELINES_SLUG, PAGES_TABLE, type PageRow, type PublicPageNavItem } from '../../../../shared/types/page'

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

  const items = [...bySlug.values()].map((rows) => {
    const row = rows.find(r => r.locale === requested)
      ?? rows.find(r => r.locale === 'en')
      ?? rows[0]!
    return { slug: row.slug, title: row.title, sortOrder: row.sortOrder }
  })

  // Die Regeln erscheinen in der Navigation auch dann, wenn es sie als Zeile
  // noch nicht gibt (F1, Davids Entscheidung 2 — Begründung in
  // shared/guidelinesFallback.ts). Der Punkt und die Seite dahinter müssen
  // dieselbe Antwort geben, deshalb steht hier dieselbe zweite Frage wie in
  // public/[slug].get.ts: ein zurückgezogener Entwurf bleibt zurückgezogen.
  if (!items.some(item => item.slug === GUIDELINES_SLUG) && await guidelinesFallbackApplies(event)) {
    items.push(guidelinesFallbackNavItem(requested))
  }

  return items.sort((a, b) => a.sortOrder - b.sortOrder)
})

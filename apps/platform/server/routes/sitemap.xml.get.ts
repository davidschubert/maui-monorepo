import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantContext } from '../../../../packages/core/shared/types/tenant'
import { communityContentIsPublic } from '../../../../packages/core/shared/communityAudience'
import { PAGES_TABLE, type PageRow } from '../../../../packages/pages/shared/types/page'
import { tenantRequestOrigin } from '../utils/tenantRequestOrigin'
import { tenantSitemapEntries, tenantSitemapXml } from '../utils/tenantSitemap'

/**
 * sitemap.xml PRO MANDANTEN-HOST (Audit-Befund S6) — aus echten Daten, nicht
 * aus einer Liste: welche Seiten eine Community hat, weiß nur ihr Datenraum.
 *
 * Datenweg = DIE Datentür (`tenantDb`, CLAUDE.md „Mandanten-Isolation"): der
 * Filter `tenantId` hängt garantiert dran, es gibt also keinen Weg, in der
 * Sitemap von Kunde A die Seiten von Kunde B zu nennen. `as: 'operator'` +
 * `status='published'` ist genau das Lese-Muster der öffentlichen
 * pages-Routen (`/api/pages/public`) — Entwürfe verlassen den Server nie.
 * Bewusst NICHT über einen internen Aufruf dieser Route: `event.$fetch` ist
 * in Nitro als @experimental markiert, und die Tür ist der kürzere, hier schon
 * verbindliche Weg (die Route bräuchte nur die Slugs, nicht ihr DTO).
 *
 * KONTROLL-Hosts (my./start.) antworten 404 — konsistent zu ihrer robots.txt
 * (`Disallow: /`): dort gibt es keinen öffentlichen Inhalt, also nichts zu
 * deklarieren. Eine leere Sitemap wäre die zweite mögliche Antwort, aber ein
 * `<urlset>` ohne URLs ist eine Aussage über nichts — und sie stünde in einer
 * robots.txt, die gar keine Sitemap nennt. Unbekannte Hosts erledigt schon
 * `00.tenant.ts` (404, keine Default-Site).
 *
 * GESCHLOSSENE Communities (C18, `audience === 'members'`) antworten aus
 * demselben Grund 404, und zwar VOR dem Datenlesen: eine Sitemap ist eine
 * Einladung an Crawler, und die Seiten, die sie nennen würde, sind für Gäste
 * ohnehin zu. Dass die URLs selbst kein Geheimnis sind, ändert daran nichts —
 * eine Liste aller Seiten einer geschlossenen Community auszuliefern wäre
 * genau die Art Rest, die C18 meint.
 */

/** Darf der Plan dieses Mandanten den Feed (Produkt `posts`)? Serverseitige
 *  Sicht auf dieselbe Entscheidung, die `requirePlanProduct(event, 'posts')`
 *  an `/api/posts` trifft — nur als Frage statt als Wurf. Ohne Pool-Kontext
 *  (Silo/Einzelbetrieb) ist alles erlaubt, genau wie dort. */
function planAllowsFeed(tenant: TenantContext | null): boolean {
  if (tenant?.mode !== 'pool') return true
  const appConfig = useAppConfig() as {
    pukalani?: { tenancy?: { quota?: { plans?: Record<string, unknown> }, products?: Record<string, string | undefined> } }
  }
  const tenancy = appConfig.pukalani?.tenancy
  return planAllowsProduct(Object.keys(tenancy?.quota?.plans ?? {}), tenancy?.products, tenant.plan, 'posts')
}

/** Slugs der veröffentlichten CMS-Seiten dieses Mandanten. Best-effort: fällt
 *  der Read aus, bleibt die Sitemap bei den statischen Routen — eine kürzere
 *  Sitemap ist besser als ein 500 auf einer Crawler-URL. */
async function publishedSlugs(event: H3Event): Promise<string[]> {
  try {
    const res = await tenantDb(event, { as: 'operator' }).list<PageRow>(PAGES_TABLE, [
      Query.equal('status', 'published'),
      // NUR die Slug-Spalte: `body` ist MEDIUMTEXT (bis ~16 MB je Row) und
      // hätte in dieser Antwort nichts zu suchen.
      Query.select(['slug']),
      // Explizites Limit (Projektregel). 200 Rows = ~100 Slugs in zwei
      // Sprachen; darüber würde die Sitemap abschneiden, was für eine
      // Community-Site kein realistischer Fall ist.
      Query.limit(200),
    ])
    return res.rows.map(row => row.slug)
  }
  catch {
    return []
  }
}

export default defineEventHandler(async (event) => {
  if (event.context.controlCenter === true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!communityContentIsPublic(useTenant(event))) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const entries = tenantSitemapEntries({
    pageSlugs: await publishedSlugs(event),
    feed: planAllowsFeed(useTenant(event)),
  })

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Öffentlich + user-agnostisch (nur veröffentlichte Seiten, keine Session-
  // Daten). Kein Microcache im Prozess: der müsste nach tenantCacheScope
  // geschlüsselt sein, spart bei Crawler-Verkehr praktisch nichts und würde
  // eine gerade veröffentlichte Seite verzögert zeigen. HTTP-Caches
  // schlüsseln nach voller URL (inkl. Host) — kein Weg von Kunde A zu B.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return tenantSitemapXml(tenantRequestOrigin(event), entries)
})

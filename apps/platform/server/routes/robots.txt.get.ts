import { communityContentIsPublic } from '../../../../packages/core/shared/communityAudience'
import { controlHostRobotsTxt, membersOnlyRobotsTxt, tenantRobotsTxt } from '../utils/tenantSitemap'
import { tenantRequestOrigin } from '../utils/tenantRequestOrigin'

/**
 * robots.txt PRO HOST (Audit-Befund S6) — dieselbe Route, mehrere Antworten:
 *
 *  - ÖFFENTLICHER Mandanten-Host (kunde.pukalani.app): Allow + Sitemap-Zeile
 *    auf die EIGENE Origin. Die Community soll gefunden werden.
 *  - GESCHLOSSENER Mandanten-Host (C18, `audience === 'members'`): Disallow: /.
 *    Was nur Mitglieder sehen, gehört nicht in den Index — und die Seiten
 *    sagen zusätzlich `noindex` im Kopf (useLocaleSeoHead), weil robots.txt
 *    das Crawlen regelt, nicht das Indexieren bereits bekannter URLs.
 *  - KONTROLL-Host (my./start. — pukalani.tenancy.controlHosts): Disallow: /.
 *    Kundenbereich und Wizard sind kein SEO-Ziel.
 *  - unbekannter Host: 404 — das entscheidet aber nicht diese Route, sondern
 *    schon `00.tenant.ts` (kein Mandant → 404, KEINE Default-Site). Deshalb
 *    steht hier keine Verzweigung dafür.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // Öffentlich + user-agnostisch. HTTP-Caches schlüsseln nach voller URL
  // (inkl. Host), die Antwort eines Mandanten kann also nicht bei einem
  // anderen landen — anders als bei einem gemeinsamen In-Memory-Cache im
  // Prozess (dort gilt die tenantCacheScope-Regel).
  setHeader(event, 'cache-control', 'public, max-age=3600')

  if (event.context.controlCenter === true) return controlHostRobotsTxt()
  if (!communityContentIsPublic(useTenant(event))) return membersOnlyRobotsTxt()

  return tenantRobotsTxt(tenantRequestOrigin(event))
})

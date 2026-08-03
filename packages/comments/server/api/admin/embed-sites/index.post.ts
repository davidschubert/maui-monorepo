import { embedSiteSchema } from '../../../../schemas/embedSite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Einbetter-Site registrieren (E3) — Host landet in der frame-ancestors-CSP
 *  von /embed (Cache write-invalidiert, greift sofort). Doppelter Host → 409
 *  via uq_tenant_host (comments-015).
 *
 *  WER DARF (F37, 2026-08-02): `community.embed`. Der Gate hieß bis heute
 *  `requirePermission('system.manage')` — ein INSTANZ-Label, das ein
 *  Kunden-Owner nie trägt. Im Silo war das richtig und bleibt es (der
 *  Operator-Admin hält die Cap über ALL_CAPABILITIES); im Pool war das
 *  Einbetter-Register damit für den Besitzer der Community unerreichbar,
 *  obwohl die Landing das Widget als Teil von „Diskussionen" verkauft.
 *
 *  WER HANDELT (F17): weiterhin KEIN `actor: 'member'`. Das hier ist
 *  Betriebs-Konfiguration der Community (welche fremde Seite darf rahmen),
 *  kein INHALT — der Eintrag soll weder unter die Zahlungssperre fallen noch
 *  eine Mitgliedschaft auslösen. Die Mandantengrenze zieht trotzdem die
 *  Datentür: `create` stempelt communityId, `update`/`remove` belegen sie. */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.embed')
  const body = await readValidatedBody(event, embedSiteSchema.parse)

  // Datentür als Operator: stempelt den Mandanten (Unique ist seit
  // comments-015 (tenantId, host) — derselbe Host darf in zwei Communities
  // registriert sein, aber nicht doppelt in einer).
  const row = await tenantDb(event, { as: 'operator' }).create<EmbedSiteRow>(EMBED_SITES_TABLE, {
    host: body.host,
    label: body.label ?? '',
    targetTypes: body.targetTypes ?? [],
    active: body.active ?? true,
  }).catch((error) => { throw toH3Error(error, 'Could not create embed site') })

  invalidateEmbedSitesCache()
  return { id: row.$id, host: row.host, label: row.label, targetTypes: row.targetTypes ?? [], active: row.active !== false }
})

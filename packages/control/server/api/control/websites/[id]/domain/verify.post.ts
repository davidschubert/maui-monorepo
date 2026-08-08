import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../../shared/types/website'
import { advanceSiteDomain, siteDomainStateFor } from '../../../../../utils/siteDomainService'
import { callSiteSettle } from '../../../../../utils/siteSettle'

/**
 * BETREIBER-SEITE: „Prüfen" für eine Silo-Website — und zwar BIS ZUM ENDE
 * (control-036).
 *
 * ── DIE EINE STELLE, AN DER DIESER WEG MEHR TUT ALS DER SILO-WEG ─────────
 * Der Ablauf bis `pending_platform` ist derselbe (`advanceSiteDomain`). Der
 * letzte Schritt gehört aber der SITE — nur sie kann die
 * Appwrite-Web-Platform in ihrem eigenen Projekt anlegen (F45). Im
 * Silo-Dashboard tut das der eingeloggte Betreiber mit seinem JWT; hier steht
 * er in einer Konsole, die zu einem anderen Appwrite-Projekt gehört und
 * deshalb kein JWT der Site hat.
 *
 * Also ruft diese Route die Site an (`callSiteSettle`, Service-Secret) und
 * schreibt danach selbst — mit ihrer eigenen Berechtigung (`sites.manage`),
 * die sie ohnehin schon geprüft hat. Es gibt bewusst KEINEN zweiten Weg, auf
 * dem eine fremde Behauptung `active` setzen könnte: die Site meldet nur
 * ERFOLG ODER GRUND zurück, geschrieben wird hier.
 *
 * ── UND WENN DIE SITE NICHT ANTWORTET? ───────────────────────────────────
 * Dann bleibt es bei `pending_platform`, mit dem Grund im Fehlertext.
 * Dieselbe Regel wie überall: lieber sichtbar warten als „aktiv" behaupten.
 * Der Weg über das Silo-Dashboard bleibt daneben offen und holt es nach.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<WebsiteRow>({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Website not found') })

  if (!row.customDomain) {
    throw createError({ status: 400, statusText: 'No domain', data: { code: 'domain_missing' } })
  }

  const advance = await advanceSiteDomain(event, row)

  /**
   * ZWEI SCHREIBVORGÄNGE, UND DIE REIHENFOLGE IST NICHT KOSMETIK
   * (2026-08-07 im eigenen Beweis erwischt, Abschnitt 8: 409 `domain_not_ready`).
   *
   * Der Rückruf in die Silo-App fragt das Control Plane SELBST nach den
   * Hostnamen — sein Rumpf ist bewusst leer, damit das Service-Secret keine
   * fremden Origins freischalten kann. Die Site sieht dabei den Status, der
   * in der ZEILE steht. Wer erst `settle` ruft und danach schreibt, lässt sie
   * also den ALTEN Zustand lesen — sie lehnt mit 409 ab, weil sie noch nicht
   * `pending_platform` sieht, und die Freischaltung endet in einer
   * Fehlermeldung, die nach einem Rechteproblem aussieht.
   *
   * Also: erst den erreichten Stand festschreiben, dann rufen, dann quittieren.
   * Der Zwischenstand ist damit auch ehrlich sichtbar, wenn der Rückruf
   * hängt — genau das, was `pending_platform` bedeuten soll.
   */
  const write = async (data: Record<string, string | null>) =>
    await admin.tablesDB.updateRow<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE, rowId: row.$id, data,
    }).catch((error) => { throw toH3Error(error, 'Could not update domain state') })

  let saved = await write(advance.patch)

  if (advance.needsPlatformRegistration) {
    const settled = await callSiteSettle(event, row.appUrl || '')
    logEvent(settled.ok ? 'info' : 'warn', 'website.custom_domain_settle_called', {
      website: row.slug, added: settled.added.join(','), detail: settled.message.slice(0, 200),
    })
    saved = await write(settled.ok
      ? { customDomainStatus: 'active', customDomainError: '', customDomainActivatedAt: new Date().toISOString() }
      : { customDomainError: settled.message.slice(0, 500) })
  }

  logEvent('info', 'website.custom_domain_checked', {
    website: row.slug, via: 'operator', domain: row.customDomain,
    status: saved.customDomainStatus ?? '', detail: advance.error.slice(0, 200),
  })

  return siteDomainStateFor(event, saved)
})

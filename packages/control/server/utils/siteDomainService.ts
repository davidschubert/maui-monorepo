/**
 * EIGENE DOMAIN JE SILO — der Ablauf, den ein Prüf-Klick auslöst (control-036).
 *
 * Das Gegenstück zu `customDomainService.ts` (Pool). Die REIHENFOLGE ist
 * dieselbe und die REGELN sind buchstäblich dieselben Funktionen — was sich
 * unterscheidet, sind genau drei Dinge, und die stehen alle hier:
 *
 *   1. Die Zeile ist eine `websites`-Zeile, nicht `communities`.
 *   2. Bei ploi wird ein ALIAS an der Site gesetzt statt eines TENANTS, und
 *      das Zertifikat deckt ALLE Namen der Site ab (sonst verliert der alte
 *      Host sein TLS — s. ploi.ts).
 *   3. Es gibt keinen Plan. Silos sind das Studio-Angebot; Pläne sind
 *      Pool-Sache (CLAUDE.md). Es wird also nicht „true zurückgegeben",
 *      sondern gar nicht gefragt.
 *
 * ── RE-ENTRANT STATT HINTERGRUND-JOB ──────────────────────────────────────
 * Wie im Pool: EINE Funktion, beliebig oft aufrufbar, kommt jedes Mal so weit
 * wie sie kommt, wirft nie. Die Bedienung ist der „Prüfen"-Knopf — im
 * Silo-Dashboard ODER in der Betreiber-Konsole; beide rufen dasselbe hier.
 */
import type { H3Event } from 'h3'
import {
  customDomainForms,
  customDomainVerifyRecordName,
  customDomainVerifyRecordValue,
} from '../../shared/customDomain'
import {
  siteDomainStatusOf,
  websiteCanonicalHost,
  websiteFallbackHost,
  websiteKnownHosts,
} from '../../shared/siteDomain'
import type { WebsiteRow } from '../../shared/types/website'
import type { SiteDomainAddress, SiteDomainState, SiteDomainStatus } from '../../../core/shared/types/siteDomain'
import { checkDomainDns, domainAnswersOverHttps } from './customDomainDns'
import { customDomainSettings } from './customDomainService'
import {
  ensurePloiAliases,
  listPloiSiteAliases,
  ploiConfigForSite,
  ploiConfigured,
  requestPloiSiteCertificate,
  siteCertificateDomains,
} from './ploi'

/** ploi-Konfiguration DIESER Website (Ids aus der Zeile, Token aus der Env). */
export function siteploi(event: H3Event, row: WebsiteRow) {
  return ploiConfigForSite(event, { serverId: row.ploiServerId, siteId: row.ploiSiteId })
}

/**
 * Die MAGERE Auskunft für die Middleware — ohne Token, ohne Fehlertext.
 *
 * Sie hat eine eigene Funktion (und weiter unten eine eigene Route), weil sie
 * ein anderes PUBLIKUM hat: die Middleware läuft vor jedem Request, auch für
 * Gäste, und darf deshalb nichts erfahren, was nicht ohnehin im DNS steht.
 */
export function siteDomainAddressFor(row: WebsiteRow): SiteDomainAddress {
  const domain = row.customDomain || ''
  return {
    canonicalHost: websiteCanonicalHost(row),
    fallbackHost: websiteFallbackHost(row.appUrl),
    knownHosts: websiteKnownHosts(row),
    domain,
    status: siteDomainStatusOf(row),
    forms: domain ? customDomainForms(domain) : [],
  }
}

/** Der volle Zustand fürs Dashboard (Silo-Seite und Betreiber-Konsole). */
export function siteDomainStateFor(event: H3Event, row: WebsiteRow): SiteDomainState {
  const settings = customDomainSettings(event)
  const domain = row.customDomain || ''
  const forms = domain ? customDomainForms(domain) : []
  return {
    ...siteDomainAddressFor(row),
    error: row.customDomainError || '',
    verifiedAt: row.customDomainVerifiedAt ?? null,
    activatedAt: row.customDomainActivatedAt ?? null,
    // Nicht „ist ploi erreichbar", sondern „steht bei DIESER Website, wohin".
    // Die Seite soll den Unterschied sagen können, statt in `pending_cert` zu
    // stehen und den Betreiber raten zu lassen.
    ploiConfigured: ploiConfigured(siteploi(event, row)),
    instructions: {
      txtName: domain ? customDomainVerifyRecordName(domain) : '',
      txtValue: row.customDomainToken ? customDomainVerifyRecordValue(row.customDomainToken) : '',
      cnameTarget: settings.cnameTarget,
      serverIps: settings.serverIps,
      apexForm: forms.find(form => !form.startsWith('www.')) ?? null,
      wwwForm: forms.find(form => form.startsWith('www.')) ?? null,
    },
  }
}

export interface SiteDomainAdvance {
  patch: Record<string, string | null>
  status: SiteDomainStatus
  error: string
  /** true = der nächste Schritt gehört der SILO-APP (Appwrite-Web-Platform,
   *  F45). Das Control Plane hat für fremde Projekte keinen Schlüssel. */
  needsPlatformRegistration: boolean
}

/**
 * EIN Schritt weiter, so weit es geht. Wirft NIE.
 *
 *   1. TXT-Nachweis + Zeige-Prüfung        → sonst `pending_dns`
 *   2. Alias an der Site + Zertifikat      → sonst `pending_cert`
 *   3. antwortet die Domain über HTTPS?    → sonst `pending_cert`
 *   4. Appwrite-Web-Platform (Silo-App)    → `pending_platform`
 *
 * DIE ZEIGE-PRÜFUNG GILT NUR FÜR DIE KANONISCHE FORM — wie im Pool: die
 * Geschwister-Form ist Zugabe und darf fehlen, ohne die Freischaltung
 * aufzuhalten. IM ZERTIFIKAT ist sie trotzdem nur dann enthalten, wenn sie
 * zeigt: HTTP-01 prüft JEDEN Namen einzeln, und ein einziger nicht
 * auflösender Name lässt die GESAMTE Anforderung scheitern. Ein Kunde, dessen
 * Apex-Anbieter kein CNAME kann, bekäme sonst gar kein Zertifikat.
 */
export async function advanceSiteDomain(event: H3Event, row: WebsiteRow): Promise<SiteDomainAdvance> {
  const domain = row.customDomain || ''
  const token = row.customDomainToken || ''
  if (!domain || !token) {
    return { patch: {}, status: 'none', error: '', needsPlatformRegistration: false }
  }

  const settings = customDomainSettings(event)
  const forms = customDomainForms(domain)
  const now = new Date().toISOString()

  const stop = (status: SiteDomainStatus, error: string): SiteDomainAdvance => ({
    patch: { customDomainStatus: status, customDomainError: error.slice(0, 500) },
    status,
    error,
    needsPlatformRegistration: false,
  })
  const halt = (error: string): SiteDomainAdvance => ({
    patch: { customDomainStatus: 'pending_cert', customDomainError: error.slice(0, 500), customDomainVerifiedAt: now },
    status: 'pending_cert',
    error,
    needsPlatformRegistration: false,
  })

  // ── 1. Gehört die Domain dieser Website, und zeigt sie auf uns? ───────────
  const dns = await checkDomainDns(forms, token, settings)
  if (!dns.owned) {
    return stop('pending_dns', dns.error
      ? `TXT-Eintrag ${dns.txtRecordName} nicht gefunden (${dns.error}).`
      : `TXT-Eintrag ${dns.txtRecordName} nicht gefunden.`)
  }
  if (!dns.canonicalPointing) {
    return stop('pending_dns', `${domain} zeigt noch nicht auf uns.${dns.error ? ` (${dns.error})` : ''}`)
  }

  // ── 2. Alias an der Site + EIN Zertifikat über alle Namen ────────────────
  const ploi = siteploi(event, row)
  const aliased = await ensurePloiAliases(ploi, dns.pointingForms)
  if (!aliased.ok) return halt(aliased.message)

  // Erst NACH dem Alias lesen: die Liste soll die neuen Namen schon enthalten,
  // damit das Zertifikat sie trägt.
  const info = await listPloiSiteAliases(ploi)
  if (!info.ok) return halt(info.message)
  const certDomains = siteCertificateDomains(info.info, dns.pointingForms)
  const cert = await requestPloiSiteCertificate(ploi, certDomains)
  if (!cert.ok) return halt(cert.message)

  // ── 3. Antwortet die Domain wirklich über HTTPS? ─────────────────────────
  // Im Trockenlauf übersprungen — dieselbe ehrliche Grenze wie im Pool: ohne
  // echtes DNS und echtes Let's Encrypt gibt es kein Zertifikat, das man
  // messen könnte.
  if (!settings.dryRun) {
    const https = await domainAnswersOverHttps(domain)
    if (!https.ok) return halt(`Zertifikat noch nicht aktiv (${https.error}).`)
  }

  // ── 4. Der letzte Schritt gehört der Silo-App (F45) ──────────────────────
  return {
    patch: { customDomainStatus: 'pending_platform', customDomainError: '', customDomainVerifiedAt: now },
    status: 'pending_platform',
    error: '',
    needsPlatformRegistration: true,
  }
}

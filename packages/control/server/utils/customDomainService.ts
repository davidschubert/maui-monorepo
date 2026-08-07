/**
 * EIGENE DOMAIN — der Ablauf, den ein Prüf-Klick auslöst.
 *
 * Hier laufen die drei Außenwelten zusammen, die eine Kundendomain braucht:
 * DNS (`customDomainDns.ts`), Zertifikat + nginx (`ploi.ts`) und die
 * `communities`-Zeile. Die REGELN dazu stehen woanders und sind pur
 * (`shared/customDomain.ts`) — hier steht nur die Reihenfolge und was bei
 * jedem Fehlschlag in der Zeile landet.
 *
 * ── RE-ENTRANT STATT HINTERGRUND-JOB ──────────────────────────────────────
 * Es gibt bewusst KEINEN Sweep und keine Warteschlange. Der Ablauf ist EINE
 * Funktion, die man beliebig oft aufrufen kann und die jedes Mal so weit
 * kommt, wie sie kommt — die Bedienung ist der „Prüfen"-Knopf im Dashboard.
 *
 * Begründung: die Wartezeiten hängen an FREMDEN Uhren (DNS-Verbreitung,
 * Let's Encrypt), die niemand kennt. Ein Job, der alle fünf Minuten pollt,
 * wäre für den Kunden nicht schneller (er schaut ohnehin auf die Seite), er
 * würde uns aber eine Zustandsmaschine mit Wiederholungen, Rückzugsstaffeln
 * und Aufräum-Fällen eintragen, für die es beim ersten Kunden noch keinen
 * einzigen Messwert gibt. Wenn sich das als falsch erweist, ist der Sweep ein
 * Aufruf DIESER Funktion — nicht ein zweiter Ablauf daneben.
 *
 * ── WAS AUF KEINEN FALL PASSIEREN DARF ────────────────────────────────────
 * `status: 'active'`, ohne dass die Domain wirklich über HTTPS antwortet.
 * Aktiv heißt: die Subdomain leitet mit 301 dorthin um (Davids Entscheidung 2).
 * Eine Umleitung auf ein Zertifikats-Warnschild ist schlimmer als jede
 * Wartezeit — deshalb glauben wir ploi nicht, sondern fragen die Domain
 * selbst.
 */
import type { H3Event } from 'h3'
import {
  canonicalHostFor,
  customDomainForms,
  customDomainVerifyRecordName,
  customDomainVerifyRecordValue,
  resolveCustomDomainStatus,
  type CustomDomainStatus,
} from '../../shared/customDomain'
import { normalizeTenantPlan, type TenantPlan, type TenantRow } from '../../shared/types/tenantRecord'
import { checkDomainDns, domainAnswersOverHttps } from './customDomainDns'
import { ensurePloiTenants, isDryRunFlag, ploiConfig, requestPloiTenantCertificate } from './ploi'

export interface CustomDomainSettings {
  serverIps: string[]
  cnameTarget: string
  dnsServers: string[]
  dryRun: boolean
}

/**
 * Wohin der Kunde zeigen soll. Build-Default + Env-Override (Muster wie
 * `controlPoolProject`): die IP steht ohnehin öffentlich im Repo, sie ist kein
 * Geheimnis — aber sie WECHSELT bei einem Server-Umzug, und dann darf man
 * dafür kein Deploy brauchen.
 */
export function customDomainSettings(event: H3Event): CustomDomainSettings {
  const config = useRuntimeConfig(event) as {
    customDomainServerIps?: string
    customDomainCnameTarget?: string
    customDomainDnsServers?: string
    customDomainDryRun?: string
  }
  const list = (value: string | undefined) => (value || '').split(',').map(entry => entry.trim()).filter(Boolean)
  return {
    serverIps: list(config.customDomainServerIps),
    cnameTarget: (config.customDomainCnameTarget || '').trim().toLowerCase(),
    dnsServers: list(config.customDomainDnsServers),
    // Dieselbe tolerante Lesart wie in ploi.ts — `destr()` macht aus einer
    // Env-`1` eine ZAHL, und `1 === '1'` ist falsch (2026-08-07 live erwischt).
    dryRun: isDryRunFlag(config.customDomainDryRun),
  }
}

/** Was das Dashboard über die Domain dieser Community erfährt. Der Token reist
 *  NUR als fertiger TXT-Wert mit — der Owner soll ihn kopieren, nicht deuten. */
export interface CustomDomainState {
  domain: string
  status: CustomDomainStatus
  /** Fehlertext für den Owner ('' = keiner). */
  error: string
  /** Beide Formen, die eingetragene zuerst. */
  forms: string[]
  verifiedAt: string | null
  activatedAt: string | null
  /** Unter welcher Adresse die Community gerade zu Hause ist. */
  canonicalHost: string
  /** Die Pukalani-Subdomain — sie bleibt Rückfall (Davids Entscheidung 2). */
  fallbackHost: string
  plan: TenantPlan
  /** Reicht der Plan? (Die Route setzt es durch; das hier ist für die Anzeige.) */
  planAllows: boolean
  instructions: {
    txtName: string
    txtValue: string
    cnameTarget: string
    serverIps: string[]
    /** Die Form ohne `www.` — braucht einen A-Record. `null` = gibt es nicht. */
    apexForm: string | null
    /** Die Form mit `www.` — nimmt am besten ein CNAME. `null` = gibt es nicht. */
    wwwForm: string | null
  }
}

export function customDomainStateFor(event: H3Event, row: TenantRow): CustomDomainState {
  const settings = customDomainSettings(event)
  const domain = row.customDomain || ''
  const forms = domain ? customDomainForms(domain) : []
  const plan = normalizeTenantPlan(row.plan)
  return {
    domain,
    status: resolveCustomDomainStatus(row.customDomainStatus),
    error: row.customDomainError || '',
    forms,
    verifiedAt: row.customDomainVerifiedAt ?? null,
    activatedAt: row.customDomainActivatedAt ?? null,
    canonicalHost: canonicalHostFor(row),
    fallbackHost: row.host,
    plan,
    planAllows: plan === 'pro',
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

/** Was `advanceCustomDomain` in die Zeile schreiben will. */
export interface CustomDomainAdvance {
  patch: Record<string, string | null>
  status: CustomDomainStatus
  error: string
  /**
   * true = der nächste Schritt gehört der RUNTIME (Appwrite-Web-Platform, F45).
   * Das Control Plane hat für das Pool-Projekt keinen Schlüssel — dieselbe
   * Grenze wie bei `revokeCommunityLabel` (A5) und der Zahlungswarnung (C15).
   */
  needsPlatformRegistration: boolean
}

/**
 * EIN Schritt weiter, so weit es geht. Wirft NIE.
 *
 * Reihenfolge (jede Stufe ist Voraussetzung der nächsten):
 *   1. TXT-Nachweis + Zeige-Prüfung        → sonst `pending_dns`
 *   2. nginx-vHost + Zertifikat bei ploi    → sonst `pending_cert`
 *   3. antwortet die Domain über HTTPS?     → sonst `pending_cert`
 *   4. Appwrite-Web-Platform (Runtime)      → `pending_platform`
 *
 * DIE ZEIGE-PRÜFUNG GILT NUR FÜR DIE KANONISCHE FORM. Die Geschwister-Form
 * (www ↔ Apex) ist Zugabe: fehlt ihr A-/CNAME-Record, bekommt sie kein
 * Zertifikat und wird übersprungen — die Freischaltung hält das NICHT auf.
 * Andernfalls hinge Davids Entscheidung 4 („www + Apex automatisch") als
 * Blockade an einem Eintrag, den viele DNS-Oberflächen für einen Apex gar
 * nicht anbieten.
 */
export async function advanceCustomDomain(event: H3Event, row: TenantRow): Promise<CustomDomainAdvance> {
  const domain = row.customDomain || ''
  const token = row.customDomainToken || ''
  if (!domain || !token) {
    return { patch: {}, status: 'none', error: '', needsPlatformRegistration: false }
  }

  const settings = customDomainSettings(event)
  const forms = customDomainForms(domain)
  const now = new Date().toISOString()

  const stop = (status: CustomDomainStatus, error: string): CustomDomainAdvance => ({
    patch: { customDomainStatus: status, customDomainError: error.slice(0, 500) },
    status,
    error,
    needsPlatformRegistration: false,
  })

  // ── 1. Gehört die Domain dieser Community, und zeigt sie auf uns? ─────────
  const dns = await checkDomainDns(forms, token, settings)
  if (!dns.owned) {
    return stop('pending_dns', dns.error
      ? `TXT-Eintrag ${dns.txtRecordName} nicht gefunden (${dns.error}).`
      : `TXT-Eintrag ${dns.txtRecordName} nicht gefunden.`)
  }
  if (!dns.canonicalPointing) {
    return stop('pending_dns', `${domain} zeigt noch nicht auf uns.${dns.error ? ` (${dns.error})` : ''}`)
  }

  // ── 2. nginx + Zertifikat ────────────────────────────────────────────────
  // Beide Formen bekommen ihren vHost; ein Zertifikat nur die, die auch
  // wirklich hierher zeigt (HTTP-01 scheitert sonst und ploi meldet einen
  // Fehler für einen Namen, den der Kunde nie angelegt hat).
  const tenants = await ensurePloiTenants(ploiConfig(event), forms)
  if (!tenants.ok) {
    return {
      patch: { customDomainStatus: 'pending_cert', customDomainError: tenants.message.slice(0, 500), customDomainVerifiedAt: now },
      status: 'pending_cert',
      error: tenants.message,
      needsPlatformRegistration: false,
    }
  }

  const certErrors: string[] = []
  for (const form of dns.pointingForms) {
    const cert = await requestPloiTenantCertificate(ploiConfig(event), form)
    if (!cert.ok) certErrors.push(`${form}: ${cert.message}`)
  }
  if (certErrors.length) {
    logEvent('warn', 'community.custom_domain_cert_failed', {
      communityId: row.$id,
      domain,
      detail: certErrors.join(' · ').slice(0, 400),
    })
  }
  // NUR die kanonische Form hält auf. Scheitert die Geschwister-Form, wird das
  // protokolliert und ignoriert — sie ist Zugabe, und ein Kunde soll nicht auf
  // seiner Hauptadresse warten, weil sein Apex-Anbieter kein CNAME kann.
  if (certErrors.some(entry => entry.startsWith(`${domain}:`))) {
    return {
      patch: { customDomainStatus: 'pending_cert', customDomainError: certErrors.join(' · ').slice(0, 500), customDomainVerifiedAt: now },
      status: 'pending_cert',
      error: certErrors.join(' · '),
      needsPlatformRegistration: false,
    }
  }

  // ── 3. Antwortet die Domain wirklich über HTTPS? ─────────────────────────
  // IM TROCKENLAUF ÜBERSPRUNGEN, und das ist die ehrliche Grenze dieses
  // Modus: ohne echtes DNS und echtes Let's Encrypt gibt es kein Zertifikat,
  // das man messen könnte. Der Trockenlauf beweist die ZUSTANDSÜBERGÄNGE,
  // nicht das TLS — der echte Weg wird beim ersten Kunden bewiesen
  // (docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md).
  if (!settings.dryRun) {
    const https = await domainAnswersOverHttps(domain)
    if (!https.ok) {
      return {
        patch: { customDomainStatus: 'pending_cert', customDomainError: `Zertifikat noch nicht aktiv (${https.error}).`.slice(0, 500), customDomainVerifiedAt: now },
        status: 'pending_cert',
        error: `Zertifikat noch nicht aktiv (${https.error}).`,
        needsPlatformRegistration: false,
      }
    }
  }

  // ── 4. Der letzte Schritt gehört der Runtime (F45) ───────────────────────
  return {
    patch: { customDomainStatus: 'pending_platform', customDomainError: '', customDomainVerifiedAt: now },
    status: 'pending_platform',
    error: '',
    needsPlatformRegistration: true,
  }
}

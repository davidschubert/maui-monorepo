/**
 * ploi — der schmale Ausschnitt, den wir für eigene Domains brauchen.
 *
 * ploi kennt „Tenants": zusätzliche Hostnamen an EINER Site, jeder mit eigenem
 * nginx-vHost und eigenem Zertifikat. Genau die Form, die eine Kundendomain
 * braucht — sie soll dieselbe `platform`-App bedienen wie die Subdomain, nur
 * unter anderem Namen.
 *
 * ── DIE TLS-FALLE, DIE HIER NICHT ZUSCHLAGEN DARF ─────────────────────────
 * CLAUDE.md nennt sie beim Namen, und sie hat platform+demo schon 40 Minuten
 * gekostet: ploi benennt die certbot-Lineage nach der ROOT-DOMAIN DER SITE.
 * Eine Zertifikatsanforderung auf der Site `pukalani.app` überschreibt deshalb
 * das Kunden-Wildcard `*.pukalani.app`. **Hier wird niemals ein Zertifikat für
 * eine Site angefordert** — ausschließlich für TENANTS, und ein Tenant hat
 * seine eigene Lineage unter seinem eigenen Namen. Der Aufruf, den man nicht
 * bauen darf, ist `POST /servers/:s/sites/:site/certificates`; er kommt in
 * dieser Datei bewusst nicht vor.
 *
 * Die DNS-01-Regel aus CLAUDE.md gilt für UNSERE eigenen Wildcards. Eine
 * Kundendomain geht über **HTTP-01**, und das ist kein Widerspruch: sobald der
 * Tenant angelegt ist, steht sein Name in nginx, Port 80 antwortet für ihn,
 * und die HTTP-Prüfung kommt durch. Genau daran scheiterte sie bei Aliassen
 * und Wildcards.
 *
 * ── FAIL-SOFT MIT EHRLICHEM STATUS ────────────────────────────────────────
 * Kein Token, keine Ids, ploi antwortet 500 — nichts davon wird verschluckt
 * und nichts davon wird zu „aktiv". Jede Funktion gibt `{ ok, message }`
 * zurück, der Aufrufer schreibt den Text in `communities.customDomainError`
 * und bleibt in `pending_cert` stehen.
 *
 * ── TROCKENLAUF ───────────────────────────────────────────────────────────
 * `NUXT_CUSTOM_DOMAIN_DRY_RUN=1` lässt ALLE Zustandsübergänge laufen, ohne
 * ploi anzufassen. Das ist der Modus, in dem der Beweis lokal fährt — die
 * echte Zertifikatskette ist ohne echte DNS und echte Let's-Encrypt-Prüfung
 * nicht herstellbar, und ein Mock, der immer grün ist, wäre kein Beweis,
 * sondern eine Attrappe.
 */
import type { H3Event } from 'h3'

export interface PloiConfig {
  token: string
  baseUrl: string
  serverId: string
  siteId: string
  /** true = alles rechnen, nichts anfassen. */
  dryRun: boolean
}

export interface PloiResult {
  ok: boolean
  /** Für den Owner lesbar gemacht; '' bei Erfolg. */
  message: string
  /** true = wir haben absichtlich nichts getan (Trockenlauf oder nicht
   *  konfiguriert). Der Aufrufer unterscheidet das von einem Fehlschlag. */
  skipped?: boolean
}

/**
 * PURE: ist der Trockenlauf an? — und warum das nicht `=== '1'` sein darf.
 *
 * 2026-08-07 LIVE ERWISCHT, beim ersten vollen Rundlauf. Der Wert steht in
 * `runtimeConfig` mit dem Default `''`, ist also ein STRING. Nuxt schiebt eine
 * Env-Überschreibung aber durch `destr()` — aus `NUXT_CUSTOM_DOMAIN_DRY_RUN=1`
 * wird die ZAHL 1, und `1 === '1'` ist falsch. Der Beweis lief damit gegen
 * echtes ploi statt im Trockenlauf und meldete „ploi ist nicht konfiguriert";
 * das sah aus wie ein fehlendes Token und war ein Typ.
 *
 * Der Nachbar `NUXT_CUSTOM_DOMAIN_DNS_SERVERS=127.0.0.1:5354` war unauffällig
 * — den kann `destr` nicht in eine Zahl verwandeln. Genau deshalb fällt so
 * etwas nur bei EINEM von mehreren Schaltern auf.
 *
 * Angenommen wird deshalb, was ein Mensch schreiben würde: `1`, `true`, `yes`,
 * `on`. Alles andere (auch das leere Feld) heißt aus.
 */
export function isDryRunFlag(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

/**
 * Dieselbe Konfiguration, aber für eine SILO-Site (control-036).
 *
 * Token, Basis-URL und Trockenlauf kommen weiter aus der Env — sie gelten für
 * das ganze Control Plane. Server und Site kommen aus der `websites`-ZEILE:
 * jedes Silo hat seine eigene ploi-Site (portfolio 390041, comments 389772),
 * und die Zuordnung ist Betriebsdatum, kein Code. Leer ⇒ `ploiConfigured()`
 * ist falsch und der Zertifikatsschritt hält ehrlich an.
 */
export function ploiConfigForSite(event: H3Event, site: { serverId?: string | null, siteId?: string | null }): PloiConfig {
  return {
    ...ploiConfig(event),
    serverId: (site.serverId || '').trim(),
    siteId: (site.siteId || '').trim(),
  }
}

export function ploiConfig(event: H3Event): PloiConfig {
  const config = useRuntimeConfig(event) as {
    ploiToken?: string
    ploiBaseUrl?: string
    ploiServerId?: string
    ploiSiteId?: string
    customDomainDryRun?: string
  }
  return {
    token: (config.ploiToken || '').trim(),
    baseUrl: (config.ploiBaseUrl || 'https://ploi.io/api').trim().replace(/\/+$/, ''),
    serverId: (config.ploiServerId || '').trim(),
    siteId: (config.ploiSiteId || '').trim(),
    dryRun: isDryRunFlag(config.customDomainDryRun),
  }
}

/** Vollständig konfiguriert? (Token UND beide Ids — eine halbe Konfiguration
 *  ist dasselbe wie keine, nur schwerer zu bemerken.) */
export function ploiConfigured(config: PloiConfig): boolean {
  return Boolean(config.token && config.serverId && config.siteId)
}

async function ploiFetch(
  config: PloiConfig,
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE', body?: unknown },
): Promise<{ ok: boolean, status: number, data: unknown, message: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    }
    catch {
      data = text
    }
    if (!response.ok) {
      // Der ploi-Rumpf trägt bei Validierungsfehlern ein `message`. Er wird
      // MITGENOMMEN, aber gekürzt — er ist eine Hilfe für den Kunden („domain
      // already exists"), kein Ort für Stack-Traces.
      const message = typeof (data as { message?: string })?.message === 'string'
        ? (data as { message: string }).message
        : text.slice(0, 200)
      return { ok: false, status: response.status, data, message: `ploi ${response.status}: ${message}`.slice(0, 400) }
    }
    return { ok: true, status: response.status, data, message: '' }
  }
  catch (error) {
    return { ok: false, status: 0, data: null, message: `ploi nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`.slice(0, 400) }
  }
  finally {
    clearTimeout(timer)
  }
}

/** Die Hostnamen, die diese Site außer ihrer eigenen Domain bedient. */
export async function listPloiTenants(config: PloiConfig): Promise<{ ok: boolean, tenants: string[], message: string }> {
  // TROCKENLAUF ZUERST, VOR der Konfigurationsprüfung — sonst könnte man den
  // Ablauf lokal gar nicht durchspielen: ohne Token wäre jeder Lauf ein
  // „nicht konfiguriert", und der Beweis würde die Zustandsübergänge nie
  // erreichen, die er zeigen soll.
  if (config.dryRun) return { ok: true, tenants: [], message: '' }
  if (!ploiConfigured(config)) return { ok: false, tenants: [], message: 'ploi ist nicht konfiguriert (Token/Server/Site).' }
  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/tenants`, { method: 'GET' })
  if (!result.ok) return { ok: false, tenants: [], message: result.message }
  const raw = (result.data as { data?: { tenants?: unknown } })?.data?.tenants
  const tenants = Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
  return { ok: true, tenants, message: '' }
}

/**
 * Hostnamen an die Site hängen — IDEMPOTENT, indem vorher gelesen wird.
 *
 * ploi wirft bei einem bekannten Tenant je nach Version 422 oder nimmt ihn
 * still noch einmal an; auf beides zu bauen wäre Raten. Ein Prüf-Klick darf
 * beliebig oft passieren (er ist die einzige Bedienung dieses Ablaufs), also
 * muss dieser Aufruf beliebig oft passieren dürfen.
 */
export async function ensurePloiTenants(config: PloiConfig, hosts: string[]): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist nicht konfiguriert — das Zertifikat muss der Betreiber anlegen.' }
  }

  const existing = await listPloiTenants(config)
  if (!existing.ok) return { ok: false, message: existing.message }
  const missing = hosts.filter(host => !existing.tenants.includes(host))
  if (!missing.length) return { ok: true, message: '' }

  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/tenants`, {
    method: 'POST',
    body: { tenants: missing },
  })
  return { ok: result.ok, message: result.message }
}

/**
 * Zertifikat für EINEN Tenant anfordern (HTTP-01, Let's Encrypt über ploi).
 *
 * ASYNCHRON: ploi nimmt die Anfrage an und arbeitet sie ab. Ein `ok: true`
 * heißt „beauftragt", NICHT „liegt" — deshalb prüft der Aufrufer danach die
 * Domain selbst (`domainAnswersOverHttps`) und bleibt bis dahin in
 * `pending_cert`.
 *
 * JE TENANT EIN EIGENES ZERTIFIKAT, statt eines gemeinsamen über den
 * `domains`-Parameter: beide Formen sind eigene Tenants mit eigenem vHost, und
 * ploi installiert ein Zertifikat in den vHost DES TENANTS, für den es
 * angefordert wurde. Ein gemeinsames Zertifikat läge nur in einem der beiden —
 * die andere Form hätte einen Namen ohne Zertifikat, also genau die
 * Warnseite, die wir vermeiden wollen.
 */
export async function requestPloiTenantCertificate(config: PloiConfig, host: string): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist nicht konfiguriert — das Zertifikat muss der Betreiber anlegen.' }
  }
  const result = await ploiFetch(
    config,
    `/servers/${config.serverId}/sites/${config.siteId}/tenants/${encodeURIComponent(host)}/request-certificate`,
    { method: 'POST' },
  )
  return { ok: result.ok, message: result.message }
}

/* ──────────────────────────────────────────────────────────────────────────
 * SILO-SITES: ALIASSE STATT TENANTS (control-036, 2026-08-07)
 *
 * Eine Pool-Kundendomain wird ein ploi-TENANT: eigener vHost, eigenes
 * Zertifikat, eigene Lineage — weil die `platform`-Site das Kunden-Wildcard
 * `*.pukalani.app` trägt und dort NIE ein Site-Zertifikat angefordert werden
 * darf (CLAUDE.md, der 40-Minuten-Vorfall).
 *
 * Bei einem SILO ist das anders, und zwar nachgemessen: die Site
 * `portfolio.pukalani.app` (390041) hat ein einzelnes Let's-Encrypt-Zertifikat
 * mit `domain: "portfolio.pukalani.app"`, `tenant: false` — eine EIGENE
 * Lineage, die mit dem Wildcard nichts zu tun hat. Ein Silo bedient außerdem
 * genau EINE App; die Kundendomain soll denselben vHost bekommen, nicht einen
 * zweiten daneben. Also: ALIAS an der Site + EIN Zertifikat über alle Namen
 * der Site.
 *
 * ── DAS „ALLE NAMEN" IST DIE GANZE VORSICHT ───────────────────────────────
 * certbot ersetzt eine Lineage durch die Namen, die man ihr gibt. Fordert man
 * ein Zertifikat NUR für `www.pukalani.studio` an, verliert
 * `portfolio.pukalani.app` sein TLS — der alte Host wäre tot, und zwar genau
 * der, der laut Zusage Rückfall bleiben soll. Deshalb baut
 * `siteCertificateDomains()` die Liste aus Site-Domain + bestehenden Aliassen
 * + neuer Domain, und die SITE-DOMAIN STEHT VORNE: certbot benennt die
 * Lineage nach dem ersten Namen, und sie soll weiter `portfolio.pukalani.app`
 * heißen.
 * ────────────────────────────────────────────────────────────────────────── */

export interface PloiSiteInfo {
  /** Die Haupt-Domain der Site (`portfolio.pukalani.app`). */
  main: string
  /** Die zusätzlich bedienten Namen. */
  aliases: string[]
}

/** Haupt-Domain + Aliasse einer Site. */
export async function listPloiSiteAliases(config: PloiConfig): Promise<{ ok: boolean, info: PloiSiteInfo, message: string }> {
  const empty: PloiSiteInfo = { main: '', aliases: [] }
  if (config.dryRun) return { ok: true, info: empty, message: '' }
  if (!ploiConfigured(config)) return { ok: false, info: empty, message: 'ploi ist nicht konfiguriert (Token/Server/Site).' }
  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/aliases`, { method: 'GET' })
  if (!result.ok) return { ok: false, info: empty, message: result.message }
  const data = (result.data as { data?: { aliases?: unknown, main?: unknown } })?.data
  return {
    ok: true,
    info: {
      main: typeof data?.main === 'string' ? data.main : '',
      aliases: Array.isArray(data?.aliases) ? data.aliases.filter((entry): entry is string => typeof entry === 'string') : [],
    },
    message: '',
  }
}

/**
 * Die Hostnamen an die Site hängen — und HINTERHER NACHSEHEN, ob sie hängen.
 *
 * ── WARUM DIE VEREINIGUNG GESCHICKT WIRD ──────────────────────────────────
 * ploi dokumentiert diesen Endpunkt als „Aliasse hinzufügen"; seine
 * Oberfläche zeigt aber EIN Feld mit allen Aliassen, was für „setzen" spricht.
 * Beides ist plausibel, und geraten wird hier nichts: geschickt wird die
 * VEREINIGUNG aus bestehenden und neuen Namen. Unter „setzen" ist das exakt
 * richtig (nichts geht verloren), unter „hinzufügen" ist es höchstens
 * überflüssig.
 *
 * ── UND WARUM DANACH NOCH EINMAL GELESEN WIRD ─────────────────────────────
 * Weil eine Vermutung über eine fremde API kein Beweis ist. Ein `2xx` von ploi
 * heißt „angenommen"; ob der Name danach wirklich im `server_name` steht, sagt
 * nur die Liste. Steht er nicht drin, endet das hier mit einem ehrlichen
 * Fehler statt mit einer Zertifikatsanforderung für einen Namen, den nginx
 * nicht kennt (die scheitert dann bei Let's Encrypt und sieht aus wie ein
 * DNS-Problem des Kunden).
 */
export async function ensurePloiAliases(config: PloiConfig, hosts: string[]): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist für diese Website nicht hinterlegt (Server-/Site-Id fehlt).' }
  }

  const existing = await listPloiSiteAliases(config)
  if (!existing.ok) return { ok: false, message: existing.message }

  // Die Haupt-Domain ist KEIN Alias — stünde sie in der Liste, träge ploi sie
  // ein zweites Mal in `server_name` ein und nginx würde den vHost verwerfen.
  const wanted = hosts.filter(host => host && host !== existing.info.main)
  const missing = wanted.filter(host => !existing.info.aliases.includes(host))
  if (!missing.length) return { ok: true, message: '' }

  const union = [...new Set([...existing.info.aliases, ...wanted])]
  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/aliases`, {
    method: 'POST',
    body: { aliases: union },
  })
  if (!result.ok) return { ok: false, message: result.message }

  const after = await listPloiSiteAliases(config)
  if (!after.ok) return { ok: false, message: after.message }
  const stillMissing = wanted.filter(host => !after.info.aliases.includes(host))
  if (stillMissing.length) {
    return { ok: false, message: `ploi hat den Alias nicht übernommen: ${stillMissing.join(', ')}` }
  }
  return { ok: true, message: '' }
}

/** Alle Namen, die das Zertifikat der Site tragen MUSS — Haupt-Domain zuerst. */
export function siteCertificateDomains(info: PloiSiteInfo, add: string[]): string[] {
  return [...new Set([info.main, ...info.aliases, ...add].filter(Boolean))]
}

/** Die Zertifikate der Site (Domain-Liste + Status). */
export async function listPloiCertificates(config: PloiConfig): Promise<{ ok: boolean, certificates: { domain: string, status: string }[], message: string }> {
  if (config.dryRun) return { ok: true, certificates: [], message: '' }
  if (!ploiConfigured(config)) return { ok: false, certificates: [], message: 'ploi ist nicht konfiguriert (Token/Server/Site).' }
  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/certificates`, { method: 'GET' })
  if (!result.ok) return { ok: false, certificates: [], message: result.message }
  const raw = (result.data as { data?: unknown })?.data
  const certificates = Array.isArray(raw)
    ? raw.map(entry => ({
        domain: typeof (entry as { domain?: string })?.domain === 'string' ? (entry as { domain: string }).domain : '',
        status: typeof (entry as { status?: string })?.status === 'string' ? (entry as { status: string }).status : '',
      }))
    : []
  return { ok: true, certificates, message: '' }
}

/** PURE: deckt eines der vorhandenen Zertifikate ALLE gewünschten Namen ab? */
export function certificateCovers(
  certificates: { domain: string, status: string }[],
  wanted: string[],
): boolean {
  const need = wanted.map(host => host.trim().toLowerCase()).filter(Boolean)
  if (!need.length) return false
  return certificates.some((entry) => {
    // ploi legt die Namen eines Zertifikats kommagetrennt in `domain` ab.
    if (entry.status !== 'active') return false
    const covered = new Set(entry.domain.split(',').map(host => host.trim().toLowerCase()).filter(Boolean))
    return need.every(host => covered.has(host))
  })
}

/**
 * EIN Zertifikat für ALLE Namen dieser SILO-Site anfordern.
 *
 * ── DIE SPERRE GEGEN DEN WIEDERHOLUNGS-KLICK ──────────────────────────────
 * „Prüfen" ist re-entrant und soll es bleiben — es ist die einzige Bedienung
 * des Ablaufs. Genau daraus wird hier aber eine Gefahr: Let's Encrypt lässt
 * pro Woche **fünf** identische Zertifikate (gleiche Namensmenge) zu. Wer
 * während der Ausstellung sechsmal klickt, sperrt sich für sieben Tage aus —
 * und die Fehlermeldung („too many certificates already issued") kommt erst
 * beim sechsten Mal und nennt keinen der vorherigen fünf Klicks.
 *
 * Deshalb wird VOR jeder Anforderung gelesen: deckt ein aktives Zertifikat die
 * gewünschte Namensmenge schon ab, passiert nichts. Nur die erste Anforderung
 * je Namensmenge geht wirklich raus.
 */
export async function requestPloiSiteCertificate(config: PloiConfig, domains: string[]): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist für diese Website nicht hinterlegt (Server-/Site-Id fehlt).' }
  }
  if (!domains.length) return { ok: false, message: 'Keine Domains für das Zertifikat.' }

  const existing = await listPloiCertificates(config)
  if (existing.ok && certificateCovers(existing.certificates, domains)) {
    return { ok: true, skipped: true, message: '' }
  }

  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/certificates`, {
    method: 'POST',
    body: { certificate: domains.join(',') },
  })
  return { ok: result.ok, message: result.message }
}

/**
 * Einen Hostnamen wieder abhängen (Domain entfernt).
 *
 * FEHLER SIND HIER NICHT SCHLIMM und dürfen die Entfernung nicht aufhalten:
 * die Wahrheit ist die `communities`-Zeile, und sobald dort nichts mehr steht,
 * löst der Host bei uns nicht mehr auf (404). Ein zurückgelassener nginx-vHost
 * ist Aufräumarbeit, kein Sicherheitsproblem — er zeigt auf eine App, die den
 * Host nicht kennt.
 */
/**
 * Aliasse einer SILO-Site wieder abhängen (Domain zurückgegeben).
 *
 * ── HIER IST ES NICHT NUR HAUSARBEIT, ANDERS ALS IM POOL ──────────────────
 * Bei einer Pool-Kundendomain ist ein zurückgelassener vHost harmlos: der
 * Tenant-Resolver findet die Community nicht mehr und die Adresse antwortet
 * 404. Eine SILO-App hat diese Tür nicht — sie beantwortet jeden Host, unter
 * dem nginx sie erreichbar macht. Bleibt der Alias stehen, liefert die Site
 * also weiter Inhalte unter einer Adresse, die dem Kunden nicht mehr gehört.
 * Deshalb wird ein Fehlschlag hier protokolliert UND dem Betreiber gemeldet,
 * statt still verschluckt zu werden.
 *
 * Geschickt wird die REDUZIERTE Liste, aus demselben Grund wie beim Anlegen
 * die Vereinigung: unter „setzen" ist sie exakt richtig, unter „hinzufügen"
 * bewirkt sie nichts — und dann sagt das Nachlesen es.
 */
export async function removePloiAliases(config: PloiConfig, hosts: string[]): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) return { ok: false, skipped: true, message: '' }

  const existing = await listPloiSiteAliases(config)
  if (!existing.ok) return { ok: false, message: existing.message }
  const drop = new Set(hosts)
  const remaining = existing.info.aliases.filter(alias => !drop.has(alias))
  if (remaining.length === existing.info.aliases.length) return { ok: true, message: '' }

  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/aliases`, {
    method: 'POST',
    body: { aliases: remaining },
  })
  if (!result.ok) return { ok: false, message: result.message }

  const after = await listPloiSiteAliases(config)
  const stillThere = after.ok ? after.info.aliases.filter(alias => drop.has(alias)) : []
  if (stillThere.length) {
    return { ok: false, message: `Alias bei ploi nicht entfernt: ${stillThere.join(', ')} — die Site antwortet dort weiter.` }
  }
  return { ok: true, message: '' }
}

export async function removePloiTenant(config: PloiConfig, host: string): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) return { ok: false, skipped: true, message: '' }
  const result = await ploiFetch(
    config,
    `/servers/${config.serverId}/sites/${config.siteId}/tenants/${encodeURIComponent(host)}`,
    { method: 'DELETE' },
  )
  return { ok: result.ok, message: result.message }
}

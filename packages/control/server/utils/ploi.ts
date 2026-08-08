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
 * das Kunden-Wildcard `*.pukalani.app`. Für POOL-Kundendomains gilt weiter:
 * ausschließlich TENANTS, jeder mit eigener Lineage unter eigenem Namen.
 *
 * **KORREKTUR 2026-08-08:** Der Satz „hier wird niemals ein Zertifikat für
 * eine Site angefordert" stand bis heute hier und stimmt seit control-036
 * NICHT MEHR. `requestPloiSiteCertificate` ruft genau
 * `POST /servers/:s/sites/:site/certificates` — für SILO-Sites, deren Lineage
 * eine eigene ist (`portfolio.pukalani.app`, `tenant: false`) und mit dem
 * Wildcard nichts zu tun hat. Die Regel ist also nicht „nie", sondern:
 * **niemals auf den Sites `pukalani.app` und `platform.pukalani.app`.**
 *
 * ── UND DIE FALLE, DIE DAS TEUER MACHT (Erstlauf 2026-08-08) ──────────────
 * **Ein GESCHEITERTER Antrag löscht die BESTEHENDE Lineage der Site.** Nicht
 * „ändert sie nicht", nicht „lässt sie stehen" — certbot/ploi räumt
 * `/etc/letsencrypt/live/<site>/` weg, wenn die Validierung scheitert. Live
 * erwischt: nach dem fehlgeschlagenen 3-Namen-Antrag lief
 * `portfolio.pukalani.app` nur noch aus dem nginx-Arbeitsspeicher weiter;
 * jeder Reload scheiterte still (`[emerg] cannot load certificate`), und ein
 * Neustart hätte die Site vom Netz genommen. Das ist der teuerste Zustand
 * überhaupt: alles sieht gesund aus, bis jemand nginx anfasst.
 *
 * Die Absicherung ist der PREFLIGHT unten (`acmeChallengeReachable`): es wird
 * gar nicht erst bestellt, wenn die HTTP-01-Prüfung scheitern MUSS.
 * Wiederherstellung nach dem Unfall: Runbook
 * docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md, Abschnitt „B7".
 *
 * Die DNS-01-Regel aus CLAUDE.md gilt für UNSERE eigenen Wildcards. Eine
 * Kundendomain geht über **HTTP-01**, und das ist kein Widerspruch: sobald der
 * Tenant angelegt ist, steht sein Name in nginx, Port 80 antwortet für ihn,
 * und die HTTP-Prüfung kommt durch. Genau daran scheiterte sie bei Aliassen
 * und Wildcards — und bei einem SILO-ALIAS scheitert sie ebenfalls, siehe den
 * Preflight-Abschnitt weiter unten.
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

/**
 * PURE: aus rohen Runtime-Config-Werten eine PloiConfig — mit String() um
 * JEDEN Wert. Nitros Env-Override läuft durch `destr`, und
 * `NUXT_PLOI_SERVER_ID=118713` kommt damit als ZAHL an — `.trim()` darauf
 * war ein 500 auf jeder Route, die den Domain-Zustand rechnet (live erwischt
 * am 2026-08-07, /dashboard/websites zeigte eine leere Liste). Dieselbe
 * Falle wie beim DRY_RUN-Schalter: sie trifft immer nur die Werte, die
 * zufällig numerisch aussehen. Pure Funktion, damit der Test sie mit einer
 * ZAHL füttern kann — genau dem Wert, den destr liefert.
 */
export function normalizePloiConfig(raw: {
  ploiToken?: unknown
  ploiBaseUrl?: unknown
  ploiServerId?: unknown
  ploiSiteId?: unknown
  customDomainDryRun?: unknown
}): PloiConfig {
  return {
    token: String(raw.ploiToken ?? '').trim(),
    baseUrl: String(raw.ploiBaseUrl || 'https://ploi.io/api').trim().replace(/\/+$/, ''),
    serverId: String(raw.ploiServerId ?? '').trim(),
    siteId: String(raw.ploiSiteId ?? '').trim(),
    dryRun: isDryRunFlag(raw.customDomainDryRun),
  }
}

export function ploiConfig(event: H3Event): PloiConfig {
  return normalizePloiConfig(useRuntimeConfig(event) as Record<string, unknown>)
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
      // Bei 422 stehen die eigentlichen Feld-Fehler in `errors` — ohne sie
      // ist "The given data was invalid" eine Diagnose ohne Inhalt (der
      // fehlende `type` beim Zertifikat hat genau so eine halbe Stunde
      // gekostet, 2026-08-07).
      const body = data as { message?: string, errors?: Record<string, unknown> } | null
      const detail = body?.errors ? ` — ${JSON.stringify(body.errors).slice(0, 200)}` : ''
      const message = typeof body?.message === 'string' ? body.message : text.slice(0, 200)
      return { ok: false, status: response.status, data, message: `ploi ${response.status}: ${message}${detail}`.slice(0, 400) }
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
 *
 * ── DIE SPERRE GEGEN DEN WIEDERHOLUNGS-KLICK (F52) ────────────────────────
 * Dieselbe Gefahr wie beim Silo-Pfad (requestPloiSiteCertificate): „Prüfen"
 * ist re-entrant, Let's Encrypt lässt fünf identische Zertifikate pro Woche
 * zu, und der sechste Klick während der Ausstellung sperrt den Kunden sieben
 * Tage aus. Deshalb wird auch hier VOR der Anforderung gelesen.
 *
 * Tenant-Zertifikate erscheinen in der Zertifikatsliste DER SITE (die API
 * führt dafür ein `tenant`-Flag; live nachgemessen 2026-08-07 an Site 391312).
 * Erschienen sie dort wider Erwarten nicht, wäre die Sperre ein No-Op und das
 * Verhalten exakt das heutige — die Vorprüfung ist bewusst FAIL-OPEN, auch
 * ein Listen-Fehler hält die Anforderung nicht auf.
 *
 * BEWUSST KEIN STATUS-VOKABULAR GERATEN: live belegt ist nur 'active'. Jeder
 * andere Status eines deckenden Eintrags gilt als „in Arbeit" und wird NICHT
 * erneut angefordert — die Meldung nennt den Status und den Ausweg (Eintrag
 * in ploi löschen, dann erneut prüfen). Das ist fail-safe gegen das
 * LE-Limit; ein wirklich festhängendes Zertifikat kostet einen Handgriff des
 * Betreibers statt den Kunden sieben Tage.
 */
export async function requestPloiTenantCertificate(config: PloiConfig, host: string): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist nicht konfiguriert — das Zertifikat muss der Betreiber anlegen.' }
  }

  const decision = certificateOrderDecision(await listPloiCertificates(config), [host])
  if (!decision.order) return { ok: true, skipped: true, message: decision.message }

  /**
   * KEIN PREFLIGHT AUF DEM TENANT-PFAD — und das ist eine Entscheidung, keine
   * Auslassung (F54-3).
   *
   * Ein ploi-TENANT bringt seinen eigenen vHost mit, Port 80 eingeschlossen;
   * genau deshalb funktioniert HTTP-01 hier überhaupt (s. Kopf). Der
   * Alias-Pfad hat dieses Problem, weil ploi dort den :80-Block NICHT pflegt.
   *
   * Dazu kommt ein Risiko, das den Nutzen überwiegt: `ensurePloiTenants` läuft
   * unmittelbar vorher, der nginx-Reload ist asynchron — ein Preflight
   * Sekunden danach könnte fälschlich blockieren und aus einem funktionierenden
   * Weg einen wackeligen machen. Und die Folge eines Fehlschlags ist hier
   * kleiner: die Lineage eines Tenants trägt SEINEN Namen, ein misslungener
   * Antrag reißt nicht das Zertifikat der Site mit.
   */
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

/**
 * PURE: der erste Zertifikats-Eintrag, dessen Namensmenge ALLE gewünschten
 * Namen abdeckt — UNABHÄNGIG vom Status. Auch die noch in Ausstellung
 * befindlichen zählen, denn genau während der Ausstellung ist der
 * Wiederholungs-Klick gefährlich. Leere Wunschliste deckt nichts (fail-closed).
 *
 * Den STATUS bewertet `certificateOrderDecision` — die einzige Stelle, die
 * das tut. Es gab hier bis 2026-08-08 einen zweiten Leser (`certificateCovers`,
 * nur aktive), und die zwei Lesarten derselben Liste waren der Grund, warum
 * auf dem Silo-Pfad nach einem Fehlschlag nicht mehr nachbestellt wurde.
 */
export function coveringCertificate(
  certificates: { domain: string, status: string }[],
  wanted: string[],
): { domain: string, status: string } | null {
  const need = wanted.map(host => host.trim().toLowerCase()).filter(Boolean)
  if (!need.length) return null
  return certificates.find((entry) => {
    // ploi legt die Namen eines Zertifikats kommagetrennt in `domain` ab.
    const covered = new Set(entry.domain.split(',').map(host => host.trim().toLowerCase()).filter(Boolean))
    return need.every(host => covered.has(host))
  }) ?? null
}

export interface CertificateOrderDecision {
  /** true = jetzt wirklich bestellen. */
  order: boolean
  /** Warum. `no_covering` ist der einzige Grund zu bestellen. */
  reason: 'no_covering' | 'active' | 'in_progress' | 'unreadable'
  /** Der Status des deckenden Eintrags ('' = keiner). */
  status: string
  /** Für den Betreiber lesbar; '' wenn nichts zu sagen ist. */
  message: string
}

/**
 * PURE: BESTELLEN ODER NICHT — die eine Regel für beide Wege (F54-2).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Der Silo-Pfad fragte bisher `certificateCovers` (also NUR aktive
 * Zertifikate), der Pool-Pfad `coveringCertificate` (jeden Status). Zwei
 * Lesarten derselben Frage an derselben ploi-Liste — und beim Erstlauf war
 * genau das der Grund, warum nach einem Fehlschlag nicht mehr nachbestellt
 * wurde: was ploi als deckend führt, hängt am Status-Vokabular, und wer nur
 * eine der beiden Lesarten kennt, misst hinterher nur noch.
 *
 * Jetzt EINE Regel, und zwar diese:
 *   - kein deckender Eintrag  ⇒ BESTELLEN (das ist die Nachbestellung; sie
 *     passiert bei JEDEM Prüf-Klick in `pending_cert`, nicht nur beim
 *     Zustandswechsel)
 *   - deckender Eintrag `active`      ⇒ still übersprungen
 *   - deckender Eintrag, anderer Status ⇒ übersprungen MIT Meldung (Status +
 *     Ausweg). Das ist der Klickschutz: Let's Encrypt lässt fünf identische
 *     Zertifikate pro Woche zu, der sechste Klick während der Ausstellung
 *     sperrt den Kunden sieben Tage aus — und die LE-Meldung nennt keinen der
 *     vorherigen Klicks.
 *   - Liste nicht lesbar ⇒ BESTELLEN (fail-open, wie bisher: ein Listen-
 *     Fehler darf keine Freischaltung verhindern).
 *
 * BEWUSST KEIN STATUS-VOKABULAR GERATEN: live belegt ist nur 'active'.
 */
export function certificateOrderDecision(
  list: { ok: boolean, certificates: { domain: string, status: string }[] },
  wanted: string[],
): CertificateOrderDecision {
  if (!list.ok) {
    return { order: true, reason: 'unreadable', status: '', message: '' }
  }
  const covering = coveringCertificate(list.certificates, wanted)
  if (!covering) {
    return { order: true, reason: 'no_covering', status: '', message: '' }
  }
  if (covering.status === 'active') {
    return { order: false, reason: 'active', status: 'active', message: '' }
  }
  return {
    order: false,
    reason: 'in_progress',
    status: covering.status,
    message: `Für ${wanted.join(', ')} ist bereits ein Zertifikat beauftragt (Status „${covering.status}") — nicht erneut angefordert. Hängt es fest: Eintrag in ploi löschen, dann erneut prüfen.`,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * PREFLIGHT: ANTWORTET PORT 80 FÜR DIESEN NAMEN? (F54-3, 2026-08-08)
 *
 * ── DER BEFUND, DER EINE SITE FAST VOM NETZ GENOMMEN HÄTTE ────────────────
 * **ploi's Alias-API pflegt den Port-80-Block NICHT.** Ein Alias landet im
 * `server_name` des :443-vHosts; die HTTP-Umleitung steht aber in einer
 * eigenen, root-eigenen Datei (`/etc/nginx/ploi/<site>/before/
 * ssl-redirect.conf`), die die API nicht anfasst. Der neue Name fällt damit
 * auf Port 80 in den 444-Catch-all — und genau dort holt Let's Encrypt seine
 * HTTP-01-Prüfung ab. Die Bestellung MUSS scheitern.
 *
 * Und ein gescheiterter Antrag löscht die bestehende Lineage der Site (s.
 * Kopf). Der Preflight ist deshalb keine Höflichkeit gegenüber Let's Encrypt,
 * sondern die Sicherung gegen einen Zustand, in dem der nächste nginx-Reload
 * die Site abschaltet.
 *
 * ── WAS ER MISST ─────────────────────────────────────────────────────────
 * Einen gewöhnlichen GET auf `http://<name>/.well-known/acme-challenge/…`.
 * JEDE HTTP-Antwort genügt — 404 heißt „nginx kennt den Namen und hat keine
 * Datei", und mehr wollten wir nicht wissen. Kommt GAR NICHTS zurück
 * (Verbindung abgewiesen, Timeout, 444), wird nicht bestellt.
 * ────────────────────────────────────────────────────────────────────────── */

/** Der Pfad, unter dem gefragt wird. Er darf 404 sein — er soll nur ankommen. */
const ACME_PREFLIGHT_PATH = '/.well-known/acme-challenge/pukalani-preflight'

export type AcmePreflightOutcome =
  | { kind: 'status', status: number }
  | { kind: 'error', detail: string }

/**
 * PURE: antwortet Port 80 für diesen Namen?
 *
 * Jede HTTP-Antwort ist ein Ja. Keine Antwort ist ein Nein — und zwar ein
 * blockierendes: fail-closed, weil die Alternative ein gelöschtes Zertifikat
 * ist.
 */
export function interpretAcmePreflight(outcome: AcmePreflightOutcome): boolean {
  return outcome.kind === 'status'
}

/**
 * Die Anleitung, die statt der Bestellung herauskommt.
 *
 * Sie nennt den KONKRETEN Handgriff, weil der Befund sonst wie ein DNS-Problem
 * des Kunden aussieht: der Name löst auf, HTTPS antwortet, nur Port 80 nicht —
 * und das sieht niemand, ohne danach zu suchen.
 */
export function acmePreflightMessage(hosts: string[]): string {
  return `Port 80 antwortet nicht für ${hosts.join(', ')} — die Let's-Encrypt-Prüfung (HTTP-01) würde scheitern, und ein gescheiterter Antrag löscht das bestehende Zertifikat der Site. Deshalb wurde NICHTS bestellt. Handgriff: in der nginx-Hauptconfig der Site (ploi → Site → Verwalte → nginx-Konfiguration) einen eigenen server-Block für Port 80 mit diesen Namen ergänzen, der /.well-known/acme-challenge/ ausliefert; danach erneut „Prüfen".`
}

/**
 * Die Frage wirklich stellen. Wirft nie.
 *
 * NACKTE ARGUMENTE, damit der Beweis sie gegen einen echten lokalen Server
 * laufen lassen kann (ein Host darf deshalb einen Port tragen).
 */
export async function acmeChallengeReachable(host: string, timeoutMs = 6000): Promise<{ ok: boolean, detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let outcome: AcmePreflightOutcome
  try {
    const response = await fetch(`http://${host}${ACME_PREFLIGHT_PATH}`, {
      method: 'GET',
      // KEIN Folgen von Umleitungen: ein 301 auf https ist selbst schon der
      // Beweis, dass Port 80 für diesen Namen antwortet.
      redirect: 'manual',
      signal: controller.signal,
    })
    outcome = { kind: 'status', status: response.status }
  }
  catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause
    outcome = { kind: 'error', detail: cause?.code || (error instanceof Error ? error.message : String(error)) }
  }
  finally {
    clearTimeout(timer)
  }
  return {
    ok: interpretAcmePreflight(outcome),
    detail: outcome.kind === 'status' ? String(outcome.status) : outcome.detail.slice(0, 120),
  }
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
 * Deshalb wird VOR jeder Anforderung gelesen (`certificateOrderDecision`):
 * deckt ein Eintrag die gewünschte Namensmenge schon ab, passiert nichts.
 *
 * ── UND DIE ANDERE RICHTUNG: NACHBESTELLEN (F54-2) ────────────────────────
 * Deckt KEIN Eintrag sie ab, wird bestellt — bei JEDEM Prüf-Klick, nicht nur
 * beim Zustandswechsel. Ein Fehlschlag darf nicht dazu führen, dass die
 * Freischaltung nur noch misst; der Knopf ist die einzige Bedienung, und er
 * muss auch der Weg zurück sein.
 *
 * ── ZWEI TORE, IN DIESER REIHENFOLGE ──────────────────────────────────────
 * Erst die Deckungsfrage (LE-Ratengrenze), dann der PREFLIGHT (würde die
 * HTTP-01-Prüfung überhaupt ankommen?). Die Reihenfolge spart im Normalfall
 * beide Netzabfragen: liegt das Zertifikat schon, fragt niemand mehr nach
 * Port 80.
 */
export async function requestPloiSiteCertificate(config: PloiConfig, domains: string[]): Promise<PloiResult> {
  if (config.dryRun) return { ok: true, skipped: true, message: '' }
  if (!ploiConfigured(config)) {
    return { ok: false, skipped: true, message: 'ploi ist für diese Website nicht hinterlegt (Server-/Site-Id fehlt).' }
  }
  if (!domains.length) return { ok: false, message: 'Keine Domains für das Zertifikat.' }

  const decision = certificateOrderDecision(await listPloiCertificates(config), domains)
  if (!decision.order) return { ok: true, skipped: true, message: decision.message }

  /**
   * PREFLIGHT — die Sicherung sitzt IN der Schnittstelle, nicht in der
   * Disziplin des Aufrufers (F54-3, dieselbe Lehre wie bei `indexStep`).
   *
   * Geprüft werden ALLE Namen, nicht nur die neuen: HTTP-01 validiert jeden
   * Namen einzeln, und ein einziger, der auf Port 80 nicht antwortet, lässt
   * den GESAMTEN Antrag scheitern — samt Löschung der bestehenden Lineage.
   */
  const unreachable: string[] = []
  for (const host of domains) {
    const reachable = await acmeChallengeReachable(host)
    if (!reachable.ok) unreachable.push(`${host} (${reachable.detail})`)
  }
  if (unreachable.length) {
    return { ok: false, message: acmePreflightMessage(unreachable).slice(0, 500) }
  }

  /**
   * `type` ist PFLICHT — ohne das Feld antwortet ploi `422 The given data was
   * invalid` und nennt das fehlende Feld nur im `errors`-Rumpf (beim
   * Portfolio-Erstlauf am 2026-08-07 live erwischt; der Alias-Schritt davor
   * war da längst durch).
   */
  const result = await ploiFetch(config, `/servers/${config.serverId}/sites/${config.siteId}/certificates`, {
    method: 'POST',
    body: { certificate: domains.join(','), type: 'letsencrypt' },
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

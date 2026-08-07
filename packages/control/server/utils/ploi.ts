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

/**
 * Einen Hostnamen wieder abhängen (Domain entfernt).
 *
 * FEHLER SIND HIER NICHT SCHLIMM und dürfen die Entfernung nicht aufhalten:
 * die Wahrheit ist die `communities`-Zeile, und sobald dort nichts mehr steht,
 * löst der Host bei uns nicht mehr auf (404). Ein zurückgelassener nginx-vHost
 * ist Aufräumarbeit, kein Sicherheitsproblem — er zeigt auf eine App, die den
 * Host nicht kennt.
 */
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

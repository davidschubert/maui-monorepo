/**
 * APPWRITE-WEB-PLATFORM FÜR EINE KUNDENDOMAIN (F45, control-035).
 *
 * ── DAS PROBLEM, DAS OHNE DIESE DATEI UNSICHTBAR BLEIBT ───────────────────
 * Appwrite lässt nur Origins zu, die im Projekt als Web-Platform stehen. Das
 * Pool-Projekt hat ein Wildcard `*.pukalani.app` und deckt damit JEDEN neuen
 * Mandanten automatisch — eine KUNDENDOMAIN deckt es NICHT. Ohne Eintrag ist
 * dort jede Realtime tot: Sofort-Abmeldung, Glocke, Live-Theme.
 *
 * Und man sieht es nicht. CLAUDE.md hält den Befund fest: der WebSocket-
 * Handschlag antwortet `101` auch für einen abgewiesenen Origin, die Ablehnung
 * kommt erst als erste Nachricht IM Socket (`code 1008`). Im Browser steht nur
 * „Realtime disconnected" — das sieht aus wie ein Code-Fehler und ist eine
 * fehlende Zeile in der Projekt-Konfiguration. Genau deshalb ist dieser
 * Schritt eine eigene Statusstufe (`pending_platform`) und keine Fußnote.
 *
 * ── GEMESSEN AM 2026-08-07 GEGEN DIE LOKALE 1.9.6 ─────────────────────────
 * Die offene Frage war, WOMIT sich diese Projekt-API authentifiziert — die
 * Projects-API ist bei Appwrite Cloud eine Konsolen-API. Auf der selbst
 * gehosteten 1.9.6 genügt ein GEWÖHNLICHER Projekt-API-Key, sofern der Header
 * `X-Appwrite-Project` dieselbe Projekt-Id trägt wie der Pfad:
 *
 *   GET  /v1/projects/<pool>/platforms   ohne Projekt-Header   → 403 project_id_missing
 *   GET  /v1/projects/<pool>/platforms   mit  Projekt-Header   → 200
 *   POST /v1/projects/<pool>/platforms   mit  Projekt-Header   → 201
 *   Gegenprobe danach (der Beleg, dass es WIRKT):
 *     curl -H "Origin: https://<neu>"          /v1/account → 401  (Origin akzeptiert)
 *     curl -H "Origin: https://<nie-gesehen>"  /v1/account → 403 general_unknown_origin
 *
 * Der Schritt ist damit automatisierbar und wird automatisiert. Was NICHT
 * automatisch geht: Appwrite prüft beim Anlegen NICHT auf Dubletten (derselbe
 * Hostname zweimal ergibt zwei Zeilen, kein 409) — deshalb liest diese Datei
 * IMMER erst die Liste. Ein Prüf-Klick darf beliebig oft passieren.
 *
 * ── WARUM IM ONBOARDING-LAYER UND NICHT IM CONTROL PLANE ──────────────────
 * Registriert werden muss die Platform im RUNTIME-Projekt (dem Pool), und
 * dafür hat das Control Plane keinen Schlüssel — dieselbe Grenze, an der schon
 * `revokeCommunityLabel` (A5) und die Zahlungswarnung (C15) entlanglaufen.
 * Also macht es die Platform-App mit ihrem EIGENEN Runtime-Key und meldet das
 * Ergebnis über die Service-Naht zurück (`domain/activate`).
 *
 * Der SDK kennt diese Route nicht (`node-appwrite` bildet die Projects-API
 * nicht ab) — deshalb rohes `fetch`. Das ist hier kein Umgehen einer
 * Abstraktion, es gibt keine.
 */
import type { H3Event } from 'h3'

interface AppwritePlatform {
  $id: string
  type: string
  hostname: string
}

export interface PlatformSyncResult {
  ok: boolean
  /** Für den Owner lesbar; '' bei Erfolg. */
  message: string
  /** Welche Hostnamen neu eingetragen wurden. */
  added: string[]
}

function projectApi(event: H3Event): { endpoint: string, projectId: string, key: string } {
  const config = useRuntimeConfig(event)
  return {
    endpoint: (config.public.appwriteEndpoint || '').replace(/\/+$/, ''),
    // Das Projekt DES REQUESTS (Naht 2) — im Pool ist das für alle Communities
    // dasselbe, in einem Silo das eigene. Beides richtig: die Platform gehört
    // in genau das Projekt, das die Community bedient.
    projectId: event.context.tenant?.projectId ?? config.public.appwriteProjectId,
    key: (config as { appwriteKey?: string }).appwriteKey || '',
  }
}

async function call(
  event: H3Event,
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE', body?: unknown },
): Promise<{ ok: boolean, data: unknown, message: string }> {
  const api = projectApi(event)
  if (!api.endpoint || !api.projectId || !api.key) {
    return { ok: false, data: null, message: 'Appwrite ist nicht vollständig konfiguriert.' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${api.endpoint}${path}`, {
      method: init.method,
      headers: {
        // BEIDE Header sind Pflicht. Ohne `X-Appwrite-Project` antwortet
        // Appwrite 403 `project_id_missing` — auch dann, wenn die Projekt-Id
        // schon im Pfad steht (gemessen, s. Kopf).
        'X-Appwrite-Project': api.projectId,
        'X-Appwrite-Key': api.key,
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
      data = null
    }
    if (!response.ok) {
      const detail = typeof (data as { type?: string })?.type === 'string' ? (data as { type: string }).type : ''
      // Appwrite-Fehlerdetails werden NICHT roh an Clients gereicht
      // (CLAUDE.md) — was hier zurückkommt, ist Status + Fehlertyp, also
      // genau so viel, wie ein Betreiber zur Diagnose braucht.
      return { ok: false, data, message: `Appwrite ${response.status}${detail ? ` (${detail})` : ''}` }
    }
    return { ok: true, data, message: '' }
  }
  catch (error) {
    return { ok: false, data: null, message: `Appwrite nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) }
  }
  finally {
    clearTimeout(timer)
  }
}

async function listPlatforms(event: H3Event): Promise<{ ok: boolean, platforms: AppwritePlatform[], message: string }> {
  const api = projectApi(event)
  const result = await call(event, `/projects/${encodeURIComponent(api.projectId)}/platforms`, { method: 'GET' })
  if (!result.ok) return { ok: false, platforms: [], message: result.message }
  const raw = (result.data as { platforms?: unknown })?.platforms
  const platforms = Array.isArray(raw) ? raw as AppwritePlatform[] : []
  return { ok: true, platforms, message: '' }
}

/**
 * Beide Formen der Kundendomain als Web-Platform eintragen — idempotent.
 *
 * WIRFT NIE. Der Aufrufer meldet das Ergebnis an `domain/activate`; ein
 * Fehlschlag lässt die Domain in `pending_platform` stehen, mit Grund. Nie
 * „aktiv": eine aktive Domain zieht den 301 der Subdomain nach sich, und dann
 * säße der Kunde auf einer Adresse, deren Live-Aktualisierung tot ist.
 */
export async function ensureAppwriteWebPlatforms(event: H3Event, hosts: string[]): Promise<PlatformSyncResult> {
  const api = projectApi(event)
  const existing = await listPlatforms(event)
  if (!existing.ok) return { ok: false, message: existing.message, added: [] }

  const known = new Set(existing.platforms.filter(entry => entry.type === 'web').map(entry => entry.hostname))
  const added: string[] = []
  for (const host of hosts) {
    if (known.has(host)) continue
    const result = await call(event, `/projects/${encodeURIComponent(api.projectId)}/platforms`, {
      method: 'POST',
      body: { platformId: 'unique()', type: 'web', name: `Community ${host}`, hostname: host },
    })
    if (!result.ok) return { ok: false, message: result.message, added }
    added.push(host)
  }
  return { ok: true, message: '', added }
}

/**
 * Die Einträge wieder abräumen (Domain abgegeben).
 *
 * FAIL-SOFT und ohne Folgen für den Aufrufer: ein zurückgelassener Eintrag
 * erlaubt einer Domain, die uns nicht mehr bedient, weiterhin Anfragen an
 * unser Appwrite-Projekt zu stellen. Das ist unerwünscht und wird deshalb
 * versucht — aber die Adresse selbst löst bei uns nicht mehr auf (die
 * `communities`-Zeile ist leer), also ist es Hausarbeit und kein Loch.
 */
export async function removeAppwriteWebPlatforms(event: H3Event, hosts: string[]): Promise<PlatformSyncResult> {
  const api = projectApi(event)
  const existing = await listPlatforms(event)
  if (!existing.ok) return { ok: false, message: existing.message, added: [] }

  const wanted = new Set(hosts)
  for (const entry of existing.platforms) {
    if (entry.type !== 'web' || !wanted.has(entry.hostname)) continue
    const result = await call(
      event,
      `/projects/${encodeURIComponent(api.projectId)}/platforms/${encodeURIComponent(entry.$id)}`,
      { method: 'DELETE' },
    )
    if (!result.ok) {
      logEvent('warn', 'community.custom_domain_platform_cleanup_failed', {
        hostname: entry.hostname, detail: result.message,
      })
    }
  }
  return { ok: true, message: '', added: [] }
}

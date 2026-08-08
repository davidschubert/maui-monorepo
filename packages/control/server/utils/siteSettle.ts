/**
 * DER RÜCKRUF IN DIE SILO-APP — der letzte Schritt aus der Betreiber-Konsole
 * (control-036).
 *
 * ── WOFÜR ────────────────────────────────────────────────────────────────
 * Eine Domain wird erst `active`, wenn ihre beiden Formen als
 * Appwrite-Web-Platform im Projekt DER SITE stehen (F45 — ohne sie ist dort
 * jede Realtime tot, und der WebSocket-Handschlag verrät es nicht: er
 * antwortet 101 auch für einen abgewiesenen Origin). Registrieren kann das nur
 * die Silo-App selbst; das Control Plane hat für fremde Projekte keinen
 * Schlüssel (dieselbe Grenze wie bei `revokeCommunityLabel`, A5).
 *
 * Steht der Betreiber in seiner Konsole, hat er kein JWT dieses Silos — die
 * Konsole läuft in einem anderen Appwrite-Projekt. Ohne diesen Rückruf bliebe
 * die Betreiber-Oberfläche also in `pending_platform` stehen und der Betreiber
 * müsste sich zusätzlich im Silo anmelden. Kein ploi-Panel, aber ein zweiter
 * Handgriff für etwas, das die Maschine kann.
 *
 * ── FAIL-SOFT, UND ZWAR IN DIE RICHTIGE RICHTUNG ─────────────────────────
 * Antwortet die Site nicht, wird die Domain NICHT aktiv. Sie bleibt in
 * `pending_platform` mit dem Grund — dieselbe Regel wie überall in diesem
 * Ablauf: lieber sichtbar warten als „aktiv" behaupten und den Kunden auf
 * einer Adresse ohne Live-Aktualisierung sitzen lassen. Der Weg über das
 * Silo-Dashboard bleibt daneben offen und tut dasselbe.
 */
import type { H3Event } from 'h3'

const SERVICE_HEADER = 'x-pukalani-onboarding-secret'

export interface SiteSettleResult {
  ok: boolean
  message: string
  added: string[]
}

/**
 * `POST <appUrl>/api/site/domain/settle` — ohne Rumpf.
 *
 * Der Rumpf ist leer, weil die Gegenseite die Hostnamen SELBST beim Control
 * Plane holt (Begründung dort). Wir sagen „schau nach", nicht „nimm das" —
 * sonst wäre das Service-Secret die Erlaubnis, einen beliebigen Origin für
 * ein fremdes Appwrite-Projekt freizuschalten.
 */
export async function callSiteSettle(event: H3Event, appUrl: string): Promise<SiteSettleResult> {
  const config = useRuntimeConfig(event) as { controlOnboardingSecret?: string }
  const secret = (config.controlOnboardingSecret || '').trim()
  const base = (appUrl || '').trim().replace(/\/+$/, '')
  if (!secret) return { ok: false, message: 'Service-Secret ist nicht konfiguriert.', added: [] }
  if (!base) return { ok: false, message: 'Für diese Website ist keine Adresse (appUrl) hinterlegt.', added: [] }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${base}/api/site/domain/settle`, {
      method: 'POST',
      headers: { [SERVICE_HEADER]: secret, 'Accept': 'application/json' },
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
      // 404 heißt hier fast immer „die Site kennt diese Route nicht" — sie
      // zieht den `domains`-Layer nicht oder läuft noch auf altem Code. Das
      // ist eine andere Nachricht als „hat nicht geklappt", und der Betreiber
      // soll sie bekommen.
      const hint = response.status === 404
        ? 'Die Site kennt den letzten Schritt nicht (Layer `domains` fehlt oder alter Stand).'
        : `HTTP ${response.status}`
      return { ok: false, message: hint, added: [] }
    }
    const result = data as { ok?: boolean, message?: string, added?: unknown }
    return {
      ok: result?.ok === true,
      message: typeof result?.message === 'string' ? result.message : '',
      added: Array.isArray(result?.added) ? result.added.filter((h): h is string => typeof h === 'string') : [],
    }
  }
  catch (error) {
    /**
     * DIE URSACHE MIT AUSGEBEN, nicht nur „fetch failed".
     *
     * `fetch` wirft bei jedem Netzproblem denselben nichtssagenden Satz; was
     * wirklich passiert ist, steht in `error.cause` (`ECONNREFUSED`,
     * `ENOTFOUND`, `ECONNRESET`, `UND_ERR_CONNECT_TIMEOUT`). Am 2026-08-07 hat
     * genau das eine halbe Stunde gekostet: der Beweis meldete „Site nicht
     * erreichbar: fetch failed" für eine Site, die per curl einwandfrei
     * antwortete — mit dem Fehlercode wäre in einer Zeile klar gewesen,
     * welcher der beiden Fälle (Adresse falsch aufgelöst vs. Verbindung
     * abgewiesen) vorliegt.
     */
    const cause = (error as { cause?: { code?: string, message?: string } }).cause
    const detail = cause?.code || cause?.message || (error instanceof Error ? error.message : String(error))
    return {
      ok: false,
      message: `Site nicht erreichbar (${base}): ${detail}`.slice(0, 200),
      added: [],
    }
  }
  finally {
    clearTimeout(timer)
  }
}

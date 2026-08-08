/**
 * WORAN MAN MERKT, DASS APPWRITE EINEN ORIGIN AKZEPTIERT (F54, 2026-08-08).
 *
 * ── DER BEFUND AUS DEM ERSTEN ECHTEN DURCHLAUF ────────────────────────────
 * `ensureAppwriteWebPlatforms()` trägt die Kundendomain über die Projects-API
 * ein (`POST /v1/projects/:id/platforms`). Lokal ging das — gemessen am
 * 2026-08-07 gegen die eigene 1.9.6 — und daraus wurde geschlossen, ein
 * gewöhnlicher Projekt-API-Key genüge. **Auf den PRODUKTIONS-Keys stimmt das
 * nicht:** weder der Runtime- noch der Migrations-Key hat den Scope, den die
 * Projects-API verlangt, und die Antwort ist `401
 * general_unauthorized_scope`. Der lokale Key hatte schlicht ALLE Scopes.
 *
 * Damit scheiterte der letzte Schritt der Freischaltung in Produktion IMMER,
 * und zwar an einer Stelle, an der lokal 46/46 bzw. 35/35 grün waren.
 *
 * ── DIE KONSEQUENZ: DIE FRAGE ÄNDERN, NICHT DEN SCHLÜSSEL ─────────────────
 * Was wir wissen wollen, ist nicht „konnten wir eintragen?", sondern „ist der
 * Origin akzeptiert?". Die zweite Frage lässt sich OHNE JEDEN SCHLÜSSEL
 * stellen — sie steht seit F45 in appwritePlatform.ts als Gegenprobe
 * dokumentiert und ist damit von einer Fußnote zum eigentlichen Messwert
 * geworden:
 *
 *   GET /v1/account   mit  Origin: https://<form>  +  X-Appwrite-Project
 *     → 401  = Origin akzeptiert (die Anfrage kam bis zur Authentifizierung)
 *     → 403 `general_unknown_origin` = der Host steht nicht im Projekt
 *
 * Eingetragen wird weiterhin VERSUCHT (wo der Schlüssel es kann, bleibt der
 * Ablauf vollautomatisch); der Erfolg hängt aber nicht mehr daran. Genau das
 * ist der Portfolio-Fall: die Platforms waren von Hand angelegt, beide Proben
 * antworten 401, und trotzdem stand die Domain in `pending_platform`.
 *
 * ── WARUM DIE REGELN HIER STEHEN UND PUR SIND ─────────────────────────────
 * Weil die teure Hälfte (fetch gegen ein fremdes Appwrite) sich nicht testen
 * lässt, die BEWERTUNG aber alles entscheidet: ein zu großzügiges „akzeptiert"
 * schaltet eine Domain frei, auf der jede Realtime tot ist — und das sieht man
 * nicht, der WebSocket-Handschlag antwortet 101 auch für einen abgewiesenen
 * Origin.
 */

/** Was eine einzelne Probe zurückbrachte. */
export type OriginProbeOutcome =
  /** Appwrite hat geantwortet (`type` = Appwrites Fehlerschlüssel, falls dabei). */
  | { kind: 'status', status: number, type?: string }
  /** Gar keine Antwort — Netz, Timeout, DNS. */
  | { kind: 'error', detail: string }

export type OriginVerdict = 'accepted' | 'rejected' | 'inconclusive'

/**
 * PURE: was sagt eine Probe?
 *
 * FAIL-CLOSED IN DER MITTE. Nur zwei Antworten sind eine Aussage:
 *   - 200/401  ⇒ die Anfrage hat die Origin-Prüfung PASSIERT (401 ist der
 *     Normalfall: kein Cookie, keine Sitzung — genau das wollten wir sehen).
 *   - 403 `general_unknown_origin` ⇒ der Host fehlt im Projekt.
 *
 * Alles andere — 5xx, ein 403 mit anderem Grund (`project_id_missing`), gar
 * keine Antwort — heißt WEISS ICH NICHT und darf nie zu „akzeptiert" werden.
 * Ein Appwrite in Wartung würde sonst reihenweise Domains freischalten, deren
 * Live-Aktualisierung tot ist.
 */
export function interpretOriginProbe(outcome: OriginProbeOutcome): OriginVerdict {
  if (outcome.kind === 'error') return 'inconclusive'
  if (outcome.status === 200 || outcome.status === 401) return 'accepted'
  if (outcome.status === 403 && outcome.type === 'general_unknown_origin') return 'rejected'
  return 'inconclusive'
}

export interface OriginProbeResult {
  host: string
  verdict: OriginVerdict
  /** Kurze Herkunft der Bewertung (Statuscode oder Fehlertext) — für den Betreiber. */
  detail: string
}

export interface PlatformDecision {
  /** true = ALLE Formen sind als Origin akzeptiert; die Domain darf aktiv werden. */
  ok: boolean
  /** Für den Betreiber lesbar; '' bei Erfolg. */
  message: string
}

/**
 * PURE: die Entscheidung aus Eintragungs-Versuch UND Proben.
 *
 * ── DIE EINE REGEL ───────────────────────────────────────────────────────
 * Gemessen wird die WIRKUNG, nicht der Vorgang. Sind alle Formen akzeptiert,
 * ist es gleichgültig, ob wir sie eingetragen haben, ob sie schon vorher
 * standen oder ob ein Mensch sie in der Konsole angelegt hat.
 *
 * Und wenn nicht, bekommt der Betreiber den HANDGRIFF und nicht nur den
 * Fehler: der fehlende Eintrag ist ein Klick in der Appwrite-Konsole (F45),
 * aber nur, wenn jemand weiß, wo. Ein `401 general_unauthorized_scope` allein
 * hat beim Erstlauf eine halbe Stunde gekostet.
 */
export function decidePlatformOutcome(input: {
  probes: OriginProbeResult[]
  /** Was der Eintragungs-Versuch ergeben hat (er darf scheitern). */
  registration: { ok: boolean, message: string }
  /** Wo der Mensch es von Hand tut, falls nötig (Projekt-Id o. Ä.). */
  consoleHint: string
}): PlatformDecision {
  const { probes, registration, consoleHint } = input

  // Keine Formen = nichts gemessen. Das ist kein Erfolg (fail-closed) — der
  // Aufrufer hat dann etwas falsch gemacht, nicht Appwrite.
  if (!probes.length) {
    return { ok: false, message: 'Keine Hostnamen zu prüfen.' }
  }

  const unresolved = probes.filter(probe => probe.verdict !== 'accepted')
  if (!unresolved.length) return { ok: true, message: '' }

  const rejected = unresolved.filter(probe => probe.verdict === 'rejected').map(probe => probe.host)
  const unclear = unresolved.filter(probe => probe.verdict === 'inconclusive')

  const parts: string[] = []
  if (rejected.length) {
    parts.push(`Appwrite kennt ${rejected.join(', ')} noch nicht als Web-Platform.`)
  }
  if (unclear.length) {
    parts.push(`Nicht messbar: ${unclear.map(probe => `${probe.host} (${probe.detail})`).join(', ')}.`)
  }
  if (!registration.ok && registration.message) {
    parts.push(`Automatisch eintragen ging nicht: ${registration.message}.`)
  }
  if (rejected.length && consoleHint) {
    parts.push(`Von Hand: ${consoleHint}`)
  }
  return { ok: false, message: parts.join(' ') }
}

/**
 * PURE: der Satz, der dem Betreiber den Klick zeigt.
 *
 * Steht hier und nicht im Aufrufer, damit beide Wege (Silo-Dashboard und
 * Betreiber-Konsole) wortgleich anleiten — es ist derselbe Handgriff.
 */
export function appwriteConsoleHint(projectId: string): string {
  return `Appwrite-Konsole → Projekt ${projectId || '(unbekannt)'} → Settings → Platforms → „Add platform" → Web, dann erneut „Prüfen".`
}

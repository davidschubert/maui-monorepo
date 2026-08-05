import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TrustLevelLookup } from '../../../core/server/utils/trustLevel'
import { normalizeTrustLevel, type TrustLevel } from '../../../core/shared/trustLevel'
import { membershipDays } from '../../shared/badges'
import { memberCounterValues } from '../../shared/memberCounters'
import {
  earnedTrustLevel,
  effectiveTrustLevel,
  raisedTrustLevel,
  trustLevelReached,
  TRUST_LEVEL_THRESHOLDS,
  type TrustLevelFacts,
} from '../../shared/trustLevels'
import { MEMBER_COUNTERS_TABLE, type MemberCounters } from '../../shared/types/post'

/**
 * DIE VERTRAUENSSTUFE EINES MENSCHEN (F1 Teilpaket 3) — die posts-Seite des
 * Core-Vertrags `registerTrustLevelResolver` und der Aufstieg beim Schreiben.
 *
 * ── DREI AUFGABEN, EINE DATEI ─────────────────────────────────────────────
 *  1. **Lesen** (`trustLevelOf`) — die Antwort auf den Core-Vertrag. Sie wird
 *     an jedem Seiten-SSR und an den betroffenen Routen gestellt und ist
 *     deshalb gecacht.
 *  2. **Rechnen und Hochschreiben** (`refreshTrustLevel`) — nach jeder
 *     Zähl-Buchung und einmal beim Hinsehen.
 *  3. **Ernennen** (`setTrustLevelLeader`) — die Owner-Entscheidung.
 *
 * ── DER CACHE, UND WARUM ER SEIN MUSS ─────────────────────────────────────
 * Ohne ihn kostete JEDER Seitenaufbau eines angemeldeten Menschen eine
 * zusätzliche Abfrage (die Middleware 07 spiegelt die Stufe in den Payload,
 * damit die Oberfläche die Knöpfe der Stufen 3 und 4 überhaupt zeigt). 60
 * Sekunden ist dieselbe Größenordnung wie beim Rollen-Resolver, und die Folge
 * ist dieselbe und dokumentiert: eine frisch erreichte Stufe erscheint im UI
 * nach ≤60 s.
 *
 * ZWEI STELLEN RÄUMEN IHN SOFORT: der Aufstieg selbst und die Ernennung. Damit
 * ist die Wartezeit auf den Fall beschränkt, in dem sich nichts geändert hat —
 * also auf keinen. Der Cache ist bewusst NUR ein Cache: er wird nie gelesen,
 * um eine Entscheidung zu FÄLLEN, ohne dass die Zeile dahintersteht.
 *
 * ── FAIL-SOFT IN DIE GUTMÜTIGE RICHTUNG ───────────────────────────────────
 * Jeder Fehler ergibt Stufe 0. Eine Stufe VERGIBT Rechte — sie fehlt also
 * lieber, als dass sie geraten wird. Ein Schreibfehler beim Aufstieg kostet
 * nichts Dauerhaftes: die nächste Buchung und das nächste Hinsehen rechnen
 * erneut.
 */

/* ─── Cache je (Mandant, Mensch) ─────────────────────────────────────────── */

const CACHE_TTL_MS = 60_000
const levels = createMicrocache<TrustLevel>(CACHE_TTL_MS)

function cacheKey(communityId: string, userId: string): string {
  // NUL-getrennt wie beim Rollen-Cache: zwei Ids können sonst über die Grenze
  // hinweg denselben Schlüssel ergeben.
  return `${communityId}\0${userId}`
}

/** Die gemerkte Stufe verwerfen — nach jedem Aufstieg und jeder Ernennung. */
export function forgetTrustLevel(communityId: string, userId: string): void {
  levels.delete(cacheKey(communityId, userId))
}

/** Nur für Tests/Diagnose. */
export function __resetTrustLevelCache(): void {
  levels.clear()
}

/* ─── Zugriff ────────────────────────────────────────────────────────────── */

/**
 * `as: 'operator', actor: 'operator'` — dieselbe Wahl und dieselbe Begründung
 * wie bei den Zählern selbst: die Zeilen tragen keine Client-Rechte, und das
 * Nachschlagen einer Stufe ist weder ein Beitritt (A5) noch ein Inhalt (M13).
 * Ein Mensch, dessen Stufe geprüft wird, hat in dem Moment nichts getan.
 */
function counterDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/** Die Zeile dieses Menschen — `null`, wenn es noch keine gibt. */
async function findRow(event: H3Event, userId: string): Promise<MemberCounters | null> {
  return counterDb(event).find<MemberCounters>(MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
}

/** PURE: die wirkende Stufe einer gelesenen Zeile. */
export function trustLevelOfRow(row: MemberCounters | null): TrustLevel {
  if (!row) return 0
  return effectiveTrustLevel(row.trustLevel, row.trustLevelLeader === true)
}

/**
 * Der Core-Vertrag: „welche Stufe hat dieser Mensch hier?"
 *
 * Wirft nie — der Vertrag fängt zwar ab, aber ein `null` aus dem Cache ist von
 * einem Fehler nicht zu unterscheiden, und eine geworfene Ausnahme in der
 * SSR-Middleware wäre eine kaputte Seite für eine Zusatz-Auskunft.
 */
export async function trustLevelOf(event: H3Event, lookup: TrustLevelLookup): Promise<TrustLevel> {
  const key = cacheKey(lookup.communityId, lookup.userId)
  const cached = levels.get(key)
  if (cached !== undefined) return cached

  try {
    const level = trustLevelOfRow(await findRow(event, lookup.userId))
    // NUR Erfolge werden gemerkt (Muster Rollen-Resolver): ein transienter
    // Fehler darf niemanden 60 Sekunden lang auf Stufe 0 festnageln.
    levels.set(key, level)
    return level
  }
  catch {
    return 0
  }
}

/* ─── Rechnen und Hochschreiben ──────────────────────────────────────────── */

/**
 * Die gemessenen Zahlen für die Schwellen-Regel.
 *
 * `contentCreated` ist die SUMME aus Themen und Antworten — Davids Zahl heißt
 * „Inhalte". Die Zähler führen beide getrennt, weil sich ein zusammengefasster
 * Zähler später nicht mehr aufteilen ließe (Core-Vertrag).
 */
export function trustFactsFrom(row: MemberCounters | null, memberForDays: number | null): TrustLevelFacts {
  const values = memberCounterValues(row)
  return {
    memberForDays,
    contentCreated: values.topicsCreated + values.repliesCreated,
    upvotesGiven: values.upvotesGiven,
    upvotesReceived: values.upvotesReceived,
  }
}

/**
 * PURE: Reicht der Zähler-Stand allein für eine HÖHERE Stufe? (Ohne die Tage.)
 *
 * ── DIE FRAGE, DIE DAS BEITRITTSDATUM SPART ───────────────────────────────
 * Die Tage kommen aus einem ANDEREN Appwrite-Projekt (`resolveJoinDates`, die
 * Naht zum Control Plane). Sie an jeder Zähl-Buchung zu holen wäre ein
 * Cross-Projekt-Aufruf an jedem Kommentar und jeder Stimme — und in fast allen
 * Fällen für nichts, weil sich an der Stufe ohnehin nichts ändert.
 *
 * Die Zähler dagegen liegen bereits in der Hand (die Buchung hat sie gerade
 * geschrieben). Also erst die billige Hälfte fragen: reicht sie nicht, ist die
 * teure Hälfte gegenstandslos — ein UND wird nicht wahr, wenn eine Seite
 * falsch ist. Erst wenn sie reicht, lohnt der Blick auf das Datum.
 *
 * Gerechnet wird mit einer unbegrenzten Dauer, nicht mit „unbekannt": gefragt
 * ist „WÄRE es möglich", nicht „ist es so".
 */
export function countersAllowHigherLevel(stored: unknown, facts: TrustLevelFacts): boolean {
  const current = normalizeTrustLevel(stored)
  const unlimited: TrustLevelFacts = { ...facts, memberForDays: Number.MAX_SAFE_INTEGER }
  return TRUST_LEVEL_THRESHOLDS.some(requirement =>
    requirement.level > current && trustLevelReached(requirement, unlimited))
}

/**
 * Die Stufe neu prüfen und — wenn sie gestiegen ist — festhalten, die
 * Abzeichen verleihen und den Cache räumen.
 *
 * Antwort: die WIRKENDE Stufe nach dem Lauf (für Aufrufer, die sie ohnehin
 * anzeigen wollen).
 *
 * `memberForDays` kommt vom Aufrufer, weil beide Aufrufer es anders bekommen:
 * die Galerie hat es schon (sie fragt das Beitrittsdatum für den Jahrestag), die
 * Zähl-Buchung holt es nur im seltenen Fall (s. `countersAllowHigherLevel`).
 * Diese Funktion soll nicht raten, welcher Weg gerade billig ist.
 *
 * WIRFT NIE. Ein Aufstieg ist eine Nebenwirkung des Handelns, kein Teil davon —
 * dieselbe Zusage wie beim Zähl-Vertrag selbst.
 */
export async function refreshTrustLevel(
  event: H3Event,
  userId: string,
  row: MemberCounters | null,
  memberForDays: number | null,
): Promise<TrustLevel> {
  if (!row) return 0

  const leader = row.trustLevelLeader === true
  const before = effectiveTrustLevel(row.trustLevel, leader)

  try {
    const earned = earnedTrustLevel(trustFactsFrom(row, memberForDays))
    const raised = raisedTrustLevel(row.trustLevel, earned)
    if (raised === null) return before

    await counterDb(event).update(MEMBER_COUNTERS_TABLE, row.$id, { trustLevel: raised }, 'Counters not found')

    const after = effectiveTrustLevel(raised, leader)
    forgetTrustLevel(tenantCacheScope(event), userId)

    /**
     * FAIL-SOFT und ausdrücklich NACH dem Schreiben: die Stufe ist das Recht,
     * das Abzeichen ist die Feier. Bleibt die Feier aus, holt das Netz beim
     * Hinsehen sie nach — bleibt das Recht aus, merkt es niemand.
     */
    await awardTrustLevelBadges(event, userId, before, after)
    return after
  }
  catch (error) {
    logEvent('warn', 'posts.trust_level_failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    })
    return before
  }
}

/**
 * Nach einer Zähl-Buchung: die Stufe prüfen, aber nur, wenn sie sich ändern
 * KANN — und das Beitrittsdatum nur dann holen.
 *
 * Die drei Ausstiege in dieser Reihenfolge sind der ganze Kostenplan:
 *  1. Stufe 3 (oder 4) erreicht ⇒ nichts mehr zu holen, sofort raus.
 *  2. Die Zähler reichen nicht ⇒ raus, OHNE das Control Plane zu fragen.
 *  3. Erst jetzt das Beitrittsdatum — für genau einen Menschen, und in der
 *     Praxis ein paarmal im Leben eines Kontos.
 */
export async function refreshTrustLevelAfterCounters(
  event: H3Event,
  userId: string,
  row: MemberCounters,
): Promise<void> {
  const stored = normalizeTrustLevel(row.trustLevel)
  if (stored >= TRUST_LEVEL_THRESHOLDS[TRUST_LEVEL_THRESHOLDS.length - 1]!.level) return

  const facts = trustFactsFrom(row, null)
  if (!countersAllowHigherLevel(stored, facts)) return

  const joinDates = await resolveJoinDates(event, [userId])
  await refreshTrustLevel(event, userId, row, membershipDays(joinDates.get(userId) ?? null))
}

/* ─── Ernennen (Owner) ───────────────────────────────────────────────────── */

/**
 * Stufe 4 setzen oder zurücknehmen.
 *
 * ── DIE ZEILE MUSS ES GEBEN, UND ZWAR VORHER ──────────────────────────────
 * Ernannt werden kann nur, wer hier schon einmal etwas getan hat — sonst gäbe
 * es keine Zähler-Zeile. Das ist keine technische Einschränkung, die man
 * umgehen sollte, sondern die richtige Grenze: eine Vertrauensstufe für jemanden
 * zu vergeben, der in dieser Community noch nie geschrieben hat, wäre eine
 * Aussage ohne Grundlage. Die Verwaltungs-Fläche listet deshalb genau die, die
 * eine Zeile haben.
 *
 * Antwort: `null`, wenn es die Zeile nicht gibt (die Route macht daraus ein
 * 404) — sonst die neue wirkende Stufe.
 */
export async function setTrustLevelLeader(
  event: H3Event,
  userId: string,
  leader: boolean,
): Promise<TrustLevel | null> {
  const row = await findRow(event, userId)
  if (!row) return null

  const before = trustLevelOfRow(row)
  const updated = await counterDb(event).update<MemberCounters>(
    MEMBER_COUNTERS_TABLE,
    row.$id,
    { trustLevelLeader: leader },
    'Counters not found',
  )

  forgetTrustLevel(tenantCacheScope(event), userId)
  const after = trustLevelOfRow(updated)

  // Verliehen ist verliehen: das Abzeichen kommt bei der Ernennung und bleibt
  // beim Entzug (Begründung am Katalog-Eintrag). Beim Entzug ist `after` kleiner
  // als `before`, die Differenz also leer — es wird nichts zurückgenommen.
  await awardTrustLevelBadges(event, userId, before, after)
  return after
}

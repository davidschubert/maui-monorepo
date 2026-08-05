import { TRUST_LEVEL_EARNABLE_MAX, TRUST_LEVEL_LEADER, normalizeTrustLevel, type TrustLevel } from '../../core/shared/trustLevel'

/**
 * DIE SCHWELLEN DER VERTRAUENSSTUFEN (F1 Teilpaket 3, Davids Entscheidung
 * „Mittel" vom 2026-08-04).
 *
 * PURE und unit-getestet: Server (Aufstieg beim Schreiben) und Client
 * (Fortschritts-Anzeige in der Galerie) rechnen mit derselben Liste. Was eine
 * Stufe VERLEIHT, steht bewusst woanders — in `core/shared/trustLevel.ts`, weil
 * das RBAC ist und core keine Produkt-Schwellen kennen darf (A14). Hier steht
 * nur, wie man sie verdient.
 *
 * ── DAVIDS ZAHLEN, UND-VERKNÜPFT ──────────────────────────────────────────
 *   TL1 Basic   ≥2 Tage  · ≥1 Inhalt  · ≥1 vergeben
 *   TL2 Member  ≥15 Tage · ≥5 Inhalte · ≥10 vergeben · ≥5 erhalten
 *   TL3 Regular ≥60 Tage · ≥25 Inhalte· ≥50 vergeben · ≥25 erhalten
 *   TL4 Leader  NUR von Hand (Owner ernennt/entzieht)
 *
 * ALLE Bedingungen einer Stufe müssen erfüllt sein (UND, nie ODER) — dasselbe
 * Prinzip wie im Abzeichen-Katalog, und aus demselben Grund: ein ODER ist eine
 * Bedingung, die man niemandem mehr in einem Satz erklären kann.
 *
 * „Inhalte" ist die SUMME aus eröffneten Themen und geschriebenen Antworten.
 * Die Zähler führen beide getrennt (der Core-Vertrag begründet, warum), gefragt
 * wird hier nach beidem zusammen: Davids Zahl heißt „Inhalte", nicht „Themen".
 *
 * ── KEIN ABSTIEG, UND ZWAR AUS ZWEI GRÜNDEN ───────────────────────────────
 * Davids Entscheidung sagt es ausdrücklich, und die Mechanik verlangt es
 * ohnehin: die Zähler KÖNNEN sinken (eine zurückgenommene Stimme zählt
 * herunter), und das Beitrittsdatum kommt aus einem anderen Appwrite-Projekt
 * und darf fail-soft „unbekannt" sein. Ein Abstieg wäre damit nicht nur
 * unhöflich, sondern regelmäßig FALSCH — jemand verlöre seine Rechte, weil
 * gerade eine Verbindung klemmt. Deshalb rechnet `earnedTrustLevel` immer den
 * Vollstand, und `raisedTrustLevel` schreibt nur nach oben.
 *
 * ── UNBEKANNTE ZUGEHÖRIGKEIT IST NICHT ERFÜLLT ────────────────────────────
 * Dieselbe Lehre wie beim Jahrestag (`badgeEarned`): `memberForDays === null`
 * heißt UNBEKANNT, nicht „null Tage" — aber gerade deshalb gilt die
 * Zeitbedingung als NICHT erfüllt. Ohne diese Zeile ginge „unbekannt" als
 * „lange genug" durch, und ausgerechnet dort, wo die Naht zum Control Plane
 * fehlt, bekäme jeder sofort Stufe 3.
 */

/** Was die Regel über einen Menschen wissen muss. */
export interface TrustLevelFacts {
  /** Tage seit dem Beitritt — `null` heißt UNBEKANNT, nicht „null Tage". */
  memberForDays: number | null
  /** Eröffnete Themen PLUS geschriebene Antworten. */
  contentCreated: number
  /** Selbst vergebene Aufstimmen. */
  upvotesGiven: number
  /** Auf eigene Inhalte erhaltene Aufstimmen. */
  upvotesReceived: number
}

/** Die vier Bedingungs-Arten einer Stufe — Reihenfolge = Anzeige-Reihenfolge. */
export const TRUST_LEVEL_CONDITIONS = ['memberForDays', 'contentCreated', 'upvotesGiven', 'upvotesReceived'] as const
export type TrustLevelCondition = (typeof TRUST_LEVEL_CONDITIONS)[number]

export interface TrustLevelRequirement {
  level: TrustLevel
  /** Bedingung → geforderter Mindestwert. 0 heißt „wird nicht gefordert". */
  requires: Record<TrustLevelCondition, number>
}

/**
 * Die ERARBEITBAREN Stufen, aufsteigend. Stufe 4 fehlt hier bewusst: sie hat
 * keine Schwelle, sie hat eine Ernennung — stünde sie mit erfundenen Zahlen
 * hier, wäre „nur von Hand" nur noch eine Notiz statt einer Eigenschaft der
 * Liste, aus der gerechnet wird.
 */
export const TRUST_LEVEL_THRESHOLDS: readonly TrustLevelRequirement[] = [
  { level: 1, requires: { memberForDays: 2, contentCreated: 1, upvotesGiven: 1, upvotesReceived: 0 } },
  { level: 2, requires: { memberForDays: 15, contentCreated: 5, upvotesGiven: 10, upvotesReceived: 5 } },
  { level: 3, requires: { memberForDays: 60, contentCreated: 25, upvotesGiven: 50, upvotesReceived: 25 } },
]

/** Die Schwelle einer Stufe — `null` für 0 und für die ernannte Stufe 4. */
export function trustLevelRequirement(level: number): TrustLevelRequirement | null {
  return TRUST_LEVEL_THRESHOLDS.find(entry => entry.level === level) ?? null
}

/** PURE: der gemessene Wert einer Bedingung. `null` = unbekannt (nur bei Tagen). */
export function trustLevelMeasured(condition: TrustLevelCondition, facts: TrustLevelFacts): number | null {
  return condition === 'memberForDays' ? facts.memberForDays : facts[condition]
}

/** PURE: Ist DIESE eine Bedingung erfüllt? Unbekannt ⇒ nein. */
export function trustLevelConditionMet(
  condition: TrustLevelCondition,
  target: number,
  facts: TrustLevelFacts,
): boolean {
  if (target <= 0) return true
  const measured = trustLevelMeasured(condition, facts)
  return measured !== null && measured >= target
}

/** PURE: Sind ALLE Bedingungen dieser Stufe erfüllt? */
export function trustLevelReached(requirement: TrustLevelRequirement, facts: TrustLevelFacts): boolean {
  return TRUST_LEVEL_CONDITIONS.every(condition =>
    trustLevelConditionMet(condition, requirement.requires[condition], facts))
}

/**
 * PURE: Die höchste ERARBEITETE Stufe bei diesem Stand (0–3).
 *
 * KEIN Durchreichen der Stufen: gerechnet wird von unten nach oben und beim
 * ersten Fehlschlag angehalten. Wer die Zeit für Stufe 3 hat, aber zu wenig
 * geschrieben, bekommt Stufe 2 nur, wenn er DEREN Bedingungen erfüllt — Stufen
 * überspringt man nicht rückwärts.
 */
export function earnedTrustLevel(facts: TrustLevelFacts): TrustLevel {
  let reached: TrustLevel = 0
  for (const requirement of TRUST_LEVEL_THRESHOLDS) {
    if (!trustLevelReached(requirement, facts)) break
    reached = requirement.level
  }
  return reached
}

/**
 * PURE: Was soll GESPEICHERT werden? — `null`, wenn nichts zu schreiben ist.
 *
 * Die eine Zeile, die „kein Abstieg" durchsetzt: geschrieben wird nur, wenn die
 * frisch gerechnete Stufe ÜBER der gespeicherten liegt. Ein gleicher oder
 * niedrigerer Stand ergibt `null` — also keinen Datenbank-Schritt, nicht nur
 * keinen Rückschritt. Das ist der Normalfall: an den allermeisten
 * Schreibvorgängen ändert sich gar nichts.
 */
export function raisedTrustLevel(stored: unknown, earned: TrustLevel): TrustLevel | null {
  const current = normalizeTrustLevel(stored)
  return earned > current ? earned : null
}

/**
 * PURE: Die Stufe, die WIRKT — Davids „max(gespeichert, TL4-Ernennung)".
 *
 * Zwei Quellen, eine Antwort: die erarbeitete Stufe (0–3) und die Ernennung.
 * Die Ernennung gewinnt immer, weil 4 über allem liegt; nimmt der Owner sie
 * zurück, steht das Erarbeitete unverändert darunter und wird wieder sichtbar.
 * Genau dafür sind es zwei Spalten (Begründung in Migration posts-016).
 */
export function effectiveTrustLevel(stored: unknown, leader: boolean): TrustLevel {
  return leader ? TRUST_LEVEL_LEADER : normalizeTrustLevel(stored)
}

/** Eine einzelne Bedingung auf dem Weg zur nächsten Stufe. */
export interface TrustLevelProgressEntry {
  condition: TrustLevelCondition
  /** Der geforderte Wert. */
  target: number
  /** Der gemessene Wert — `null` = unbekannt (nur bei der Zugehörigkeit). */
  current: number | null
  met: boolean
  /** Wie viel fehlt noch? 0, wenn erfüllt; = `target`, wenn unbekannt. */
  missing: number
}

export interface TrustLevelProgress {
  /** Die Stufe, auf die zugegangen wird. */
  level: TrustLevel
  entries: TrustLevelProgressEntry[]
}

/**
 * PURE: Der Weg zur NÄCHSTEN erarbeitbaren Stufe — `null`, wenn es keine gibt.
 *
 * `null` heißt genau zwei Dinge, und beide sind kein Fehler: die Stufe 3 ist
 * erreicht (mehr kann man sich nicht verdienen), oder es läuft eine Ernennung
 * (Stufe 4 — dort ist „Fortschritt" gegenstandslos, es gibt nichts zu tun).
 *
 * GEZEIGT WIRD JEDE BEDINGUNG EINZELN, auch die erfüllten. Ein einzelner Balken
 * müsste sich für eine entscheiden und läse sich wie „fast geschafft", während
 * drei andere Zahlen weit weg sind — dieselbe Überlegung, aus der
 * `badgeProgress` bei mehreren Bedingungen lieber gar nichts sagt. Hier gibt es
 * IMMER mehrere, also wird die Liste zur Antwort statt zur Ausrede.
 *
 * Bedingungen mit Ziel 0 (bei Stufe 1 die erhaltene Zustimmung) fallen raus:
 * „0 von 0" ist keine Aufgabe.
 */
export function trustLevelProgress(effective: TrustLevel, facts: TrustLevelFacts): TrustLevelProgress | null {
  if (effective >= TRUST_LEVEL_EARNABLE_MAX) return null

  const requirement = trustLevelRequirement(effective + 1)
  if (!requirement) return null

  const entries: TrustLevelProgressEntry[] = []
  for (const condition of TRUST_LEVEL_CONDITIONS) {
    const target = requirement.requires[condition]
    if (target <= 0) continue
    const current = trustLevelMeasured(condition, facts)
    const met = trustLevelConditionMet(condition, target, facts)
    entries.push({
      condition,
      target,
      current,
      met,
      // Unbekannt ⇒ es fehlt alles. Eine ehrliche Zahl ist besser als eine
      // beruhigende: „noch 60 Tage" ist wahr, „noch 0" wäre eine Zusage.
      missing: met ? 0 : Math.max(0, target - (current ?? 0)),
    })
  }
  return { level: requirement.level, entries }
}

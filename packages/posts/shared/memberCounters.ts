/**
 * DIE RECHENREGELN DER MITSCHREIBENDEN ZÄHLER (F1, gemeinsames Paket).
 *
 * PURE und unit-getestet — hier steht, WAS gerechnet wird; WO es landet und wie
 * die Zähler-NAMEN des Core-Vertrags heißen, steht in
 * `server/utils/memberCounters.ts`. Diese Datei kennt bewusst keinen
 * Zähler-Namen: `shared/` läuft auch im Browser, und die Namen gehören einem
 * Server-Vertrag.
 */

/** Die Spalten, die additiv geführt werden (ohne `seeded`). */
export const MEMBER_COUNTER_COLUMNS = [
  'topicsCreated',
  'repliesCreated',
  'upvotesGiven',
  'upvotesReceived',
  'edits',
] as const

export type MemberCounterColumn = (typeof MEMBER_COUNTER_COLUMNS)[number]

/** Die Zahlen einer Zähler-Zeile, ohne Appwrite-Beiwerk. */
export type MemberCounterValues = Record<MemberCounterColumn, number>

export function emptyMemberCounterValues(): MemberCounterValues {
  return { topicsCreated: 0, repliesCreated: 0, upvotesGiven: 0, upvotesReceived: 0, edits: 0 }
}

/**
 * Was die Aggregat-Quellen zum Eichen beisteuern können — mehr gibt der Bestand
 * nicht her (Begründung bei `seedValuesFrom`).
 */
export interface MemberCounterSeedInput {
  topicsCreated: number
  repliesCreated: number
  upvotesGiven: number
}

/** PURE: eine gemeldete Zahl auf eine brauchbare Anzahl bringen. */
function whole(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

/**
 * PURE: die STARTWERTE aus den Aggregat-Zählern (Lazy-Seed).
 *
 * ── DREI VON FÜNF, UND DAS IST KEINE LÜCKE, SONDERN DIE WAHRHEIT ───────────
 * Geeicht werden kann nur, was sich aus dem BESTAND ausrechnen lässt:
 *  - `topicsCreated` / `repliesCreated` — eine `count`-Abfrage je Quelle, exakt.
 *  - `upvotesGiven` — der Zähler `likesGiven`, den die Quellen ohnehin melden.
 *
 * Die anderen beiden STARTEN BEI 0, und beide Male ist das unvermeidlich:
 *  - `upvotesReceived` wäre die SUMME der `upvotes`-Spalte über alle eigenen
 *    Inhalte. Appwrite kann eine Spalte nicht summieren; man müsste jeden
 *    eigenen Beitrag und jede eigene Antwort seitenweise laden — bei einem
 *    langjährigen Mitglied Dutzende Abfragen, ausgelöst durch das Öffnen einer
 *    Galerie. Verworfen.
 *  - `edits` wäre gar nicht erst ausrechenbar: eine Bearbeitung hinterlässt
 *    einen ZEITSTEMPEL, keine Anzahl. Wer vor der Umstellung zehnmal
 *    nachgebessert hat, ist von seiner Vergangenheit nicht zu unterscheiden.
 *
 * Was das praktisch heißt, gehört ausgesprochen: das Abzeichen „Editor" zählt
 * ab der Umstellung, und eine spätere Trust-Level-Schwelle „erhaltene
 * Zustimmung" ebenso. Das ist der Preis dafür, dass es diese Zahlen überhaupt
 * gibt — und der Grund, warum sie JETZT mitgeschrieben werden statt später.
 *
 * EIN MASSEN-BACKFILL WAR NIE EINE OPTION: die Zeilen liegen in jedem
 * Runtime-Projekt einzeln (Pool, jede Silo-Instanz), ein Lauf bekäme genau
 * EINEN Schlüssel für EINE Instanz, müsste über alle Mitglieder aller
 * Communities rechnen — und wäre in dem Moment veraltet, in dem der nächste
 * Mensch etwas schreibt. Deshalb beim ersten Hinsehen, für genau einen
 * Menschen, genau einmal.
 */
export function seedValuesFrom(input: Partial<MemberCounterSeedInput>): MemberCounterValues {
  return {
    topicsCreated: whole(input.topicsCreated),
    repliesCreated: whole(input.repliesCreated),
    upvotesGiven: whole(input.upvotesGiven),
    upvotesReceived: 0,
    edits: 0,
  }
}

/**
 * PURE: Ist der geeichte Stand hinter dem Aggregat zurückgefallen?
 *
 * WOFÜR: die Meldungen sind fail-soft (ein Zähler darf nie einen Kommentar
 * kosten), also KANN ein Ereignis untergehen — bei einem Deploy mitten im
 * Schreibvorgang, bei einer Störung des Datenbank-Schritts. Nach unten darf
 * dieser Verlust nicht bleiben: er würde ein verdientes Abzeichen dauerhaft
 * verhindern, und niemand käme je darauf, warum.
 *
 * Die Selbstheilung ist billig, weil das Aggregat an der Auswertestelle
 * OHNEHIN gerechnet wird (die Schwellen-Fragen brauchen es). Nur die Richtung
 * ist einseitig: ein Aggregat, das HÖHER liegt, zieht den Zähler nach; ein
 * niedrigeres wird ignoriert — sonst machte jeder Aufruf die zusätzlich
 * mitgeschriebenen Spalten (`edits`, `upvotesReceived`) wieder platt.
 */
export function counterFellBehind(
  stored: MemberCounterValues,
  input: Partial<MemberCounterSeedInput>,
): boolean {
  const seed = seedValuesFrom(input)
  return seed.topicsCreated > stored.topicsCreated
    || seed.repliesCreated > stored.repliesCreated
    || seed.upvotesGiven > stored.upvotesGiven
}

/**
 * PURE: den nachgezogenen Stand bilden — die eichbaren Spalten auf das Aggregat
 * heben, die rein mitgeschriebenen unangetastet lassen.
 */
export function healedValues(
  stored: MemberCounterValues,
  input: Partial<MemberCounterSeedInput>,
): MemberCounterValues {
  const seed = seedValuesFrom(input)
  return {
    topicsCreated: Math.max(stored.topicsCreated, seed.topicsCreated),
    repliesCreated: Math.max(stored.repliesCreated, seed.repliesCreated),
    upvotesGiven: Math.max(stored.upvotesGiven, seed.upvotesGiven),
    upvotesReceived: stored.upvotesReceived,
    edits: stored.edits,
  }
}

/** PURE: die Zahlen einer gelesenen Zeile, defensiv (fehlend/kaputt ⇒ 0). */
export function memberCounterValues(row: Partial<Record<MemberCounterColumn, unknown>> | null): MemberCounterValues {
  const values = emptyMemberCounterValues()
  if (!row) return values
  for (const column of MEMBER_COUNTER_COLUMNS) {
    const raw = row[column]
    values[column] = whole(typeof raw === 'number' ? raw : undefined)
  }
  return values
}

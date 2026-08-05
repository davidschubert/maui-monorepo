import { MESSAGE_PREVIEW_LENGTH } from './types/message'

/**
 * DIE PUREN REGELN EINER KONVERSATION (Konzept § 4).
 *
 * Hier steht ausschließlich Rechnung, kein Datenzugriff — Server und
 * Oberfläche benutzen dieselbe Quelle, und alles davon ist ohne Nitro
 * testbar. Die Fragen, die diese Datei beantwortet:
 *  - Wie viele Teilnehmer darf eine Konversation haben? (v1: genau zwei)
 *  - Wie heißt der eindeutige Schlüssel eines Teilnehmer-SATZES?
 *  - Wann verschwindet ein Verlauf wirklich?
 */

/**
 * WIE VIELE TEILNEHMER v1 ERLAUBT (Davids Entscheidung 6: n:m-fähig gebaut,
 * 1:1 ausgeliefert).
 *
 * Das ist der EINE Ort, an dem die Beschränkung steht. Gruppen-Nachrichten
 * (TL2, Konzept § 7 Stufe 3) ändern hier eine Zahl — nicht das Datenmodell.
 * Deshalb steht sie auch nicht in der Migration: ein Schema, das zwei
 * Teilnehmer erzwingt, verschöbe die Entscheidung dorthin, wo man sie nur mit
 * einer Migration zurücknehmen kann.
 */
export const CONVERSATION_PARTICIPANTS_V1 = 2

/**
 * Teilnehmer normalisieren: leere Werte raus, Doubletten raus, sortiert.
 *
 * SORTIERT, weil daraus der eindeutige Schlüssel entsteht — „A schreibt B" und
 * „B schreibt A" müssen denselben ergeben, sonst hat dasselbe Paar zwei
 * Konversationen und jeder liest seine eigene Hälfte.
 */
export function normalizeParticipants(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort()
}

/** Ist das ein gültiger Teilnehmer-Satz für die AUSGELIEFERTE Fassung? */
export function isValidParticipantSet(ids: readonly string[]): boolean {
  return normalizeParticipants(ids).length === CONVERSATION_PARTICIPANTS_V1
}

/**
 * Der eindeutige Schlüssel eines Teilnehmer-SATZES.
 *
 * Warum eine eigene Spalte und nicht ein Unique-Index über die Teilnehmer:
 * über eine Array-Spalte gibt es in Appwrite gar keinen Index, und über eine
 * eigene Tabelle keinen, der einen SATZ eindeutig macht. Ohne diesen Schlüssel
 * entstünden bei zwei gleichzeitigen ersten Nachrichten zwei Konversationen
 * desselben Paares — derselbe Grund, aus dem `member_counters` (posts-013)
 * blind schreibt und einen 409 als „jemand war schneller" liest.
 *
 * Der Doppelpunkt trennt sicher: Appwrite-Row-Ids sind alphanumerisch.
 */
export function conversationPairKey(ids: readonly string[]): string {
  return normalizeParticipants(ids).join(':')
}

/** Das Gegenüber in einer 1:1-Konversation ('' wenn es keines gibt). */
export function otherParticipant(participants: readonly string[], userId: string): string {
  return participants.find(id => id !== userId) ?? ''
}

/** Ist dieser Mensch beteiligt? */
export function isParticipant(participants: readonly string[], userId: string): boolean {
  return participants.includes(userId)
}

/**
 * Eine gelesene Zahl als Zähler lesen.
 *
 * Alles Unbrauchbare (fehlend, kaputt, negativ) wird 0. Ohne diese Zeile wäre
 * ein `undefined` aus einer Bestandszeile eine NaN-Quelle, die sich durch jede
 * Anzeige zieht — dieselbe fail-soft-Richtung wie bei `normalizeTrustLevel`.
 */
export function counterValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/**
 * Die einzeilige Vorschau in der Liste.
 *
 * Zeilenumbrüche werden zu Leerzeichen: die Liste hat EINE Zeile, und ein
 * Umbruch im Datenfeld würde dort als Lücke erscheinen. Gekürzt wird hart —
 * die Vorschau ist keine Nachricht, sondern ein Wiedererkennungszeichen.
 */
export function messagePreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= MESSAGE_PREVIEW_LENGTH) return flat
  return `${flat.slice(0, MESSAGE_PREVIEW_LENGTH - 1)}…`
}

/**
 * Wer die Konversation für sich entfernt hat, bekommt sie beim nächsten
 * SCHREIBEN zurück (Davids Entscheidung 5: „unbegrenzt, dafür selbst
 * entfernbar").
 *
 * Das Entfernen ist eine Ansicht-Entscheidung, keine Löschung: eine neue
 * Nachricht macht den Verlauf für ALLE wieder sichtbar, sonst wäre „ich räume
 * auf" dasselbe wie „ich schweige diese Person tot" — und der Absender bekäme
 * keinen Hinweis, dass seine Nachricht nirgends ankommt.
 *
 * PUR formuliert als Frage an eine einzelne Mitglieds-Zeile, weil genau so
 * geschrieben wird: eine Zeile je Teilnehmer.
 */
export function memberAfterMessage(closed: boolean): { closed: boolean } | null {
  return closed ? { closed: false } : null
}

/**
 * Sind ALLE Teilnehmer raus? Dann darf die Zeile wirklich weg — genau Davids
 * Formulierung „gelöscht wird sie, wenn beide es getan haben".
 */
export function conversationIsAbandoned(closedFlags: readonly boolean[]): boolean {
  return closedFlags.length > 0 && closedFlags.every(Boolean)
}

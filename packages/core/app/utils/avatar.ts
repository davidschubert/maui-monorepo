/**
 * Avatar-Initialen aus einem Anzeigenamen (Audit-Befund S2).
 *
 * Nuxt UI berechnet den UAvatar-Fallback selbst als
 * `alt.split(' ').map(w => w.charAt(0)).join('').substring(0, 2)` — das nimmt
 * das erste ZEICHEN jedes Wortes, auch wenn es kein Buchstabe ist: aus
 * „Lena (Coach)" wurde „L(". Deshalb berechnen wir die Initialen selbst und
 * übergeben sie UAvatar als `text` (das schlägt den eingebauten Fallback).
 *
 * Regeln (bewusst gewählt, damit alle Avatare identisch aussehen):
 * 1. Klammer-Zusätze („Lena (Coach)", „Max [Support]") werden ENTFERNT — sie
 *    sind Rollen-/Kontext-Anhänge, keine Namensbestandteile: → „L".
 *    Bleibt danach nichts übrig („(Test)"), zählt der Rohname → „T".
 * 2. Nur Buchstaben/Ziffern-Anläufe zählen (Unicode-fähig, \p{L}\p{N}):
 *    Emoji-, Interpunktions- und Symbol-Präfixe werden übersprungen.
 * 3. Maximal 2 Initialen, aus den ERSTEN zwei Wörtern (wie bisher bei Nuxt UI
 *    — „Anna Lena Müller" → „AL", nicht „AM").
 * 4. Ergebnis wird großgeschrieben (locale-bewusst; bei Schriften ohne
 *    Groß-/Kleinschreibung, z. B. „李 明" → „李明", ändert das nichts).
 *
 * Rückgabe '' bedeutet „keine Initialen möglich" (Name ohne Buchstaben/Ziffern,
 * z. B. rein Emoji). UAvatar behandelt einen leeren `text` als „nicht gesetzt"
 * und zeigt dann seinen eigenen Fallback (Icon bzw. Alt-Zeichen) — genau
 * richtig, denn in diesem Fall gibt es nichts Besseres zu zeigen.
 */

/** Klammer-Zusätze inkl. Inhalt (rund/eckig/geschweift, auch CJK-Klammern) */
const BRACKETED = /[([{（【][^)\]}）】]*[)\]}）】]?/gu

/** Ein „Wort" beginnt mit Buchstabe/Ziffer; danach dürfen Marks/Bindestriche folgen */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu

function firstLetters(value: string): string {
  const words = value.match(WORD) ?? []
  return words
    .slice(0, 2)
    // [...word][0]: Code-Point-sicher (kein halbes Surrogat-Paar)
    .map(word => ([...word][0] ?? '').toLocaleUpperCase())
    .join('')
}

export function avatarInitials(name?: string | null, fallback?: string | null): string {
  const source = (name ?? '').trim() || (fallback ?? '').trim()
  if (!source) return ''
  return firstLetters(source.replace(BRACKETED, ' ')) || firstLetters(source)
}

/**
 * WANN GILT EIN BEITRAG ALS „BEARBEITET"? (F1, `posts.editedAt`.)
 *
 * PURE und unit-getestet, weil die Antwort NICHT aus der Route hervorgeht: der
 * Bearbeiten-Endpunkt (`[id].patch.ts`) bekommt Titel UND Text bei JEDEM
 * Speichern mitgeschickt — auch dann, wenn nur die Kategorie gewechselt wurde.
 * Wer dort blind einen Zeitstempel setzte, hätte „bearbeitet" an jedem Thema
 * stehen, das jemand nur einsortiert hat.
 *
 * ── DIE REGEL: INHALT JA, ZUSTAND NEIN ─────────────────────────────────────
 * Gesetzt wird ausschließlich, wenn TITEL oder TEXT sich wirklich ändern.
 * Ausdrücklich NICHT:
 *  - Umkategorisieren (dasselbe Formular, andere Absicht),
 *  - Anheften/Schließen/Gelöst (`state.patch.ts` — schreibt nur sein eines Feld),
 *  - Stimmen, Ausblenden, Wiederherstellen.
 * Der Grund ist der Leser: „bearbeitet" ist eine Aussage über den TEXT, den er
 * gerade liest. Steht es an einem Thema, das nur moderiert wurde, heißt es für
 * ihn „hier wurde etwas geändert, was du vorher gesehen hast" — und das wäre
 * falsch.
 *
 * ── TITEL: '' UND null SIND DASSELBE ───────────────────────────────────────
 * Die Route speichert `input.title || null`, die Spalte ist leer-fähig, und das
 * Formular schickt für einen fehlenden Titel den leeren String. Ohne diese
 * Gleichsetzung wäre das Speichern eines titellosen Beitrags ohne jede Änderung
 * eine „Bearbeitung" — jedes Mal aufs Neue.
 */

export interface PostEditableContent {
  title: string | null
  body: string
}

/** PURE: Titel-Normalform — leer ist leer, egal in welcher Schreibweise. */
function normalizedTitle(title: string | null | undefined): string {
  return title ?? ''
}

/** Hat sich am INHALT etwas geändert? */
export function postContentEdited(before: PostEditableContent, after: PostEditableContent): boolean {
  if (normalizedTitle(before.title) !== normalizedTitle(after.title)) return true
  return before.body !== after.body
}

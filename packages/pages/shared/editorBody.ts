/**
 * ÖFFNEN DARF NICHTS ÄNDERN (Live-Befund 2026-08-03, F2-Nachtrag).
 *
 * Der Seiten-Editor startet im Reiter „Schreiben". Beim Montieren parst Tiptap
 * den Markdown und serialisiert ihn ZURÜCK — dabei maskiert es eckige
 * Klammern: aus `[Straße und Nummer]` wird `\[Straße und Nummer\]`. Wer eine
 * Seite nur aufschlägt und speichert, ohne ein Zeichen zu tippen, schriebe
 * diese Maskierung in die Datenbank, und der Backslash stünde danach auf der
 * öffentlichen Seite. Getroffen hätte es zuerst die Rechtstexte — die stecken
 * voller Platzhalter in eckigen Klammern.
 *
 * Die Regel dagegen ist eine Unterscheidung, keine Reparatur: die erste
 * Fassung, die der Editor VON SICH AUS schreibt, ist `normalized`. Steht beim
 * Speichern noch genau sie im Feld, hat niemand getippt — dann geht die
 * Urfassung raus. Jede andere Abweichung ist echte Bearbeitung und wird
 * gespeichert.
 *
 * BEWUSST NICHT so gelöst: dem Renderer Backslash-Escapes beibringen (wäre
 * CommonMark-konform, änderte aber die Darstellung ALLER bestehenden Inhalte),
 * oder `\[` beim Speichern zurückersetzen (rät, was der Mensch meinte, und
 * zerstörte ein absichtlich geschriebenes `\[`).
 */
export interface EditorBodyState {
  /** Was gerade im Formular steht. */
  current: string
  /** Was aus der API kam. */
  pristine: string
  /** Die erste Selbst-Änderung des Editors; `null` = es gab keine. */
  normalized: string | null
}

export function bodyToSave({ current, pristine, normalized }: EditorBodyState): string {
  if (normalized !== null && current === normalized) return pristine
  return current
}

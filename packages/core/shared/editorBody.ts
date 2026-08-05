/**
 * ÖFFNEN DARF NICHTS ÄNDERN (Live-Befund 2026-08-03, F2-Nachtrag; seit
 * 2026-08-04 in core, weil es die zweite Schreibfläche gibt — siehe unten).
 *
 * Ein WYSIWYG-Editor über einem Markdown-Text macht beim Montieren einen
 * Rundlauf: er parst den Text und serialisiert ihn zurück. Dabei maskiert
 * `@tiptap/markdown` HARTKODIERT jedes Sonderzeichen in einem Text-Knoten —
 * aus `[Straße und Nummer]` wird `\[Straße und Nummer\]`, aus `snake_case`
 * wird `snake\_case`. Wer ein Dokument nur aufschlägt und speichert, ohne ein
 * Zeichen zu tippen, schriebe diese Maskierung in die Datenbank.
 *
 * Die Regel dagegen ist eine Unterscheidung, keine Reparatur: die erste
 * Fassung, die der Editor VON SICH AUS schreibt, ist `normalized`. Steht beim
 * Speichern noch genau sie im Feld, hat niemand getippt — dann geht die
 * Urfassung raus. Jede andere Abweichung ist echte Bearbeitung.
 *
 * ── WARUM SIE BLEIBT, OBWOHL DER RENDERER DIE MASKIERUNG VERSTEHT ─────────
 * Der ursprüngliche Schaden ist weg: seit dem 2026-08-04 löst
 * `core/shared/markdown.ts` Backslash-Escapes nach CommonMark auf, `\[…\]`
 * zeigt also keinen Backslash mehr. Zwei Gründe tragen die Regel trotzdem:
 *  - Ein Speichern ohne Tastendruck wäre sonst eine BEARBEITUNG. Bei
 *    Beiträgen hängt daran sichtbar `editedAt` („bearbeitet", posts/shared/
 *    postEdit.ts) — der Leser bekäme gesagt, am Text habe sich etwas geändert,
 *    obwohl er identisch aussieht.
 *  - Die Maskierung macht den Text LÄNGER. Ein Beitrag dicht an der
 *    Spaltengrenze (`varchar(10000)`) könnte allein vom Aufschlagen über die
 *    Grenze wachsen.
 *
 * BEWUSST NICHT so gelöst: `\[` beim Speichern zurückersetzen — das rät, was
 * der Mensch meinte, und zerstörte ein absichtlich geschriebenes `\[`.
 *
 * Konsumenten: pages (Seiten-Editor), posts (PostCard, Bearbeiten).
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

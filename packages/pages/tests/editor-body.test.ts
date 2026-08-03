import { describe, expect, it } from 'vitest'
import { bodyToSave } from '../shared/editorBody'

/**
 * F2-Nachtrag: Öffnen darf nichts ändern.
 *
 * Der Fall, der das ausgelöst hat, steht als erster Test drin — er ist am
 * Live-System gemessen worden: Tiptap macht beim Serialisieren aus
 * `[Street and number]` ein `\[Street and number\]`, und ohne diese Regel
 * hätte ein Speichern ohne einen einzigen Tastendruck die Maskierung in die
 * Datenbank geschrieben.
 */
const ORIGINAL = 'David Schubert\n[Street and number]\n[Postal code and city]'
const TIPTAP = 'David Schubert\n\\[Street and number\\]\n\\[Postal code and city\\]'

describe('bodyToSave', () => {
  it('speichert die Urfassung, wenn nur der Editor normalisiert hat', () => {
    expect(bodyToSave({ current: TIPTAP, pristine: ORIGINAL, normalized: TIPTAP })).toBe(ORIGINAL)
  })

  it('speichert, was der Mensch geschrieben hat', () => {
    const edited = `${TIPTAP}\nMünchen`
    expect(bodyToSave({ current: edited, pristine: ORIGINAL, normalized: TIPTAP })).toBe(edited)
  })

  it('lässt unberührten Text unberührt, wenn der Editor nie lief', () => {
    // Wer eine Sprachversion gar nicht aufschlägt, hat keine Normalisierung —
    // dann darf die Regel nicht eingreifen.
    expect(bodyToSave({ current: ORIGINAL, pristine: ORIGINAL, normalized: null })).toBe(ORIGINAL)
  })

  it('speichert eine Bearbeitung auch ohne vorherige Normalisierung', () => {
    // Rohtext-Modus: dort tippt man direkt, der Editor war nie montiert.
    expect(bodyToSave({ current: 'ganz neu', pristine: ORIGINAL, normalized: null })).toBe('ganz neu')
  })

  it('speichert eine geleerte Seite als leer — nicht als Urfassung', () => {
    // Gegenprobe: die Regel darf nicht „alles Leere ist ein Versehen" raten.
    expect(bodyToSave({ current: '', pristine: ORIGINAL, normalized: TIPTAP })).toBe('')
  })
})

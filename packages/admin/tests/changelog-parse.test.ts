import { describe, it, expect } from 'vitest'
// Geteilte Parser-Quelle der Appwrite Function (Track 2B) — auch von Track 2A genutzt.
// @ts-expect-error — reine JS-Datei ohne Typdeklaration (Function-Runtime).
import { parseCommitsToDraft } from '../../../functions/changelog-draft/src/parse.js'

describe('parseCommitsToDraft', () => {
  it('mappt feat/fix/perf/refactor auf Abschnitte und ignoriert chore/docs/…', () => {
    const draft = parseCommitsToDraft([
      'feat(core): neue Anmeldung',
      'fix(comments): Vote-Zähler korrigiert',
      'perf(admin): Liste schneller',
      'refactor(core): Realtime gebündelt',
      'chore: deps bump',
      'docs: readme',
      'kaputte zeile ohne typ',
    ], { version: 'v1.5' })

    expect(draft.counted).toBe(4)
    expect(draft.sectionCount).toBe(3)
    expect(draft.title).toBe('Entwurf v1.5')
    // Abschnitts-Reihenfolge stabil: Funktionen → Verbesserungen → Fehler
    expect(draft.body.indexOf('Neue Funktionen')).toBeLessThan(draft.body.indexOf('Verbesserungen'))
    expect(draft.body.indexOf('Verbesserungen')).toBeLessThan(draft.body.indexOf('Fehlerbehebungen'))
    // Beschreibung wird großgeschrieben und als Bullet gelistet
    expect(draft.body).toContain('• Neue Anmeldung')
  })

  it('dominante Kategorie (meiste Einträge) bestimmt die category', () => {
    const draft = parseCommitsToDraft([
      'feat: a', 'feat: b', 'feat: c', 'fix: x',
    ])
    expect(draft.category).toBe('feature')
  })

  it('perf und refactor zählen beide als improvement-Abschnitt', () => {
    const draft = parseCommitsToDraft(['perf: schneller', 'refactor: sauberer'])
    expect(draft.category).toBe('improvement')
    expect(draft.sectionCount).toBe(1)
    expect(draft.body).toContain('Verbesserungen')
  })

  it('ohne Version nutzt title den range', () => {
    const draft = parseCommitsToDraft(['feat: x'], { range: 'v1.4..HEAD' })
    expect(draft.title).toBe('Entwurf v1.4..HEAD')
  })

  it('keine relevanten Commits → counted 0, leere Felder', () => {
    const draft = parseCommitsToDraft(['chore: x', 'docs: y', ''])
    expect(draft.counted).toBe(0)
    expect(draft.body).toBe('')
    expect(draft.category).toBe('')
  })

  it('breaking-Marker (feat!:) wird weiterhin als feat erkannt', () => {
    const draft = parseCommitsToDraft(['feat!: umbau'])
    expect(draft.counted).toBe(1)
    expect(draft.category).toBe('feature')
  })
})

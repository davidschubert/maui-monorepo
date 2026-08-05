import { describe, expect, it } from 'vitest'
import { postContentEdited } from '../shared/postEdit'

/**
 * „Bearbeitet" heißt INHALT, nicht Formular abgeschickt (F1, `posts.editedAt`).
 *
 * Der Fehler, gegen den dieser Test schützt, ist NICHT der offensichtliche
 * (Text geändert ⇒ bearbeitet), sondern der stille: das Bearbeiten-Formular
 * schickt Titel und Text bei JEDEM Speichern mit, auch beim bloßen
 * Umkategorisieren. Wer dort blind stempelt, hat „bearbeitet" an Themen
 * stehen, an deren Text nie jemand war — und das merkt niemand beim Bauen.
 */
const original = { title: 'Wie funktioniert das?', body: 'Ich verstehe es nicht.' }

describe('postContentEdited — Inhalt ja', () => {
  it('erkennt einen geänderten Text', () => {
    expect(postContentEdited(original, { ...original, body: 'Jetzt verstehe ich es.' })).toBe(true)
  })

  it('erkennt einen geänderten Titel', () => {
    expect(postContentEdited(original, { ...original, title: 'Doch eine andere Frage' })).toBe(true)
  })

  it('erkennt einen nachträglich gesetzten Titel', () => {
    expect(postContentEdited({ title: null, body: 'x' }, { title: 'Neu', body: 'x' })).toBe(true)
  })

  it('erkennt einen entfernten Titel', () => {
    expect(postContentEdited({ title: 'Weg damit', body: 'x' }, { title: null, body: 'x' })).toBe(true)
  })
})

describe('postContentEdited — Zustand nein', () => {
  it('bleibt still, wenn nichts geändert wurde', () => {
    // Genau der Fall „nur umkategorisiert": die Route schickt Titel und Text
    // unverändert mit, geändert hat sich woanders etwas.
    expect(postContentEdited(original, { ...original })).toBe(false)
  })

  it('hält den leeren Titel und null für dasselbe', () => {
    // Die Route speichert `input.title || null`, das Formular schickt für einen
    // fehlenden Titel ''. Ohne diese Gleichsetzung wäre JEDES Speichern eines
    // titellosen Beitrags eine „Bearbeitung" — jedes Mal aufs Neue.
    expect(postContentEdited({ title: null, body: 'x' }, { title: '', body: 'x' })).toBe(false)
    expect(postContentEdited({ title: '', body: 'x' }, { title: null, body: 'x' })).toBe(false)
  })

  it('unterscheidet Leerzeichen sehr wohl', () => {
    // Kein Trimmen: wer ein Leerzeichen einfügt, hat den Text geändert. Eine
    // Normalisierung hier wäre eine zweite Wahrheit neben dem, was gespeichert
    // wird.
    expect(postContentEdited({ title: null, body: 'x' }, { title: null, body: 'x ' })).toBe(true)
  })
})

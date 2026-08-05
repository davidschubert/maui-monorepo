import { describe, expect, it } from 'vitest'
import { POST_EDIT_FIELDS, mayEditPost, mayEditPostField, mayEditPostFields } from '../shared/postEditRights'

/**
 * WER DARF WELCHES FELD EINES FREMDEN BEITRAGS ÄNDERN? (F1 Teilpaket 3.)
 *
 * Davids v1-Rechte: „TL3 darf fremde Themen umbenennen und umkategorisieren;
 * TL4 bekommt … + fremde Beiträge bearbeiten." Die Trennung zwischen HÜLLE und
 * TEXT ist damit die Aussage dieser Regel — und die Gegenprobe (ein Kurator
 * kommt NICHT an den Text) ist der wichtigere Teil.
 */

const AUTHOR = { isAuthor: true, canCurate: false, canRevise: false }
const CURATOR = { isAuthor: false, canCurate: true, canRevise: false }
const REVISER = { isAuthor: false, canCurate: false, canRevise: true }
const STRANGER = { isAuthor: false, canCurate: false, canRevise: false }

describe('der Autor', () => {
  it('darf jedes Feld — unverändert', () => {
    // Die Zusage „TL erweitert nur nach unten, nimmt nie etwas weg": wer vorher
    // durchkam, kommt weiter durch, und zwar ohne jede neue Bedingung.
    for (const field of POST_EDIT_FIELDS) {
      expect(mayEditPostField(field, AUTHOR), field).toBe(true)
    }
  })
})

describe('ein Kurator (posts.curate, Stufe 3)', () => {
  it('darf Titel und Einordnung', () => {
    expect(mayEditPostField('title', CURATOR)).toBe(true)
    expect(mayEditPostField('categoryId', CURATOR)).toBe(true)
  })

  it('darf den TEXT ausdrücklich NICHT', () => {
    // Die Gegenprobe, an der alles hängt: sonst wäre aus „umbenennen" still
    // „umschreiben" geworden.
    expect(mayEditPostField('body', CURATOR)).toBe(false)
    expect(mayEditPostFields(['title', 'body'], CURATOR)).toBe(false)
  })
})

describe('eine Stufe 4 (posts.revise)', () => {
  it('darf alles, was ein Kurator darf — und den Text dazu', () => {
    // Ein Recht am Text, das den Titel nicht mitziehen darf, wäre in der Praxis
    // keines.
    for (const field of POST_EDIT_FIELDS) {
      expect(mayEditPostField(field, REVISER), field).toBe(true)
    }
  })
})

describe('jemand ohne beides', () => {
  it('darf gar nichts', () => {
    expect(mayEditPost(STRANGER)).toBe(false)
    for (const field of POST_EDIT_FIELDS) {
      expect(mayEditPostField(field, STRANGER), field).toBe(false)
    }
  })
})

describe('die tatsächliche Änderung entscheidet', () => {
  it('lässt ein Speichern OHNE Änderung durch', () => {
    // Das Formular schickt Titel und Text bei jedem Speichern mit. Ein
    // Kurator, der nur die Kategorie wechselt, darf am unveränderten Text nicht
    // scheitern — und ein Speichern ohne jede Änderung ist kein Rechtsakt.
    expect(mayEditPostFields([], STRANGER)).toBe(true)
    expect(mayEditPostFields(['categoryId'], CURATOR)).toBe(true)
  })

  it('lehnt ab, sobald EIN unerlaubtes Feld dabei ist', () => {
    expect(mayEditPostFields(['title', 'categoryId'], CURATOR)).toBe(true)
    expect(mayEditPostFields(['title', 'categoryId', 'body'], CURATOR)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_MENTIONS_PER_CONTENT, extractMentionCandidates, splitMentions } from '../shared/mentions'

describe('extractMentionCandidates', () => {
  it('findet eine einfache Erwähnung', () => {
    expect(extractMentionCandidates('Hallo @david, schau mal')).toEqual(['david'])
  })

  it('vergleicht klein geschrieben', () => {
    expect(extractMentionCandidates('Hallo @DavidSchubert')).toEqual(['davidschubert'])
  })

  it('meldet jeden Handle nur EINMAL — sonst gäbe es zwei Meldungen', () => {
    expect(extractMentionCandidates('@david ja, @david wirklich, @David auch')).toEqual(['david'])
  })

  it('findet mehrere in der Reihenfolge des Auftretens', () => {
    expect(extractMentionCandidates('@anna und @bert und @carla')).toEqual(['anna', 'bert', 'carla'])
  })

  it('ist bei MAX_MENTIONS_PER_CONTENT zu Ende', () => {
    const many = Array.from({ length: MAX_MENTIONS_PER_CONTENT + 5 }, (_, i) => `@user${i}`).join(' ')
    expect(extractMentionCandidates(many)).toHaveLength(MAX_MENTIONS_PER_CONTENT)
  })

  it('hält E-Mail-Adressen heraus — die linke Flanke ist der Punkt', () => {
    expect(extractMentionCandidates('Schreib an kontakt@firma.de')).toEqual([])
    expect(extractMentionCandidates('a+b@example.com und x@y.z')).toEqual([])
  })

  it('lässt sich von doppelten @ nicht täuschen', () => {
    expect(extractMentionCandidates('@@david')).toEqual([])
  })

  it('erkennt eine Erwähnung am Zeilenanfang und am Textende', () => {
    expect(extractMentionCandidates('@anna hat recht')).toEqual(['anna'])
    expect(extractMentionCandidates('das findet @bert')).toEqual(['bert'])
  })

  it('endet an Satzzeichen', () => {
    expect(extractMentionCandidates('Danke, @anna!')).toEqual(['anna'])
    expect(extractMentionCandidates('(@bert)')).toEqual(['bert'])
    expect(extractMentionCandidates('@carla, @dora.')).toEqual(['carla', 'dora'])
  })

  it('nimmt einen Unterstrich in der Mitte, aber nicht am Ende', () => {
    expect(extractMentionCandidates('Hallo @erika_muster')).toEqual(['erika_muster'])
    expect(extractMentionCandidates('Hallo @erika_')).toEqual(['erika'])
  })

  // ── Der eigentliche Grund für den AST-Weg ────────────────────────────────
  it('liest die Erwähnung AUCH aus maskiertem Markdown', () => {
    // Genau so schreibt die Schreibfläche einen Unterstrich zurück
    // (@tiptap/markdown maskiert hartkodiert). Über den Rohtext gesucht,
    // wäre dieser Mensch still nie benachrichtigt worden.
    expect(extractMentionCandidates('Hallo @erika\\_muster willkommen')).toEqual(['erika_muster'])
  })

  it('benachrichtigt NICHT wegen eines Namens in Code', () => {
    expect(extractMentionCandidates('Beispiel: `@david` ist ein Handle')).toEqual([])
    expect(extractMentionCandidates('```\ncurl -u @david\n```')).toEqual([])
  })

  it('findet Erwähnungen in Listen, Zitaten, Überschriften und Links', () => {
    expect(extractMentionCandidates('- @anna\n- @bert')).toEqual(['anna', 'bert'])
    expect(extractMentionCandidates('> danke @carla')).toEqual(['carla'])
    expect(extractMentionCandidates('## Für @dora')).toEqual(['dora'])
    expect(extractMentionCandidates('[frag @emil](/feed)')).toEqual(['emil'])
  })

  it('findet Erwähnungen innerhalb von Betonung', () => {
    expect(extractMentionCandidates('**@anna** und *@bert*')).toEqual(['anna', 'bert'])
  })

  it('bleibt bei Text ohne @ sofort stehen', () => {
    expect(extractMentionCandidates('Ein Beitrag ganz ohne Erwähnung.')).toEqual([])
  })

  it('meldet einen überlangen Namen nicht', () => {
    expect(extractMentionCandidates(`@${'a'.repeat(40)}`)).toEqual([])
  })
})

describe('splitMentions', () => {
  const known = new Set(['david', 'anna'])

  it('ohne bekannte Handles wird NICHTS hervorgehoben (fail-closed)', () => {
    expect(splitMentions('Hallo @david')).toEqual([{ type: 'text', text: 'Hallo @david' }])
    expect(splitMentions('Hallo @david', new Set())).toEqual([{ type: 'text', text: 'Hallo @david' }])
  })

  it('zerlegt um eine bekannte Erwähnung herum', () => {
    expect(splitMentions('Hallo @david, hi', known)).toEqual([
      { type: 'text', text: 'Hallo ' },
      { type: 'mention', text: '@david', handle: 'david' },
      { type: 'text', text: ', hi' },
    ])
  })

  it('lässt einen UNBEKANNTEN Namen gewöhnlicher Text bleiben', () => {
    expect(splitMentions('Hallo @niemand', known)).toEqual([{ type: 'text', text: 'Hallo @niemand' }])
  })

  it('behält die getippte Schreibweise, vergleicht aber klein', () => {
    expect(splitMentions('Hi @David', known)).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', text: '@David', handle: 'david' },
    ])
  })

  it('trifft mehrere und lässt Unbekanntes dazwischen stehen', () => {
    expect(splitMentions('@anna @fremd @david', known)).toEqual([
      { type: 'mention', text: '@anna', handle: 'anna' },
      { type: 'text', text: ' @fremd ' },
      { type: 'mention', text: '@david', handle: 'david' },
    ])
  })

  it('rührt E-Mail-Adressen nicht an', () => {
    expect(splitMentions('mail an anna@david.de', known)).toEqual([
      { type: 'text', text: 'mail an anna@david.de' },
    ])
  })

  it('verliert kein Zeichen — die Stücke ergeben wieder den Text', () => {
    for (const text of ['Hallo @david, hi', '@anna @fremd @david', 'nichts', 'x@y.z @anna!']) {
      expect(splitMentions(text, known).map(s => s.text).join(''), text).toBe(text)
    }
  })
})

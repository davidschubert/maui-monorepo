import { describe, expect, it } from 'vitest'
import { guestCommentsAllowed } from '../shared/guestComments'

/**
 * F4 — Gäste schreiben genau dort, wo Gäste auch lesen dürfen.
 *
 * Der Befund war eine Kante von C18: in einer Community mit Publikum 'members'
 * trägt jede neue Zeile `read(label:<communityId>)`, und ein Gast trägt kein
 * Label — er sah seinen eigenen Kommentar nach dem nächsten Seitenaufbau nicht
 * wieder. Die Regel ist PURE, weil Route und Ansicht sie GEMEINSAM brauchen:
 * liefen sie auseinander, stünde ein Formular da, dessen Absenden 404 wird.
 */
describe('guestCommentsAllowed (F4)', () => {
  const open = { embedEnabled: true, guestsEnabled: true, communityIsPublic: true }

  it('offen, freigegeben, im Embed ⇒ Gäste dürfen', () => {
    expect(guestCommentsAllowed(open)).toBe(true)
  })

  it('geschlossene Community schließt Gäste aus — auch bei freigegebenem Schalter', () => {
    expect(guestCommentsAllowed({ ...open, communityIsPublic: false })).toBe(false)
  })

  it('der Betreiber-Schalter bleibt die erste Sperre', () => {
    expect(guestCommentsAllowed({ ...open, guestsEnabled: false })).toBe(false)
  })

  it('ohne Embed gar nicht', () => {
    expect(guestCommentsAllowed({ ...open, embedEnabled: false })).toBe(false)
  })

  it('kein Schalter gleicht einen anderen aus (jede Sperre allein genügt)', () => {
    expect(guestCommentsAllowed({ embedEnabled: false, guestsEnabled: false, communityIsPublic: false })).toBe(false)
    expect(guestCommentsAllowed({ embedEnabled: true, guestsEnabled: false, communityIsPublic: false })).toBe(false)
    expect(guestCommentsAllowed({ embedEnabled: false, guestsEnabled: true, communityIsPublic: true })).toBe(false)
  })
})

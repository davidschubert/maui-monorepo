import { describe, expect, it } from 'vitest'
import { upvoteDelta } from '../shared/upvoteDelta'

/**
 * Die Vorzeichen-Regel der mitschreibenden Zähler (F1).
 *
 * Warum sie einen eigenen Test verdient, obwohl sie vier Zeilen hat: sie wird
 * an ZWEI Stellen benutzt (posts- und comments-Stimme), und ein falsches
 * Vorzeichen fällt nirgends auf — der Zähler driftet einfach, und irgendwann
 * bekommt jemand ein Abzeichen nicht, das er verdient hat.
 */
describe('upvoteDelta', () => {
  it('zählt eine neue Aufstimme hoch', () => {
    expect(upvoteDelta(null, 1)).toBe(1)
  })

  it('zählt eine zurückgenommene Aufstimme herunter', () => {
    expect(upvoteDelta(1, null)).toBe(-1)
  })

  it('zählt den Wechsel von ab nach auf hoch', () => {
    expect(upvoteDelta(-1, 1)).toBe(1)
  })

  it('zählt den Wechsel von auf nach ab herunter', () => {
    expect(upvoteDelta(1, -1)).toBe(-1)
  })

  it('lässt Abstimmen komplett unberührt', () => {
    // Davids Entscheidung 4: „Like" ist das Upvote, Downvotes sind
    // abzeichen-neutral. Sie dürfen den Zähler in KEINE Richtung bewegen.
    expect(upvoteDelta(null, -1)).toBe(0)
    expect(upvoteDelta(-1, null)).toBe(0)
    expect(upvoteDelta(-1, -1)).toBe(0)
  })

  it('bewegt nichts, wenn sich nichts geändert hat', () => {
    expect(upvoteDelta(null, null)).toBe(0)
    expect(upvoteDelta(1, 1)).toBe(0)
  })
})

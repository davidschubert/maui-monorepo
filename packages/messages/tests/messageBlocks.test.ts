import { describe, expect, it } from 'vitest'
import {
  blockAppliesIn,
  blockCoversPair,
  isSelfBlock,
  myBlocksIn,
  pairIsBlocked,
  type BlockFacts,
} from '../shared/messageBlocks'

/**
 * DIE SPERRE (Konzept § 2.3, Davids Entscheidung 3).
 *
 * Drei Zusagen, die hier festgenagelt werden:
 *  1. BEIDSEITIG. Einseitig wäre eine Falle — der Blockierende bekäme weiter
 *     Nachrichten, die niemand liest, der Blockierte behielte einen Kanal für
 *     Fortsetzungen.
 *  2. Das Häkchen „überall" wirkt in FREMDEN Communities.
 *  3. Wer MICH gesperrt hat, taucht in MEINER Liste nicht auf — eine Sperre
 *     anzuzeigen hieße, sie zu verraten.
 */
const here = 'c-hier'
const elsewhere = 'c-anderswo'

const block = (over: Partial<BlockFacts> = {}): BlockFacts => ({
  communityId: here, blockerId: 'anna', blockedId: 'bodo', scope: 'community', ...over,
})

describe('beidseitig', () => {
  it('trifft das Paar in BEIDE Richtungen', () => {
    expect(blockCoversPair(block(), 'anna', 'bodo')).toBe(true)
    expect(blockCoversPair(block(), 'bodo', 'anna')).toBe(true)
  })

  it('sperrt beide Richtungen, egal wer sie ausgesprochen hat', () => {
    const rows = [block({ blockerId: 'anna', blockedId: 'bodo' })]
    expect(pairIsBlocked(rows, 'anna', 'bodo', here)).toBe(true)
    expect(pairIsBlocked(rows, 'bodo', 'anna', here)).toBe(true)
  })

  it('lässt unbeteiligte Dritte in Ruhe', () => {
    expect(blockCoversPair(block(), 'anna', 'clara')).toBe(false)
    expect(pairIsBlocked([block()], 'anna', 'clara', here)).toBe(false)
  })
})

describe('Reichweite', () => {
  it('wirkt „community" NUR dort, wo sie ausgesprochen wurde', () => {
    expect(blockAppliesIn(block(), here)).toBe(true)
    expect(blockAppliesIn(block(), elsewhere)).toBe(false)
    expect(pairIsBlocked([block()], 'anna', 'bodo', elsewhere)).toBe(false)
  })

  it('wirkt „everywhere" auch in einer FREMDEN Community', () => {
    // Das ist der ganze Inhalt von Davids Häkchen — und der Grund, warum die
    // Abfrage dahinter bewusst ohne Mandanten-Filter läuft
    // (server/utils/messageBlocks.ts).
    const rows = [block({ scope: 'everywhere' })]
    expect(pairIsBlocked(rows, 'anna', 'bodo', elsewhere)).toBe(true)
    expect(pairIsBlocked(rows, 'bodo', 'anna', elsewhere)).toBe(true)
  })
})

describe('meine Liste', () => {
  it('zeigt nur, was ICH gesetzt habe', () => {
    const rows = [
      block({ blockerId: 'anna', blockedId: 'bodo' }),
      block({ blockerId: 'clara', blockedId: 'anna' }),
    ]
    const mine = myBlocksIn(rows, 'anna', here)
    expect(mine).toHaveLength(1)
    expect(mine[0]?.blockedId).toBe('bodo')
  })

  it('verschweigt Sperren aus fremden Communities', () => {
    const rows = [block({ communityId: elsewhere })]
    expect(myBlocksIn(rows, 'anna', here)).toHaveLength(0)
  })
})

describe('Selbst-Sperre', () => {
  it('ist keine Handlung, sondern ein Tippfehler', () => {
    expect(isSelfBlock('anna', 'anna')).toBe(true)
    expect(isSelfBlock('anna', 'bodo')).toBe(false)
  })
})

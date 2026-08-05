import type { BlockScope } from './types/message'

/**
 * SPERREN — DIE PURE REGEL (Konzept § 2.3, Davids Entscheidung 3).
 *
 * ── BEIDSEITIG, IMMER ─────────────────────────────────────────────────────
 * Hat A B blockiert, kann weder A an B noch B an A schreiben. Einseitig wäre
 * eine Falle: der Blockierende bekäme weiter Nachrichten, die niemand liest,
 * und der Blockierte behielte einen Kanal für Fortsetzungen. Deshalb kennt
 * diese Regel keine Richtung — sie fragt nur, ob es zu diesem PAAR eine
 * wirksame Zeile gibt.
 *
 * ── REICHWEITE: DIE COMMUNITY, ODER ÜBERALL ───────────────────────────────
 * Davids Entscheidung: Sperre je Community, plus ein Häkchen „auch in meinen
 * anderen Communities". Eine Zeile mit `scope: 'everywhere'` wirkt deshalb
 * unabhängig davon, wo sie ausgesprochen wurde; eine mit `scope: 'community'`
 * nur dort. Welche Zeilen überhaupt gelesen werden, entscheidet
 * `server/utils/messageBlocks.ts` — hier steht nur, was aus ihnen folgt.
 */

/** Das Nötigste einer Sperr-Zeile, damit die Regel ohne Appwrite testbar ist. */
export interface BlockFacts {
  communityId: string
  blockerId: string
  blockedId: string
  scope: BlockScope
}

/** Betrifft diese Zeile genau dieses Paar — in irgendeiner Richtung? */
export function blockCoversPair(row: BlockFacts, a: string, b: string): boolean {
  return (row.blockerId === a && row.blockedId === b)
    || (row.blockerId === b && row.blockedId === a)
}

/**
 * Wirkt diese Zeile IN DIESER Community?
 *
 * `everywhere` wirkt überall — auch dort, wo die Zeile nicht entstanden ist.
 * Das ist der ganze Inhalt des Häkchens.
 */
export function blockAppliesIn(row: BlockFacts, communityId: string): boolean {
  return row.scope === 'everywhere' || row.communityId === communityId
}

/**
 * DIE Frage: darf zwischen diesen beiden in dieser Community geschrieben
 * werden?
 *
 * Bekommt ALLE Zeilen zu dem Paar (auch die aus fremden Communities) und
 * entscheidet daraus — genau deshalb ist sie pur: der eine Datenzugriff, der
 * bewusst NICHT durch die Datentür geht, soll keine Regel enthalten.
 */
export function pairIsBlocked(rows: readonly BlockFacts[], a: string, b: string, communityId: string): boolean {
  return rows.some(row => blockCoversPair(row, a, b) && blockAppliesIn(row, communityId))
}

/**
 * Die Zeilen, die eine Person in DIESER Community als „von mir gesperrt"
 * angezeigt bekommt.
 *
 * BEWUSST NUR DIE EIGENEN: wer MICH gesperrt hat, steht hier nicht. Die
 * Sperre wirkt zwar beidseitig, aber sie ist die Entscheidung des anderen —
 * sie anzuzeigen hieße, sie zu verraten (§ 2.3: „Der Blockierte erfährt es
 * nicht").
 */
export function myBlocksIn(rows: readonly BlockFacts[], userId: string, communityId: string): BlockFacts[] {
  return rows.filter(row => row.blockerId === userId && blockAppliesIn(row, communityId))
}

/**
 * Sich selbst sperren ist keine Handlung, sondern ein Tippfehler — und eine
 * Zeile dafür würde jede Selbst-Konversation still unmöglich machen.
 */
export function isSelfBlock(blockerId: string, blockedId: string): boolean {
  return blockerId === blockedId
}

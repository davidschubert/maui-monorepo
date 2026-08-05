import type { Models } from 'node-appwrite'

/**
 * Die Tabelle gehört dem `system`-Layer (Migration system-029), der Zugriff
 * liegt in core/server/utils/handles.ts. Das ist DASSELBE Muster wie bei den
 * Benachrichtigungen: `notify()` lebt in core, die Tabelle `notifications`
 * bringt system-003 mit. Core besitzt weiterhin KEINE Tabelle (A14) — es
 * benutzt eine, die auf jeder Instanz vorhanden ist.
 *
 * WARUM system UND NICHT posts: ein Handle ist keine Eigenschaft von
 * Beiträgen. Kommentare, Beiträge und später jede andere Schreibfläche
 * brauchen dieselben Namen, und ein `comments`, das dafür von `posts`
 * abhängen müsste, wäre genau die Kreuz-Abhängigkeit, die A14 verbietet.
 * WARUM NICHT das Control Plane, wo `community_members` liegt: der Handle
 * muss zur LAUFZEIT beim Rendern eines Beitrags lesbar sein, und dort hat das
 * Runtime-Projekt keinen Schlüssel — dieselbe Grenze wie bei
 * `revokeCommunityLabel` (A5).
 */
export const HANDLES_TABLE = 'community_handles'

export type HandleStatus
  = /** Der aktuelle Name dieser Person in dieser Community. */
  | 'active'
  /**
   * Ein FRÜHERER Name derselben Person. Er bleibt stehen und belegt weiterhin
   * den eindeutigen Index — das ist die Umsetzung von „der alte Handle bleibt
   * gesperrt" (Davids Entscheidung 3), und zwar als HISTORIE statt als
   * Sperrliste: eine Erwähnung in einem alten Beitrag löst dadurch weiterhin
   * auf DIESELBE Person auf, statt ins Leere zu laufen.
   */
  | 'former'

export interface CommunityHandleRow extends Models.Row {
  /** Pool-Mandant; im Silo ''. Erste Spalte JEDES Index (Pool-Regel). */
  communityId: string
  userId: string
  /** Die vom Menschen gewählte Schreibweise — so wird sie angezeigt. */
  handle: string
  /** Vergleichsform (klein). Trägt den eindeutigen Index. */
  handleLower: string
  status: HandleStatus
  /**
   * Wann diese Zeile zur AKTIVEN wurde. Basis der 30-Tage-Sperrfrist; bei der
   * ersten, automatisch vergebenen Zeile bewusst LEER, damit die erste
   * Änderung nicht durch die Vergabe verbraucht ist.
   */
  changedAt: string
}

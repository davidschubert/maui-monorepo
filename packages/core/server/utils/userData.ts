import type { H3Event } from 'h3'

/**
 * UserDataContributor-Vertrag (GDPR-Export/-Löschung, CONCEPT A14).
 *
 * Feature-Layer BESITZEN ihre Daten — core darf ihre Schemas nicht kennen.
 * Stattdessen registriert jeder Layer beim Serverstart (Nitro-Plugin
 * `server/plugins/user-data.ts`) einen Contributor; core orchestriert Export
 * und Löschung über diese Registry (userDataOrchestration.ts), ohne ein
 * einziges Feature-Schema zu importieren. Gleiches Kompositionsprinzip wie
 * `maui.admin.modules`: Apps ohne einen Layer haben dessen Plugin nicht →
 * die Registry ist automatisch korrekt besetzt.
 */

export interface UserDataDeleteResult {
  /** hart gelöschte Rows/Dateien */
  deleted: number
  /** in-place anonymisierte/pseudonymisierte Rows */
  anonymized: number
}

export interface UserDataContributor {
  /** stabil + eindeutig, z. B. 'comments', 'moderation', 'system' */
  id: string
  /**
   * Alle Daten des Users als export-fertiges, JSON-serialisierbares Objekt.
   * MUSS intern vollständig paginieren (listAllRows). Darf werfen — der
   * Orchestrator entscheidet über das Teilfehler-Reporting.
   */
  exportUserData(event: H3Event, userId: string): Promise<unknown>
  /**
   * Löscht/anonymisiert alle Daten des Users im eigenen Layer.
   * MUSS idempotent sein: ein Re-Run nach Teilfehler findet Rest-Daten
   * (oder nichts) und terminiert erfolgreich.
   */
  deleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult>
}

const contributors = new Map<string, UserDataContributor>()

/** Registrierung ist idempotent (HMR/Doppel-Plugin überschreibt nur sich selbst). */
export function registerUserDataContributor(contributor: UserDataContributor): void {
  contributors.set(contributor.id, contributor)
}

/** Deterministische Reihenfolge — unabhängig von der Plugin-Ladereihenfolge. */
export function listUserDataContributors(): UserDataContributor[] {
  return [...contributors.values()].sort((a, b) => a.id.localeCompare(b.id))
}

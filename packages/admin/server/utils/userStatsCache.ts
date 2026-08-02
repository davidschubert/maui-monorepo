import { createMicrocache } from '../../../core/server/utils/microcache'

/**
 * DER TEURE TEIL der People-Nav-Zähler — und NUR der.
 *
 * ── Der Befund (Nacht-Audit 2026-08-02, F23) ──────────────────────────────
 * `/api/admin/users/stats` hielt seine vier Zahlen in EINER prozessweiten
 * 60-Sekunden-Variable, ohne Schlüssel. Drei davon (total/active/new) sind
 * projektweit und dürfen das auch sein — sie kommen aus `users.list()`, und im
 * Pool teilen sich alle Communities EIN Appwrite-Projekt. Die vierte,
 * `online`, kommt aus `listOnlinePresences(event)` und ist seit A4
 * MANDANTEN-gescopt. Wer als Betreiber binnen einer Minute zwei
 * Community-Hosts ansah, bekam auf dem zweiten die Anwesenheitszahl des
 * ersten.
 *
 * ── Warum `online` aus dem Cache fliegt statt den Cache zu schlüsseln ─────
 * Ein mandantengeschlüsselter Cache (Muster `tenantCacheScope`) würde die
 * ZAHLEN MITSCHLEPPEN, die gar nicht pro Mandant verschieden sind — und mit
 * ihnen den teuren Teil: `active` scannt bis zu 5.000 Nutzer per Cursor, weil
 * `accessedAt` bei Appwrite nicht queryfähig ist. Bei N Communities wäre das
 * N Scans für N identische Ergebnisse; der Cache soll Last sparen und würde
 * sie vervielfachen.
 *
 * `online` dagegen ist EIN Presences-Aufruf ohne Scan — es zu cachen sparte
 * praktisch nichts und war der einzige Grund, warum der Cache falsch sein
 * konnte. Es wird jetzt bei jedem Request frisch geholt, und das ist für eine
 * Live-Zahl ohnehin das richtige Verhalten.
 *
 * Der Schlüssel ist deshalb das APPWRITE-PROJEKT — genau das, was diese Zahlen
 * beschreiben. Im Betrieb ist das ein einziger Eintrag; er steht trotzdem im
 * Schlüssel, damit der Cache nicht wieder zu einer namenlosen Variablen wird,
 * an die man den nächsten Wert einfach anhängt.
 */

/** NUR projektweite Zahlen. `online` gehört hier strukturell nicht hinein. */
export interface ProjectUserCounts {
  total: number
  active: number
  new: number
}

/** Nav-Badges werden bei jedem Dashboard-Render gebraucht → kurzer Cache. */
export const USER_STATS_TTL_MS = 60_000

const cache = createMicrocache<ProjectUserCounts>(USER_STATS_TTL_MS)

/** Zahlen des Projekts — aus dem Cache oder frisch geladen. */
export async function projectUserCounts(
  projectId: string,
  load: () => Promise<ProjectUserCounts>,
): Promise<ProjectUserCounts> {
  const key = `users:${projectId}`
  const hit = cache.get(key)
  if (hit) return hit
  const value = await load()
  cache.set(key, value)
  return value
}

/** Nur für Tests/Schreibrouten: Cache leeren. */
export function clearProjectUserCounts(): void {
  cache.clear()
}

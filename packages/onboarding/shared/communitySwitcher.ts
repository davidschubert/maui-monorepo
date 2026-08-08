import type { CommunityRole } from '../../core/shared/communityAuthz'
// Cross-Layer als EXPLIZITER Vertrag (A14): der Umschlag „Deine Communities"
// gehört dem Control Plane — reiner Typ-Import, kein Laufzeit-Coupling.
import type { MyCommunityView } from '../../control/shared/myCommunities'

/**
 * DER COMMUNITY-SWITCHER OBEN LINKS — in reiner Form (F50, 2026-08-07,
 * DECISION-LOG „Konto-Modell bestätigt, Community-Switcher kommt").
 *
 * Die Route `GET /api/community/switcher` macht I/O (JWT minten, Control Plane
 * fragen), diese Datei macht die ENTSCHEIDUNG: wer steht im Menü, in welcher
 * Reihenfolge, und mit welchen Feldern. Getrennt, damit die Regel ohne Appwrite
 * und ohne h3 testbar ist — dasselbe Muster wie `projectMyCommunities` im
 * Control Plane, dessen Ausgabe hier hereinkommt.
 *
 * ── NUR TEAM-ROLLEN, KEINE VIEWER (Davids Auswahl-Text) ───────────────────
 * Das Menü sitzt im DASHBOARD-Kopf und wechselt in ein DASHBOARD. Ein `viewer`
 * trägt zwar `dashboard.access` und käme dort hinein, hätte aber nichts zu
 * verwalten: seine Übersicht ist leer, jeder Menüpunkt darunter ist
 * capability-gefiltert weg. Wer in zwanzig Communities mitliest und in einer
 * arbeitet, bekäme ein Menü mit neunzehn Sackgassen.
 *
 * Der KUNDENBEREICH auf `my.*` bleibt davon unberührt und zeigt weiter ALLE
 * Mitgliedschaften (`projectMyCommunities`) — das ist die vollständige Liste,
 * dies hier ist die Arbeits-Auswahl. Beide Wege stehen im Menü nebeneinander:
 * unten führt „Communities verwalten" genau dorthin.
 *
 * ── WAS HIER NICHT DRINSTEHT ──────────────────────────────────────────────
 * Kein `plan`, kein `trialEndsAt`, kein `suspension`, kein `readOnly`. Ein
 * Wechsler ist kein Vertragsbericht; alles davon steht eine Ebene weiter unten
 * im Dashboard der jeweiligen Community bzw. auf der Übersicht. Was ein Menü
 * nicht anzeigt, gehört nicht in seine Antwort.
 */

/**
 * Die Rollen, die im Wechsler erscheinen — das „Team" einer Community.
 * Absichtlich eine EIGENE Liste und keine Ableitung aus `COMMUNITY_ROLES`
 * ohne den letzten Eintrag: die Auswahl ist eine Produktentscheidung, keine
 * Folge der Sortierreihenfolge. Käme eines Tages eine sechste Rolle dazu,
 * soll hier eine Entscheidung nötig sein und kein Zufall passieren.
 */
export const SWITCHER_TEAM_ROLES: readonly CommunityRole[] = ['owner', 'admin', 'moderator', 'editor']

/** Trägt diese Rolle ein Dashboard, in dem es etwas zu tun gibt? */
export function isSwitcherTeamRole(role: CommunityRole): boolean {
  return SWITCHER_TEAM_ROLES.includes(role)
}

/** Ein Eintrag des Wechslers. */
export interface CommunitySwitcherEntry {
  /** = communities.$id — zugleich der Schlüssel für POST /api/community/switch. */
  communityId: string
  name: string
  /**
   * Kanonischer Host. NUR als Fallback-Ziel gedacht (wenn das Siegeln
   * scheitert, führt der Klick wenigstens zur Community) und als zweite Zeile
   * im Menü — das ECHTE Sprungziel kommt aus der Antwort von
   * `/api/community/switch`, nie aus dieser Liste (Audit 2026-08-02).
   */
  host: string
  role: CommunityRole
  /**
   * Die Community, auf deren Host der Betrachter GERADE steht. Sie bleibt im
   * Menü stehen (mit Häkchen), statt zu verschwinden: ein Wechsler, in dem der
   * aktuelle Stand fehlt, zwingt zum Erinnern.
   */
  current: boolean
}

export interface CommunitySwitcherResponse {
  communities: CommunitySwitcherEntry[]
}

/**
 * Mitgliedschaften → Menü-Einträge.
 *
 * `currentCommunityId` ist `communities.$id` des Mandanten aus der
 * HOST-Auflösung (`useTenant(event).communityId`), NICHT der Request-Host.
 * Das ist eine bewusste Wahl: seit control-035 löst eine Community unter
 * mehreren Hosts auf (Pukalani-Subdomain, eigene Domain, deren www-Zwilling),
 * und `MyCommunityView.host` trägt nur den kanonischen. Ein Host-Vergleich
 * markierte auf einer eigenen Domain also die falsche Zeile — die Id ist
 * eindeutig und beidseitig dieselbe Zahl. Leer/unbekannt ⇒ nichts markiert und
 * die Reihenfolge bleibt, wie das Control Plane sie geliefert hat.
 *
 * Die REIHENFOLGE dahinter wird bewusst NICHT neu gerechnet: `projectMyCommunities`
 * sortiert schon nach Rolle (owner zuerst) und dann alphabetisch. Eine zweite
 * Sortierregel hier wäre eine zweite Wahrheit, die beim nächsten Anfassen von
 * der ersten abweicht.
 */
export function projectCommunitySwitcher(
  communities: readonly MyCommunityView[],
  currentCommunityId: string,
): CommunitySwitcherEntry[] {
  const entries = communities
    .filter(community => isSwitcherTeamRole(community.role))
    // Ein Eintrag ohne Adresse hat kein Ziel — er wäre ein Menüpunkt ins Leere.
    .filter(community => community.host !== '')
    .map(community => ({
      communityId: community.communityId,
      name: community.name,
      host: community.host,
      role: community.role,
      current: currentCommunityId !== '' && community.communityId === currentCommunityId,
    }))
  // Stabil: `current` nach vorn, alles andere behält seine Position.
  return [...entries.filter(e => e.current), ...entries.filter(e => !e.current)]
}

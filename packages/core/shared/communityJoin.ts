import type { CommunityRole } from './communityAuthz'

/**
 * MITGLIEDSCHAFT ALS EREIGNIS (A5, Davids Entscheidung 1 vom 2026-07-29) — der
 * pure Vertrag. Server (Auslöser + Middleware) und Control Plane (Regel) teilen
 * ihn, damit „Beitritt" auf beiden Seiten dasselbe Wort ist.
 *
 * ── WAS VORHER FALSCH WAR ───────────────────────────────────────────────────
 * A4 hat das Community-Label nach der Regel „wer eingeloggt einen Mandanten-Host
 * benutzt, ist Mitglied" vergeben (server/middleware/06.community-label.ts). Das war
 * eine ehrliche Abbildung eines Produkts OHNE Beitritt — aber seit es
 * /dashboard/members mit „Zugang entziehen" gibt (C16), ist es eine Lüge: der
 * Entzug nahm nur die ROLLE, das Label kam beim nächsten eingeloggten Besuch
 * zurück, und die entfernte Person las weiter mit. Die Seite versprach mehr,
 * als das Modell hielt.
 *
 * ── DIE NEUE REGEL ──────────────────────────────────────────────────────────
 * Mitglied ist, wer eine `community_members`-Zeile mit Zugang hat. Das Label FOLGT
 * dieser Zeile (es wird nicht mehr selbst zur Quelle). Entstehen kann sie auf
 * drei Wegen — mehr gibt es nicht:
 *
 *  1. **Einladung** (C16) — der einzige Weg in eine geschlossene Community.
 *  2. **Beitritt** bei OFFENER Registrierung (`tenants.openRegistration`) an
 *     einem der beiden Auslöser unten.
 *  3. **Gründung** (onboardingProvision) — der Owner.
 *
 * ── DIE AUSLÖSER, UND WARUM GENAU DIESE ZWEI ────────────────────────────────
 *  - `registration`: die Anmeldung AUF DEM MANDANTEN-HOST. Wer sich bei
 *    kunde-a.de ein Konto anlegt, ist bei kunde-a beigetreten — deutlicher wird
 *    eine Absicht nicht. Der Feed sagt an genau dieser Stelle schon
 *    „user.joined" (signup.post.ts, otp/verify.post.ts); jetzt stimmt es auch
 *    in den Daten.
 *  - `contribution`: der erste SCHREIBVORGANG (Kommentar, Beitrag, Stimme,
 *    Anmeldung zu Termin/Kurs) — für alle, die ihr Konto schon woanders
 *    angelegt haben. Fängt die Datentür ab (`tenantDb().create` mit der
 *    Türklinke 'member'), also an EINER Stelle statt an zwanzig.
 *
 * BEWUSST NICHT der Seitenaufruf. Aus jedem Vorbeisurfer ein Mitglied zu machen
 * hieße, die Mitgliederliste zu Rauschen zu machen und „Zugang entziehen"
 * wieder wirkungslos: die entfernte Person würde beim nächsten Laden erneut
 * beitreten. Ein Beitritt braucht eine Handlung, die die Person tut, nicht eine,
 * die ihr Browser tut.
 *
 * PREIS DES SPÄTEREN AUSLÖSERS (offen benannt): das Label steht bei
 * `contribution` erst MITTEN in der Sitzung — der schon offene Realtime-Socket
 * behält seine alten Rollen (Appwrite rechnet sie für offene Verbindungen nicht
 * neu). Die Anwesenheit kommt trotzdem an: der Heartbeat schreibt server-seitig
 * mit dem neuen Label, und der Leser-Poll in usePresence (POLL_MS = 20 s, ein
 * Cookie-GET mit frischen Labels) holt die Nachbarn spätestens 20 s später —
 * ohne Reload. Beim Auslöser `registration` ist das gar kein Thema: dort steht
 * das Label vor dem ersten Seitenaufruf.
 *
 * `legacy` ist kein Auslöser, sondern die Bestands-Übernahme — siehe
 * server/middleware/06.community-label.ts.
 */

export type CommunityJoinTrigger =
  /** Kontoanlage auf dem Mandanten-Host. */
  | 'registration'
  /** Erster eigener Schreibvorgang in dieser Community. */
  | 'contribution'
  /** Bestands-Übernahme: trägt das Label aus der A4-Zeit, hat aber keine Zeile. */
  | 'legacy'

export type CommunityJoinOutcome =
  /** Die Mitgliedschaft ist JETZT entstanden. */
  | 'joined'
  /** War schon Mitglied — nichts zu tun (der Normalfall). */
  | 'member'
  /** Geschlossene Community: Mitglied wird man nur per Einladung. */
  | 'closed'
  /** Der Zugang wurde entzogen. Von selbst kommt er nicht zurück. */
  | 'removed'
  /** Hier gibt es nichts zu entscheiden (kein Mandant, kein Login) — oder die
   *  Naht zum Control Plane antwortet nicht. Nie eine Aussage über die Person. */
  | 'unavailable'

/**
 * Die Rolle, mit der man beitritt.
 *
 * `viewer` und keine neue Stufe: die Rollen-Matrix (shared/communityAuthz.ts)
 * beschreibt sie genau als das, was ein beitretendes Mitglied ist — „liest die
 * Community + kommentiert, kein Dashboard-Verwaltungsrecht" (einzige Capability
 * `dashboard.access`, damit die eigenen Einstellungen erreichbar bleiben). Eine
 * sechste Rolle „member" wäre ein zweiter Name für dieselbe Sache und würde
 * jede Prüfung, jedes Menü und jede Übersetzung verdoppeln. Ihr Anzeige-Label
 * heißt vor Kunden ohnehin schon „Mitglied" (members.roles.viewer).
 */
export const COMMUNITY_JOIN_ROLE: CommunityRole = 'viewer'

/** Hat dieses Ergebnis Zugang zur Community? (= Label vergeben) */
export function joinOutcomeGrantsAccess(outcome: CommunityJoinOutcome): boolean {
  return outcome === 'joined' || outcome === 'member'
}

/**
 * Sagt dieses Ergebnis „diese Person gehört NICHT (mehr) dazu"? Nur dann darf
 * ein bestehendes Label eingezogen werden — 'unavailable' ist ausdrücklich KEIN
 * solches Ergebnis (eine gestörte Naht darf keinem echten Mitglied den Zugang
 * nehmen).
 */
export function joinOutcomeRevokesAccess(outcome: CommunityJoinOutcome): boolean {
  return outcome === 'removed' || outcome === 'closed'
}

import { COMMUNITY_JOIN_ROLE, type CommunityJoinOutcome, type CommunityJoinTrigger } from '../../core/shared/communityJoin'
import { COMMUNITY_ROLES, type CommunityRole } from '../../core/shared/communityAuthz'
import type { CommunityMemberStatus } from './types/communityMember'
import type { CommunityInviteStatus } from './types/communityInvite'

/**
 * Die Schutzregeln der Mitglieder-Verwaltung — PURE (unit-getestet, ohne h3/
 * Appwrite), weil sie zweimal gebraucht werden: die Kunden-App darf sie fürs UI
 * kennen (Knöpfe ausgrauen), das Control Plane MUSS sie durchsetzen. Wären sie
 * nur in der Route, gäbe es genau die Sorte Regel, die beim nächsten Endpunkt
 * vergessen wird.
 *
 * Vier Regeln, alle mit Grund:
 *
 *  1. **Kein Selbst-Degradieren.** Wer die Verwaltung offen hat, darf sich nicht
 *     selbst die Rechte nehmen, mit denen er sie offen hält — sonst sperrt ein
 *     Fehlklick die letzte handlungsfähige Person aus ihrer eigenen Community.
 *     Dieselbe Regel kennt die Operator-Nutzerliste schon (isSelf ⇒ Block/Delete
 *     gesperrt).
 *  2. **Nicht der letzte Owner.** Eine Community ohne Owner hätte niemanden, der
 *     übertragen oder abrechnen kann. Degradieren UND Entfernen prüfen das.
 *  3. **Owner ist nur per Übergabe erreichbar.** Ein Admin kann keinen Owner
 *     ernennen und keinen Owner antasten — sonst wäre `community.transfer` (Owner-
 *     Capability) über die Rollen-Änderung (admin-Capability) umgehbar.
 *  4. **Sich selbst entfernt man nicht.** Austritt ist ein anderer Vorgang als
 *     Verwaltung; ihn hier mitzudenken hieße, den einzigen Owner per „Entfernen"
 *     loswerden zu können.
 *
 * ENTFERNEN LÖSCHT NICHTS (Davids Entscheidung 1 vom 2026-07-29): der Status
 * wird 'removed', Inhalte und Namen bleiben. Echtes Löschen ist der getrennte
 * DSGVO-Weg (Konto löschen).
 */

/** Fakten über eine Mitgliedschaft, die für eine Entscheidung reichen. */
export interface CommunityTeamMemberFacts {
  /** Row-Id der Mitgliedschaft. */
  id: string
  /** Appwrite-User IM Runtime-Projekt. */
  runtimeUserId: string
  role: CommunityRole
  status: CommunityMemberStatus
}

export type CommunityTeamDenyReason =
  /** Zielzeile gehört nicht (mehr) zum Team dieser Community. */
  | 'not_a_member'
  /** Unbekannte Rolle. */
  | 'invalid_role'
  /** Rolle unverändert — nichts zu tun. */
  | 'unchanged'
  /** Selbst-Degradierung. */
  | 'self_demote'
  /** Sich selbst entfernen. */
  | 'self_remove'
  /** Letzter Owner. */
  | 'last_owner'
  /** Owner nur per Übergabe (weder ernennen noch antasten). */
  | 'owner_protected'
  /** Diese Adresse ist schon im Team. */
  | 'already_member'
  /** Es läuft noch ein Abo — erst kündigen (C16). */
  | 'subscription_active'
  /** Die Community ist schon stillgelegt (C16) — nichts zu tun. */
  | 'already_disabled'

export type CommunityTeamDecision =
  | { ok: true }
  | { ok: false, reason: CommunityTeamDenyReason }

const ALLOW: CommunityTeamDecision = { ok: true }
const deny = (reason: CommunityTeamDenyReason): CommunityTeamDecision => ({ ok: false, reason })

/** Zählt die Mitglieder mit Zugang und Owner-Rolle. */
export function countActiveOwners(members: readonly CommunityTeamMemberFacts[]): number {
  return members.filter(member => member.status === 'active' && member.role === 'owner').length
}

/** Hat diese Mitgliedschaft Zugang? (nur 'active' — genau wie der Resolver) */
export function hasCommunityAccess(status: CommunityMemberStatus): boolean {
  return status === 'active'
}

export interface RoleChangeInput {
  /** Runtime-User, der handelt. */
  actorUserId: string
  /** Rolle des Handelnden (aus der Mitgliedschaft, nicht aus dem Request). */
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
  nextRole: string
  /** ALLE Mitgliedschaften der Site (für die Owner-Zählung). */
  members: readonly CommunityTeamMemberFacts[]
}

/** Darf die Rolle dieses Mitglieds so geändert werden? */
export function decideRoleChange(input: RoleChangeInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target, nextRole, members } = input

  if (!(COMMUNITY_ROLES as readonly string[]).includes(nextRole)) return deny('invalid_role')
  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.role === nextRole) return deny('unchanged')

  // Zum Owner macht nur die ÜBERGABE — sonst wäre eine Owner-Capability über
  // eine Admin-Capability erreichbar (auch für sich selbst).
  if (nextRole === 'owner') return deny('owner_protected')

  // Eigene Rechte gibt niemand über diese Seite ab.
  if (target.runtimeUserId === actorUserId) return deny('self_demote')

  // Einen Owner anzutasten darf nur ein Owner — und nie den letzten.
  if (target.role === 'owner') {
    if (actorRole !== 'owner') return deny('owner_protected')
    if (countActiveOwners(members) <= 1) return deny('last_owner')
  }

  return ALLOW
}

export interface RemovalInput {
  actorUserId: string
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
  members: readonly CommunityTeamMemberFacts[]
}

/** Darf diesem Mitglied der Zugang entzogen werden? */
export function decideRemoval(input: RemovalInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target, members } = input

  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.runtimeUserId === actorUserId) return deny('self_remove')
  if (target.role === 'owner') {
    if (actorRole !== 'owner') return deny('owner_protected')
    if (countActiveOwners(members) <= 1) return deny('last_owner')
  }

  return ALLOW
}

export interface TransferInput {
  actorUserId: string
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
}

/**
 * Darf der Besitz an dieses Mitglied übergehen? Erfolgreich heißt: das Ziel wird
 * Owner, der Übergebende wird Admin (nicht ausgesperrt — Davids Entscheidung 3).
 */
export function decideTransfer(input: TransferInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target } = input

  if (actorRole !== 'owner') return deny('owner_protected')
  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.runtimeUserId === actorUserId) return deny('unchanged')

  return ALLOW
}

export interface CommunityDeletionInput {
  actorRole: CommunityRole
  /** `communities.status` — 'disabled' heißt: schon stillgelegt. */
  communityStatus: string
  /** Läuft an dieser Community ein Abo? (hasLiveSubscription, communityBilling.ts) */
  liveSubscription: boolean
}

/**
 * Darf diese Community JETZT gelöscht werden? (C16, Davids Kehrtwende zur
 * Entscheidung 3 vom 2026-07-29 — er hat den Punkt selbst wieder eingereiht.)
 *
 * WAS „LÖSCHEN" HIER HEISST — und was ausdrücklich nicht (der bewusste Schnitt):
 * **Deaktivieren + Zugänge entziehen, Daten bleiben.** `communities.status`
 * wird 'disabled' (der Host-Resolver liefert dann nichts mehr → 404 binnen
 * ≤30 s), jede Mitgliedschaft wird 'removed', und die Runtime zieht die
 * Community-Labels ein. KEINE Zeile wird gelöscht. Drei Gründe:
 *
 *  1. F3-Grundsatz „nie destruktiv": ein unumkehrbares Löschen ohne
 *     Wiederherstellungs-Frist ist Datenverlust auf einen Klick.
 *  2. Für echtes Löschen von Personendaten gibt es einen eigenen, geprüften
 *     Weg (DSGVO: Konto löschen, deleteUserCompletely). Zwei Löschpfade
 *     nebeneinander wären zwei Stellen, an denen etwas übrig bleibt.
 *  3. Inhalte einer Community gehören nicht nur ihrem Owner — an Threads hängen
 *     die Beiträge anderer.
 *
 * Ein echtes Hard-Delete (Rows weg, Projekt weg) wäre Davids FOLGE-Entscheidung
 * und ein eigener Plan (Frist, Export, Reihenfolge über zwei Projekte hinweg).
 *
 * Zwei Sperren, beide mit Grund:
 *  - **Abo läuft** ⇒ erst kündigen. Stillegen kündigt bei Stripe nichts; die
 *    Rechnung käme weiter für etwas, das niemand mehr sehen kann.
 *  - **Schon stillgelegt** ⇒ nichts zu tun. Bewusst eine ABLEHNUNG und kein
 *    stilles ok: sonst meldete die Seite jedem Doppelklick einen Erfolg, der
 *    nichts bewirkt hat.
 *
 * Die Owner-Prüfung ist doppelt gemoppelt (der Gate verlangt schon
 * `community.delete`, und die trägt nur der Owner) — sie steht trotzdem hier,
 * weil eine PURE Regel ohne ihre Vorbedingung nur die halbe Wahrheit ist.
 */
export function decideCommunityDeletion(input: CommunityDeletionInput): CommunityTeamDecision {
  const { actorRole, communityStatus, liveSubscription } = input

  if (actorRole !== 'owner') return deny('owner_protected')
  if (communityStatus === 'disabled') return deny('already_disabled')
  if (liveSubscription) return deny('subscription_active')

  return ALLOW
}

// ── DSGVO: die Mitgliedschaften EINES Kontos auflösen (F3) ──────────────────

/**
 * Was mit EINER Mitgliedschaft passiert, wenn das dazugehörige Runtime-Konto
 * gelöscht wird.
 *
 *  - `delete`    — Zeile weg. Der Regelfall: an einer Mitgliedschaft hängt
 *                  kein fremder Kontext (anders als an einem Kommentar), sie
 *                  ist reine Zuordnung Person ⇄ Community.
 *  - `anonymize` — Zeile bleibt, E-Mail wird geleert. Nur wenn die Zeile
 *                  strukturell gebraucht wird (siehe `decideMembershipErasure`).
 */
export type MembershipErasureAction = 'delete' | 'anonymize'

export interface MembershipErasureInput {
  /** Die Mitgliedschaft des zu löschenden Kontos. */
  target: CommunityTeamMemberFacts
  /** ALLE Mitgliedschaften DIESER Community — inklusive `target`. */
  members: readonly CommunityTeamMemberFacts[]
  /** `communities.status` — 'disabled' heißt: stillgelegt (C16). */
  communityStatus: string
}

export interface MembershipErasureDecision {
  action: MembershipErasureAction
  /** Warum die Zeile bleiben MUSS; null bei `delete`. */
  reason: 'last_owner' | null
}

/**
 * Darf diese Mitgliedschaft mit dem Konto verschwinden? (F3)
 *
 * DIE EINE AUSNAHME IST DIESELBE WIE ÜBERALL: der letzte Owner einer aktiven
 * Community. `decideRoleChange` und `decideRemoval` verbieten schon, ihn per
 * Verwaltung wegzunehmen — eine Community ohne Owner hätte niemanden, der
 * übertragen oder abrechnen kann, und niemanden, der sie wieder öffnet. Die
 * DSGVO-Löschung darf diese Sperre nicht hintenherum aufheben, nur weil sie aus
 * einer anderen Richtung kommt.
 *
 * Sie darf die Löschung aber auch nicht VERWEIGERN: das Recht auf Löschung
 * hängt nicht daran, ob jemand anders eine Community erbt. Also der Mittelweg,
 * und er ist bewusst kein Kompromiss aus Bequemlichkeit: die Zeile bleibt als
 * STRUKTUR stehen (Community behält einen Owner-Platz), aber ohne
 * Personenbezug — die E-Mail wird geleert, und die `runtimeUserId` zeigt nach
 * `users.delete()` auf ein Konto, das es nicht mehr gibt. Was bleibt, ist ein
 * Pseudonym ohne Auflösung.
 *
 * Damit das nicht still passiert, meldet die Route jede zurückgehaltene Zeile
 * im KLARTEXT (Community-Name + Rolle) — der Betreiber muss wissen, welche
 * Community jetzt einen verwaisten Owner-Platz hat, und sie einem Menschen
 * zuweisen können.
 *
 * Drei Fälle gehen ohne Ausnahme durch:
 *  - kein Zugang mehr ('removed'/'suspended') — die Zeile schützt niemanden,
 *  - keine Owner-Rolle,
 *  - Community stillgelegt ('disabled') — dort ist nichts mehr zu verwalten.
 */
export function decideMembershipErasure(input: MembershipErasureInput): MembershipErasureDecision {
  const { target, members, communityStatus } = input

  if (!hasCommunityAccess(target.status)) return { action: 'delete', reason: null }
  if (target.role !== 'owner') return { action: 'delete', reason: null }
  if (communityStatus === 'disabled') return { action: 'delete', reason: null }
  if (countActiveOwners(members) > 1) return { action: 'delete', reason: null }

  return { action: 'anonymize', reason: 'last_owner' }
}

/** Eine Mitgliedschaft, die die DSGVO-Löschung stehen lassen MUSSTE. */
export interface RetainedMembership {
  communityId: string
  /** Klartext für den Betreiber — Anzeigename, ersatzweise der Host. */
  communityName: string
  role: CommunityRole
  reason: 'last_owner'
}

/** Was die DSGVO-Löschung im Control Plane bewegt hat. */
export interface CommunityErasureResult {
  /** Hart gelöschte `community_members`-Zeilen. */
  deleted: number
  /** Zeilen, die bleiben mussten und entpersonalisiert wurden. */
  anonymized: number
  /** Gelöschte `community_invites` (die E-Mail IST dort der Personenbezug). */
  invitesDeleted: number
  /** Klartext zu jeder zurückgehaltenen Zeile — gehört ins Log, nie in eine
   *  Browser-Antwort (es nennt fremde Communities). */
  retained: RetainedMembership[]
}

/** Eine Mitgliedschaft, wie die DSGVO-AUSKUNFT sie zeigt. */
export interface CommunityMembershipExport {
  communityId: string
  communityName: string
  host: string
  role: CommunityRole
  status: CommunityMemberStatus
  joinedAt: string
  removedAt: string | null
}

/** Eine offene Einladung, wie die DSGVO-Auskunft sie zeigt (nie mit Token). */
export interface CommunityInviteExport {
  communityId: string
  communityName: string
  role: CommunityRole
  status: CommunityInviteStatus
  expiresAt: string
  createdAt: string
}

export interface CommunityUserDataExport {
  memberships: CommunityMembershipExport[]
  invites: CommunityInviteExport[]
}

export interface InviteInput {
  email: string
  role: string
  members: readonly CommunityTeamMemberFacts[]
  /** E-Mails der Mitglieder MIT Zugang (gleiche Reihenfolge irrelevant). */
  activeEmails: readonly string[]
}

/** Darf unter dieser Adresse mit dieser Rolle eingeladen werden? */
export function decideInvite(input: InviteInput): CommunityTeamDecision {
  const { email, role, activeEmails } = input

  if (!(COMMUNITY_ROLES as readonly string[]).includes(role)) return deny('invalid_role')
  // Owner wird nie eingeladen — Besitz entsteht durch Gründung oder Übergabe.
  if (role === 'owner') return deny('owner_protected')

  const normalized = email.trim().toLowerCase()
  if (activeEmails.some(existing => existing.trim().toLowerCase() === normalized)) {
    return deny('already_member')
  }

  return ALLOW
}

export interface JoinInput {
  /** Warum jemand beitreten möchte (core/shared/communityJoin.ts). */
  trigger: CommunityJoinTrigger
  /** `tenants.openRegistration` DIESER Community — der bestehende Schalter. */
  openRegistration: boolean
  /** Bestehende Mitgliedschaft (jeden Status) oder null. */
  existing: CommunityTeamMemberFacts | null
}

export interface JoinDecision {
  outcome: CommunityJoinOutcome
  /** Rolle, die danach gilt (bei 'closed'/'removed' null). */
  role: CommunityRole | null
}

/**
 * Darf diese Person JETZT Mitglied dieser Community werden? (A5, Davids
 * Entscheidung 1 vom 2026-07-29)
 *
 * Die Reihenfolge der drei Fragen ist die ganze Regel, und sie ist mit Absicht so:
 *
 *  1. **Gibt es schon eine Zeile?** Dann entscheidet SIE, nicht der Schalter.
 *     Eine aktive heißt „ist schon dabei" (idempotent — jeder Auslöser darf
 *     beliebig oft feuern). Eine entzogene heißt **draußen**, und zwar
 *     endgültig: das ist der Kern des ganzen Vorgangs. Ohne diesen Zweig würde
 *     der Auslöser genau das wieder aufheben, was „Zugang entziehen" gerade
 *     getan hat — die entfernte Person schreibt einen Kommentar und ist zurück.
 *     Zurück kommt man nur über eine neue EINLADUNG (accept.post.ts hebt den
 *     Status wieder auf 'active').
 *  2. **Bestand?** `legacy` überspringt den Schalter — und nur dieser Auslöser.
 *     Wer das Site-Label aus der A4-Zeit trägt, hat diese Community bisher als
 *     Mitglied benutzt; ihn jetzt auszusperren, weil seine Community inzwischen
 *     geschlossen ist, wäre ein Rückschritt für einen echten Nutzer, kein
 *     Sicherheitsgewinn. Die Zeile, die dabei entsteht, macht den Zustand zum
 *     ersten Mal sichtbar UND entziehbar.
 *  3. **Ist die Registrierung offen?** Sonst: kein Auto-Beitritt. Geschlossen
 *     heißt geschlossen — Mitglied wird man dort ausschließlich per Einladung.
 */
export function decideJoin(input: JoinInput): JoinDecision {
  const { trigger, openRegistration, existing } = input

  if (existing) {
    if (hasCommunityAccess(existing.status)) return { outcome: 'member', role: existing.role }
    return { outcome: 'removed', role: null }
  }

  if (trigger !== 'legacy' && !openRegistration) return { outcome: 'closed', role: null }

  return { outcome: 'joined', role: COMMUNITY_JOIN_ROLE }
}

// ── Anzeige-Verträge (Control Plane ⇄ Kunden-App ⇄ UI) ──────────────────────

/**
 * Ein Mitglied, wie die Verwaltungsseite es zeigt. `name` reichert die RUNTIME
 * an (nur sie kennt die Nutzer ihres Projekts) — das Control Plane liefert es
 * leer.
 */
export interface CommunityMemberView {
  id: string
  runtimeUserId: string
  email: string
  name: string
  role: CommunityRole
  status: CommunityMemberStatus
  /** Beitrittsdatum = Entstehung der Mitgliedschaft. */
  joinedAt: string
  /** Zeitpunkt des Zugangs-Entzugs; null = hat Zugang. */
  removedAt: string | null
  /** true = das bin ich (die UI sperrt Selbst-Aktionen sichtbar). */
  self: boolean
}

/** Eine offene Einladung, wie die Verwaltungsseite sie zeigt (nie mit Token). */
export interface CommunityInviteView {
  id: string
  email: string
  role: CommunityRole
  status: CommunityInviteStatus
  expiresAt: string
  createdAt: string
}

export interface CommunityTeamResponse {
  members: CommunityMemberView[]
  invites: CommunityInviteView[]
  /** Rolle des Abfragenden — die UI leitet daraus ab, was sie anbietet. */
  actorRole: CommunityRole | null
}

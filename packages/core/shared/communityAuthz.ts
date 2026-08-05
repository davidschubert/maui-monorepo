import type { Capability } from './types/authz'

/**
 * COMMUNITY-ROLLEN (G1) — die Rechte-Matrix für Mitglieder EINER Kunden-
 * Community, getrennt vom Operator-RBAC in authz.ts. **Die EINE Liste der 5
 * Rollen**: seit E8 Etappe 4 (2026-07-30) importiert auch das Control Plane sie
 * von hier, statt eine zweite Kopie zu pflegen.
 *
 * Zwei bewusst getrennte Welten (docs/referenz/G0-PRODUKTVERTRAG.md §2):
 *  - authz.ts (Role = admin|moderator) = Betreiber/Operator (globale Appwrite-
 *    Labels auf DEINER Instanz; über die GANZE Plattform gültig).
 *  - communityAuthz.ts (CommunityRole) = die 5 Rollen INNERHALB einer Kunden-
 *    Community. Verankert an `community_members {communityId = tenants.$id,
 *    runtimeProjectId, runtimeUserId}` — die Runtime-Identität (Pool-/Silo-
 *    Projekt-User), NICHT die Control-Plane-userId.
 *
 * Pure TS ohne Nuxt-/Appwrite-Deps → Server (requireCommunityPermission) UND
 * Client (UI-Gating) nutzen dieselbe Quelle via relativem Import.
 *
 * VOKABULAR (E8-4): hieß bis 2026-07-30 `tenantAuthz.ts` mit `TenantRole`/
 * `TENANT_ROLES`. Die Rollen-WERTE ('owner' … 'viewer') stehen in Zeilen und
 * ändern sich nie — umbenannt wurden nur die Namen im Code.
 *
 * Rollen-Gitter (kein reiner Chain — Editor und Moderator sind Geschwister):
 *   viewer ⊂ {editor, moderator} ⊂ admin ⊂ owner
 * Editor darf verfassen, aber nicht moderieren; Moderator moderiert, verfasst
 * aber nicht. Admin vereint beide + Branding + Team. Owner = Admin + Übergabe/
 * Löschung. Abrechnung/System/Instanz-weite Rechte bleiben beim Operator.
 */
export const COMMUNITY_ROLES = ['owner', 'admin', 'moderator', 'editor', 'viewer'] as const
export type CommunityRole = (typeof COMMUNITY_ROLES)[number]

/** Viewer: liest die Community + kommentiert. Kein Dashboard-Verwaltungsrecht. */
const VIEWER: readonly Capability[] = [
  'dashboard.access',
]

/** Editor: verfasst Inhalte (Beiträge, Seiten, Events, Medien) — moderiert NICHT. */
const EDITOR: readonly Capability[] = [
  ...VIEWER,
  'posts.write',
  'pages.manage',
  'media.manage',
  'events.manage',
  /**
   * Private Nachrichten eröffnen (2026-08-05, PN-Konzept § 2.4).
   *
   * Die HAUPTQUELLE dieser Capability ist die Vertrauensstufe 1
   * (`trustLevel.ts`) — hier steht sie zusätzlich, und der Unterschied ist
   * genau der zwischen VERDIENT und ERNANNT: ein Editor ist vom Owner berufen
   * worden, und eine Berufung ist eine stärkere Vertrauensaussage als zwei
   * Tage Mitgliedschaft. Ein frisch berufener Redakteur, der niemandem
   * schreiben kann, wäre nicht erklärbar.
   *
   * DER VIEWER BEKOMMT SIE AUSDRÜCKLICH NICHT. Das ist die Rolle, die ein
   * automatischer Beitritt vergibt (A5) — dort und nur dort muss der
   * Spam-Schutz greifen, sonst wäre das TL1-Gate eine Zierde.
   */
  'messages.write',
]

/** Moderator: Meldungen + Kommentare + Beiträge + Termine moderieren — verfasst NICHT. */
const MODERATOR: readonly Capability[] = [
  ...VIEWER,
  'comments.moderate',
  'reports.moderate',
  'posts.moderate',
  // F15 (2026-08-03): Termine sind die dritte öffentliche Inhaltsart im Pool.
  // Sie steht hier neben posts.moderate und NICHT im EDITOR — `events.manage`
  // (Termine verfassen) bleibt dort. Ein Editor verwaltet seine eigenen
  // Termine, ein Moderator urteilt über fremde; Admin/Owner erben beides über
  // EDITOR ∪ MODERATOR.
  'events.moderate',
  /**
   * F1 Teilpaket 3 (2026-08-04): die beiden Stufen-Rechte, die auch der
   * Moderator hält — ZUGEWINN, kein Umbau.
   *
   *  - `posts.arrange` war bisher Teil von `posts.moderate` (die
   *    Zustands-Route prüfte genau die). Sie steht jetzt als eigene Capability
   *    daneben, damit Vertrauensstufe 4 die drei Zustände bekommen kann, OHNE
   *    Melde-Queue, Ausblenden und KI-Assistenz mitzuerben. Für den Moderator
   *    ändert sich dadurch nichts: er hält beide.
   *  - `posts.curate` ist neu für ALLE — fremde Titel und Einordnungen konnte
   *    bis hierher niemand korrigieren. Sie hier NICHT einzutragen hieße, dass
   *    ein automatisch aufgestiegenes Mitglied (Stufe 3) mehr dürfte als der
   *    Moderator; das wäre schwerer zu erklären als der kleine Zugewinn.
   */
  'posts.curate',
  'posts.arrange',
  /**
   * Private Nachrichten eröffnen (2026-08-05) — aus demselben Grund wie beim
   * EDITOR: der Moderator ist ernannt. Er hier wegzulassen hieße, dass ein
   * automatisch aufgestiegenes Mitglied (Stufe 1) mehr dürfte als der
   * Moderator, der über seine Beiträge urteilt — dieselbe Überlegung, die
   * `posts.curate` eine Zeile weiter oben hierher gebracht hat.
   */
  'messages.write',
]

/** Admin: Editor ∪ Moderator + Kurse, Activity, Branding, Team. Kein Billing/System. */
const ADMIN: readonly Capability[] = [
  ...new Set<Capability>([
    ...EDITOR,
    ...MODERATOR,
    // F1 (2026-08-03): die Kategorien-STRUKTUR der Discussions. Sie steht hier
    // und nicht im EDITOR/MODERATOR, weil Davids Konzept die Struktur
    // ausdrücklich dem Admin gibt („Mitglieder können KEINE Kategorien
    // anlegen"). Verfassen (`posts.write`) und Moderieren (`posts.moderate`)
    // bleiben, wo sie sind — der Rahmen ist eine dritte Aufgabe.
    'posts.manage',
    /**
     * F1 Teilpaket 3 (2026-08-04): fremde Beiträge inhaltlich bearbeiten.
     *
     * BEIM ADMIN UND NICHT BEIM MODERATOR, und das ist eine Entscheidung: der
     * Moderator urteilt über fremde Inhalte (ausblenden, wiederherstellen) —
     * in einen fremden Text hineinzuschreiben ist etwas anderes. Dem Admin
     * gehören die Inhalte der Community ohnehin (`posts.manage`), und er muss
     * mindestens so viel dürfen wie die Stufe 4, die sein Owner ernennt.
     */
    'posts.revise',
    'courses.manage',
    'activity.manage',
    'branding.manage',
    'team.manage',
  ]),
]

/** Owner: Admin + Owner-Übergabe + Community-Löschung + Abo (A6: der Owner kauft). */
const OWNER: readonly Capability[] = [
  ...new Set<Capability>([
    ...ADMIN,
    'community.transfer',
    'community.delete',
    // A6 (Davids Entscheidung 2, 2026-07-30): gekauft wird im Dashboard der
    // Community, und zwar NUR vom Owner — das Abo hängt an der Community.
    // BEWUSST eine EIGENE Community-Capability: billing.manage ist Instanz-weit
    // (Operator-Payment-Logs) — sie dem Owner zu geben, wäre das Leck, das
    // der Rollen-Trennungs-Test (communityAuthz.test.ts) verbietet.
    'community.billing',
    // F37 (2026-08-02): das Einbetter-Register des Widgets. Aus DEMSELBEN
    // Grund beim Owner wie das Abo — wer eine fremde Domain freigibt, öffnet
    // die Community nach außen (frame-ancestors + partitioniertes
    // Session-Cookie). Ein Admin verwaltet, was INNEN passiert.
    'community.embed',
    // Besucherstatistik (2026-08-04): aus DEMSELBEN Grund beim Owner. Die
    // eingetragene Script-Id lädt fremden Code in jede Seite der Community und
    // meldet die Besuche ihrer Mitglieder an einen Dritten — eine Entscheidung
    // nach außen, keine Verwaltung nach innen.
    'community.analytics',
    /**
     * F1 Teilpaket 3 (2026-08-04): die Vertrauensstufe 4 von Hand ernennen.
     *
     * Beim Owner aus demselben Grund wie die Übergabe: hier wird Macht über
     * fremde Inhalte VERSCHENKT — dauerhaft und ohne Schwelle, die sie
     * verdient. Ein Admin verwaltet, was es gibt; wer Rechte vergibt, ist der
     * Eigentümer. (Die Stufen 1–3 vergibt niemand, die rechnet sich jeder
     * selbst zusammen — dafür gibt es bewusst keine Capability.)
     */
    'posts.appoint',
    /**
     * Den privaten Kanal der Community auf- und zumachen (2026-08-05,
     * PN-Konzept § 2.6, Davids Entscheidung 4).
     *
     * Beim Owner aus demselben Grund wie `community.embed` und
     * `community.analytics`: das ist keine Verwaltung dessen, was es gibt,
     * sondern die Entscheidung, ob es einen unbeobachteten Kanal zwischen
     * Mitgliedern überhaupt gibt. Davids Rahmensetzung nennt die Sorge beim
     * Namen, und die Antwort darauf gehört dem Eigentümer.
     */
    'messages.manage',
  ]),
]

/** Rolle → ihre Capabilities. Single Source of Truth für Community-Autorisierung. */
export const COMMUNITY_ROLE_CAPABILITIES: Record<CommunityRole, readonly Capability[]> = {
  owner: OWNER,
  admin: ADMIN,
  moderator: MODERATOR,
  editor: EDITOR,
  viewer: VIEWER,
}

/** Type-Guard: ist der String eine bekannte Community-Rolle? */
export function isCommunityRole(value: string): value is CommunityRole {
  return (COMMUNITY_ROLES as readonly string[]).includes(value)
}

/** Hat GENAU DIESE Rolle die gefragte Capability? (eine Rolle je User/Community) */
export function communityRoleHasCapability(role: CommunityRole, capability: Capability): boolean {
  return COMMUNITY_ROLE_CAPABILITIES[role].includes(capability)
}

/** Capabilities einer Community-Rolle als Set (für UI/Aggregation). */
export function communityCapabilitiesFor(role: CommunityRole | null | undefined): Set<Capability> {
  if (!role || !isCommunityRole(role)) return new Set()
  return new Set(COMMUNITY_ROLE_CAPABILITIES[role])
}

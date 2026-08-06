import type { Capability } from './types/authz'
import { hasCapability } from './authz'
import { communityRoleHasCapability, type CommunityRole } from './communityAuthz'
import { normalizeTrustLevel, trustLevelHasCapability, type TrustLevel } from './trustLevel'

/**
 * PURE Entscheidung für community-bezogene Routen (O5): darf dieser Request?
 *
 * Drei Wege führen durch, und die Reihenfolge ist Absicht:
 *
 *  1. **Community-Rolle** (Normalfall) — der Runtime-User ist Mitglied DIESER
 *     Community mit ausreichender Rolle (community_members, G1).
 *  2. **Vertrauensstufe** (F1 Teilpaket 3, seit 2026-08-04) — was sich dieser
 *     Mensch DURCH SEIN VERHALTEN in dieser Community erarbeitet hat, plus die
 *     von Hand ernannte Stufe 4. Steht NACH der Rolle, weil die Rolle die
 *     stärkere Aussage ist und ihr Weg im Ergebnis sichtbar bleiben soll; steht
 *     VOR dem Operator, weil ein verdientes Recht kein Break-Glass ist und
 *     keine Warnzeile verdient.
 *  3. **Operator-Break-Glass** — jemand mit globalem Label auf der Instanz
 *     (Betreiber-Support). Kommt zuletzt, damit das Protokoll nur dann einen
 *     Break-Glass meldet, wenn wirklich einer stattfand, und nicht bei jedem
 *     normalen Owner-Klick.
 *
 * Warum das nicht `requirePermission` erweitert: die Funktion ist SYNCHRON und
 * wird in Dutzenden Routen ohne `await` aufgerufen. Sie async zu machen hätte
 * jede dieser Prüfungen still in ein nicht-abgewartetes Promise verwandelt —
 * also in KEINE Prüfung. Deshalb ein eigener, bewusst asynchroner Gate.
 *
 * VOKABULAR (E8-4, 2026-07-30): hieß bis dahin `siteAccess.ts` mit
 * `decideSiteAccess`. Reine Entscheidungslogik, keine Verhaltensänderung.
 */

export type CommunityAccessDecision =
  | { allowed: true, via: 'role', role: CommunityRole }
  /**
   * Erarbeitete (oder ernannte) Vertrauensstufe — F1 Teilpaket 3.
   * Ein Mitglied DIESER Community, also derselbe `actor` wie bei `role`.
   */
  | { allowed: true, via: 'trust', trustLevel: TrustLevel }
  /** Betreiber-Zugriff auf eine Kunden-Community — MUSS protokolliert werden. */
  | { allowed: true, via: 'operator' }
  /** Kein Mandanten-Kontext (Single-Tenant-App): klassisches Operator-RBAC. */
  | { allowed: true, via: 'single-tenant' }
  | { allowed: false, reason: 'no-role' | 'insufficient-role' | 'forbidden' }

/** Auf welchem Weg der Zugriff erlaubt wurde. */
export type CommunityAccessVia = Extract<CommunityAccessDecision, { allowed: true }>['via']

export interface CommunityAccessInput {
  capability: Capability
  /** Globale Appwrite-Labels des Users (Operator-RBAC). */
  labels: readonly string[]
  /** Läuft der Request in einem Mandanten-Kontext? */
  tenantScoped: boolean
  /** Rolle des Users in DIESER Community (null = keine Mitgliedschaft). */
  role: CommunityRole | null
  /**
   * Vertrauensstufe dieses Menschen in DIESER Community (F1 Teilpaket 3).
   *
   * OPTIONAL, und das ist Betrieb statt Bequemlichkeit: die Stufe nachzuschlagen
   * kostet eine Abfrage, und nur drei Capabilities können überhaupt aus ihr
   * folgen (`trustLevelGrantsCapability`). Jeder Aufrufer, der die Frage nicht
   * stellt, bekommt hier Stufe 0 — also exakt das Verhalten von vorher.
   */
  trustLevel?: number | null
}

/**
 * PURE (unit-getestet): WER HANDELT auf diesem Weg — der `actor` für die
 * Datentür (F17, 2026-08-01).
 *
 * WARUM DIESE FUNKTION EXISTIERT: seit C1c trennt `tenantDb` „welcher Client
 * fragt" (`as`) von „wer handelt" (`actor`). Für die REDAKTIONS-Routen (Kurs,
 * Lektion, Termin, Seite) ist das keine freie Wahl mehr, sondern eine
 * Ableitung: der Gate hat die Frage schon beantwortet. Wer über seine
 * Community-ROLLE hereinkommt, ist ein Mensch DIESER Community — Inhalts-Sperre
 * (M13) und Beitritt (A5) gelten. Wer über das Betreiber-Break-Glass
 * hereinkommt, handelt für jemand ANDEREN.
 *
 * Und deshalb wäre ein pauschales `actor: 'member'` an diesen Routen falsch:
 *  - A5 — der Break-Glass-Betreiber würde durch eine Support-Änderung selbst
 *    Mitglied der Kunden-Community (Rolle `viewer` in der Mitgliederliste des
 *    Kunden). Ein Beitritt ist eine Aussage über eine Person, keine
 *    Nebenwirkung von Hilfe.
 *  - M13 — der Betreiber käme in einer gesperrten Community nicht mehr an die
 *    Inhalte seines eigenen Kunden. Genau dieselbe Begründung, aus der die
 *    Moderation offen bleibt.
 *
 * `single-tenant` (Silo, Playground, Kontroll-Host) ist wörtlich Operator-RBAC
 * und wird auch so beantwortet. Wirkung hat das dort ohnehin keine: ohne
 * Mandanten gibt es weder eine Sperre noch eine Mitgliedschaft.
 */
export function actorForCommunityAccess(via: CommunityAccessVia): 'member' | 'operator' {
  // `trust` steht hier neben `role`, und das ist die ganze Aussage dieser
  // Zeile: eine Vertrauensstufe erarbeitet man sich DURCH Mitmachen. Wer über
  // sie hereinkommt, ist ein Mensch DIESER Community — die Inhalts-Sperre (M13)
  // und der Beitritts-Auslöser (A5) gelten für ihn wie für jedes andere
  // Mitglied. Ihn als `operator` zu führen, hieße einer Stufe 4 den
  // Betreiber-Ausweis zu geben.
  return via === 'role' || via === 'trust' ? 'member' : 'operator'
}

/**
 * PURE (unit-getestet): GEHÖRT dieser Mensch hierher? — H1, seit 2026-08-05.
 *
 * Eine ANDERE Frage als `decideCommunityAccess` daneben, und deshalb eine eigene
 * Funktion: dort geht es um „darf er DIESE eine Sache", hier nur um „ist er
 * überhaupt einer von uns". Es gibt Dinge, die keine Capability sind und
 * trotzdem Mitgliedschaft voraussetzen — der eigene @name ist das erste davon
 * (`community_handles`). Ihn über `decideCommunityAccess` zu erzwingen hätte
 * eine Capability erfunden, die niemand vergibt, und den Operator-Break-Glass
 * mitgebracht: der Betreiber hätte sich beim Support-Besuch still einen Namen
 * in der Kunden-Community genommen.
 *
 * ── WAS ALS MITGLIEDSCHAFT ZÄHLT ───────────────────────────────────────────
 * Genau das, was `server/middleware/06.community-label.ts` auch dafür hält —
 * zwei Regelwerke für eine Frage laufen auseinander:
 *
 *  1. `tenantScoped === false` ⇒ JA. Silo, Kontroll-Host, Playground,
 *     Single-Tenant: dort ist das PROJEKT die Grenze, jedes Konto ist zuhause.
 *     Ein Gate wäre dort keine Grenze, sondern eine Aussperrung.
 *  2. Frisch entzogen ⇒ NEIN, noch vor der Rolle. Der Rollen-Resolver cacht
 *     30 s; ohne diese Frage hätte „Zugang entziehen" ein halbminütiges Loch,
 *     in dem sich der Hinausgeworfene noch einen Namen sichern kann.
 *  3. Eine Rolle in DIESER Community ⇒ JA (eine `community_members`-Zeile mit
 *     Zugang, A5).
 *  4. Das Community-LABEL ⇒ JA. Das ist kein zweiter Weg neben (3), sondern
 *     derselbe, eine Sekunde früher: das Label wird seit A5 NUR mit
 *     feststehender Mitgliedschaft vergeben (joinCommunity, Label-Middleware,
 *     Wizard) und mit ihr wieder eingezogen. Es zu lesen schliesst zwei Fälle,
 *     die sonst offen blieben:
 *       - BESTAND aus der A4-Zeit (Label, noch keine Zeile) — für die
 *         Middleware ist das ein Mitglied, das sie gerade nachträgt.
 *       - Der A5-BEITRITT DURCH SCHREIBEN: wer mit seinem ersten Beitrag
 *         beitritt, hat die Zeile erst seit Millisekunden, und der 30-s-Cache
 *         des Rollen-Resolvers weiss noch nichts davon. `grantCommunityLabel`
 *         schreibt das Label aber im SELBEN Request auch in
 *         `event.context.user.labels` — dort steht es also schon.
 *     Ein Label ist damit hier ein ZEUGNIS über Mitgliedschaft, keine Rolle;
 *     autorisiert wird davon nichts (das bleibt requireCommunityPermission).
 */
export interface CommunityMembershipInput {
  /** Läuft der Request in einer gepoolten Community? (Silo/Kontroll-Host: nein.) */
  tenantScoped: boolean
  /** Rolle in DIESER Community (null = keine Zeile mit Zugang). */
  role: CommunityRole | null
  /** Trägt das Konto das Lese-Publikum dieser Community? */
  hasCommunityLabel: boolean
  /** Wurde dem Konto der Zugang gerade selbst entzogen? (30-s-Cache-Loch.) */
  recentlyDenied: boolean
}

export function isCommunityMember(input: CommunityMembershipInput): boolean {
  if (!input.tenantScoped) return true
  if (input.recentlyDenied) return false
  return input.role !== null || input.hasCommunityLabel
}

export function decideCommunityAccess(input: CommunityAccessInput): CommunityAccessDecision {
  const operator = hasCapability(input.labels, input.capability)
  const trustLevel = normalizeTrustLevel(input.trustLevel)
  const trusted = trustLevelHasCapability(trustLevel, input.capability)

  // Ohne Mandanten (Single-Tenant-App, Playground, Studio) bleibt der
  // Operator-Weg unverändert — sonst würde dieser Gate die Bestands-Apps
  // umschreiben. Die Stufe kommt auch dort als ZUSATZ dazu (eine Silo-Instanz
  // ist selbst die Community; wer dort mitschreibt, sammelt dieselben Zähler)
  // und kann dem Operator nichts nehmen, weil sie erst nach ihm gefragt wird.
  if (!input.tenantScoped) {
    if (operator) return { allowed: true, via: 'single-tenant' }
    return trusted ? { allowed: true, via: 'trust', trustLevel } : { allowed: false, reason: 'forbidden' }
  }

  if (input.role && communityRoleHasCapability(input.role, input.capability)) {
    return { allowed: true, via: 'role', role: input.role }
  }

  // Erarbeitet oder ernannt — und ausdrücklich VOR dem Operator-Break-Glass:
  // ein Recht, das dieser Mensch sich verdient hat, ist kein Support-Eingriff
  // und darf keine Warnzeile erzeugen. Wer beides hat, gilt als der Mensch,
  // der er ist.
  if (trusted) return { allowed: true, via: 'trust', trustLevel }

  // Mitglied, aber weder Rolle noch Stufe reichen. Ein Operator darf trotzdem
  // durch (Support), sonst ist hier Schluss — mit eigenem Grund fürs Log.
  if (operator) return { allowed: true, via: 'operator' }
  return { allowed: false, reason: input.role ? 'insufficient-role' : 'no-role' }
}

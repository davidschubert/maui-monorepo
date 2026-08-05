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

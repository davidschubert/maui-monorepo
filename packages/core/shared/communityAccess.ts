import type { Capability } from './types/authz'
import { hasCapability } from './authz'
import { communityRoleHasCapability, type CommunityRole } from './communityAuthz'

/**
 * PURE Entscheidung für community-bezogene Routen (O5): darf dieser Request?
 *
 * Zwei Wege führen durch, und die Reihenfolge ist Absicht:
 *
 *  1. **Community-Rolle** (Normalfall) — der Runtime-User ist Mitglied DIESER
 *     Community mit ausreichender Rolle (community_members, G1).
 *  2. **Operator-Break-Glass** — jemand mit globalem Label auf der Instanz
 *     (Betreiber-Support). Kommt NACH der Rolle, damit das Protokoll nur dann
 *     einen Break-Glass meldet, wenn wirklich einer stattfand, und nicht bei
 *     jedem normalen Owner-Klick.
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
  return via === 'role' ? 'member' : 'operator'
}

export function decideCommunityAccess(input: CommunityAccessInput): CommunityAccessDecision {
  const operator = hasCapability(input.labels, input.capability)

  // Ohne Mandanten (Single-Tenant-App, Playground, Studio) bleibt alles wie
  // bisher — sonst würde dieser Gate die Bestands-Apps umschreiben.
  if (!input.tenantScoped) {
    return operator ? { allowed: true, via: 'single-tenant' } : { allowed: false, reason: 'forbidden' }
  }

  if (input.role) {
    if (communityRoleHasCapability(input.role, input.capability)) {
      return { allowed: true, via: 'role', role: input.role }
    }
    // Mitglied, aber die Rolle reicht nicht. Ein Operator darf trotzdem durch
    // (Support), sonst ist hier Schluss — mit eigenem Grund fürs Log.
    return operator ? { allowed: true, via: 'operator' } : { allowed: false, reason: 'insufficient-role' }
  }

  return operator ? { allowed: true, via: 'operator' } : { allowed: false, reason: 'no-role' }
}

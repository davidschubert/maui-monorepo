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

export interface CommunityAccessInput {
  capability: Capability
  /** Globale Appwrite-Labels des Users (Operator-RBAC). */
  labels: readonly string[]
  /** Läuft der Request in einem Mandanten-Kontext? */
  tenantScoped: boolean
  /** Rolle des Users in DIESER Community (null = keine Mitgliedschaft). */
  role: CommunityRole | null
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

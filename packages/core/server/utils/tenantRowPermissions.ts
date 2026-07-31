import { Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantContext } from '../../shared/types/tenant'
import { communityContentIsPublic } from '../../shared/communityAudience'
import { useTenant } from './tenant'

/**
 * Horizont-3 Naht 4 — Row-Permissions als HARTE zweite Verteidigungslinie im
 * Pool. Der `tenantId`-Filter (Naht 3, scopeQuery) ist nur Anwendungslogik; ein
 * vergessener Filter würde ohne diese Schicht Zeilen von Kunde A an Kunde B
 * leaken. Mit tenant-genameter Read-Permission gibt Appwrite die Zeile gar
 * nicht erst heraus — der Session-Client eines fremden Tenants trägt das Label
 * nicht.
 *
 * Label-Schlüssel = die `communityId` (= tenants.$id): garantiert alphanumerisch
 * ≤36 Zeichen (Appwrite-Row-IDs), also ein GÜLTIGES Appwrite-Label ohne
 * Sanitisierung — und kollisionsfrei je Site. (Der Zeilen-Scope-Wert bleibt die
 * `tenantId`-Spalte; Label und Filter identifizieren denselben Tenant über
 * verschiedene Schlüssel — bewusst, weil $id die einzige alnum-Garantie hat.)
 *
 * Pure Kern (unit-getestet, node-appwrite Permission/Role sind String-Builder).
 */

/** Read-Publikum einer Zeile.
 *  - 'members': nur Mitglieder DIESER Site (Pool: Role.label(communityId); Silo:
 *    Role.users, da das Projekt schon isoliert). Community-Standard.
 *  - 'public': jede/r (Role.any) — bewusst öffentliche Inhalte (z. B. ein
 *    öffentlicher Kommentar-Thread, ein öffentlich sichtbarer Beitrag).
 *
 *  ACHTUNG (C18): 'public' ist die ABSICHT DER ZEILE („dieser Beitrag ist
 *  veröffentlicht"), nicht die Entscheidung der Community. Ist die Community
 *  auf 'members' gestellt, wird daraus hier ein Mitglieder-Read — siehe
 *  tenantReadRolesFor(). Eine Zeile ohne Veröffentlichungs-Absicht (Entwurf,
 *  ausgeblendeter Kommentar) bleibt in BEIDEN Fällen zu. */
export type RowReadAudience = 'members' | 'public'

export interface TenantRowPermissionOptions {
  /** Wer die Zeile lesen darf. Default 'members' (fail-safe: nicht öffentlich). */
  read?: RowReadAudience
  /** Besitzer (Appwrite-User-$id): darf ändern/löschen. */
  ownerUserId?: string
  /** Zusätzliche Read-Rollen (z. B. Role.label('admin')/('moderator') für
   *  Operator-/Moderations-Sicht). Werden additiv angehängt. */
  extraRead?: string[]
}

/** Das Read-Permission-Set für das gewählte Publikum im gegebenen Tenant.
 *
 *  C18 (2026-07-30): die WAHL DER COMMUNITY schlägt die ABSICHT DER ZEILE.
 *  Steht `audience` auf 'members', wird aus jedem 'public' hier ein
 *  Mitglieder-Read — DIESE Zeile ist der Grund, warum der Schalter überhaupt
 *  wirkt, ohne dass zwanzig Schreib-Routen ihn kennen müssten (dieselbe
 *  Begründung wie bei der Datentür). Der umgekehrte Weg gilt NICHT: eine
 *  bewusst mitglieder-interne Zeile (Activity-Feed, Presence) wird durch eine
 *  öffentliche Community nie öffentlich. */
export function tenantReadRolesFor(tenant: TenantContext | null, read: RowReadAudience): string[] {
  if (read === 'public' && communityContentIsPublic(tenant)) return [Permission.read(Role.any())]
  // 'members' — und jedes 'public' einer geschlossenen Community
  if (tenant?.mode === 'pool') {
    // Harte Grenze: nur wer das Site-Label trägt. Ohne communityId (Datenfehler /
    // Bestand ohne Migration) fällt es auf 'no read' zurück statt any —
    // fail-CLOSED, nie versehentlich öffentlich.
    return tenant.communityId ? [Permission.read(Role.label(tenant.communityId))] : []
  }
  // Silo: eigenes Projekt → jede/r eingeloggte Projekt-User. Single-Tenant
  // (kein Kontext): ebenfalls Role.users (heutiges Verhalten der Member-Reads).
  return [Permission.read(Role.users())]
}

/**
 * Vollständiges Permission-Array für eine tenant-genamete Zeile: Read je
 * Publikum + optionale Extra-Read-Rollen + Owner-Update/Delete. Dedupliziert.
 */
export function tenantRowPermissionsFor(
  tenant: TenantContext | null,
  options: TenantRowPermissionOptions = {},
): string[] {
  const read = options.read ?? 'members'
  const perms = new Set<string>(tenantReadRolesFor(tenant, read))
  for (const r of options.extraRead ?? []) perms.add(r)
  if (options.ownerUserId) {
    perms.add(Permission.update(Role.user(options.ownerUserId)))
    perms.add(Permission.delete(Role.user(options.ownerUserId)))
  }
  return [...perms]
}

/** event-Wrapper (das, was Produkt-Routen aufrufen). */
export function tenantRowPermissions(event: H3Event, options: TenantRowPermissionOptions = {}): string[] {
  return tenantRowPermissionsFor(useTenant(event), options)
}

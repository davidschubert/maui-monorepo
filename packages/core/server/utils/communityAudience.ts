import { Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { CommunityAudience, TenantContext } from '../../shared/types/tenant'
import { communityAudienceFor, communityContentIsPublic } from '../../shared/communityAudience'
import { tenantReadRolesFor } from './tenantRowPermissions'
import { useTenant } from './tenant'

/**
 * C18 — die SERVER-Seite der Sichtbarkeit: was „veröffentlicht" für die
 * Row-Permissions bedeutet, und wer die Inhalte einer Community lesen darf,
 * wenn die Row-Permissions gar nicht befragt werden.
 *
 * ZWEI FÄLLE, ZWEI WERKZEUGE — und der zweite ist der, den man vergisst:
 *
 *  1. Zeilen mit eigenen Row-Permissions (comments, community_posts, events,
 *     media_items). Dort ist Appwrite die Grenze: `publishedReadPermission()`
 *     liefert `read("any")` bzw. `read("label:<communityId>")`, je nachdem, was
 *     die Community gewählt hat. Ein Gast trägt kein Label und bekommt die
 *     Zeile schlicht nicht.
 *  2. Zeilen OHNE Row-Permissions, die eine Route mit der OPERATOR-Türklinke
 *     ausliefert (heute: `pages` — Entwürfe sind server-only, öffentlich macht
 *     sie der `status`-Filter). Dort umgeht die Route die Permissions
 *     ABSICHTLICH, also gibt es nichts, was der Schalter umlegen könnte:
 *     `assertCommunityContentReadable()` ist da die einzige Grenze.
 *
 * Der Lese-Test in Fall 2 stellt bewusst DIESELBE Frage wie Appwrite in Fall 1
 * ("trägt der Aufrufer das Publikum dieser Zeile?"), damit beide Wege nicht
 * auseinanderlaufen können.
 */

/** Der Publikums-Wert dieses Requests (Server-Wrapper der puren Regel). */
export function communityAudience(event: H3Event): CommunityAudience {
  return communityAudienceFor(useTenant(event))
}

/**
 * Die EINE Read-Permission, die eine VERÖFFENTLICHTE Zeile dieser Community
 * trägt. Genau `tenantReadRolesFor(tenant, 'public')`, nur als Einzelwert —
 * die Produkt-Layer stempeln ein einzelnes `Permission.read(...)` und sollen
 * dafür kein Array auspacken müssen.
 *
 * Kann '' sein: Pool-Zeile einer geschlossenen Community OHNE `communityId`
 * (Datenfehler). Fail-CLOSED wie in tenantReadRolesFor — lieber keine
 * Leseberechtigung als `read("any")`. Aufrufer filtern leere Werte, dafür gibt
 * es `withPublishedRead()`.
 */
export function publishedReadPermissionFor(tenant: TenantContext | null): string {
  return tenantReadRolesFor(tenant, 'public')[0] ?? ''
}

export function publishedReadPermission(event: H3Event): string {
  return publishedReadPermissionFor(useTenant(event))
}

/**
 * ALLE Schreibweisen, die „veröffentlicht" in DIESER Community je bedeuten
 * kann — die öffentliche UND die mitglieder-interne.
 *
 * Warum beide: das zweiphasige Ausblenden (comments/posts) entfernt die
 * Veröffentlichungs-Permission aus einem BESTEHENDEN Array. Nach einem
 * Publikums-Wechsel steht dort die jeweils andere Schreibweise — wer nur die
 * aktuelle sucht, lässt beim Ausblenden die alte stehen und der Beitrag bleibt
 * lesbar. Genau diese Sorte Rest ist der Grund, warum C18 „beide Richtungen
 * prüfen" verlangt.
 */
export function publishedReadCandidatesFor(tenant: TenantContext | null): string[] {
  const candidates = new Set<string>([Permission.read(Role.any())])
  for (const role of tenantReadRolesFor(tenant, 'members')) candidates.add(role)
  return [...candidates]
}

/** Veröffentlichungs-Permission aus einem Permission-Array ENTFERNEN
 *  (Ausblenden, Zurückziehen) — beide Schreibweisen, siehe oben. */
export function withoutPublishedRead(permissions: readonly string[], event: H3Event): string[] {
  const remove = new Set(publishedReadCandidatesFor(useTenant(event)))
  return permissions.filter(permission => !remove.has(permission))
}

/** Veröffentlichungs-Permission SETZEN (Anlegen, Freigeben, Wiederherstellen):
 *  erst jede alte Schreibweise raus, dann die für diese Community richtige rein.
 *  Idempotent — zweimal aufgerufen steht sie genau einmal drin. */
export function withPublishedRead(permissions: readonly string[], event: H3Event): string[] {
  const next = withoutPublishedRead(permissions, event)
  const published = publishedReadPermission(event)
  return published ? [...next, published] : next
}

/**
 * Darf der Aufrufer dieses Requests mitglieder-interne Inhalte DIESER
 * Community lesen?
 *
 * Öffentlich ⇒ immer ja. Sonst gilt genau, was Appwrite auch prüfen würde:
 *  - Pool: trägt der eingeloggte Nutzer das Label `<communityId>`? (Das Label
 *    ist seit A5 „ist Mitglied dieser Community" — vergeben von
 *    06.community-label.ts, entzogen mit dem Zugang.)
 *  - Silo/Single-Tenant: eingeloggt reicht, das Projekt IST die Grenze
 *    (`Role.users()`, dieselbe Zeile in tenantReadRolesFor).
 * Gast ⇒ nein.
 */
export function communityContentReadable(event: H3Event): boolean {
  const tenant = useTenant(event)
  if (communityContentIsPublic(tenant)) return true

  const user = event.context.user
  if (!user?.$id) return false
  if (tenant?.mode !== 'pool') return true
  // Fail-closed: Pool ohne communityId ist ein Datenfehler — dann liest niemand.
  if (!tenant.communityId) return false
  return (user.labels ?? []).includes(tenant.communityId)
}

/**
 * Wache für Routen, die mit der OPERATOR-Türklinke öffentlichen Inhalt
 * ausliefern (pages). 404, nicht 403: dass es diese Community gibt, ist keine
 * Auskunft für Fremde — und für den Aufrufer ist eine Seite, die er nicht
 * sehen darf, dasselbe wie eine, die es nicht gibt.
 */
export function assertCommunityContentReadable(event: H3Event, statusText = 'Not found'): void {
  if (communityContentReadable(event)) return
  throw createError({ status: 404, statusText })
}

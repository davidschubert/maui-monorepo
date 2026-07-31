import type { H3Event } from 'h3'

/**
 * GEBÜNDELTER Mitglieds-Vertrag (N9, 2026-07-29) — „ist dieser Autor noch
 * Mitglied DIESER Community?" für VIELE Nutzer auf einmal.
 *
 * Warum es ihn zusätzlich zum Einzel-Lookup gibt: `CommunityRoleResolver`
 * (communityPermission.ts) beantwortet EINE Frage pro Request — die Rolle des
 * Handelnden. Eine Kommentarliste hat aber 25 Autoren, und dieselbe Naht dafür zu
 * benutzen hieße 25 Cross-Projekt-Abfragen pro Seitenaufruf. Also ein eigener
 * Vertrag mit eigener Form: viele IDs rein, EINE Abfrage raus.
 *
 * Die Frage ist mit Absicht negativ formuliert („welche dieser Nutzer sind
 * EHEMALIG?") und nicht positiv („wer ist Mitglied?"). Der Grund ist Produkt, kein
 * Geschmack: eine fehlende Row heißt nicht „ehemalig". Seit A5 (2026-07-29) trägt
 * `community_members` zwar jedes beigetretene Mitglied und nicht mehr nur das Team —
 * aber Gast-Kommentare, Autoren von vor A5 und Konten, die hier nie beigetreten
 * sind, haben trotzdem keine Zeile. Wer „nicht in community_members" als „ehemalig"
 * läse, würde sie alle falsch kennzeichnen. Ehemalig ist deshalb eine POSITIVE
 * Tatsache: es gibt eine Mitgliedschafts-Row, und ihr Zugang wurde entzogen
 * (status 'removed').
 *
 * FAIL-SOFT, anders als bei der Autorisierung: fällt die Auflösung aus, fehlt ein
 * Hinweis-Zeichen — das darf niemals eine Liste kaputt machen. (Beim
 * Rollen-Resolver ist es umgekehrt fail-CLOSED: dort hängt Zugriff daran.)
 */

export interface FormerCommunityMembersLookup {
  /** = tenants.$id (die kanonische Kunden-Community). */
  communityId: string
  /** Appwrite-Projekt, in dem die Runtime-User existieren. */
  runtimeProjectId: string
  /** Die zu prüfenden Runtime-User (dedupliziert, ohne Leerwerte). */
  runtimeUserIds: string[]
}

/**
 * App-registrierte Auflösung: gibt NUR die IDs zurück, für die eine
 * Mitgliedschaft dieser Community existiert, deren Zugang entzogen wurde.
 */
export type FormerCommunityMembersResolver = (
  lookup: FormerCommunityMembersLookup,
) => Promise<string[]> | string[]

let formerMembersResolver: FormerCommunityMembersResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerFormerCommunityMembersResolver(fn: FormerCommunityMembersResolver): void {
  if (formerMembersResolver) {
    console.warn('[core] registerFormerCommunityMembersResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  formerMembersResolver = fn
}

export function getFormerCommunityMembersResolver(): FormerCommunityMembersResolver | null {
  return formerMembersResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetFormerCommunityMembersResolver(): void {
  formerMembersResolver = null
}

/**
 * Welche dieser Autoren sind ehemalige Mitglieder dieser Community?
 *
 * Leeres Set, wenn es nichts zu entscheiden gibt: kein Mandanten-Kontext (Silo,
 * Kontroll-Host, Einzelbetrieb), keine communityId, kein registrierter Resolver, keine
 * IDs — oder ein Fehler beim Lesen. Die Antwort ist ein Hinweis, keine Grenze.
 */
export async function resolveFormerMembers(event: H3Event, userIds: string[]): Promise<Set<string>> {
  const tenant = event.context.tenant
  if (!tenant?.communityId) return new Set()

  const resolver = getFormerCommunityMembersResolver()
  if (!resolver) return new Set()

  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Set()

  try {
    const former = await resolver({
      communityId: tenant.communityId,
      runtimeProjectId: tenant.projectId,
      runtimeUserIds: ids,
    })
    return new Set(former)
  }
  catch {
    return new Set()
  }
}

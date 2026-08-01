/**
 * COMMUNITY → HOST, als Registry-Vertrag (D5).
 *
 * WOFÜR: Benachrichtigungs-Mails müssen auf den Host DER COMMUNITY zeigen, in
 * der die Meldung entstanden ist. Die Zuordnung Host ↔ Community besitzt das
 * Control Plane (`communities.host`) — ein anderes Appwrite-PROJEKT, zu dem
 * core weder Schlüssel noch Kenntnis haben darf (A14: Fundament-Layer hängen
 * nie an Produkten, erst recht nicht am Control Plane). Also derselbe Bau wie
 * bei `registerFormerCommunityMembersResolver` und `registerCommunityJoinHandler`:
 * core beschreibt die FRAGE, die App verdrahtet die ANTWORT
 * (apps/platform/server/plugins/tenant-resolver.ts → control-Layer).
 *
 * ZWEI Eigenheiten, die diesen Vertrag von den Nachbarn unterscheiden:
 *
 * 1. KEIN `H3Event`. Der Digest-Sweep läuft im Intervall-Plugin, ganz ohne
 *    Request — er hat keinen Mandanten-Kontext und keinen Host, aus dem er
 *    etwas ableiten könnte. Genau das war der Grund, warum D5 geparkt war. Der
 *    Resolver bekommt deshalb (wie die anderen Cross-Projekt-Leser) seine
 *    Verbindungsdaten bei der Registrierung, nicht pro Aufruf.
 *
 * 2. GEBÜNDELT, weil eine Digest-Mail mehrere Communities mischt und ein Sweep
 *    viele Mails baut. Viele Ids rein, EINE Karte raus — dieselbe Form und
 *    dieselbe Begründung wie beim Ehemaligen-Resolver (N9), nur dass hier der
 *    Sweep statt der Kommentarliste die N+1-Falle wäre.
 *
 * WELCHE ID? Der Wert aus `notifications.communityId` — und der ist
 * `communities.tenantId` (z. B. `t-kunde-a`), NICHT `communities.$id`. E8-3 hat
 * die SPALTE umbenannt, nicht den WERT: `scopeRowFor()` stempelt weiter
 * `tenant.tenantId` hinein. Wer hier `$id` nachschlägt, findet nie etwas und
 * merkt es nicht, weil der Vertrag fail-soft ist.
 *
 * FAIL-SOFT: keine Auflösung ⇒ leere Karte ⇒ der Aufrufer nimmt seine
 * Fallback-Basis (`public.appUrl`). Eine Mail wird NIE verworfen, weil ein Host
 * fehlt.
 */

import { NOTIFICATION_SCOPE_ACCOUNT } from '../../shared/notificationScope'

/**
 * Viele Ablage-Werte → Karte `communityId → kanonischer Host` (ohne Schema,
 * ohne Port, wie in `communities.host` gespeichert). Nicht auflösbare Ids
 * FEHLEN in der Karte — sie tauchen nicht als leerer String auf, damit der
 * Aufrufer „unbekannt" nicht mit „Host ist leer" verwechselt.
 */
export type CommunityHostResolver = (
  communityIds: string[],
) => Promise<Record<string, string>> | Record<string, string>

let hostResolver: CommunityHostResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerCommunityHostResolver(fn: CommunityHostResolver): void {
  if (hostResolver) {
    console.warn('[core] registerCommunityHostResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  hostResolver = fn
}

export function getCommunityHostResolver(): CommunityHostResolver | null {
  return hostResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetCommunityHostResolver(): void {
  hostResolver = null
}

/**
 * Hosts für diese Ablage-Werte auflösen. Filtert selbst, was gar keine
 * Community ist (`_account`, `''`, Dubletten) — der Aufrufer soll seine Liste
 * roh übergeben dürfen.
 *
 * Leere Karte, wenn es nichts zu holen gibt: kein Resolver (Silo-App,
 * Kontroll-Host, CI-Build ohne Control-Env), keine echten Ids, oder ein Fehler
 * beim Lesen. Der Aufrufer verlinkt dann wie vor D5 auf `public.appUrl`.
 */
export async function resolveCommunityHosts(
  communityIds: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, string>> {
  const resolver = getCommunityHostResolver()
  if (!resolver) return {}

  const ids = [...new Set(communityIds.filter((id): id is string => Boolean(id) && id !== NOTIFICATION_SCOPE_ACCOUNT))]
  if (ids.length === 0) return {}

  try {
    return await resolver(ids)
  }
  catch {
    // Fail-soft: die Mail geht mit der App-Basis raus (siehe Kopf).
    return {}
  }
}

import type { H3Event } from 'h3'
import {
  joinOutcomeGrantsAccess,
  joinOutcomeRevokesAccess,
  type CommunityJoinOutcome,
  type CommunityJoinTrigger,
} from '../../shared/communityJoin'

/**
 * A5 — die RUNTIME-Seite des Beitritts: „diese Person macht jetzt mit, sorge für
 * ihre Mitgliedschaft." Die Regel und die Tabelle liegen im Control Plane
 * (packages/control/.../members/join.post.ts, decideJoin); hier steht nur, WANN
 * gefragt wird und was danach mit dem Community-Label passiert.
 *
 * WARUM EINE REGISTRY (A14): `community_members` gehört dem Control Plane, und die
 * Service-Naht dorthin (Secret + JWT) besitzt der onboarding-Layer. Core darf
 * von einem Produkt-Layer nicht abhängen — also derselbe Vertrag wie beim
 * Rollen-Resolver und bei registerReportEscalationHandler: core erklärt die
 * Frage, die App/der Layer verdrahtet die Antwort. Ohne registrierten Handler
 * ist alles hier ein No-Op (Silo-Apps, Playground, CI-Builds).
 *
 * WIRFT NIE. Ein Beitritt ist eine Nebenwirkung des Handelns, kein Teil davon:
 * niemandes Kommentar darf verloren gehen, weil das Control Plane gerade nicht
 * antwortet. Ein Fehlschlag heißt `unavailable` — der nächste Auslöser
 * versucht es erneut.
 */

export interface CommunityJoinRequest {
  /** = tenants.$id. */
  communityId: string
  trigger: CommunityJoinTrigger
  /**
   * Frischer Appwrite-Session-Secret. Nur der Auslöser `registration` braucht
   * ihn: dort ist die Session eine Millisekunde alt und steckt noch NICHT im
   * Request-Cookie (setSessionCookie schreibt in die ANTWORT) — ohne ihn könnte
   * die Naht kein JWT prägen und der Beitritt fiele genau bei der Anmeldung aus.
   */
  sessionSecret?: string
}

export type CommunityJoinHandler = (
  event: H3Event,
  request: CommunityJoinRequest,
) => Promise<CommunityJoinOutcome> | CommunityJoinOutcome

let joinHandler: CommunityJoinHandler | null = null

/** Vom Layer/der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerCommunityJoinHandler(fn: CommunityJoinHandler): void {
  if (joinHandler) {
    console.warn('[core] registerCommunityJoinHandler: bestehender Handler wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  joinHandler = fn
}

export function getCommunityJoinHandler(): CommunityJoinHandler | null {
  return joinHandler
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetCommunityJoinHandler(): void {
  joinHandler = null
}

/**
 * Kurzzeit-Gedächtnis pro (Community, Nutzer): „danach gefragt wurde schon".
 *
 * Warum es das braucht: die Datentür feuert bei JEDEM Anlegen, und die
 * Label-Middleware bei jedem Request eines Bestands-Nutzers. Ohne diese Bremse
 * würde ein Nicht-Mitglied, das in einer geschlossenen Community schreibt, bei
 * jedem Klick ein JWT prägen und das Control Plane fragen — für immer dieselbe
 * Antwort. 60 s sind genug, um Serien abzufangen, und kurz genug, dass eine
 * frische Einladung sofort wirkt.
 *
 * Nur ABGESCHLOSSENE Antworten kommen hinein. 'unavailable' wird NICHT gemerkt:
 * eine Störung darf keine Minute lang nachhallen. Erfolge ('joined'/'member')
 * auch nicht — die beantwortet danach der Rollen-Resolver aus seinem Cache,
 * ohne Netzwerk.
 */
const DECIDED_TTL_MS = 60_000
const decided = new Map<string, { outcome: CommunityJoinOutcome, until: number }>()

function decisionKey(communityId: string, userId: string): string {
  return `${communityId} ${userId}`
}

function rememberedDecision(communityId: string, userId: string): CommunityJoinOutcome | null {
  const hit = decided.get(decisionKey(communityId, userId))
  if (!hit) return null
  if (hit.until < Date.now()) {
    decided.delete(decisionKey(communityId, userId))
    return null
  }
  return hit.outcome
}

function rememberDecision(communityId: string, userId: string, outcome: CommunityJoinOutcome): void {
  if (outcome !== 'closed' && outcome !== 'removed') return
  decided.set(decisionKey(communityId, userId), { outcome, until: Date.now() + DECIDED_TTL_MS })
  // Der Karten-Deckel ist kein Cache-Produkt, sondern Speicherhygiene: ein
  // Deployment sieht über Wochen viele Nutzer, und ein unbegrenztes Map wächst
  // still mit. Beim Überlauf wird der älteste Eintrag geopfert (Insertion-Order
  // von Map) — schlimmster Fall ist eine Frage zu viel.
  if (decided.size > 5000) {
    const oldest = decided.keys().next()
    if (!oldest.done) decided.delete(oldest.value)
  }
}

/** Nur für Tests: Kurzzeit-Gedächtnis leeren. */
export function __resetCommunityJoinMemory(): void {
  decided.clear()
}

/**
 * „Wir haben diesem Nutzer GERADE selbst den Zugang entzogen."
 *
 * Warum das nötig ist: der Rollen-Resolver cacht 30 s (bewusst, dokumentiert).
 * Ohne diese Notiz hätte „Zugang entziehen" ein 30-Sekunden-Loch — die
 * Label-Middleware fragte den Cache, hörte „viewer" und vergäbe das Publikum
 * beim nächsten Request derselben Person sofort wieder. Genau die Sekunden, in
 * denen ein rausgeworfener Mensch noch klickt.
 *
 * Die Notiz gilt nur in DIESEM Prozess. Bei mehreren Instanzen bleibt für die
 * anderen die dokumentierte Revoke-Latenz von ≤30 s (dieselbe wie bei der
 * Rolle) — danach greift der Selbstheilungs-Zweig der Middleware.
 */
export function rememberCommunityAccessRevoked(communityId: string, userId: string): void {
  if (!communityId || !userId) return
  rememberDecision(communityId, userId, 'removed')
}

/**
 * Steht für dieses Paar eine frische Ablehnung? Die Label-Middleware fragt das,
 * BEVOR sie einer (womöglich gecachten) Rolle glaubt.
 */
export function communityAccessRecentlyDenied(communityId: string, userId: string): boolean {
  return rememberedDecision(communityId, userId) !== null
}

/**
 * Die Notiz wieder wegwerfen — „das war einmal, jetzt ist es anders."
 *
 * Der eine Fall, in dem das zählt: eine entfernte Person wird neu EINGELADEN und
 * nimmt an. Ohne dieses Vergessen würde die Label-Middleware ihr das gerade
 * gewonnene Publikum bis zu einer Minute lang wieder abziehen — die Einladung
 * wäre angenommen und trotzdem wirkungslos.
 */
export function forgetCommunityAccessDecision(communityId: string, userId: string): void {
  if (!communityId || !userId) return
  decided.delete(decisionKey(communityId, userId))
}

export interface JoinCommunityOptions {
  /** Siehe CommunityJoinRequest.sessionSecret. */
  sessionSecret?: string
  /**
   * Runtime-User, um den es geht. Default `event.context.user.$id` — bei der
   * Anmeldung gibt es den Kontext-User noch nicht, deshalb explizit.
   */
  userId?: string
}

/**
 * „Diese Person macht mit" — der EINE Aufruf, den Auslöser benutzen.
 *
 * Reihenfolge, und jede Zeile spart einen Roundtrip:
 *  1. Nichts zu entscheiden? (kein Nutzer, kein Pool-Mandant, kein Handler) →
 *     `unavailable`. Silo/Kontroll-Host/Einzelbetrieb laufen hier vorbei: dort
 *     ist das PROJEKT die Grenze, eine Mitgliedschaft wäre Zeremonie.
 *  2. Schon eine aktive Rolle? Der Rollen-Resolver antwortet aus seinem
 *     30-s-Cache, meist ohne Netzwerk → `member`. Das ist der Normalfall (jedes
 *     bestehende Mitglied, das etwas schreibt) und kostet damit fast nichts.
 *  3. Frisch abgelehnt? Aus dem Kurzzeit-Gedächtnis.
 *  4. Sonst: das Control Plane fragen — und die ANTWORT am Label vollziehen.
 */
export async function joinCommunity(
  event: H3Event,
  trigger: CommunityJoinTrigger,
  options: JoinCommunityOptions = {},
): Promise<CommunityJoinOutcome> {
  const userId = options.userId ?? event.context.user?.$id
  const tenant = event.context.tenant
  if (!userId || tenant?.mode !== 'pool' || !tenant.communityId) return 'unavailable'

  const handler = getCommunityJoinHandler()
  if (!handler) return 'unavailable'

  const communityId = tenant.communityId

  // Bestehende Mitglieder gar nicht erst fragen. Nur möglich, wenn der Nutzer
  // AUCH der des Requests ist — bei der Anmeldung (options.userId) hat der
  // Resolver keinen Kontext-User zum Auflösen.
  // `.catch` ist kein Zierrat: „joinCommunity wirft nie" darf nicht davon abhängen,
  // dass der registrierte Rollen-Resolver brav ist. Der heutige (communityMembersResolver)
  // fängt intern ab — aber die Registry ist ein offener Vertrag, und ein
  // werfender Resolver würde hier über die Datentür einen Kommentar zum 500
  // machen. Fail-closed wie in 06.community-label.ts: kein Wissen heißt keine Rolle.
  if (!options.userId && await resolveCommunityRole(event).catch(() => null)) return 'member'

  const remembered = rememberedDecision(communityId, userId)
  if (remembered) return remembered

  let outcome: CommunityJoinOutcome
  try {
    outcome = await handler(event, { communityId, trigger, sessionSecret: options.sessionSecret })
  }
  catch (error) {
    logEvent('warn', 'community.join_failed', {
      communityId,
      userId,
      trigger,
      message: error instanceof Error ? error.message : String(error),
    })
    return 'unavailable'
  }

  rememberDecision(communityId, userId, outcome)

  // Das Label FOLGT der Mitgliedschaft — beide Richtungen, an einer Stelle.
  if (joinOutcomeGrantsAccess(outcome)) {
    await grantCommunityLabel(event, communityId, userId)
  }
  else if (joinOutcomeRevokesAccess(outcome)) {
    // Wer nicht (mehr) dazugehört, verliert das Lese-Publikum sofort — auch
    // wenn `remove` es schon getan hat (idempotent). Das ist die zweite Sperre
    // dafür, dass „draußen" nicht beim nächsten Besuch zurückgenommen wird.
    await revokeCommunityLabel(event, communityId, userId)
  }

  return outcome
}

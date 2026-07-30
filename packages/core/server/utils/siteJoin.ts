import type { H3Event } from 'h3'
import {
  joinOutcomeGrantsAccess,
  joinOutcomeRevokesAccess,
  type SiteJoinOutcome,
  type SiteJoinTrigger,
} from '../../shared/siteJoin'

/**
 * A5 — die RUNTIME-Seite des Beitritts: „diese Person macht jetzt mit, sorge für
 * ihre Mitgliedschaft." Die Regel und die Tabelle liegen im Control Plane
 * (packages/control/.../members/join.post.ts, decideJoin); hier steht nur, WANN
 * gefragt wird und was danach mit dem Site-Label passiert.
 *
 * WARUM EINE REGISTRY (A14): `site_members` gehört dem Control Plane, und die
 * Service-Naht dorthin (Secret + JWT) besitzt der onboarding-Layer. Core darf
 * von einem Feature-Layer nicht abhängen — also derselbe Vertrag wie beim
 * Rollen-Resolver und bei registerReportEscalationHandler: core erklärt die
 * Frage, die App/der Layer verdrahtet die Antwort. Ohne registrierten Handler
 * ist alles hier ein No-Op (Silo-Apps, Playground, CI-Builds).
 *
 * WIRFT NIE. Ein Beitritt ist eine Nebenwirkung des Handelns, kein Teil davon:
 * niemandes Kommentar darf verloren gehen, weil das Control Plane gerade nicht
 * antwortet. Ein Fehlschlag heißt `unavailable` — der nächste Auslöser
 * versucht es erneut.
 */

export interface SiteJoinRequest {
  /** = tenants.$id. */
  siteId: string
  trigger: SiteJoinTrigger
  /**
   * Frischer Appwrite-Session-Secret. Nur der Auslöser `registration` braucht
   * ihn: dort ist die Session eine Millisekunde alt und steckt noch NICHT im
   * Request-Cookie (setSessionCookie schreibt in die ANTWORT) — ohne ihn könnte
   * die Naht kein JWT prägen und der Beitritt fiele genau bei der Anmeldung aus.
   */
  sessionSecret?: string
}

export type SiteJoinHandler = (
  event: H3Event,
  request: SiteJoinRequest,
) => Promise<SiteJoinOutcome> | SiteJoinOutcome

let joinHandler: SiteJoinHandler | null = null

/** Vom Layer/der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerSiteJoinHandler(fn: SiteJoinHandler): void {
  if (joinHandler) {
    console.warn('[core] registerSiteJoinHandler: bestehender Handler wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  joinHandler = fn
}

export function getSiteJoinHandler(): SiteJoinHandler | null {
  return joinHandler
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetSiteJoinHandler(): void {
  joinHandler = null
}

/**
 * Kurzzeit-Gedächtnis pro (Site, Nutzer): „danach gefragt wurde schon".
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
const decided = new Map<string, { outcome: SiteJoinOutcome, until: number }>()

function decisionKey(siteId: string, userId: string): string {
  return `${siteId} ${userId}`
}

function rememberedDecision(siteId: string, userId: string): SiteJoinOutcome | null {
  const hit = decided.get(decisionKey(siteId, userId))
  if (!hit) return null
  if (hit.until < Date.now()) {
    decided.delete(decisionKey(siteId, userId))
    return null
  }
  return hit.outcome
}

function rememberDecision(siteId: string, userId: string, outcome: SiteJoinOutcome): void {
  if (outcome !== 'closed' && outcome !== 'removed') return
  decided.set(decisionKey(siteId, userId), { outcome, until: Date.now() + DECIDED_TTL_MS })
  // Der Karten-Deckel ist kein Cache-Feature, sondern Speicherhygiene: ein
  // Deployment sieht über Wochen viele Nutzer, und ein unbegrenztes Map wächst
  // still mit. Beim Überlauf wird der älteste Eintrag geopfert (Insertion-Order
  // von Map) — schlimmster Fall ist eine Frage zu viel.
  if (decided.size > 5000) {
    const oldest = decided.keys().next()
    if (!oldest.done) decided.delete(oldest.value)
  }
}

/** Nur für Tests: Kurzzeit-Gedächtnis leeren. */
export function __resetSiteJoinMemory(): void {
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
export function rememberSiteAccessRevoked(siteId: string, userId: string): void {
  if (!siteId || !userId) return
  rememberDecision(siteId, userId, 'removed')
}

/**
 * Steht für dieses Paar eine frische Ablehnung? Die Label-Middleware fragt das,
 * BEVOR sie einer (womöglich gecachten) Rolle glaubt.
 */
export function siteAccessRecentlyDenied(siteId: string, userId: string): boolean {
  return rememberedDecision(siteId, userId) !== null
}

/**
 * Die Notiz wieder wegwerfen — „das war einmal, jetzt ist es anders."
 *
 * Der eine Fall, in dem das zählt: eine entfernte Person wird neu EINGELADEN und
 * nimmt an. Ohne dieses Vergessen würde die Label-Middleware ihr das gerade
 * gewonnene Publikum bis zu einer Minute lang wieder abziehen — die Einladung
 * wäre angenommen und trotzdem wirkungslos.
 */
export function forgetSiteAccessDecision(siteId: string, userId: string): void {
  if (!siteId || !userId) return
  decided.delete(decisionKey(siteId, userId))
}

export interface JoinSiteOptions {
  /** Siehe SiteJoinRequest.sessionSecret. */
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
export async function joinSite(
  event: H3Event,
  trigger: SiteJoinTrigger,
  options: JoinSiteOptions = {},
): Promise<SiteJoinOutcome> {
  const userId = options.userId ?? event.context.user?.$id
  const tenant = event.context.tenant
  if (!userId || tenant?.mode !== 'pool' || !tenant.siteId) return 'unavailable'

  const handler = getSiteJoinHandler()
  if (!handler) return 'unavailable'

  const siteId = tenant.siteId

  // Bestehende Mitglieder gar nicht erst fragen. Nur möglich, wenn der Nutzer
  // AUCH der des Requests ist — bei der Anmeldung (options.userId) hat der
  // Resolver keinen Kontext-User zum Auflösen.
  if (!options.userId && await resolveTenantRole(event)) return 'member'

  const remembered = rememberedDecision(siteId, userId)
  if (remembered) return remembered

  let outcome: SiteJoinOutcome
  try {
    outcome = await handler(event, { siteId, trigger, sessionSecret: options.sessionSecret })
  }
  catch (error) {
    logEvent('warn', 'site.join_failed', {
      siteId,
      userId,
      trigger,
      message: error instanceof Error ? error.message : String(error),
    })
    return 'unavailable'
  }

  rememberDecision(siteId, userId, outcome)

  // Das Label FOLGT der Mitgliedschaft — beide Richtungen, an einer Stelle.
  if (joinOutcomeGrantsAccess(outcome)) {
    await grantSiteLabel(event, siteId, userId)
  }
  else if (joinOutcomeRevokesAccess(outcome)) {
    // Wer nicht (mehr) dazugehört, verliert das Lese-Publikum sofort — auch
    // wenn `remove` es schon getan hat (idempotent). Das ist die zweite Sperre
    // dafür, dass „draußen" nicht beim nächsten Besuch zurückgenommen wird.
    await revokeSiteLabel(event, siteId, userId)
  }

  return outcome
}

import type { H3Event } from 'h3'

/**
 * „SEIT WANN IST WER HIER DABEI?" — als Registry-Vertrag (F1, Davids
 * Entscheidung 1 nach Stufe 4).
 *
 * ── DIE SCHULD, DIE DAS HIER BEGLEICHT ─────────────────────────────────────
 * Zwei Dinge fehlten aus GENAU demselben Grund, und deshalb kommen sie über
 * denselben Vertrag: das Abzeichen „Jahrestag" (1 Jahr Mitglied) und die
 * About-Zahl „N Beitritte in 7 Tagen". Beide fragen nach dem Beitrittsdatum,
 * und das steht in `community_members` — im CONTROL PLANE, einem anderen
 * Appwrite-PROJEKT, zu dem core weder Schlüssel noch Kenntnis haben darf (A14).
 *
 * Die naheliegenden Runtime-Quellen beantworten ETWAS ANDERES, und das ist der
 * Grund, warum es diesen Weg braucht statt einer Abkürzung:
 *  - `$createdAt` des Kontos = wann sich dieser Mensch IRGENDWO im Pool
 *    registriert hat, nicht wann er DIESER Community beigetreten ist.
 *  - `user.joined` im Aktivitäts-Feed = nur, wer sich auf dem Host registriert
 *    hat — wer per A5 durch Mitschreiben beigetreten ist, fehlt dort.
 *
 * ── ZWEI FRAGEN, EIN VERTRAG ───────────────────────────────────────────────
 * Anders als die Nachbarn (`registerCommunityHostResolver`,
 * `registerFormerCommunityMembersResolver`) ist die Antwort hier ein OBJEKT mit
 * zwei Methoden statt einer Funktion — dasselbe Muster wie
 * `registerUserDataContributor`. Der Grund ist Betrieb, nicht Geschmack: beide
 * Fragen lesen dieselbe Tabelle über dieselbe Verbindung, und zwei getrennte
 * Registries hießen, dass eine App die eine verdrahten und die andere
 * vergessen kann. Das Ergebnis wäre ein Abzeichen, das nie verliehen wird, oder
 * eine Zahl, die stumm verschwindet — beides fail-soft und damit unsichtbar.
 *
 * ── FAIL-SOFT, WIE BEIM EHEMALIGEN-VERTRAG ─────────────────────────────────
 * Kein Mandanten-Kontext (Silo, Kontroll-Host, Playground), kein registrierter
 * Resolver (App ohne Control-Plane-Zugang, CI-Build ohne Env) oder ein
 * Lesefehler ⇒ „unbekannt". Und „unbekannt" heißt hier ausdrücklich NICHT 0:
 * das Abzeichen bleibt schlicht unverdient, die About-Zahl erscheint gar
 * nicht. Eine 0 wäre die Lüge, gegen die sich die About-Seite seit Stufe 2
 * ausdrücklich entschieden hat.
 */

export interface CommunityJoinDatesLookup {
  /** = communities.$id (die kanonische Kunden-Community). */
  communityId: string
  /** Appwrite-Projekt, in dem die Runtime-User existieren. */
  runtimeProjectId: string
  /** Die nachzuschlagenden Runtime-User (dedupliziert, ohne Leerwerte). */
  runtimeUserIds: string[]
}

export interface CommunityRecentJoinsLookup {
  communityId: string
  runtimeProjectId: string
  /** Rollierendes Fenster in Tagen, zurückgerechnet von jetzt. */
  days: number
}

export interface CommunityJoinDatesResolver {
  /**
   * Runtime-User-Id → Beitrittsdatum (ISO). Wer keine Mitgliedschaft MIT
   * Zugang hat, FEHLT in der Karte — er steht nicht als leerer String drin,
   * damit der Aufrufer „nicht dabei" nicht mit „Datum unbekannt" verwechselt.
   */
  joinedAt: (lookup: CommunityJoinDatesLookup) => Promise<Record<string, string>> | Record<string, string>
  /** Wie viele sind in den letzten `days` Tagen beigetreten? `null` = unbekannt. */
  recentJoinCount: (lookup: CommunityRecentJoinsLookup) => Promise<number | null> | number | null
}

let joinDatesResolver: CommunityJoinDatesResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerCommunityJoinDatesResolver(resolver: CommunityJoinDatesResolver): void {
  if (joinDatesResolver) {
    console.warn('[core] registerCommunityJoinDatesResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  joinDatesResolver = resolver
}

export function getCommunityJoinDatesResolver(): CommunityJoinDatesResolver | null {
  return joinDatesResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetCommunityJoinDatesResolver(): void {
  joinDatesResolver = null
}

/**
 * Beitrittsdaten dieser Menschen — leere Karte, wenn es nichts zu holen gibt.
 *
 * GEBÜNDELT wie der Ehemaligen-Vertrag (N9): viele Ids rein, EINE Karte raus.
 * Heute fragt nur die Abzeichen-Auswertung, und die kennt genau einen Menschen
 * — aber ein Einzel-Lookup wäre die Form, die man später in einer Schleife über
 * 25 Autoren wiederfindet. Die teure Variante gar nicht erst anzubieten ist
 * billiger, als sie später zu verbieten.
 */
export async function resolveJoinDates(event: H3Event, userIds: string[]): Promise<Map<string, string>> {
  const tenant = event.context.tenant
  if (!tenant?.communityId) return new Map()

  const resolver = getCommunityJoinDatesResolver()
  if (!resolver) return new Map()

  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  try {
    const dates = await resolver.joinedAt({
      communityId: tenant.communityId,
      runtimeProjectId: tenant.projectId,
      runtimeUserIds: ids,
    })
    return new Map(Object.entries(dates).filter(([, at]) => Boolean(at)))
  }
  catch {
    // Fail-soft: das Abzeichen bleibt unverdient, nichts bricht.
    return new Map()
  }
}

/**
 * „Wie viele sind in den letzten `days` Tagen beigetreten?" — `null`, wenn die
 * Frage in diesem Deployment nicht beantwortbar ist.
 *
 * `null` und nicht 0, weil die About-Seite genau daran entscheidet, ob sie die
 * Kachel überhaupt zeigt. Eine 0 stünde dort als Tatsache („niemand ist
 * gekommen"), obwohl niemand nachgesehen hat.
 */
export async function resolveRecentJoinCount(event: H3Event, days: number): Promise<number | null> {
  const tenant = event.context.tenant
  if (!tenant?.communityId) return null
  if (!Number.isFinite(days) || days <= 0) return null

  const resolver = getCommunityJoinDatesResolver()
  if (!resolver) return null

  try {
    const count = await resolver.recentJoinCount({
      communityId: tenant.communityId,
      runtimeProjectId: tenant.projectId,
      days,
    })
    if (count === null || !Number.isFinite(count) || count < 0) return null
    return count
  }
  catch {
    return null
  }
}

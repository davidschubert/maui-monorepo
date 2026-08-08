/**
 * DIE TÜR VOR DEN SILO-DOMAIN-ROUTEN des Control Plane (control-036).
 *
 * Das Gegenstück zu `communityDomainGate.ts`. Die Fragen sind teils dieselben,
 * teils andere — und die Unterschiede sind der eigentliche Inhalt dieser
 * Datei, weil ein Silo ANDERS beweist, wer er ist:
 *
 *  1. **Service-Secret** — der Aufrufer ist eines unserer eigenen Deployments
 *     (`requireOnboardingCaller`, an der Route). 404 ohne Secret, 401 falsch.
 *     Dasselbe Secret-Paar wie die Onboarding-Naht, bewusst kein zweites: es
 *     ist dieselbe Vertrauensbeziehung (unser Code ↔ unser Control Plane),
 *     und ein zweites Geheimnis wäre ein zweiter Ort zum Vergessen.
 *
 *  2. **Die Zeile bestimmt das Projekt, nicht der Aufrufer.** `projectId` aus
 *     dem Body sucht eine `websites`-Zeile; Endpoint und Projekt-Id für die
 *     JWT-Prüfung kommen DANN aus dieser Zeile. Der Body nennt also nur, WELCHE
 *     Website gemeint ist.
 *
 *  3. **JWT** — geprüft gegen genau dieses Projekt (`verifyIdentityAgainst`).
 *     Damit ist die Grenze zwischen zwei SILOS dicht: portfolio kann nicht
 *     comments' Domain verwalten, weil sein JWT gegen das comments-Projekt ein
 *     401 ergibt. Ein Appwrite-JWT ist für genau ein Projekt ausgestellt.
 *
 * ── WAS DIESE TÜR *NICHT* PRÜFT, UND WARUM DAS BEWUSST SO IST ─────────────
 * Sie prüft NICHT, ob der JWT-Inhaber in seinem Silo ein Administrator ist.
 * Sie kann es nicht: dafür bräuchte das Control Plane einen API-Key für ein
 * fremdes Appwrite-Projekt, und genau den hat es aus gutem Grund nicht (A5,
 * C15 — dieselbe Grenze wie bei `revokeCommunityLabel`).
 *
 * Die Rechte-Prüfung liegt deshalb IN DER SILO-APP (`requireCommunityPermission
 * (event, 'community.domain')` an ihren Routen, die auf das globale
 * Betreiber-Label fällt, weil ein Silo keine Community-Rollen hat). Was diese
 * Tür beisteuert, ist die Aussage „der Aufruf kommt aus unserem Deployment UND
 * ein echtes Konto DIESES Projekts steht dahinter" — beides zusammen, nicht
 * eines davon.
 *
 * Der verbleibende Fall ist also: ein eingeloggter Nutzer des Silos, der die
 * Rechteprüfung SEINER App umgeht. Der müsste dafür deren Server-Code ändern —
 * dann hat er ohnehin den Runtime-Key. Es ist keine Lücke zwischen zwei
 * Kunden, sondern eine innerhalb eines Deployments, und dort ist sie
 * gegenstandslos. Aufgeschrieben, damit niemand sie später für einen
 * Flüchtigkeitsfehler hält.
 *
 * ── KEINE PLAN-PRÜFUNG ────────────────────────────────────────────────────
 * Silos sind das Studio-Angebot; Pläne sind Pool-Sache (CLAUDE.md). Es gibt
 * hier nichts zu prüfen — nicht „immer erlaubt", sondern die Frage stellt sich
 * nicht.
 */
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { WEBSITES_TABLE, type WebsiteRow } from '../../shared/types/website'
import { verifyIdentityAgainst, type RuntimeIdentity } from './onboardingService'

export interface SiteDomainContext {
  identity: RuntimeIdentity
  row: WebsiteRow
  databaseId: string
}

/**
 * Die Website zu einem Appwrite-Projekt — die eine Zuordnung, an der alles
 * hängt. `projectId` ist die unveränderliche Identität einer Site (F6), nicht
 * ihr Slug: der darf sich ändern, ohne dass eine Domain umzieht.
 */
export async function findWebsiteByProject(event: H3Event, projectId: string): Promise<{ row: WebsiteRow | null, databaseId: string }> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<WebsiteRow>({
    databaseId,
    tableId: WEBSITES_TABLE,
    // ZWEI, obwohl EINE erwartet wird — und `orderAsc` dazu. Das Register hat
    // einen Unique-Index auf `slug`, aber KEINEN auf `projectId`: zwei Zeilen
    // für dasselbe Appwrite-Projekt sind ein Bedienfehler, den nichts
    // verhindert. Am 2026-08-07 ist genau der im eigenen Beweis passiert (eine
    // zweite Wegwerf-Zeile neben der echten), und das Ergebnis war das
    // Unangenehmste, was es hier geben kann: die Silo-App bekam still die
    // ANDERE Zeile — keine Fehlermeldung, nur eine Umleitung, die nie kam.
    //
    // Also: deterministisch (die älteste gewinnt, `$id` ist monoton) und LAUT.
    // Nicht abgewiesen, weil eine halb erreichbare Site schlimmer ist als eine
    // mit einem Warnhinweis im Log — aber auffindbar.
    queries: [Query.equal('projectId', projectId), Query.orderAsc('$id'), Query.limit(2)],
  }).catch((error) => { throw toH3Error(error, 'Could not read website register') })

  if (rows.length > 1) {
    logEvent('warn', 'website.duplicate_project_row', {
      projectId,
      rows: rows.map(row => `${row.$id}:${row.slug}`).join(','),
    })
  }
  return { row: rows[0] ?? null, databaseId }
}

/** Wie oben, aber 404 statt `null` — für die Routen, die eine Zeile brauchen. */
export async function requireWebsiteByProject(event: H3Event, projectId: string): Promise<{ row: WebsiteRow, databaseId: string }> {
  const { row, databaseId } = await findWebsiteByProject(event, projectId)
  if (!row) {
    // 404 und nicht 403: eine unbekannte Projekt-Id soll sich nicht dadurch
    // bestätigen, dass sie einen anderen Fehler bekommt als eine bekannte.
    throw createError({ status: 404, statusText: 'Unknown website' })
  }
  return { row, databaseId }
}

export async function requireSiteDomainCaller(
  event: H3Event,
  body: { jwt: string, projectId: string },
): Promise<SiteDomainContext> {
  const { row, databaseId } = await requireWebsiteByProject(event, body.projectId)

  const config = useRuntimeConfig(event)
  // Der Endpoint der SITE, nicht unserer: ein Silo kann auf einer anderen
  // Appwrite-Instanz laufen. `endpoint` ist Pflichtspalte seit control-001;
  // fehlt sie wider Erwarten, fällt es auf unseren zurück statt zu raten.
  const endpoint = (row.endpoint || config.public.appwriteEndpoint).replace(/\/+$/, '')
  const identity = await verifyIdentityAgainst(endpoint, row.projectId, body.jwt)

  return { identity, row, databaseId }
}

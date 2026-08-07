import { createHash, timingSafeEqual } from 'node:crypto'
import { Account, Client } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Die Vertrauensnaht des Self-Service-Onboardings.
 *
 * Ausgangslage: der Trichter läuft in der PLATFORM-App (eigenes Appwrite-
 * Projekt, read-only-Key aufs Control Plane), das Anlegen einer Community
 * gehört aber dem CONTROL PLANE (es besitzt `communities`,
 * `community_members`). Es braucht also einen schreibenden Kanal — und der ist die
 * gefährlichste Stelle des ganzen Blocks: wer ihn hat, kann Communities
 * anlegen.
 *
 * Deshalb zwei UNABHÄNGIGE Beweise, und beide müssen stimmen:
 *
 *  1. **Service-Secret** (`NUXT_CONTROL_ONBOARDING_SECRET`) — beweist, dass der
 *     AUFRUFER unser eigenes Platform-Deployment ist. Ohne gesetztes Secret
 *     existiert die Route nicht (404) — Default-aus, wie alle scharfen Gates.
 *  2. **Appwrite-JWT des Runtime-Users** — beweist, WER die Community anlegt.
 *     Das Control Plane prüft das JWT SELBST gegen das Runtime-Projekt; es
 *     glaubt der Platform-App keine Identitätsbehauptung. Der Unterschied ist
 *     wesentlich: ein kompromittiertes Secret erlaubt dann noch immer keine
 *     Community im Namen eines fremden Nutzers, weil dessen JWT fehlt.
 *
 * Das Runtime-Projekt muss das konfigurierte Pool-Projekt sein — niemals ein
 * frei mitgeschickter Wert, sonst könnte ein Aufrufer auf ein FREMDES
 * Appwrite-Projekt zeigen und sich dort selbst zum Nutzer erklären.
 */

export interface RuntimeIdentity {
  projectId: string
  userId: string
  email: string
  name: string
  emailVerified: boolean
}

const SERVICE_HEADER = 'x-pukalani-onboarding-secret'

/** Konfiguriertes Secret; '' = Produkt aus. */
function configuredSecret(event: H3Event): string {
  const config = useRuntimeConfig(event) as { controlOnboardingSecret?: string }
  return (config.controlOnboardingSecret || '').trim()
}

/**
 * Vergleich in konstanter Zeit. Beide Seiten werden zuerst gehasht: sonst
 * verrät schon die Länge etwas, und timingSafeEqual verlangt gleich lange
 * Puffer (ein Längen-Check davor wäre selbst ein Seitenkanal).
 */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Gate + Aufrufer-Prüfung. 404 wenn das Produkt aus ist (die Route soll für
 * Fremde nicht einmal existieren), 401 bei falschem Secret.
 */
export function requireOnboardingCaller(event: H3Event): void {
  const expected = configuredSecret(event)
  if (!expected) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const provided = getHeader(event, SERVICE_HEADER) || ''
  if (!provided || !secretsMatch(provided, expected)) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
}

/**
 * Das Pool-Projekt, in dem Self-Service-Communities entstehen.
 * Env-Override vor Build-Default (NUXT_PUBLIC_CONTROL_POOL_PROJECT), weil das
 * Projekt pro Umgebung anders heißt.
 */
export function onboardingRuntimeProject(event?: H3Event): string {
  const config = useRuntimeConfig(event) as { public?: { controlPoolProject?: string } }
  const appConfig = useAppConfig() as { pukalani?: { control?: { defaultPoolProject?: string } } }
  const projectId = (config.public?.controlPoolProject || appConfig.pukalani?.control?.defaultPoolProject || '').trim()
  if (!projectId) {
    throw createError({ status: 500, statusText: 'Pool project not configured' })
  }
  return projectId
}

/**
 * Ist das GENANNTE Runtime-Projekt das, das diese Naht bedient? PURE
 * (unit-getestet) — Trimmen, sonst exakter Vergleich. Appwrite-Projekt-Ids
 * sind case-sensitiv, also wird hier NICHT normalisiert.
 */
export function runtimeProjectMatches(expected: string, claimed: string): boolean {
  const a = expected.trim()
  const b = claimed.trim()
  return a !== '' && a === b
}

/**
 * DER AUFRUFER DARF SEIN PROJEKT NICHT SELBST BESTIMMEN (Nacht-Audit
 * 2026-08-02, F33).
 *
 * Die beiden DSGVO-Routen (`members/user-data`, `members/user-erase`) kommen
 * bewusst OHNE JWT — das Konto ist im Moment des Aufrufs schon gesperrt oder
 * ganz weg (Begründung an den Routen). Sie nahmen `runtimeProjectId` deshalb
 * aus dem Body und scopten hart darauf. Das war eine Zusage an den Aufrufer,
 * die niemand prüfte: wer das Service-Secret hat (ein Deployment, ein
 * versehentlich geteiltes Env, ein kompromittierter Runtime-Host), konnte damit
 * Mitgliedschaften und Einladungen in JEDEM anderen Runtime-Projekt auslesen
 * und LÖSCHEN — also die Communities eines fremden Silo-Kunden.
 *
 * Es gibt dafür keinen legitimen Fall: die Naht bedient genau EIN Pool-Projekt
 * (`onboardingRuntimeProject`), und jede andere Community-Route zieht ihr
 * Projekt ohnehin von dort (`verifyRuntimeIdentity` → `identity.projectId`).
 * Der Body darf das Projekt also weiterhin NENNEN — aber nur, um bestätigt zu
 * werden. 403, nicht 404: der Aufrufer ist unser eigenes Deployment, ihm
 * gegenüber ist ein klarer Fehler richtig (er zeigt einen Konfigurationsfehler,
 * und ohne ihn scheitert die Löschung still).
 */
export function assertOnboardingRuntimeProject(event: H3Event, claimed: string): string {
  const expected = onboardingRuntimeProject(event)
  if (!runtimeProjectMatches(expected, claimed)) {
    throw createError({ status: 403, statusText: 'Unknown runtime project' })
  }
  return expected
}

/**
 * Identität aus dem JWT gewinnen — der Beweis kommt von Appwrite, nicht vom
 * Aufrufer. Ein abgelaufenes, fremdes oder manipuliertes JWT endet in 401.
 *
 * Kein API-Key im Spiel: Endpoint + Projekt + JWT genügen, und genau deshalb
 * kann diese Prüfung nicht mehr, als sie darf (sie liest EINEN Account —
 * den des JWT-Inhabers).
 */
export async function verifyRuntimeIdentity(event: H3Event, jwt: string): Promise<RuntimeIdentity> {
  const config = useRuntimeConfig(event)
  return await verifyIdentityAgainst(config.public.appwriteEndpoint, onboardingRuntimeProject(event), jwt)
}

/**
 * DIESELBE PRÜFUNG, ABER GEGEN EIN GENANNTES PROJEKT (control-036).
 *
 * Der Pool ist EIN Projekt, deshalb konnte `verifyRuntimeIdentity` es fest
 * verdrahten. Für die Silo-Domains gibt es viele: portfolio, comments und
 * jedes weitere Studio-Deployment haben ihr eigenes Appwrite-Projekt.
 *
 * ── DASS DER AUFRUFER DAS PROJEKT NENNT, IST HIER KEIN LOCH ───────────────
 * F33 hat gelehrt: „der Aufrufer darf sein Projekt nicht selbst bestimmen".
 * Das galt für die beiden DSGVO-Routen, die OHNE JWT arbeiten — dort war die
 * Projekt-Angabe eine ungeprüfte Zusage, und wer das Service-Secret hatte,
 * konnte damit in fremden Runtimes lesen und löschen.
 *
 * Hier ist es umgekehrt: das Projekt wird nicht geglaubt, sondern GEPRÜFT,
 * und zwar durch dieselbe Frage, die auch die Identität beweist. Ein JWT ist
 * für genau ein Appwrite-Projekt ausgestellt; wer `projectId: B` behauptet und
 * ein JWT aus Projekt A mitschickt, bekommt von Appwrite ein 401. Die
 * Projekt-Angabe kann sich also nur selbst bestätigen — genau das, was F33
 * verlangt.
 *
 * Woher `projectId` und `endpoint` kommen, entscheidet trotzdem NICHT der
 * Body: beides wird aus der `websites`-Zeile gelesen, die der Betreiber
 * gepflegt hat (`siteDomainGate.ts`). Der Body nennt nur, WELCHE Zeile.
 */
export async function verifyIdentityAgainst(endpoint: string, projectId: string, jwt: string): Promise<RuntimeIdentity> {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setJWT(jwt)

  const user = await new Account(client).get().catch(() => null)
  if (!user) {
    throw createError({ status: 401, statusText: 'Invalid runtime session' })
  }
  return {
    projectId,
    userId: user.$id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerification,
  }
}

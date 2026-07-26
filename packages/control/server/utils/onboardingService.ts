import { createHash, timingSafeEqual } from 'node:crypto'
import { Account, Client } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Die Vertrauensnaht des Self-Service-Onboardings.
 *
 * Ausgangslage: der Trichter läuft in der PLATFORM-App (eigenes Appwrite-
 * Projekt, read-only-Key aufs Control Plane), das Anlegen einer Community
 * gehört aber dem CONTROL PLANE (es besitzt `tenants`, `workspaces`,
 * `site_members`). Es braucht also einen schreibenden Kanal — und der ist die
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

const SERVICE_HEADER = 'x-maui-onboarding-secret'

/** Konfiguriertes Secret; '' = Feature aus. */
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
 * Gate + Aufrufer-Prüfung. 404 wenn das Feature aus ist (die Route soll für
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
  const appConfig = useAppConfig() as { maui?: { studio?: { defaultPoolProject?: string } } }
  const projectId = (config.public?.controlPoolProject || appConfig.maui?.studio?.defaultPoolProject || '').trim()
  if (!projectId) {
    throw createError({ status: 500, statusText: 'Pool project not configured' })
  }
  return projectId
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
  const projectId = onboardingRuntimeProject(event)
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
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

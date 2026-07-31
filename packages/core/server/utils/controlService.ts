import { Account, Client } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Der Ruf ins Control Plane — als GENERISCHER Transport im Fundament.
 *
 * Er stand bis E10 nur im onboarding-Layer (`server/utils/controlPlane.ts`).
 * Mit dem zentralen Kunden-Feedback braucht ihn ein ZWEITER Layer (feedback),
 * und der lebt in Apps ohne onboarding (apps/control). Zwei Kopien derselben
 * Vertrauensnaht wären genau die Sorte Doppelpflege, bei der eines Tages nur
 * eine der beiden einen Fehlerfall richtig behandelt.
 *
 * DASS DAS IM CORE STEHEN DARF, ist kein Aufweichen von A14: hier ist keine
 * Produktkenntnis drin. Der Transport weiß von einem Pfad, einem Body, einem
 * Secret und einem Appwrite-JWT — nicht davon, was am anderen Ende passiert.
 * Die Semantik (welcher Pfad, welche Nutzlast) bleibt beim rufenden Layer.
 *
 * Die Runtime-Config-Schlüssel heißen weiter `onboardingControlUrl` /
 * `onboardingServiceSecret`. Das ist bewusst NICHT umbenannt: sie sind als
 * `NUXT_ONBOARDING_CONTROL_URL` / `NUXT_ONBOARDING_SERVICE_SECRET` auf jeder
 * Maschine gesetzt, und ein Umbenennen wäre ein Deployment-Bruch für einen
 * kosmetischen Gewinn.
 *
 * Fehler werden bewusst DURCHGELASSEN, nicht geglättet: 4xx sind Aussagen über
 * die Eingabe. Nur was gar nicht antwortet, wird zu 503 — dann ist die
 * Gegenseite gestört, nicht die Eingabe.
 */

export interface ControlServiceConfig {
  url: string
  secret: string
}

const SERVICE_HEADER = 'x-pukalani-onboarding-secret'

export function controlServiceConfig(event: H3Event): ControlServiceConfig {
  const config = useRuntimeConfig(event) as {
    onboardingControlUrl?: string
    onboardingServiceSecret?: string
  }
  const url = (config.onboardingControlUrl || '').replace(/\/+$/, '')
  const secret = config.onboardingServiceSecret || ''
  if (!url || !secret) {
    // 503 statt 404: hier ist etwas FALSCH KONFIGURIERT, nicht abwesend — der
    // Unterschied entscheidet, ob jemand danach sucht.
    logEvent('error', 'control_service.not_configured', { hasUrl: !!url, hasSecret: !!secret })
    throw createError({ status: 503, statusText: 'Control plane is not configured' })
  }
  return { url, secret }
}

/** Ist die Naht überhaupt konfiguriert? (Für Aufrufer, die sauber degradieren
 *  müssen, statt einen 503 zu werfen — z. B. ein Dashboard-Bereich, der das
 *  restliche Dashboard nicht mitreißen darf.) */
export function controlServiceAvailable(event: H3Event): boolean {
  const config = useRuntimeConfig(event) as {
    onboardingControlUrl?: string
    onboardingServiceSecret?: string
  }
  return Boolean((config.onboardingControlUrl || '') && (config.onboardingServiceSecret || ''))
}

/**
 * Kurzlebiges JWT des eingeloggten Nutzers (wie beim Realtime-Token).
 *
 * `sessionSecret` ist die Ausnahme für Vorgänge BEI DER ANMELDUNG: dort ist die
 * Session eine Millisekunde alt und steckt noch nicht im Request-Cookie
 * (setSessionCookie schreibt in die ANTWORT), also gibt es weder
 * `event.context.user` noch einen brauchbaren Session-Client.
 */
export async function mintServiceJwt(event: H3Event, sessionSecret?: string): Promise<string> {
  if (sessionSecret) {
    const config = useRuntimeConfig(event)
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint)
      .setProject(config.public.appwriteProjectId)
      .setSession(sessionSecret)
    const { jwt } = await new Account(client).createJWT({ duration: 120 })
      .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
    return jwt
  }

  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const { account } = createSessionClient(event)
  const { jwt } = await account.createJWT({ duration: 120 })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return jwt
}

/** Dasselbe, aber ohne Session einfach kein JWT — für Wege, die bewusst auch
 *  anonym gehen dürfen (Feedback senden, Entscheidung 4). */
export async function mintServiceJwtIfPossible(event: H3Event): Promise<string | undefined> {
  if (!event.context.user) return undefined
  return await mintServiceJwt(event).catch(() => undefined)
}

export async function callControlService<T>(event: H3Event, path: string, body: Record<string, unknown>): Promise<T> {
  const { url, secret } = controlServiceConfig(event)
  try {
    // Cast: $fetch typisiert die Antwort über NitroFetchRequest (die Route liegt
    // in einer ANDEREN App, also gibt es hier keine abgeleiteten Route-Typen).
    return await $fetch<T>(`${url}${path}`, {
      method: 'POST',
      headers: { [SERVICE_HEADER]: secret },
      body,
      timeout: 15_000,
    }) as T
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status
      ?? (error as { statusCode?: number }).statusCode
    const statusText = (error as { statusText?: string, statusMessage?: string }).statusText
      ?? (error as { statusMessage?: string }).statusMessage
    // 4xx = Aussage über die Eingabe → unverändert weitergeben. MIT `data`:
    // die Gegenseite legt ihren fachlichen Grund als `reason` ins Envelope
    // (last_owner, community_muted, …). ZWEI Envelopes hintereinander, und das
    // ist die Stelle, an der man sich vertut: das Control Plane ist selbst eine
    // pukalani-App, seine Antwort ist also schon das fertige Envelope
    // `{ ok, code, message, reason }` und steckt bei $fetch in `error.data`.
    // Der Grund muss deshalb aus `data.reason` gelesen und als `data.code` NEU
    // gesetzt werden — dann macht unser eigener Error-Handler daraus wieder ein
    // `reason` für den Browser. Weitergegeben wird ausschließlich dieser
    // Schlüssel — keine Appwrite-Details, keine fremden Nutzlasten.
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const payload = (error as { data?: { reason?: unknown } }).data
      const reason = typeof payload?.reason === 'string' ? payload.reason : null
      throw createError({
        status,
        statusText: statusText || 'Request rejected',
        ...(reason ? { data: { code: reason } } : {}),
      })
    }
    logEvent('error', 'control_service.unreachable', {
      path,
      status: status ?? 0,
      message: error instanceof Error ? error.message : String(error),
    })
    throw createError({ status: 503, statusText: 'Control plane is temporarily unavailable' })
  }
}

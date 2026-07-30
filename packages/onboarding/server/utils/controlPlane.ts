import type { H3Event } from 'h3'

/**
 * Der Ruf ins Control Plane.
 *
 * Die Platform-App darf das Control Plane nur LESEN (read-only-Key, H3). Das
 * Anlegen einer Community gehört dorthin, also ruft der Trichter die
 * auditierte Service-Route auf — mit Secret im Header (beweist: unser
 * Deployment) und dem Appwrite-JWT des Nutzers im Body (beweist: dieser
 * Nutzer). Details der Naht: packages/control/server/utils/onboardingService.ts
 *
 * Fehler werden bewusst DURCHGELASSEN, nicht geglättet: 403 (Code/Kontingent)
 * und 409 (Adresse belegt) sind Aussagen für den Nutzer. Nur was gar nicht
 * antwortet, wird zu 503 — dann ist die Plattform gestört, nicht die Eingabe.
 */

export interface ControlPlaneConfig {
  url: string
  secret: string
}

export function controlPlaneConfig(event: H3Event): ControlPlaneConfig {
  const config = useRuntimeConfig(event) as {
    onboardingControlUrl?: string
    onboardingServiceSecret?: string
  }
  const url = (config.onboardingControlUrl || '').replace(/\/+$/, '')
  const secret = config.onboardingServiceSecret || ''
  if (!url || !secret) {
    // 503 statt 404: hier ist etwas FALSCH KONFIGURIERT, nicht abwesend — der
    // Unterschied entscheidet, ob jemand danach sucht.
    logEvent('error', 'onboarding.not_configured', { hasUrl: !!url, hasSecret: !!secret })
    throw createError({ status: 503, statusText: 'Onboarding is not configured' })
  }
  return { url, secret }
}

/** Kurzlebiges JWT des eingeloggten Nutzers (wie beim Realtime-Token). */
export async function mintRuntimeJwt(event: H3Event): Promise<string> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const { account } = createSessionClient(event)
  const { jwt } = await account.createJWT({ duration: 120 })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return jwt
}

export async function callControlPlane<T>(event: H3Event, path: string, body: Record<string, unknown>): Promise<T> {
  const { url, secret } = controlPlaneConfig(event)
  try {
    // Cast: $fetch typisiert die Antwort über NitroFetchRequest (die Route liegt
    // in einer ANDEREN App, also gibt es hier keine abgeleiteten Route-Typen).
    return await $fetch<T>(`${url}${path}`, {
      method: 'POST',
      headers: { 'x-maui-onboarding-secret': secret },
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
    // die Mitglieder-Regeln des Control Plane antworten 409 und legen ihren
    // Grund als `data.code` bei (last_owner, self_demote, …). Ohne diese Zeile
    // käme in der Oberfläche nur „Fehler" an, und der Nutzer wüsste nicht, was
    // ihn aufgehalten hat. Weitergegeben wird ausschließlich dieses Feld —
    // keine Appwrite-Details, keine fremden Nutzlasten.
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // ZWEI Envelopes hintereinander, und das ist die Stelle, an der man sich
      // vertut: das Control Plane ist selbst eine maui-App, seine Antwort ist
      // also schon das fertige Envelope `{ ok, code, message, reason }`. Bei
      // $fetch steckt dieser Body in `error.data`. Der Grund muss hier deshalb
      // aus `data.reason` gelesen und als `data.code` NEU gesetzt werden —
      // dann macht unser eigener Error-Handler daraus wieder ein `reason` für
      // den Browser. Weitergegeben wird ausschließlich dieser Schlüssel.
      const body = (error as { data?: { reason?: unknown } }).data
      const reason = typeof body?.reason === 'string' ? body.reason : null
      throw createError({
        status,
        statusText: statusText || 'Request rejected',
        ...(reason ? { data: { code: reason } } : {}),
      })
    }
    logEvent('error', 'onboarding.control_plane_unreachable', {
      path,
      status: status ?? 0,
      message: error instanceof Error ? error.message : String(error),
    })
    throw createError({ status: 503, statusText: 'Onboarding is temporarily unavailable' })
  }
}

import type { H3Event } from 'h3'
import type { ControlServiceConfig } from '../../../core/server/utils/controlService'

/**
 * Der Ruf ins Control Plane — aus Sicht des ONBOARDING-Layers.
 *
 * Die Platform-App darf das Control Plane nur LESEN (read-only-Key, H3). Das
 * Anlegen einer Community gehört dorthin, also ruft der Trichter die
 * auditierte Service-Route auf — mit Secret im Header (beweist: unser
 * Deployment) und dem Appwrite-JWT des Nutzers im Body (beweist: dieser
 * Nutzer). Details der Naht: packages/control/server/utils/onboardingService.ts
 *
 * SEIT E10 IST DER TRANSPORT SELBST IM CORE (`server/utils/controlService.ts`):
 * mit dem zentralen Kunden-Feedback braucht ihn ein ZWEITER Layer (feedback),
 * und der lebt in Apps ohne onboarding (apps/control). Zwei Kopien derselben
 * Vertrauensnaht wären genau die Sorte Doppelpflege, bei der eines Tages nur
 * eine der beiden einen Fehlerfall richtig behandelt.
 *
 * Hier bleiben nur die Namen stehen, unter denen die Onboarding-Routen ihn
 * kennen — Verhalten, Header, Fehler-Übersetzung und Config-Schlüssel
 * (`onboardingControlUrl` / `onboardingServiceSecret`) sind unverändert.
 */

export type ControlPlaneConfig = ControlServiceConfig

export function controlPlaneConfig(event: H3Event): ControlPlaneConfig {
  return controlServiceConfig(event)
}

/**
 * Kurzlebiges JWT des eingeloggten Nutzers (wie beim Realtime-Token).
 *
 * `sessionSecret` ist die Ausnahme für den Beitritt BEI DER ANMELDUNG (A5):
 * dort ist die Session eine Millisekunde alt und steckt noch nicht im
 * Request-Cookie (setSessionCookie schreibt in die ANTWORT).
 */
export async function mintRuntimeJwt(event: H3Event, sessionSecret?: string): Promise<string> {
  return await mintServiceJwt(event, sessionSecret)
}

export async function callControlPlane<T>(event: H3Event, path: string, body: Record<string, unknown>): Promise<T> {
  return await callControlService<T>(event, path, body)
}

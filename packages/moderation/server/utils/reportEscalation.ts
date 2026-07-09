import type { H3Event } from 'h3'
import { openReportsForTarget } from './reportQueries'

/**
 * Report-Eskalations-Vertrag (A14): moderation zählt Meldungen, die
 * KONSEQUENZ (z. B. Auto-Hide) gehört dem Target-Owner. Feature-Layer
 * registrieren pro targetType einen Handler (Nitro-Plugin, Muster wie
 * registerUserDataContributor); nach jeder NEUEN Meldung ruft moderation
 * die Handler mit der aktuellen Anzahl offener Meldungen — best-effort,
 * ein Handler-Fehler darf die Meldung selbst nie scheitern lassen.
 */

export interface ReportEscalationContext {
  targetType: string
  targetId: string
  /** Anzahl aktuell offener Meldungen zu diesem Target (inkl. der neuen) */
  openCount: number
}

type ReportEscalationHandler = (event: H3Event, context: ReportEscalationContext) => Promise<void>

const handlers = new Map<string, ReportEscalationHandler[]>()

export function registerReportEscalationHandler(targetType: string, handler: ReportEscalationHandler) {
  const list = handlers.get(targetType) ?? []
  list.push(handler)
  handlers.set(targetType, list)
}

/** Nach einer neuen Meldung aufrufen — zählt offen + feuert die Handler. */
export async function runReportEscalation(event: H3Event, targetType: string, targetId: string): Promise<void> {
  const registered = handlers.get(targetType)
  if (!registered?.length) return
  try {
    const open = await openReportsForTarget(event, targetType, targetId)
    const context: ReportEscalationContext = { targetType, targetId, openCount: open.length }
    for (const handler of registered) {
      await handler(event, context).catch((error) => {
        console.error(`[moderation] Report-Eskalations-Handler (${targetType}) fehlgeschlagen:`, error)
      })
    }
  }
  catch (error) {
    console.error(`[moderation] Report-Eskalation für ${targetType}/${targetId} fehlgeschlagen:`, error)
  }
}

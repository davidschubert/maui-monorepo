import { EVENTS_TABLE } from '../../shared/types/event'

/**
 * C18 — die Tabellen des events-Layers, deren Zeilen eine
 * Veröffentlichungs-Permission tragen (core-Vertrag
 * registerAudienceRepermissionTable).
 *
 * NUR `events`: RSVPs, Tickets und Stimmen gehören der einzelnen Person
 * (`read(user:…)`) und waren nie öffentlich.
 */
export default defineNitroPlugin(() => {
  registerAudienceRepermissionTable({ layer: 'events', table: EVENTS_TABLE })
})

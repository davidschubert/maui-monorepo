import type { H3Event } from 'h3'

/**
 * Schreibende Kommentar-Aktionen (Erstellen, Antworten, Bearbeiten, Voten,
 * Melden) sind gesperrt, wenn Kommentare deaktiviert sind ODER Wartungsmodus
 * läuft. Wirft 403 mit `code`, damit der Client die passende Meldung zeigt.
 */
export async function assertCommentsWritable(event: H3Event): Promise<void> {
  const config = await getAppConfig(event)
  if (config.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Service is in maintenance mode', data: { code: 'maintenance' } })
  }
  if (!config.commentsEnabled) {
    throw createError({ status: 403, statusText: 'Commenting is currently disabled', data: { code: 'comments_disabled' } })
  }
}

/**
 * Nur der Wartungsmodus friert diese Aktion ein (alle Writes). Für Aktionen,
 * die bei lediglich deaktivierten Kommentaren erlaubt bleiben — z.B. das
 * Löschen eigener Kommentare.
 */
export async function assertNotMaintenance(event: H3Event): Promise<void> {
  const config = await getAppConfig(event)
  if (config.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Service is in maintenance mode', data: { code: 'maintenance' } })
  }
}

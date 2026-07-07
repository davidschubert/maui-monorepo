import type { EventRow } from '../../shared/types/event'

/** Text nach RFC 5545 escapen (Backslash, Semikolon, Komma, Zeilenumbruch) */
export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
}

/** ISO-Datum → ICS-UTC-Basic-Format (20260101T180000Z) */
export function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Kalender-Datei (EIN VEVENT) für ein Event — pure Funktion, kein externer
 * Dienst. CRLF-Zeilenenden nach RFC 5545; Zeilen-Folding bewusst weggelassen
 * (Clients akzeptieren lange Zeilen, die Felder sind ohnehin größenbegrenzt).
 */
export function buildEventIcs(row: Pick<EventRow, '$id' | '$updatedAt' | 'title' | 'description' | 'startAt' | 'endAt' | 'location' | 'url' | 'status'>): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//maui//events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${row.$id}@maui-events`,
    `DTSTAMP:${toIcsDate(row.$updatedAt)}`,
    `DTSTART:${toIcsDate(row.startAt)}`,
    ...(row.endAt ? [`DTEND:${toIcsDate(row.endAt)}`] : []),
    `SUMMARY:${escapeIcsText(row.title)}`,
    ...(row.description ? [`DESCRIPTION:${escapeIcsText(row.description)}`] : []),
    ...(row.location ? [`LOCATION:${escapeIcsText(row.location)}`] : []),
    ...(row.url ? [`URL:${escapeIcsText(row.url)}`] : []),
    `STATUS:${row.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}

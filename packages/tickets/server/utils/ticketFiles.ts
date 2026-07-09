/**
 * Anhang-Validierung (P4): erlaubte Typen per MAGIC BYTES (Bilder/PDF) bzw.
 * Text-Heuristik (md/txt/csv/json) — die Client-Mime ist Angreifer-Input.
 * Muster: core avatarFile / events event-covers.
 */
const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024

interface DetectedType {
  mimeType: string
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buffer[offset + i] === b)
}

export function detectTicketFileType(buffer: Buffer, filename: string): DetectedType | null {
  if (buffer.length === 0 || buffer.length > MAX_TICKET_FILE_BYTES) return null

  // Bilder + PDF über Magic Bytes
  if (startsWith(buffer, [0x89, 0x50, 0x4E, 0x47])) return { mimeType: 'image/png' }
  if (startsWith(buffer, [0xFF, 0xD8, 0xFF])) return { mimeType: 'image/jpeg' }
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return { mimeType: 'image/gif' }
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return { mimeType: 'image/webp' }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return { mimeType: 'application/pdf' }

  // Text-Formate (md/txt/csv/json/log): Endung + „sieht nach Text aus"
  // (keine Nullbytes im Anfangsfenster)
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const TEXT_EXTENSIONS: Record<string, string> = {
    md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json', log: 'text/plain',
  }
  if (ext in TEXT_EXTENSIONS) {
    const window = buffer.subarray(0, Math.min(buffer.length, 4096))
    if (!window.includes(0)) return { mimeType: TEXT_EXTENSIONS[ext]! }
  }

  return null
}

export { MAX_TICKET_FILE_BYTES }

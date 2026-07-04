import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

type CustomFontRow = Models.Row & { name: string, files?: string | null, order?: number }

interface FontFile { weight: number, fileId: string, variable?: boolean }

/** JSON defensiv parsen — kaputte/fehlende Werte = leere Liste */
function parseFiles(raw: string | null | undefined): FontFile[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is FontFile =>
      typeof entry === 'object' && entry !== null
      && typeof (entry as FontFile).weight === 'number'
      && typeof (entry as FontFile).fileId === 'string')
  }
  catch {
    return []
  }
}

/**
 * Öffentliche Font-Daten (Theme-Studio) — beim App-Start (themes-Plugin)
 * geladen: individuelle Schriften, deren @font-face-Regeln SSR in den Head
 * gerendert werden. Namen/Datei-IDs sind nicht schutzwürdig → kein Auth;
 * degradiert vollständig (Apps ohne Table → leere Liste).
 * Bewusst im system-Layer: er besitzt die Tabelle (A14).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const rows = await admin.tablesDB.listRows<CustomFontRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'custom_fonts',
    queries: [Query.orderAsc('order'), Query.limit(100)],
  }).then(res => res.rows).catch(() => [] as CustomFontRow[])

  return {
    fonts: rows
      .map(row => ({ id: row.$id, name: row.name, order: row.order ?? 0, files: parseFiles(row.files) }))
      .filter(font => font.files.length > 0),
  }
})

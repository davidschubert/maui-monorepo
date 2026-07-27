import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'

/**
 * Speicherort des signierten Entitlement-Dokuments (Audit-Befund N2).
 *
 * Bis system-019 lag es in `app_config.entitlements`. Diese Tabelle ist seit
 * system-005 Table-read(any) — bewusst, weil Config-Flags und Themes live an
 * Gäste propagieren müssen. Table-Permissions vererben aber auf ALLE Rows:
 * jeder Client konnte das Dokument (siteProjectId, Feature-Zuteilung,
 * `suspended`, Gültigkeitsfenster, `kid`) per Row-GET oder Realtime direkt bei
 * Appwrite abholen — an den Nuxt-Wegen vorbei, die K5 dicht gemacht hat.
 *
 * Seit system-020 lebt es in `app_secrets/global.entitlements`: eigene Tabelle
 * mit LEEREN Permissions, erreichbar nur über den Admin-Client (API-Key).
 * Kein Realtime — das Dokument hat keinen Client-Leser (K5-Analyse), bewertet
 * wird es ausschließlich in featureGates.
 *
 * 2-WEGE-READ: gelesen wird zuerst die neue Stelle, Fallback ist die
 * Altspalte. Damit ist die Rollout-Reihenfolge (Migration vs. Code-Deploy)
 * egal: neuer Code auf altem Schema liest die Altspalte weiter, alter Code auf
 * neuem Schema findet seinen Wert bis zum ersten Pull unverändert vor.
 * Geschrieben wird IMMER nur die neue Stelle; derselbe Schreibvorgang leert
 * die Altspalte, damit das Dokument nicht öffentlich liegen bleibt.
 */

const TABLE = 'app_secrets'
const LEGACY_TABLE = 'app_config'
const ROW = 'global'

type SecretsRow = Models.Row & { entitlements?: string }

function readColumn(row: SecretsRow): string {
  return typeof row.entitlements === 'string' ? row.entitlements : ''
}

/** Altspalte app_config.entitlements (leer, sobald der Pull sie geräumt hat). */
export async function getLegacyEntitlementsDocument(event?: H3Event): Promise<string> {
  try {
    const config = useRuntimeConfig(event)
    const row = await createAdminClient(event).tablesDB.getRow<SecretsRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: LEGACY_TABLE,
      rowId: ROW,
    })
    return readColumn(row)
  }
  catch {
    return ''
  }
}

/**
 * Das gespeicherte Dokument (roh, ungeprüft — die Signaturprüfung macht
 * featureGates). Leer = kein Dokument = Entitlement-Bedingung neutral AN.
 */
export async function getEntitlementsDocument(event?: H3Event): Promise<string> {
  try {
    const config = useRuntimeConfig(event)
    const row = await createAdminClient(event).tablesDB.getRow<SecretsRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: TABLE,
      rowId: ROW,
    })
    const stored = readColumn(row)
    if (stored) return stored
  }
  catch {
    // Tabelle/Row noch nicht migriert → Altspalte trägt weiter
  }
  return await getLegacyEntitlementsDocument(event)
}

/**
 * Dokument persistieren (nur verifizierte Dokumente — siehe entitlementsPull)
 * und die Altspalte im selben Zug räumen. Wirft bei Schreibfehlern; der
 * Aufrufer entscheidet, ob last-known-good stehen bleibt.
 */
export async function storeEntitlementsDocument(event: H3Event | undefined, raw: string): Promise<void> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  try {
    await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: ROW, data: { entitlements: raw } })
  }
  catch (error) {
    if ((error as { code?: number })?.code !== 404) throw error
    await tablesDB.createRow({ databaseId, tableId: TABLE, rowId: ROW, data: { entitlements: raw } })
  }
}

/**
 * Altspalte leeren, sobald das Dokument sicher an der neuen Stelle liegt.
 * Best effort: schlägt es fehl (z. B. Spalte in einer alten Instanz noch
 * nicht vorhanden), bleibt das Ergebnis des Pulls trotzdem gültig — der
 * nächste Zyklus versucht es erneut.
 */
export async function clearLegacyEntitlementsDocument(event?: H3Event): Promise<boolean> {
  try {
    const config = useRuntimeConfig(event)
    await createAdminClient(event).tablesDB.updateRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: LEGACY_TABLE,
      rowId: ROW,
      data: { entitlements: '' },
    })
    return true
  }
  catch {
    return false
  }
}

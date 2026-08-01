import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'

/**
 * Speicherort des signierten Entitlement-Dokuments (Audit-Befund N2).
 *
 * Bis system-019 lag es in `app_config.entitlements`. Diese Tabelle ist seit
 * system-005 Table-read(any) — bewusst, weil Config-Flags und Themes live an
 * Gäste propagieren müssen. Table-Permissions vererben aber auf ALLE Rows:
 * jeder Client konnte das Dokument (siteProjectId, Produkt-Zuteilung,
 * `suspended`, Gültigkeitsfenster, `kid`) per Row-GET oder Realtime direkt bei
 * Appwrite abholen — an den Nuxt-Wegen vorbei, die K5 dicht gemacht hat.
 *
 * Seit system-020 lebt es in `app_secrets/global.entitlements`: eigene Tabelle
 * mit LEEREN Permissions, erreichbar nur über den Admin-Client (API-Key).
 * Kein Realtime — das Dokument hat keinen Client-Leser (K5-Analyse), bewertet
 * wird es ausschließlich in productGates.
 *
 * EINE STELLE, seit 2026-07-31 (OPEN-ITEMS C6). Der 2-Wege-Read auf die
 * Altspalte ist WEG: er war die Rollout-Brücke zwischen system-020 und dem
 * Code-Deploy danach, und jede Instanz hat sie längst überquert (der Pull
 * räumte die Altspalte seither bei JEDEM Lauf leer, ein Lesefallback konnte
 * also ohnehin nur noch '' liefern). Reihenfolge des Abbaus: erst diese
 * Zeilen, DANN system-027 — eine Migration vor dem Code-Deploy hätte den
 * Fallback gegen eine gelöschte Spalte laufen lassen.
 */

const TABLE = 'app_secrets'
const ROW = 'global'

type SecretsRow = Models.Row & { entitlements?: string }

/**
 * Das gespeicherte Dokument (roh, ungeprüft — die Signaturprüfung macht
 * productGates). Leer = kein Dokument = Entitlement-Bedingung neutral AN.
 * Fehlt Tabelle oder Row (frische Instanz vor dem ersten Pull), ist das kein
 * Fehler, sondern genau dieser neutrale Fall.
 */
export async function getEntitlementsDocument(event?: H3Event): Promise<string> {
  try {
    const config = useRuntimeConfig(event)
    const row = await createAdminClient(event).tablesDB.getRow<SecretsRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: TABLE,
      rowId: ROW,
    })
    return typeof row.entitlements === 'string' ? row.entitlements : ''
  }
  catch {
    return ''
  }
}

/**
 * Dokument persistieren (nur verifizierte Dokumente — siehe entitlementsPull).
 * Wirft bei Schreibfehlern; der Aufrufer entscheidet, ob last-known-good
 * stehen bleibt.
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

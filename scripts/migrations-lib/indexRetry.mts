/**
 * Geteilter Helfer für ALLE Migrationen: `createIndex` mit Wiederholung bei
 * 400/`column_not_available`.
 *
 * WARUM ES DEN RACE ÜBERHAUPT GIBT (in Appwrite 1.9.x nachgelesen, nicht geraten):
 *
 *  - Der Datenbank-Worker legt erst die PHYSISCHE Spalte an und setzt DANACH
 *    `status = 'available'` auf dem `attributes`-Dokument
 *    (Platform/Modules/Databases/Workers/Databases.php — `createAttribute()`
 *    ruft `createAttribute(...)` und erst dann `setAttribute('status',
 *    'available')`).
 *  - Der Index-Endpunkt prüft die Verfügbarkeit aber NICHT auf diesem Dokument,
 *    sondern auf der im COLLECTION-Dokument eingebetteten Spaltenliste
 *    (`Http/…/Indexes/Create.php`: `if ($attributeStatus !== 'available') throw
 *    …COLUMN_NOT_AVAILABLE`). Diese eingebettete Kopie kommt aus Appwrites
 *    Metadaten-Cache und kann dem `attributes`-Dokument HINTERHERHINKEN.
 *
 * Deshalb ist `waitForColumn()` (pollt `listColumns` bis 'available') korrekt
 * und trotzdem nicht hinreichend: der Poll sieht die frische Wahrheit, der
 * Index-Aufruf danach eine veraltete Kopie. Das Rennen liegt in Appwrite, nicht
 * in den Migrationen — die einzige verlässliche Antwort ist Wiederholen.
 *
 * LIVE ERWISCHT: CI-E2E (frische Wegwerf-Appwrite, GitHub-Runner) am
 * 2026-07-30 zweimal in Folge an VERSCHIEDENEN Migrationen (courses-002
 * `tenantId`, dann media-001 `sortOrder`) — „The requested column '…' is not
 * yet available". Frühere Läufe waren grün: ein Flake, kein Bruch. Deshalb wird
 * GENAU dieser Fall wiederholt und nur er; jeder andere 400er ist ein echter
 * Fehler und muss weiterhin sofort auffallen.
 *
 * NUR INDIZES: Row-Schreibvorgänge (`createRow`/`updateRow`) sind NICHT
 * betroffen. Sie kennen die Prüfung nicht (der Fehler wird ausschliesslich aus
 * dem Spalten- und dem Index-Endpunkt geworfen), und weil die physische Spalte
 * VOR dem 'available' entsteht, ist sie garantiert da, sobald `waitForColumn`
 * durch ist. Kein Retry für Seeds.
 *
 * EINBINDUNG (Migrationen laufen als eigenständige
 * `node --experimental-strip-types`-Prozesse, siehe scripts/migrate.mjs — die
 * Auflösung ist deshalb relativ zur DATEI, nicht zum cwd):
 *
 *   import { indexStep } from '../../../../scripts/migrations-lib/indexRetry.mts'
 *
 * Die Datei importiert BEWUSST nichts aus `node-appwrite`: sie liegt im
 * Repo-Root, wo das Paket nicht aufgelöst wird (pnpm installiert es je Layer).
 */

/** Wiederholungen und Pause zwischen zwei Index-Versuchen. */
export const INDEX_RETRIES = 10
export const INDEX_RETRY_DELAY_MS = 1500

/** Appwrite-Fehlercode prüfen — dieselbe Form wie das lokale `hasCode` jeder Migration. */
export function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Ist das der Spalten-Race und nicht irgendein anderer 400er?
 * Erst der Typ (`column_not_available`, bzw. `attribute_not_available` auf der
 * alten Collections-API), dann der Wortlaut als Netz für Stände, die den Typ
 * nicht mitliefern.
 */
export function isColumnNotAvailable(error: unknown): boolean {
  if (!hasCode(error, 400)) return false
  const details = error as { type?: unknown, message?: unknown }
  if (details.type === 'column_not_available' || details.type === 'attribute_not_available') return true
  return typeof details.message === 'string' && details.message.includes('is not yet available')
}

/**
 * Wrapper UM einen `createIndex`-Aufruf: wiederholt nur bei
 * `column_not_available`. Alles andere — auch 409 „existiert bereits" — fliegt
 * unverändert weiter, damit das Idempotenz-Handling der aufrufenden Migration
 * unangetastet bleibt.
 */
export async function withIndexRetry<T>(run: () => Promise<T>, label = 'Index-Anlage'): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    }
    catch (error) {
      if (!isColumnNotAvailable(error) || attempt >= INDEX_RETRIES) throw error
      console.log(`… ${label}: Spalte für den Index-Worker noch nicht sichtbar (Versuch ${attempt}/${INDEX_RETRIES}) — neuer Versuch in ${INDEX_RETRY_DELAY_MS} ms`)
      await new Promise(resolve => setTimeout(resolve, INDEX_RETRY_DELAY_MS))
    }
  }
}

/**
 * Drop-in für das `step()` jeder Migration, aber NUR für `createIndex`:
 * 409 → „existiert bereits" (identische Ausgabe wie `step`), zusätzlich der
 * Retry oben. Signatur und Meldungen sind absichtlich deckungsgleich mit
 * `step`, damit die Umstellung ein Wort ist und die Logs gleich aussehen.
 */
export async function indexStep(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await withIndexRetry(run, label)
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

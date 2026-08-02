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
 *   import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'
 *   const { indexStep } = createIndexSteps(tablesDB, databaseId)
 *   await indexStep('Index comments.author', {
 *     tableId: 'comments', key: 'author', type: 'key', columns: ['authorId'],
 *   })
 *
 * Die Datei importiert BEWUSST nichts aus `node-appwrite`: sie liegt im
 * Repo-Root, wo das Paket nicht aufgelöst wird (pnpm installiert es je Layer).
 *
 * WARUM DIE FABRIK DEN `createIndex`-AUFRUF SELBST MACHT (F19-Nachlese,
 * 2026-08-02): der Cache-Anstoß war zuerst ein OPTIONALES drittes Argument.
 * Ergebnis nach einem Tag: 2 von 63 Migrationen reichten ihn durch, 61 nicht —
 * und genau eine davon (posts-004) legte die CI-E2E lahm. Ein Schutz, den der
 * Aufrufer mitgeben MUSS, ist ein Schutz, den die Aufrufer vergessen. Deshalb
 * gibt es das Argument nicht mehr: die Fabrik bindet `tablesDB` + `databaseId`,
 * der Schritt bekommt die Index-Beschreibung (inkl. `tableId`) als DATEN und
 * ruft `createIndex` selbst. Der Anstoß ist damit nicht „empfohlen", sondern
 * der einzige Weg — und er kann auch nicht auf die falsche Tabelle zeigen,
 * weil er dieselbe `tableId` benutzt wie der Index.
 */

/**
 * Wiederholungen und Pausen.
 *
 * BUDGET STATT TAKT (2026-08-02): 10 × 1500 ms waren 15 s Gesamt-Vorrat — zu
 * wenig. Die CI-E2E starb an `events.idx_tenant_status_start`, NACHDEM sie alle
 * zehn Versuche verbraucht hatte (Log: „Versuch 9/10"), also nicht an einem
 * anderen Fehler, sondern schlicht am Ende der Geduld. Auf einem ausgelasteten
 * Runner (frische Appwrite, alle Migrationen aller Layer am Stück) hinkt der
 * Metadaten-Cache länger nach als auf einer warmen lokalen Instanz.
 *
 * Jetzt: erst schnell (die meisten Fälle lösen sich in 1–3 s), dann wachsende
 * Pausen bis 8 s, Gesamt-Vorrat ~2 min. Wachsend statt gleichmäßig, damit der
 * Normalfall nicht langsamer wird und der seltene Ausreißer trotzdem gewinnt.
 *
 * WARTEN ALLEIN REICHT NICHT (F19, 2026-08-02 am laufenden 1.9.6 nachgemessen):
 * es gibt einen Zustand, aus dem der Vorrat NIE herausführt. Der Index-Endpunkt
 * liest die Spaltenliste aus dem gecachten Collection-Dokument (Create.php:97 +
 * :170); der Worker setzt erst `status = 'available'` (Databases.php:210) und
 * räumt den Cache ERST DANACH (:242) — dazwischen liegt noch das Realtime-
 * `trigger()`. Wer in diesem Fenster liest, kann seinen veralteten Stand NACH
 * dem Räumen zurückschreiben; dann steht die Spalte dort für immer auf
 * 'processing', denn nichts räumt ein zweites Mal. Genau so starben zwei
 * CI-Läufe: 23 Versuche über 2,5 min, keine Bewegung, während 67 andere Indizes
 * sofort durchgingen. Bitterer Beigeschmack: der Poller, der auf 'available'
 * wartet, ist selbst der wahrscheinlichste Vergifter — er liest genau dann.
 *
 * Deshalb STÖSST der Wrapper den Cache nach ein paar Fehlversuchen an, statt
 * länger zu warten (siehe `tableCacheNudge`).
 */
export const INDEX_RETRIES = 24
export const INDEX_RETRY_DELAY_MS = 1500
export const INDEX_RETRY_MAX_DELAY_MS = 8000

/**
 * Ab welchem Fehlversuch angestoßen wird — und wie oft danach wieder.
 *
 * Nicht sofort: der GEWÖHNLICHE Nachhinker löst sich in 1–3 s von selbst, und
 * ein Schreibzugriff auf die Tabelle ist teurer als eine Pause. Nach drei
 * Fehlversuchen (~5 s) ist der harmlose Fall aber durch — was dann noch steht,
 * ist mit hoher Wahrscheinlichkeit der vergiftete Cache.
 */
export const INDEX_NUDGE_AFTER_ATTEMPT = 3
export const INDEX_NUDGE_EVERY = 4

/** Pause vor Versuch `attempt+1`: 1,5 s, dann +25 % je Runde, gedeckelt. */
export function retryDelayMs(attempt: number): number {
  return Math.min(Math.round(INDEX_RETRY_DELAY_MS * 1.25 ** (attempt - 1)), INDEX_RETRY_MAX_DELAY_MS)
}

/**
 * Die Teile von `TablesDB`, die der Anstoß braucht — STRUKTURELL getippt, weil
 * diese Datei bewusst nichts aus `node-appwrite` importiert (sie liegt im
 * Repo-Root, wo das Paket nicht aufgelöst wird).
 */
export interface NudgeableTablesDB {
  getTable: (params: { databaseId: string, tableId: string }) => Promise<{
    name: string
    enabled?: boolean
    rowSecurity?: boolean
    $permissions?: string[]
  }>
  updateTable: (params: {
    databaseId: string
    tableId: string
    name: string
    permissions?: string[]
    rowSecurity?: boolean
    enabled?: boolean
  }) => Promise<unknown>
}

/**
 * Zusätzlich zum Anstoß: der Index-Aufruf selbst. METHODEN-Syntax, nicht
 * Pfeil-Eigenschaft — nur so prüft TypeScript die Parameter bivariant, und der
 * echte `TablesDB` (dessen `type` das Enum `TablesDBIndexType` ist, dazu eine
 * veraltete Positional-Überladung) bleibt strukturell zuweisbar, ohne dass
 * diese Datei `node-appwrite` importieren müsste.
 */
export interface IndexingTablesDB extends NudgeableTablesDB {
  createIndex(params: {
    databaseId: string
    tableId: string
    key: string
    type: string
    columns: string[]
    orders?: string[]
    lengths?: number[]
  }): Promise<unknown>
}

/**
 * Der Index als DATEN — ohne `databaseId`, die bindet die Fabrik.
 * `tableId` gehört bewusst hierher: sie ist gleichzeitig das Ziel des Index
 * UND das Ziel des Cache-Anstoßes; zwei getrennte Angaben könnten auseinander
 * laufen, eine kann es nicht.
 */
export interface IndexSpec {
  tableId: string
  key: string
  type: string
  columns: string[]
  orders?: string[]
  lengths?: number[]
}

/**
 * Baut den Cache-Anstoß für EINE Tabelle: liest ihren Zustand und schreibt ihn
 * UNVERÄNDERT zurück. Der Schreibvorgang räumt das gecachte Collection-Dokument
 * — mehr will er nicht.
 *
 * WARUM ALLE VIER FELDER MITGESCHRIEBEN WERDEN, und warum das keine Kür ist:
 * `updateTable` setzt `rowSecurity` und `enabled` BEDINGUNGSLOS (Update.php:108
 * f.), und ihre Vorgaben sind `false` bzw. `true` (:69 f.) — nur `permissions`
 * erbt (`??=`, :98). Ein Anstoß mit bloßem `name` würde also die Zeilen-
 * Sicherheit einer Tabelle stillschweigend ABSCHALTEN. Lokal nachgemessen
 * (Gegenprobe in `nudge-proof`): naiv ⇒ `rowSecurity` fällt auf false; mit
 * zurückgeschriebenem Zustand ⇒ alles bleibt, und der Index geht sofort durch.
 *
 * Der Anstoß ist FAIL-SOFT: schlägt er fehl, läuft der normale Wiederhol-Takt
 * weiter. Er ist eine Abkürzung, kein neuer Fehlerpfad.
 */
export function tableCacheNudge(
  tablesDB: NudgeableTablesDB,
  databaseId: string,
  tableId: string,
): () => Promise<void> {
  return async () => {
    const table = await tablesDB.getTable({ databaseId, tableId })
    await tablesDB.updateTable({
      databaseId,
      tableId,
      name: table.name,
      permissions: table.$permissions,
      rowSecurity: table.rowSecurity,
      enabled: table.enabled,
    })
  }
}

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
export async function withIndexRetry<T>(
  run: () => Promise<T>,
  label: string,
  nudge: () => Promise<void>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    }
    catch (error) {
      if (!isColumnNotAvailable(error) || attempt >= INDEX_RETRIES) throw error

      // Ab dem dritten Fehlversuch den Cache anstoßen statt nur zu warten —
      // gegen den vergifteten Eintrag hilft Geduld nachweislich nie.
      // FAIL-SOFT: misslingt der Anstoß, geht der normale Takt weiter.
      if (attempt >= INDEX_NUDGE_AFTER_ATTEMPT
        && (attempt - INDEX_NUDGE_AFTER_ATTEMPT) % INDEX_NUDGE_EVERY === 0) {
        try {
          await nudge()
          console.log(`… ${label}: Cache der Tabelle angestoßen (Versuch ${attempt})`)
        }
        catch (nudgeError) {
          const grund = nudgeError instanceof Error ? nudgeError.message : String(nudgeError)
          console.log(`… ${label}: Anstoß fehlgeschlagen (${grund}) — es wird weiter gewartet`)
        }
      }

      const delay = retryDelayMs(attempt)
      console.log(`… ${label}: Spalte für den Index-Worker noch nicht sichtbar (Versuch ${attempt}/${INDEX_RETRIES}) — neuer Versuch in ${delay} ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * EINZIGER Weg, in einer Migration einen Index anzulegen. Einmal je Datei
 * bauen, danach so oft benutzt wie nötig:
 *
 *   const { indexStep } = createIndexSteps(tablesDB, databaseId)
 *
 * Liefert zwei Formen — beide mit Retry UND Anstoß, ohne Zutun des Aufrufers:
 *
 * - `indexStep(label, spec)`: Drop-in für das `step()` jeder Migration, aber
 *   NUR für Indizes. 409 → „existiert bereits" (identische Ausgabe wie `step`).
 *   Meldungen sind absichtlich deckungsgleich mit `step`, damit die Logs gleich
 *   aussehen.
 * - `createIndex(spec, label?)`: roh — wirft ALLES weiter, auch 409. Für die
 *   Handvoll Migrationen, die ihr eigenes Idempotenz-Handling um den Aufruf
 *   gelegt haben (eigener try/catch mit eigener Meldung).
 */
export function createIndexSteps(tablesDB: IndexingTablesDB, databaseId: string): {
  indexStep: (label: string, spec: IndexSpec) => Promise<void>
  createIndex: (spec: IndexSpec, label?: string) => Promise<unknown>
} {
  const createIndex = (spec: IndexSpec, label = `Index ${spec.tableId}.${spec.key}`) =>
    withIndexRetry(
      () => tablesDB.createIndex({ databaseId, ...spec }),
      label,
      tableCacheNudge(tablesDB, databaseId, spec.tableId),
    )

  const indexStep = async (label: string, spec: IndexSpec): Promise<void> => {
    try {
      await createIndex(spec, label)
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

  return { indexStep, createIndex }
}

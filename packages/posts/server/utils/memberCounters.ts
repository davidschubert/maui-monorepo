import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import type { UserCounterEvent } from '../../../core/server/utils/userCounterEvents'
import {
  counterFellBehind,
  emptyMemberCounterValues,
  healedValues,
  memberCounterValues,
  seedValuesFrom,
  type MemberCounterValues,
} from '../../shared/memberCounters'
import { MEMBER_COUNTERS_TABLE, type MemberCounters } from '../../shared/types/post'

/**
 * DIE AUTORITÄT ÜBER `member_counters` (F1, gemeinsames Paket) — die
 * posts-Seite des Core-Vertrags `registerUserCounterRecorder`.
 *
 * ── DIE KLINKE UND DER HANDELNDE: `operator` / `operator` ──────────────────
 * `as: 'operator'`, weil die Zeilen bewusst KEINE Client-Rechte tragen: gelesen
 * und geschrieben wird ausschließlich server-seitig, ein Session-Client käme
 * gar nicht an sie heran (Muster `post_views`).
 *
 * `actor: 'operator'` ist die wichtigere Hälfte, und sie hat zwei Gründe:
 *  - **A5 (Beitritt):** eine Buchung ist kein Beitritt. Die HANDLUNG, die
 *    gerade Mitglied macht, ist der Kommentar oder der Beitrag — der lief eine
 *    Zeile vorher durch dieselbe Tür mit `actor: 'member'`. Und die Hälfte
 *    aller Buchungen betrifft einen ANDEREN Menschen (den Autor, der eine
 *    Stimme bekommt); den zum Mitglied zu machen, weil jemand ihn hochgestimmt
 *    hat, wäre schlicht falsch.
 *  - **M13 (Zahlungssperre):** eine gesperrte Community ist NUR-LESEND. Ihre
 *    Inhalts-Routen scheitern also schon, bevor hier etwas gebucht würde — die
 *    Buchungen, die trotzdem ankämen (Moderation, eine Rücknahme), sind
 *    Buchhaltung und kein Inhalt. Mit `'member'` hinge die Verlässlichkeit der
 *    Zähler an einem Zahlungsstatus.
 *
 * ── ATOMAR, WEIL APPWRITE ES KANN ─────────────────────────────────────────
 * Hoch- und heruntergezählt wird über `incrementRowColumn`/`decrementRowColumn`
 * (Appwrite 1.9.x, in der Datentür als `increment`/`decrement`) — also ohne
 * Lesen-Rechnen-Schreiben. Das ist nicht Kosmetik: zwei gleichzeitige Stimmen
 * auf denselben Autor wären mit Lesen-und-Schreiben ein verlorenes Update, und
 * zwar lautlos. Dieselbe Wahl trifft der Aufruf-Zähler aus Stufe 2.
 *
 * `min: 0` beim Herunterzählen: Appwrite WEIST den Schritt ab, statt zu
 * kappen — die Zahl bleibt bei 0 stehen und der Fehlschlag wird verschluckt.
 * Genau das ist gemeint mit „nie unter 0". Die Spalte trägt dieselbe Grenze
 * noch einmal (posts-013) — der Schreibweg ist die Regel, die Spalte das Netz.
 *
 * ── EIN GEDÄCHTNIS FÜR DIE ZEILEN-ID ──────────────────────────────────────
 * Die Zeile ist über (communityId, userId) eindeutig, ihre Id aber nicht
 * berechenbar: Appwrite-Ids fassen keine 72 Zeichen. Ohne Gedächtnis kostete
 * jede Buchung eine Such-Abfrage. Die Id einer Zeile ändert sich nie, also ist
 * sie unbegrenzt haltbar; gedeckelt wird nur der Speicher.
 */

/* ─── Zeilen-Id-Gedächtnis (pro Prozess) ─────────────────────────────────── */

const rowIds = new Map<string, string>()
const MAX_REMEMBERED = 5000

function memoryKey(scope: string, userId: string): string {
  return `${scope} ${userId}`
}

function rememberRowId(scope: string, userId: string, rowId: string): void {
  if (rowIds.size >= MAX_REMEMBERED) {
    const oldest = rowIds.keys().next()
    if (!oldest.done) rowIds.delete(oldest.value)
  }
  rowIds.set(memoryKey(scope, userId), rowId)
}

/** Nur für Tests/Diagnose. */
export function __resetMemberCounterMemory(): void {
  rowIds.clear()
}

/* ─── Zugriff ────────────────────────────────────────────────────────────── */

function counterDb(event: H3Event): TenantDb {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/**
 * Die Zeile dieses Menschen — `null`, wenn es noch keine gibt.
 *
 * Über die gemerkte Id, sonst über den Unique-Index. `get` der Tür belegt
 * zusätzlich die Zugehörigkeit; ein Gedächtnis-Treffer aus einer FREMDEN
 * Community (theoretisch, weil der Schlüssel den Mandanten-Scope enthält)
 * liefe damit ins Leere statt in fremde Zahlen.
 */
async function findRow(event: H3Event, db: TenantDb, userId: string): Promise<MemberCounters | null> {
  const scope = tenantCacheScope(event)
  const remembered = rowIds.get(memoryKey(scope, userId))
  if (remembered) {
    const row = await db.get<MemberCounters>(MEMBER_COUNTERS_TABLE, remembered, 'Counters not found').catch(() => null)
    if (row) return row
    rowIds.delete(memoryKey(scope, userId))
  }

  const found = await db.find<MemberCounters>(MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
  if (found) rememberRowId(scope, userId, found.$id)
  return found
}

/**
 * Die Zeile anlegen. `seeded` sagt, ob die Werte schon geeicht sind.
 *
 * Ein 409 aus dem Unique-Index ist kein Fehler, sondern ein Wettlauf: jemand
 * anderes war schneller, also gewinnt dessen Zeile. `created` sagt dem
 * Aufrufer, welcher der beiden Fälle eingetreten ist — bei einem Wettlauf muss
 * er seine Deltas nachzählen, sie stecken sonst in der verworfenen Zeile.
 */
async function createRow(
  event: H3Event,
  db: TenantDb,
  userId: string,
  values: MemberCounterValues,
  seeded: boolean,
): Promise<{ row: MemberCounters | null, created: boolean }> {
  const row = await db.create<MemberCounters>(MEMBER_COUNTERS_TABLE, { userId, ...values, seeded }, {
    // KEINE Row-Permissions: gelesen wird ausschließlich über die
    // Operator-Klinke. Ohne Leser gibt es kein Realtime-Ereignis — und ein
    // Zähler, der bei jeder fremden Stimme in offene Fenster funkt, wäre
    // Aufregung ohne Neuigkeit (dieselbe Überlegung wie bei `post_views`).
    permissions: [],
  }).catch(() => null)

  if (row) {
    rememberRowId(tenantCacheScope(event), userId, row.$id)
    return { row, created: true }
  }
  return { row: await findRow(event, db, userId), created: false }
}

/* ─── Der Schreibweg (Core-Vertrag) ──────────────────────────────────────── */

/**
 * Die Meldungen verbuchen. Wirft nie — der Core-Vertrag fängt zwar ab, aber
 * eine einzelne fehlgeschlagene Buchung darf auch die übrigen nicht mitnehmen.
 *
 * NEUE ZEILE MIT `seeded: false`: die Startwerte kommen erst beim ersten
 * Hinsehen (`ensureSeededCounters`), weil sie ein Aggregat über ZWEI Layer
 * sind und nur für den ANGEMELDETEN Menschen ermittelt werden können — die
 * Quellen zählen ausdrücklich nur, was `event.context.user` getan hat. Bei
 * einer Buchung geht es aber oft um jemand anderen.
 */
export async function applyMemberCounterEvents(event: H3Event, events: readonly UserCounterEvent[]): Promise<void> {
  const db = counterDb(event)

  const byUser = new Map<string, UserCounterEvent[]>()
  for (const entry of events) {
    const list = byUser.get(entry.userId)
    if (list) list.push(entry)
    else byUser.set(entry.userId, [entry])
  }

  await Promise.all([...byUser.entries()].map(async ([userId, entries]) => {
    try {
      let row = await findRow(event, db, userId)
      if (!row) {
        // Die frische Zeile trägt die positiven Deltas gleich mit — ein
        // getrenntes Anlegen und Hochzählen wäre ein Schritt mehr und ein
        // Wettlauf mehr. Negative Deltas fallen dabei weg: es gibt keinen
        // Bestand, von dem sie abziehen könnten.
        const values = emptyMemberCounterValues()
        for (const entry of entries) {
          if (entry.delta > 0) values[entry.kind] += entry.delta
        }
        const attempt = await createRow(event, db, userId, values, false)
        // Angelegt ⇒ die Deltas stecken drin, fertig. Wettlauf verloren ⇒ die
        // fremde Zeile bekommt sie unten nachgezählt.
        if (attempt.created || !attempt.row) {
          // Der Sprung von NICHTS auf die frischen Werte ist die erste
          // Überschreitung dieses Menschen — „Erster Zuspruch" entsteht genau
          // hier, bei der allerersten vergebenen Stimme.
          if (attempt.created) await awardCounterBadges(event, userId, emptyMemberCounterValues(), values)
          /**
           * BEWUSST KEINE STUFEN-PRÜFUNG auf einer frisch angelegten Zeile: sie
           * trägt die Deltas EINES Schreibvorgangs, und die kleinste Schwelle
           * verlangt zusätzlich zwei Tage Zugehörigkeit. Wer hier steht, ist
           * gerade erst angekommen — die Prüfung wäre eine garantiert
           * ergebnislose Abfrage ans Control Plane bei jedem ersten Beitrag
           * eines jeden neuen Mitglieds. Der zweite Schreibvorgang prüft, und
           * das Netz beim Hinsehen ohnehin.
           */
          return
        }
        row = attempt.row
      }

      /**
       * VORHER MERKEN, NACHHER VERGLEICHEN (F1 Teilpaket 2): die Verleihung an
       * dieser Stelle darf nur das NEUE sehen. `db.increment` gibt die
       * geschriebene Zeile zurück, der Stand davor steckt in `row` — damit ist
       * die Differenz gratis und kostet keine zusätzliche Abfrage.
       */
      const before = memberCounterValues(row)
      let latest: MemberCounters = row
      for (const entry of entries) {
        if (entry.delta > 0) {
          latest = await db.increment<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, entry.kind, { value: entry.delta }, 'Counters not found')
        }
        else {
          // `min: 0` — Appwrite weist den Schritt ab, statt unter null zu
          // gehen. Der Fehlschlag ist hier die gewünschte Wirkung.
          latest = await db.decrement<MemberCounters>(MEMBER_COUNTERS_TABLE, row.$id, entry.kind, { value: -entry.delta, min: 0 }, 'Counters not found')
            .catch(() => latest)
        }
      }

      // FAIL-SOFT und ausdrücklich NACH der Buchung: ein Abzeichen darf keine
      // gezählte Stimme kosten. Was hier untergeht, holt das Netz beim
      // Hinsehen nach.
      await awardCounterBadges(event, userId, before, memberCounterValues(latest))

      /**
       * DIE VERTRAUENSSTUFE (F1 Teilpaket 3) — hier und nicht in zwanzig
       * Routen, aus demselben Grund wie die Zähler selbst: das ist die EINE
       * Stelle, an der der neue Stand vorliegt.
       *
       * `latest` ist die gerade geschriebene Zeile, die Prüfung rechnet also
       * mit dem Ergebnis dieser Buchung. Sie steigt in den allermeisten Fällen
       * schon an der billigen Hälfte aus (`countersAllowHigherLevel`), ohne das
       * Control Plane zu fragen — die Begründung dieser Reihenfolge steht dort.
       *
       * Fail-soft und zuletzt: eine Stufe ist eine Folge des Handelns, nie sein
       * Preis. `refreshTrustLevelAfterCounters` wirft nicht.
       */
      await refreshTrustLevelAfterCounters(event, userId, latest)
    }
    catch (error) {
      logEvent('warn', 'posts.member_counters_failed', {
        kinds: entries.map(entry => entry.kind).join(','),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }))
}

/* ─── Der Leseweg (Abzeichen-Auswertung) ─────────────────────────────────── */

/** Der aktuelle Stand dieses Menschen — `null`, wenn es noch keine Zeile gibt. */
export async function readMemberCounters(event: H3Event, userId: string): Promise<MemberCounters | null> {
  return findRow(event, counterDb(event), userId).catch(() => null)
}

/**
 * Braucht dieser Stand die Aggregate? (Zeile fehlt oder ist noch nicht geeicht.)
 *
 * Die Auswertestelle fragt das, BEVOR sie zählt — nur dann kostet der Seed die
 * beiden zusätzlichen `count`-Abfragen, und zwar einmal je Mensch statt bei
 * jedem Blick in die Galerie.
 */
export function needsCounterSeed(row: MemberCounters | null): boolean {
  return !row || row.seeded !== true
}

/**
 * Die Zähler eichen bzw. nachziehen — und den gültigen Stand zurückgeben.
 *
 * DREI FÄLLE, EINE ANTWORT:
 *  1. keine Zeile ⇒ anlegen, geeicht,
 *  2. Zeile ohne Eichung ⇒ auf die Aggregate setzen und als geeicht markieren,
 *  3. geeichte Zeile, die HINTER dem Aggregat liegt ⇒ nachziehen
 *     (Selbstheilung, Begründung in `shared/memberCounters.ts`).
 * Sonst bleibt alles, wie es ist.
 *
 * FAIL-SOFT: schlägt das Schreiben fehl, wird der GERECHNETE Stand
 * zurückgegeben. Die Abzeichen-Seite zeigt dann das Richtige, nur ohne es
 * festzuhalten — der nächste Aufruf versucht es erneut.
 */
export async function ensureSeededCounters(
  event: H3Event,
  userId: string,
  row: MemberCounters | null,
  aggregates: { topicsCreated?: number, repliesCreated?: number, upvotesGiven?: number },
): Promise<MemberCounterValues> {
  const db = counterDb(event)

  if (!row) {
    const values = seedValuesFrom(aggregates)
    await createRow(event, db, userId, values, true)
    return values
  }

  const stored = memberCounterValues(row)

  if (row.seeded !== true) {
    const values = seedValuesFrom(aggregates)
    // ABSOLUT SETZEN, nicht addieren: die Aggregate sind der vollständige
    // Bestand. Was seit dem Anlegen der Zeile hereingezählt wurde, steckt
    // bereits darin — es sei denn, es war eine Bearbeitung oder eine erhaltene
    // Stimme; die beiden Spalten bleiben deshalb erhalten.
    const merged: MemberCounterValues = {
      ...values,
      upvotesReceived: stored.upvotesReceived,
      edits: stored.edits,
    }
    await db.update(MEMBER_COUNTERS_TABLE, row.$id, { ...merged, seeded: true }, 'Counters not found').catch(() => null)
    return merged
  }

  if (counterFellBehind(stored, aggregates)) {
    const healed = healedValues(stored, aggregates)
    await db.update(MEMBER_COUNTERS_TABLE, row.$id, healed, 'Counters not found').catch(() => null)
    return healed
  }

  return stored
}

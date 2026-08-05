import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  HANDLE_MAX_LENGTH,
  handleCandidate,
  isValidHandle,
  normalizeHandle,
  suggestHandleBase,
} from '../../shared/handles'
import { HANDLES_TABLE, type CommunityHandleRow } from '../../shared/types/handle'

/**
 * HANDLES — der Zugriff auf `community_handles` (Tabelle: system-029).
 *
 * Dass der Zugriff in core liegt und die Tabelle in system, ist kein Bruch von
 * A14, sondern das bestehende Muster: `notify()` lebt genauso in core, während
 * `notifications` von system-003 kommt. Core BESITZT keine Tabelle — es
 * benutzt eine, die auf jeder Instanz existiert. Die Alternative wäre gewesen,
 * die Handles in `posts` zu legen; dann hätte `comments` von `posts` abhängen
 * müssen, sobald dort auch erwähnt wird — genau die Kreuz-Abhängigkeit, die
 * A14 verbietet.
 *
 * ── WARUM ALLES ÜBER `as: 'operator'` LÄUFT ────────────────────────────────
 * Die Tabelle trägt bewusst KEINE Tabellen-Rechte (Migration system-029), also
 * kann ein Session-Client dort nichts anlegen. Der Handle ist eine Zusage des
 * Systems („du bist ab jetzt erwähnbar"), keine Zeile, die ein Browser selbst
 * schreiben können soll — sonst könnte jemand die 30-Tage-Sperrfrist und die
 * Reservierungs-Liste umgehen, indem er direkt schreibt.
 *
 * ── UND WARUM `actor: 'operator'`, obwohl ein Mensch handelt ───────────────
 * Zwei Gründe, beide bewusst (die Regel aus CLAUDE.md lautet, bei einer
 * Operator-Klinke IMMER zu prüfen, ob `actor` gesetzt gehört — hier lautet die
 * Antwort nein):
 *  1. EIN HANDLE IST KEIN INHALT. M13 friert Inhalte ein (Kommentare,
 *     Beiträge, Stimmen) und lässt persönliche Einstellungen sowie
 *     Owner-Einstellungen bewusst offen. Seinen eigenen Namen zu ändern gehört
 *     in die zweite Gruppe; ein `actor: 'member'` hätte das ohne Not gesperrt.
 *  2. KEIN BEITRITT IM BEITRITT. `ensureCommunityHandle` läuft als NEBENwirkung
 *     eines anderen Schreibvorgangs, der über dieselbe Datentür geht — mit
 *     `actor: 'member'` würde `tenantDb().create` dort ein zweites Mal
 *     `joinCommunity('contribution')` auslösen, mitten im ersten.
 * Die Autorisierung („darf dieser Mensch das?") passiert deshalb VOR dem
 * Aufruf, in der Route — nicht an der Türklinke.
 */

/** Wie viele Kandidaten (`david`, `david2`, …) probiert die Vergabe? */
const MAX_ASSIGN_ATTEMPTS = 12

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Der Zugang für ALLE Handle-Operationen — siehe Kopf. */
function handleDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/**
 * Die AKTIVE Zeile dieses Menschen in dieser Community — oder null.
 *
 * Filtert auf `status: 'active'`: gefragt ist „wie heisst er JETZT". Die
 * Gegenrichtung (eine alte Erwähnung auflösen) darf genau das NICHT tun, siehe
 * `resolveHandleOwners`.
 */
export async function activeHandleRow(event: H3Event, userId: string): Promise<CommunityHandleRow | null> {
  if (!userId) return null
  try {
    return await handleDb(event).find<CommunityHandleRow>(HANDLES_TABLE, [
      Query.equal('userId', userId),
      Query.equal('status', 'active'),
    ])
  }
  catch {
    // Fail-soft: solange system-029 auf einer Instanz noch nicht gelaufen ist,
    // soll KEINE Seite deswegen 500 werfen — sie zeigt dann nur keinen Handle.
    return null
  }
}

/**
 * „Sorge dafür, dass dieser Mensch hier einen Namen hat" — idempotent.
 *
 * Davids Entscheidung 2: automatisch vergeben, niemand wird blockiert, jeder
 * ist ab Tag 1 erwähnbar. Deshalb gibt es KEINEN Zustand „hat noch keinen
 * Handle, muss erst einen wählen".
 *
 * DIE MECHANIK IST DER UNIQUE-INDEX, nicht ein Vorab-Blick: erst nachsehen und
 * dann schreiben wäre bei zwei gleichzeitigen Anmeldungen ein Rennen mit zwei
 * Gewinnern. Hier wird blind geschrieben, und ein 409 heisst „jemand war
 * schneller" — dann kommt der nächste Kandidat dran.
 *
 * `changedAt` bleibt bei der automatischen Vergabe LEER: die Sperrfrist soll
 * nicht schon verbraucht sein, bevor der Mensch seinen Namen überhaupt gesehen
 * hat.
 *
 * Wirft nie. Der Handle ist eine Annehmlichkeit; er darf keine Anmeldung und
 * keinen Beitrag kosten. Im Fehlerfall kommt `null` zurück.
 */
export async function ensureCommunityHandle(
  event: H3Event,
  userId: string,
  displayName: string,
): Promise<string | null> {
  if (!userId) return null

  try {
    const existing = await activeHandleRow(event, userId)
    if (existing) return existing.handle

    const db = handleDb(event)
    const base = suggestHandleBase(displayName)

    for (let attempt = 1; attempt <= MAX_ASSIGN_ATTEMPTS; attempt++) {
      // Ab dem sechsten Versuch ist die Community offensichtlich voller
      // `david`s — dann eine Zufallszahl statt weiter zu zählen, sonst laufen
      // gleichzeitige Anmeldungen immer wieder in dieselbe Reihenfolge.
      const index = attempt <= 5 ? attempt : 100 + Math.floor(Math.random() * 9900)
      const candidate = handleCandidate(base, index)
      if (!isValidHandle(candidate)) continue

      try {
        const row = await db.create<CommunityHandleRow>(HANDLES_TABLE, {
          userId,
          handle: candidate,
          handleLower: candidate,
          status: 'active',
          changedAt: '',
        }, { ownerUserId: userId })
        return row.handle
      }
      catch (error) {
        // 409 = der eindeutige Index hat gegriffen: Name ist vergeben (auch als
        // FRÜHERER Name eines anderen Menschen). Nächster Kandidat.
        if (hasCode(error, 409)) continue
        throw error
      }
    }
    return null
  }
  catch {
    return null
  }
}

/**
 * `handleLower` → `userId` für eine Liste von Kandidaten.
 *
 * FILTERT DEN STATUS BEWUSST NICHT. Genau hier zahlt sich die Historien-Zeile
 * aus: eine Erwähnung in einem zwei Jahre alten Beitrag trägt den DAMALIGEN
 * Namen, und der zeigt weiterhin auf denselben Menschen. Mit einem
 * `status: 'active'`-Filter wäre jede Erwähnung von vor einer Umbenennung
 * stillschweigend ins Leere gelaufen — und niemandem wäre es aufgefallen,
 * weil die Meldung ja nur ausbleibt.
 *
 * Eine Abfrage für alle Kandidaten (nie eine je Name — eine Beitragsliste hat
 * schnell 25 davon). Gibt im Fehlerfall eine leere Map zurück.
 */
export async function resolveHandleOwners(
  event: H3Event,
  handles: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(handles.map(normalizeHandle).filter(h => h && h.length <= HANDLE_MAX_LENGTH))]
  if (wanted.length === 0) return new Map()

  try {
    const { rows } = await handleDb(event).list<CommunityHandleRow>(HANDLES_TABLE, [
      Query.equal('handleLower', wanted),
      Query.limit(wanted.length),
    ])
    return new Map(rows.map(row => [row.handleLower, row.userId]))
  }
  catch {
    return new Map()
  }
}

/**
 * Welche dieser Kandidaten gibt es in dieser Community wirklich? Das ist die
 * Menge, die der Renderer hervorhebt — alles andere bleibt gewöhnlicher Text.
 */
export async function knownHandles(event: H3Event, handles: string[]): Promise<string[]> {
  return [...(await resolveHandleOwners(event, handles)).keys()]
}

/** Ist dieser Name in dieser Community noch frei? (Aktiv ODER früher belegt.) */
export async function handleIsTaken(event: H3Event, handle: string): Promise<boolean> {
  const value = normalizeHandle(handle)
  if (!value) return true
  return (await resolveHandleOwners(event, [value])).has(value)
}

/**
 * Den Namen wechseln. Die REGELN (Sperrfrist, Zeichensatz, reservierte Namen)
 * prüft die Route — hier steht nur der Schreibvorgang, und der ist die
 * Umsetzung von Davids Entscheidung 3+4:
 *
 *   NEUE Zeile anlegen, ALTE auf 'former' setzen. Die alte wird NICHT gelöscht.
 *
 * Reihenfolge mit Absicht: erst die neue Zeile (sie kann am eindeutigen Index
 * scheitern — dann ist nichts passiert), danach die alte umstellen. Andersherum
 * stünde jemand nach einem Fehlschlag ganz ohne aktiven Namen da.
 *
 * Gibt `null` zurück, wenn der Name inzwischen vergeben ist (409) — die Route
 * macht daraus einen fachlichen Ablehnungsgrund.
 */
export async function changeCommunityHandle(
  event: H3Event,
  userId: string,
  nextHandle: string,
): Promise<CommunityHandleRow | null> {
  const db = handleDb(event)
  const lower = normalizeHandle(nextHandle)
  const previous = await activeHandleRow(event, userId)

  // Derselbe Name wie bisher: nichts tun und die Sperrfrist nicht verbrauchen.
  if (previous && previous.handleLower === lower) return previous

  let created: CommunityHandleRow
  try {
    created = await db.create<CommunityHandleRow>(HANDLES_TABLE, {
      userId,
      handle: nextHandle.trim().replace(/^@+/, ''),
      handleLower: lower,
      status: 'active',
      changedAt: new Date().toISOString(),
    }, { ownerUserId: userId })
  }
  catch (error) {
    if (hasCode(error, 409)) return null
    throw error
  }

  if (previous) {
    // Fail-soft: bliebe das hier stecken, hätte der Mensch zwei aktive Zeilen.
    // Unschön, aber harmlos — beide lösen auf ihn auf, und `activeHandleRow`
    // nimmt die erste. Der Wechsel selbst ist bereits vollzogen und soll nicht
    // an der Aufräumarbeit scheitern.
    await db.update(HANDLES_TABLE, previous.$id, { status: 'former' })
      .catch(() => undefined)
  }

  return created
}

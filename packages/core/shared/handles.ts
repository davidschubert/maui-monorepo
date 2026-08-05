/**
 * HANDLES (@name) — die PUREN Regeln. Eine Quelle für Oberfläche und Server.
 *
 * Davids Entscheidungen vom 2026-08-04, die hier zu Code werden:
 *  1. Ein Handle ist EINDEUTIG JE COMMUNITY, nicht instanzweit. Das ist genau
 *     die Pool-Regel für tenant-RELATIVE Schlüssel (CLAUDE.md): der eindeutige
 *     Index trägt die `communityId`. Zwei Communities dürfen beide ein
 *     `@david` haben — sie sehen einander nicht.
 *  2. Jeder bekommt beim Beitritt einen VORSCHLAG aus seinem Anzeigenamen.
 *     Niemand wird blockiert, niemand muss etwas ausfüllen; ab Tag 1 ist jeder
 *     erwähnbar. Deshalb `suggestHandleBase` + `handleCandidate`.
 *  3. Änderbar, aber BEGRENZT (30 Tage) — `mayChangeHandleAt`.
 *  4. Der ALTE Handle bleibt gesperrt. Umgesetzt NICHT als Sperrliste, sondern
 *     als HISTORIEN-Zeile (`status: 'former'`, siehe types/handle.ts): sie
 *     belegt denselben eindeutigen Index UND löst weiter auf dieselbe Person
 *     auf. Eine reine Sperre hätte alte Erwähnungen ins Leere laufen lassen;
 *     so zeigt `@alter-name` in einem zwei Jahre alten Beitrag weiterhin auf
 *     den Menschen, der damals gemeint war.
 *
 * ── ZEICHENSATZ, UND WARUM ER SO ENG IST ───────────────────────────────────
 * `a–z 0–9 _`, klein geschrieben verglichen, weder am Anfang noch am Ende ein
 * `_`. Der Grund ist nicht Geschmack, sondern die Schreibfläche: `@tiptap/
 * markdown` maskiert beim Speichern hartkodiert `\ ` * _ [ ] ~` in TEXT-Knoten
 * (Messung: docs/plans/COMPOSER-UEDITOR.md). Ein gespeichertes `@erika_muster`
 * kommt beim erneuten Öffnen als `@erika\_muster` zurück.
 * DAS IST HIER UNGEFÄHRLICH und bleibt bewusst erlaubt, weil weder der
 * Renderer noch die server-seitige Auflösung je auf dem ROHEN Markdown
 * arbeiten: beide gehen über `parseMarkdown` (shared/mentions.ts), und dort
 * ist das Escape längst aufgelöst. Wer das ändert und irgendwo doch roh sucht,
 * verliert genau die Handles mit Unterstrich — deshalb steht es hier.
 * Punkte und Bindestriche fehlen absichtlich: `@a.b` und `@a-b` enden mitten
 * im Satzzeichen und machen die Grenze eines Handles zur Auslegungssache.
 */

/** Kurze Handles sind knappes Gut — dieselbe Überlegung wie bei SLUG_MIN. */
export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 24

/** Sperrfrist zwischen zwei Änderungen (Davids Entscheidung 3). */
export const HANDLE_CHANGE_INTERVAL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const HANDLE_CHANGE_INTERVAL_MS = HANDLE_CHANGE_INTERVAL_DAYS * DAY_MS

/**
 * Gestalt-Prüfung. Kein `_` an den Rändern: `@_foo` und `@foo_` lesen sich wie
 * eine angefangene Betonung, und der Markdown-Parser hat für Unterstriche
 * ohnehin eine Flanken-Regel — ein Handle soll nie in ihre Nähe kommen.
 */
const HANDLE_SHAPE_RE = /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/

/**
 * Namen, die niemand für sich beanspruchen darf. Vorbild und Begründung sind
 * RESERVED_SUBDOMAINS (packages/control/schemas/tenant.ts): ein `@support`
 * oder `@admin` in fremder Hand ist eine Falle, die unseren Namen trägt —
 * jemand schreibt „melde dich bei @support", und die Nachricht geht an einen
 * Fremden. Deshalb sind Rollen-, Betreiber- und Hilfe-Wörter gesperrt, in
 * BEIDEN Sprachen (de+en), denn die Communities laufen zweisprachig.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Betreiber und Marke
  'pukalani', 'aloha', 'team', 'staff', 'official', 'operator',
  // Rollen aus der Rollen-Matrix (shared/communityAuthz.ts) und ihre Nachbarn
  'admin', 'admins', 'administrator', 'mod', 'mods', 'moderator', 'moderators',
  'owner', 'editor', 'viewer', 'member', 'members',
  // Hilfe und Anlaufstellen — der Phishing-Kern
  'support', 'help', 'hilfe', 'kontakt', 'contact', 'info', 'service',
  'security', 'sicherheit', 'abuse', 'report', 'melden',
  // Konto und Geld
  'account', 'konto', 'billing', 'payment', 'payments', 'zahlung', 'invoice',
  'login', 'signin', 'signup', 'register', 'password', 'passwort', 'auth',
  // Technische Namen, die wie ein System klingen
  'system', 'root', 'bot', 'null', 'undefined', 'anonymous', 'anonym',
  'everyone', 'here', 'channel', 'all', 'alle', 'api', 'www',
  // Der Löschungs-Platzhalter der Oberfläche
  'deleted', 'geloescht', 'unknown',
])

export type HandleRejection
  = /** Kürzer als HANDLE_MIN_LENGTH. */
  | 'too_short'
  /** Länger als HANDLE_MAX_LENGTH. */
  | 'too_long'
  /** Verbotene Zeichen oder `_` am Rand. */
  | 'charset'
  /** Steht in RESERVED_HANDLES. */
  | 'reserved'

/**
 * Eingabe → Vergleichsform. Nimmt ein führendes `@` und Leerraum weg und
 * schreibt klein. NUR das — die Prüfung ist ein eigener Schritt, damit
 * „ungültig" nie durch stilles Zurechtbiegen verschwindet.
 *
 * Kleinschreibung ist die Vergleichsform, NICHT die Anzeigeform: gespeichert
 * wird zusätzlich die vom Menschen gewählte Schreibweise (`handle`), damit
 * `@DavidSchubert` so erscheint, wie er es wollte, aber mit `@davidschubert`
 * kollidiert (Davids Vorgabe: „Kleinschreibung getrennt speichern").
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

/**
 * Warum dieses Handle NICHT geht — oder `null`, wenn es geht. Ein Grund statt
 * eines `false`, damit die Oberfläche sagen kann, WAS zu ändern ist; die
 * Übersetzung sitzt beim Aufrufer.
 *
 * Geprüft wird IMMER die normalisierte Form: `@David` und `david` sind
 * dieselbe Frage.
 */
export function handleRejection(raw: string): HandleRejection | null {
  const value = normalizeHandle(raw)
  if (value.length < HANDLE_MIN_LENGTH) return 'too_short'
  if (value.length > HANDLE_MAX_LENGTH) return 'too_long'
  if (!HANDLE_SHAPE_RE.test(value)) return 'charset'
  if (RESERVED_HANDLES.has(value)) return 'reserved'
  return null
}

/** Kurzform für die Stellen, die nur ja/nein brauchen. */
export function isValidHandle(raw: string): boolean {
  return handleRejection(raw) === null
}

/**
 * „David Schubert" → `davidschubert`. Der VORSCHLAG, nicht das Ergebnis: er
 * kann kollidieren (dann zählt `handleCandidate` hoch) und er kann leer
 * ausfallen (Namen ohne lateinische Buchstaben) — dann übernimmt der Aufrufer
 * mit `HANDLE_FALLBACK_BASE`.
 *
 * Umlaute werden AUSGESCHRIEBEN, nicht weggeworfen: aus „Jürgen Groß" wird
 * `juergengross` und nicht `jrgengro`. Das ist die deutsche Erwartung, und
 * dieses Produkt ist zuerst deutschsprachig. Alles andere fällt über die
 * Unicode-Zerlegung (NFD) auf seinen Grundbuchstaben zurück (`é` → `e`).
 */
const TRANSLITERATIONS: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'æ': 'ae', 'ø': 'oe', 'å': 'aa',
}

/**
 * Wenn vom Namen nichts Brauchbares übrig bleibt (Namen ohne lateinische
 * Buchstaben, zu kurze Namen).
 *
 * BEWUSST NICHT `member`: das steht in RESERVED_HANDLES, und ein Rückfall auf
 * einen reservierten Namen hätte die Vergabe für genau diese Menschen zum
 * Stillstand gebracht — jeder Kandidat wäre abgelehnt worden. Der Test
 * „liefert IMMER etwas Gültiges" hält diese Falle zu. `user` ist keine Rolle
 * und keine Anlaufstelle, also auch kein Phishing-Köder.
 */
export const HANDLE_FALLBACK_BASE = 'user'

export function suggestHandleBase(displayName: string): string {
  const lowered = displayName.trim().toLowerCase()

  let transliterated = ''
  for (const char of lowered) transliterated += TRANSLITERATIONS[char] ?? char

  const base = transliterated
    .normalize('NFD')
    // Kombinierende Akzente entfernen — der Grundbuchstabe bleibt stehen.
    .replace(/[̀-ͯ]/g, '')
    // Alles, was nicht in den Zeichensatz gehört, fällt weg (auch Leerzeichen:
    // „David Schubert" wird EIN Wort, nicht `david_schubert` — ein Handle mit
    // Unterstrich soll eine bewusste Wahl sein, kein Nebenprodukt).
    .replace(/[^a-z0-9]/g, '')
    .slice(0, HANDLE_MAX_LENGTH)

  return base.length >= HANDLE_MIN_LENGTH ? base : HANDLE_FALLBACK_BASE
}

/**
 * Der n-te Kandidat zu einer Basis: `davidschubert`, `davidschubert2`, `…3`.
 * Die Ziffer verdrängt bei Bedarf Zeichen am Ende, damit HANDLE_MAX_LENGTH
 * eingehalten bleibt — sonst wäre der 2. Kandidat eines maximal langen Namens
 * ungültig und die Vergabe bliebe stecken.
 *
 * `index` ist 1-basiert; 1 ist die nackte Basis.
 */
export function handleCandidate(base: string, index: number): string {
  const clean = normalizeHandle(base) || HANDLE_FALLBACK_BASE
  if (index <= 1) return clean.slice(0, HANDLE_MAX_LENGTH)

  const suffix = String(index)
  const room = HANDLE_MAX_LENGTH - suffix.length
  // Ein Handle darf nicht auf `_` enden — beim Abschneiden kann genau das
  // entstehen, deshalb hier noch einmal wegräumen.
  const stem = clean.slice(0, room).replace(/_+$/, '') || HANDLE_FALLBACK_BASE
  return `${stem}${suffix}`
}

/**
 * Wann darf das nächste Mal geändert werden? `null` heißt „jederzeit" (noch nie
 * geändert). Bewusst ein ZEITPUNKT statt eines booleans: die Oberfläche will
 * das Datum nennen können, und der Server prüft mit derselben Zahl.
 */
export function handleChangeAvailableAt(lastChangedAt: string | null | undefined): number | null {
  if (!lastChangedAt) return null
  const last = Date.parse(lastChangedAt)
  // Ein unlesbares Datum darf niemanden aussperren: kein Datum = keine Sperre.
  if (Number.isNaN(last)) return null
  return last + HANDLE_CHANGE_INTERVAL_MS
}

/** Die Sperrfrist als Regel — nicht als Kommentar (Davids Vorgabe). */
export function mayChangeHandleAt(lastChangedAt: string | null | undefined, now: number = Date.now()): boolean {
  const available = handleChangeAvailableAt(lastChangedAt)
  return available === null || now >= available
}

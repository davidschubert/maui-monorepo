import type { Models } from 'node-appwrite'

/**
 * DAS DATENMODELL DER PRIVATEN NACHRICHTEN (Konzept § 4).
 *
 * Fünf Tabellen, alle mit `communityId`, alle ausschließlich über
 * `tenantDb(event)` angefasst — mit EINER benannten Ausnahme, die im Kopf von
 * `server/utils/messageBlocks.ts` steht. `communityId` gehört BEWUSST NICHT in
 * die TypeScript-Typen der Zeilen: dieselbe Auslassung wie in
 * `packages/posts/shared/types/post.ts` — der Mandant gehört der Datentür, und
 * ein Feld im Typ wäre eine Einladung, ihn selbst zu setzen.
 *
 * ── n:m-FÄHIG, GEBAUT NUR 1:1 (Davids Entscheidung 6, 2026-08-04) ─────────
 * Die Teilnehmer stehen in EINER EIGENEN TABELLE (`conversation_members`), wie
 * es Konzept § 8 als n:m-Form ausdrücklich nennt („Teilnehmer-Tabelle statt
 * zweier Spalten"). Gruppen-Nachrichten (TL2, § 7 Stufe 3) ändern damit eine
 * ZAHL in der Validierung, nicht das Schema — die Beschränkung auf genau zwei
 * steht an genau einer Stelle (`shared/conversations.ts`).
 *
 * ── WARUM EINE TABELLE UND NICHT EINE ARRAY-SPALTE (live erwischt) ───────
 * Der erste Entwurf trug die Teilnehmer als Array-Spalte auf der Konversation.
 * Appwrite 1.9.6 lehnt das beim Migrieren ab: „Creating indexes on array
 * attributes is not currently supported." Ohne Index gäbe es für den
 * Posteingang („welche Konversationen gehören mir?") keine Abfrage, sondern
 * einen vollen Durchlauf — auf einer Tabelle, die mit jeder Community wächst.
 *
 * Der erzwungene Weg ist zugleich der bessere, und das gehört dazugesagt:
 *  - Der UNGELESEN-Zähler ist jetzt ein SKALAR je Mensch und lässt sich damit
 *    atomar hochzählen (`incrementRowColumn`). In der Array-Fassung musste er
 *    gelesen, verändert und zurückgeschrieben werden — zwei gleichzeitige
 *    Nachrichten konnten einen Schritt verlieren.
 *  - „Für mich entfernt" ist ein Schalter je Mensch statt einer Liste, die man
 *    beim Schreiben filtern muss.
 *
 * ── ZWEI ORTE FÜR DIESELBE TATSACHE, UND WARUM DAS IN ORDNUNG IST ───────
 * `conversations.participants` bleibt als Array-Spalte bestehen — sie wird NIE
 * abgefragt, nur GELESEN. Sie ist die Quelle der Row-Permissions beim
 * Schreiben jeder Nachricht; ohne sie kostete jede Nachricht eine zusätzliche
 * Abfrage auf die Mitglieder-Tabelle. Beide entstehen im selben Vorgang und
 * ändern sich in v1 nie wieder (die Teilnehmer einer 1:1-Konversation stehen
 * bei ihrer Eröffnung fest). Dasselbe Verhältnis wie zwischen `participants`
 * und `pairKey`: eine Wahrheit, zwei Formen, eine Schreibstelle.
 */

export const CONVERSATIONS_TABLE = 'conversations'
export const CONVERSATION_MEMBERS_TABLE = 'conversation_members'
export const MESSAGES_TABLE = 'messages'
export const MESSAGE_BLOCKS_TABLE = 'message_blocks'
export const MESSAGE_SETTINGS_TABLE = 'message_settings'

/** Der `targetType`, unter dem eine Nachricht gemeldet wird (moderation-Registry). */
export const MESSAGE_REPORT_TARGET = 'message'

/** Höchstlänge eines Nachrichtentextes. Wie ein Beitrag — es ist dieselbe
 *  Schreibfläche und dasselbe Markdown-Subset. Die Spalte ist MEDIUMTEXT und
 *  damit nicht die Grenze; diese Zahl ist die fachliche. */
export const MAX_MESSAGE_BODY = 10_000

/** Was in der Liste als einzeilige Vorschau steht (Spaltenbreite 200). */
export const MESSAGE_PREVIEW_LENGTH = 160

export interface Conversation extends Models.Row {
  /**
   * Die Teilnehmer (Appwrite-User-$id), SORTIERT. v1 immer genau zwei.
   *
   * NIE ABGEFRAGT (Array-Spalten sind in Appwrite 1.9.6 nicht indizierbar) —
   * gelesen wird sie aus der schon geholten Zeile, um die Row-Permissions
   * einer neuen Nachricht zu bauen. Die ABFRAGBARE Form ist
   * `conversation_members`.
   */
  participants: string[]
  /**
   * Die sortierten Teilnehmer als EIN Schlüssel — er trägt den eindeutigen
   * Index (communityId, pairKey). Ohne ihn entstünden bei zwei gleichzeitigen
   * ersten Nachrichten zwei Konversationen desselben Paares, und ab da läse
   * jeder seine eigene Hälfte.
   */
  pairKey: string
  /** Wer die Konversation eröffnet hat — Grundlage des dritten Rate-Budgets. */
  starterId: string
  /**
   * Hat jemand ANDERES als der Eröffner geschrieben? Genau die Frage des
   * dritten Budgets („offene, unbeantwortete Konversationen"), als Spalte
   * statt als Rechnung über alle Nachrichten.
   */
  answered: boolean
  lastMessageAt: string
  lastMessagePreview: string
}

export interface ConversationMember extends Models.Row {
  conversationId: string
  userId: string
  /** Ungelesene Nachrichten DIESES Menschen — atomar hoch- und auf 0 gesetzt. */
  unread: number
  /**
   * Wie oft dieser Mensch die Konversation schon GEÖFFNET hat.
   *
   * Die Zählmarke des Benachrichtigungs-Schlüssels (§ 4, „Zusammenfassen statt
   * fluten"): solange sie steht, ergibt jede weitere Nachricht denselben
   * `rowId` und damit KEINE zweite Meldung; hat er hingesehen, rückt sie
   * weiter und die nächste Nachricht weckt wieder. Eine eigene Zahl statt
   * „unread war 0" — die Prüfung auf 0 hätte bei zwei gleichzeitigen
   * Nachrichten zweimal zugestimmt, der Idempotenz-Schlüssel kann das nicht.
   */
  readRounds: number
  /** Hat DIESER Mensch den Verlauf für sich entfernt? (Davids Entscheidung 5) */
  closed: boolean
  /**
   * Spiegel von `conversations.lastMessageAt`.
   *
   * DENORMALISIERT MIT GRUND: der Posteingang ist EINE Abfrage („meine
   * Konversationen, neueste zuerst") und braucht die Sortierung auf derselben
   * Zeile wie den Filter. Ohne diese Spalte wären es zwei Abfragen und eine
   * Sortierung im Speicher — mit einer Seitengrenze, die dann nichts mehr
   * garantiert. Geschrieben wird sie im selben Vorgang wie die Konversation.
   */
  lastMessageAt: string
}

export interface PrivateMessage extends Models.Row {
  conversationId: string
  authorId: string
  body: string
  /** Wann der Empfänger sie gelesen hat; '' = ungelesen. */
  readAt: string
  /**
   * DER EINGEFRORENE BELEG (Konzept § 2.2, Davids Entscheidung 2).
   *
   * Kopie des Textes im Moment der ERSTEN Meldung. Sie ist das EINZIGE, was
   * die Moderation je zu sehen bekommt — die Zeile selbst wird von keiner
   * Moderations-Route als `body` gelesen. Löscht oder ändert der Absender
   * danach, bleibt die Meldung belegbar; das ist der ganze Zweck.
   */
  reportedBody: string
  /** Zeitpunkt des Einfrierens; '' = nie gemeldet. Anker der 90-Tage-Frist. */
  reportedAt: string
}

/**
 * Wie weit eine Sperre reicht (Davids Entscheidung 3).
 *
 *  - `community`: nur dort, wo sie ausgesprochen wurde (der Normalfall, folgt
 *    dem Daten-Scope und ist moderations-nah).
 *  - `everywhere`: das Häkchen „auch in meinen anderen Communities". EINE
 *    Zeile, nicht N — warum, steht im Kopf von `server/utils/messageBlocks.ts`.
 */
export const BLOCK_SCOPES = ['community', 'everywhere'] as const
export type BlockScope = (typeof BLOCK_SCOPES)[number]

export interface MessageBlock extends Models.Row {
  /** Wo die Sperre ausgesprochen wurde (auch bei `everywhere` gefüllt). */
  communityId: string
  blockerId: string
  blockedId: string
  scope: BlockScope
}

export interface MessageSettings extends Models.Row {
  /**
   * Der Owner-Schalter (Davids Entscheidung 4: Default AUS). Fehlt die ZEILE,
   * gilt derselbe Vorgabewert — Rückfall zur Laufzeit statt Backfill, Muster
   * `packages/pages/shared/guidelinesFallback.ts`.
   */
  enabled: boolean
}

/* ── Was über die API geht (der Client sieht nie eine rohe Zeile) ─────────── */

export interface ConversationSummary {
  id: string
  /** Das Gegenüber — v1 gibt es genau eines. */
  partnerId: string
  partnerName: string
  partnerHandle: string
  lastMessageAt: string
  lastMessagePreview: string
  unread: number
}

export interface MessageView {
  id: string
  authorId: string
  body: string
  createdAt: string
  readAt: string
  mine: boolean
}

export interface ConversationThread {
  id: string
  partnerId: string
  partnerName: string
  partnerHandle: string
  /** Sperrt eine Sperre diesen Verlauf? (Antworten ist dann zu.) */
  blocked: boolean
  messages: MessageView[]
  total: number
}

/** Was die Moderation zu einer gemeldeten Nachricht sieht — mehr gibt es nicht. */
export interface ReportedMessageView {
  id: string
  conversationId: string
  authorId: string
  authorName: string
  recipientId: string
  recipientName: string
  /** Der EINGEFRORENE Text, nie der aktuelle. */
  body: string
  reportedAt: string
  sentAt: string
  openReports: number
}

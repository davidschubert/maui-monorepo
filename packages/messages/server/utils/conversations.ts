import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  conversationIsAbandoned,
  conversationPairKey,
  counterValue,
  isParticipant,
  isValidParticipantSet,
  memberAfterMessage,
  messagePreview,
  normalizeParticipants,
  otherParticipant,
} from '../../shared/conversations'
import {
  MESSAGE_NOTIFICATION_TYPE,
  messageNotificationFields,
  messageNotificationKey,
  messageNotificationLink,
} from '../../shared/messageNotification'
import {
  CONVERSATIONS_TABLE,
  CONVERSATION_MEMBERS_TABLE,
  MESSAGES_TABLE,
  type Conversation,
  type ConversationMember,
  type PrivateMessage,
} from '../../shared/types/message'

/**
 * KONVERSATIONEN UND NACHRICHTEN — der Datenzugriff (Konzept § 4).
 *
 * ── DIE KLINKE IST 'operator', DER HANDELNDE IST 'member' ────────────────
 * Die Tabellen tragen bewusst keine User-SCHREIBrechte (Migration
 * messages-001) — dasselbe Muster wie `poll_votes`, `event_rsvps`,
 * `enrollments`. Geschrieben wird deshalb mit dem Admin-Client. Der HANDELNDE
 * ist trotzdem ein Mitglied, und das muss dastehen (C1c):
 *
 *  - M13 greift dadurch ohne Zusatzarbeit — eine Nachricht ist INHALT, eine
 *    wegen Zahlungsverzug stillgelegte Community kann keine neuen verschicken,
 *    LESEN bleibt offen (Konzept § 2.7).
 *  - Der A5-Beitritts-Auslöser feuert ebenfalls, und er ist STRUKTURELL ein
 *    No-op: `messages.write` hängt an Vertrauensstufe 1, und wer TL1 hat, ist
 *    seit mindestens zwei Tagen Mitglied. Wer senden darf, IST längst
 *    Mitglied. Genau darauf ist ein Test genagelt
 *    (`tests/trustGate.test.ts`) — würde `messages.write` je bei Stufe 0
 *    stehen, könnte sich ein Fremder durch das Anschreiben EINES Mitglieds das
 *    Lese-Label einer geschlossenen Community verschaffen (Konzept § 3).
 *
 * ── DAS PUBLIKUM EINER ZEILE SIND ZWEI MENSCHEN ─────────────────────────
 * `tenantRowPermissions` kennt drei Publikums-Werte (`members`, `public`,
 * `moderators`) — KEINER passt: ein Mitglieder-Read wäre hier das Gegenteil
 * des Produkts. Genutzt wird der ausdrücklich vorgesehene Sonderweg
 * `TenantCreateOptions.permissions`.
 */

/** Wie viele Nachrichten eine Seite höchstens stempelt/liest. */
const READ_PAGE = 100

/** Admin-Client, aber ein handelnder Mensch (siehe Kopf). */
function messageDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'member' })
}

/**
 * Lesen und AUFRÄUMEN ohne Handelnden.
 *
 * `actor: 'operator'` für die reinen Lesewege ist selbsterklärend. Er gilt
 * ABER AUCH für das Nachführen der Mitglieds-Zeilen und das Löschen: eine
 * Zähler-Zeile ist kein Inhalt (M13) und niemandes Beitritt (A5). Der INHALT —
 * die Nachricht selbst — geht über `messageDb`, und dort hängen beide Regeln.
 * Ohne diese Trennung wäre das Aufräumen eines Verlaufs ein Schreibvorgang,
 * den eine gesperrte Community nicht mehr dürfte.
 */
function readDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/**
 * `read(user:A) · read(user:B)` — mehr nicht.
 *
 * KEIN `update`, KEIN `delete` für die Nutzer: Bearbeiten gibt es in diesem
 * Produkt nicht, und Löschen läuft über die Route (die die Regeln kennt).
 * KEIN Moderations-Label: das ist die Permission-Seite von § 2.2 — die
 * Moderation kommt nicht über die Zeile an den Inhalt.
 */
export function conversationPermissions(participants: readonly string[]): string[] {
  return participants.filter(Boolean).map(id => Permission.read(Role.user(id)))
}

/* ── Finden und Eröffnen ─────────────────────────────────────────────────── */

/** Die Konversation dieses Teilnehmer-Satzes in dieser Community (oder null). */
export async function findConversation(event: H3Event, participants: readonly string[]): Promise<Conversation | null> {
  return readDb(event).find<Conversation>(CONVERSATIONS_TABLE, [
    Query.equal('pairKey', conversationPairKey(participants)),
  ])
}

/** Die Mitglieds-Zeile eines Menschen in einer Konversation (oder null). */
export async function findMember(
  event: H3Event,
  conversationId: string,
  userId: string,
): Promise<ConversationMember | null> {
  return readDb(event).find<ConversationMember>(CONVERSATION_MEMBERS_TABLE, [
    Query.equal('conversationId', conversationId),
    Query.equal('userId', userId),
  ])
}

/** Alle Teilnehmer-Zeilen einer Konversation (v1 genau zwei). */
export async function listMembers(event: H3Event, conversationId: string): Promise<ConversationMember[]> {
  const { rows } = await readDb(event).list<ConversationMember>(CONVERSATION_MEMBERS_TABLE, [
    Query.equal('conversationId', conversationId),
    Query.limit(READ_PAGE),
  ])
  return rows
}

/**
 * Die Konversation holen ODER eröffnen.
 *
 * BLIND SCHREIBEN, 409 LESEN: zwischen „gibt es sie?" und „dann lege ich sie
 * an" passt ein zweiter Request. Der Unique-Index (communityId, pairKey) ist
 * die eigentliche Mechanik, das erneute Suchen danach der Rückweg — dieselbe
 * Bauart wie bei `member_counters` (posts-013).
 *
 * Die Mitglieds-Zeilen entstehen im SELBEN Vorgang und ebenfalls idempotent:
 * ihr eigener Unique-Index fängt einen halb gelaufenen Vorgang ab, den ein
 * zweiter Aufruf zu Ende bringt.
 */
export async function openConversation(
  event: H3Event,
  participants: readonly string[],
  starterId: string,
): Promise<{ conversation: Conversation, created: boolean }> {
  const people = normalizeParticipants(participants)
  if (!isValidParticipantSet(people)) {
    // v1 kennt genau zwei (Davids Entscheidung 6). Die Zahl steht in
    // shared/conversations.ts, nicht hier und nicht in der Migration.
    throw createError({ status: 400, statusText: 'A conversation needs exactly two participants' })
  }

  const existing = await findConversation(event, people)
  if (existing) {
    await ensureMembers(event, existing, people)
    return { conversation: existing, created: false }
  }

  try {
    const conversation = await messageDb(event).create<Conversation>(CONVERSATIONS_TABLE, {
      participants: people,
      pairKey: conversationPairKey(people),
      starterId,
      answered: false,
      lastMessageAt: '',
      lastMessagePreview: '',
    }, { permissions: conversationPermissions(people) })
    await ensureMembers(event, conversation, people)
    return { conversation, created: true }
  }
  catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code !== 409) throw error
    const raced = await findConversation(event, people)
    if (!raced) throw error
    await ensureMembers(event, raced, people)
    return { conversation: raced, created: false }
  }
}

/**
 * Für jeden Teilnehmer eine Zeile — idempotent.
 *
 * KEINE Row-Permissions: die Zeile trägt nur Zähler und einen Schalter, und
 * sie wird ausschließlich server-seitig gelesen. Ohne Leser gibt es auch kein
 * Realtime-Ereignis — der Verlauf läuft über die `messages`-Zeilen nach, nicht
 * über Zähler.
 */
async function ensureMembers(event: H3Event, conversation: Conversation, participants: readonly string[]): Promise<void> {
  const db = readDb(event)
  for (const userId of participants) {
    await db.create(CONVERSATION_MEMBERS_TABLE, {
      conversationId: conversation.$id,
      userId,
      unread: 0,
      readRounds: 0,
      closed: false,
      lastMessageAt: conversation.lastMessageAt ?? '',
    }, { permissions: [] }).catch((error: unknown) => {
      // 409 = die Zeile gibt es schon (zweiter Aufruf, Wettrennen). Alles
      // andere darf nicht still verschwinden.
      if ((error as { code?: unknown } | null)?.code !== 409) throw error
    })
  }
}

/**
 * Die Konversation per Id — und der Beleg, dass der Anfragende dazugehört.
 *
 * 404 statt 403, wie überall: ein 403 würde bestätigen, dass es diese
 * Konversation gibt, und damit fremde Ids verifizierbar machen. Die Datentür
 * hat die Zugehörigkeit zum MANDANTEN schon belegt; hier kommt die
 * Zugehörigkeit zum GESPRÄCH dazu.
 */
export async function requireConversation(event: H3Event, id: string, userId: string): Promise<Conversation> {
  const conversation = await readDb(event).get<Conversation>(CONVERSATIONS_TABLE, id, 'Conversation not found')
  if (!isParticipant(conversation.participants ?? [], userId)) {
    throw createError({ status: 404, statusText: 'Conversation not found' })
  }
  return conversation
}

/* ── Der Posteingang ─────────────────────────────────────────────────────── */

export interface InboxEntry {
  conversation: Conversation
  member: ConversationMember
}

/**
 * Meine Konversationen, neueste zuerst.
 *
 * ZWEI Abfragen, nie N+1: erst meine Mitglieds-Zeilen (gefiltert UND sortiert
 * über denselben Index, deshalb der Spiegel `lastMessageAt` dort), dann die
 * zugehörigen Konversationen in EINEM gebündelten Aufruf.
 *
 * `closed = false` steht im FILTER und nicht in einer Nachbearbeitung: wer den
 * Verlauf für sich entfernt hat, soll ihn nicht sehen — und ein Filter nach
 * dem Blättern würde Seiten unterschiedlicher Länge liefern.
 */
export async function listInbox(event: H3Event, userId: string, limit: number): Promise<InboxEntry[]> {
  const db = readDb(event)
  const { rows: members } = await db.list<ConversationMember>(CONVERSATION_MEMBERS_TABLE, [
    Query.equal('userId', userId),
    Query.equal('closed', false),
    Query.orderDesc('lastMessageAt'),
    Query.limit(limit),
  ])
  if (members.length === 0) return []

  const { rows: conversations } = await db.list<Conversation>(CONVERSATIONS_TABLE, [
    Query.equal('$id', members.map(m => m.conversationId)),
    Query.limit(members.length),
  ])
  const byId = new Map(conversations.map(row => [row.$id, row]))

  return members
    .map(member => ({ member, conversation: byId.get(member.conversationId) }))
    .filter((entry): entry is InboxEntry => Boolean(entry.conversation))
}

/** Wie viele meiner eröffneten Konversationen hat niemand beantwortet? (§ 2.5) */
export async function countUnansweredConversations(event: H3Event, userId: string): Promise<number> {
  return readDb(event).count(CONVERSATIONS_TABLE, [
    Query.equal('starterId', userId),
    Query.equal('answered', false),
  ])
}

/* ── Schreiben ───────────────────────────────────────────────────────────── */

/**
 * Eine Nachricht anhängen: Zeile schreiben, Konversation und Teilnehmer
 * nachführen, Empfänger benachrichtigen.
 *
 * REIHENFOLGE MIT GRUND: erst die Nachricht (das ist der Vorgang, den der
 * Mensch ausgelöst hat), dann die Zähler (Bequemlichkeit), dann die Meldung
 * (best-effort, `notify()` wirft nie). Scheitert Schritt 2, steht die
 * Nachricht trotzdem im Verlauf; scheiterte Schritt 1, gäbe es nichts
 * nachzuführen.
 */
export async function appendMessage(
  event: H3Event,
  conversation: Conversation,
  authorId: string,
  body: string,
): Promise<PrivateMessage> {
  const participants = conversation.participants ?? []
  const db = messageDb(event)

  const message = await db.create<PrivateMessage>(MESSAGES_TABLE, {
    conversationId: conversation.$id,
    authorId,
    body,
    readAt: '',
    reportedBody: '',
    reportedAt: '',
  }, { permissions: conversationPermissions(participants) })

  const now = new Date().toISOString()
  await db.update<Conversation>(CONVERSATIONS_TABLE, conversation.$id, {
    lastMessageAt: now,
    lastMessagePreview: messagePreview(body),
    // „beantwortet" heißt: jemand ANDERES als der Eröffner hat geschrieben.
    // Einmal true bleibt true — das dritte Budget zählt offene Anbahnungen,
    // nicht den aktuellen Gesprächsstand.
    answered: conversation.answered === true || authorId !== conversation.starterId,
  }, 'Conversation not found')

  const members = await listMembers(event, conversation.$id)
  await fanOutToMembers(event, members, authorId, now)
  await notifyRecipients(event, conversation, members, authorId)
  return message
}

/**
 * Die Teilnehmer-Zeilen nachführen.
 *
 * Der Ungelesen-Zähler wird ATOMAR hochgezählt (`increment`) — zwei
 * gleichzeitige Nachrichten verlieren damit keinen Schritt mehr. Genau das
 * war in der ersten, Array-basierten Fassung nicht möglich und ist der Gewinn
 * der eigenen Tabelle.
 *
 * `closed` fällt für ALLE zurück auf false: eine neue Nachricht holt den
 * Verlauf zurück (Davids Entscheidung 5, `memberAfterMessage`).
 */
async function fanOutToMembers(
  event: H3Event,
  members: readonly ConversationMember[],
  authorId: string,
  now: string,
): Promise<void> {
  const db = readDb(event)
  for (const member of members) {
    const reopen = memberAfterMessage(member.closed === true)
    await db.update(CONVERSATION_MEMBERS_TABLE, member.$id, {
      lastMessageAt: now,
      ...(reopen ?? {}),
    }, 'Member not found')
    if (member.userId === authorId) continue
    await db.increment(CONVERSATION_MEMBERS_TABLE, member.$id, 'unread')
  }
}

/**
 * Die Meldung an alle AUSSER dem Absender.
 *
 * ZUSAMMENFASSEN STATT FLUTEN (§ 4): der Idempotenz-Schlüssel enthält die
 * Zählmarke des Empfängers. Solange er nicht hingesehen hat, ergibt jede
 * weitere Nachricht denselben Schlüssel — Appwrite antwortet 409, `notify()`
 * schreibt keine Zeile UND verschickt keine Mail (`created: false`).
 *
 * `scope: 'tenant'` (C15): die Ablage ist die Community, in der das Gespräch
 * läuft. Ein `_account`-Stempel wäre falsch — die Nachricht betrifft nicht den
 * Vertrag. Die Mail-Links folgen derselben Ablage (D5) und zeigen damit auf
 * den Host DIESER Community.
 *
 * DIE MAIL TRÄGT DEN TEXT NICHT (Konzept-Entscheidung): `body` bleibt leer,
 * `title` ist der Absendername.
 */
async function notifyRecipients(
  event: H3Event,
  conversation: Conversation,
  members: readonly ConversationMember[],
  authorId: string,
): Promise<void> {
  const recipients = members.filter(member => member.userId !== authorId)
  if (recipients.length === 0) return

  const names = await resolveUserNames(event, [authorId])
  const fields = messageNotificationFields(names.get(authorId) ?? '')

  for (const recipient of recipients) {
    await notify(event, {
      recipientId: recipient.userId,
      type: MESSAGE_NOTIFICATION_TYPE,
      title: fields.title,
      body: fields.body,
      link: messageNotificationLink(conversation.$id),
      scope: 'tenant',
      senderId: authorId,
      rowId: messageNotificationKey({
        conversationId: conversation.$id,
        recipientId: recipient.userId,
        readRounds: counterValue(recipient.readRounds),
      }),
    })
  }
}

/* ── Lesen ───────────────────────────────────────────────────────────────── */

/**
 * Der Verlauf einer Konversation, älteste zuletzt geladen.
 *
 * `Query.orderDesc('$createdAt')` + Umkehr im Code: geblättert wird von hinten
 * (das Neueste zuerst holen), angezeigt wird von vorn. Ein aufsteigender
 * Abruf müsste beim Blättern jedes Mal von der ersten Nachricht an lesen.
 */
export async function listMessages(
  event: H3Event,
  conversationId: string,
  limit: number,
  offset: number,
): Promise<{ rows: PrivateMessage[], total: number }> {
  const { rows, total } = await readDb(event).list<PrivateMessage>(MESSAGES_TABLE, [
    Query.equal('conversationId', conversationId),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
    Query.offset(offset),
  ])
  return { rows: [...rows].reverse(), total }
}

/**
 * Als gelesen markieren: den Zähler auf 0, die Zählmarke eins weiter, und die
 * fremden ungelesenen Nachrichten stempeln.
 *
 * AUF 0 SETZEN STATT HERUNTERZÄHLEN: das Öffnen bedeutet „alles gesehen", und
 * ein Herunterzählen müsste raten, wie viele es waren.
 *
 * Die Stempel sind auf eine Seite begrenzt, und das ist ehrlich so gemeint:
 * `readAt` ist die Auskunft „hat sie gesehen" für den Verlauf, nicht die
 * Grundlage des Zählers. Wer 500 Nachrichten ungelesen liegen hat, soll durch
 * das Öffnen keine 500 Schreibvorgänge auslösen.
 */
export async function markConversationRead(
  event: H3Event,
  conversation: Conversation,
  userId: string,
): Promise<void> {
  const db = readDb(event)
  const member = await findMember(event, conversation.$id, userId)
  if (!member || counterValue(member.unread) === 0) return

  await db.update(CONVERSATION_MEMBERS_TABLE, member.$id, {
    unread: 0,
    readRounds: counterValue(member.readRounds) + 1,
  }, 'Member not found')

  const now = new Date().toISOString()
  const { rows } = await db.list<PrivateMessage>(MESSAGES_TABLE, [
    Query.equal('conversationId', conversation.$id),
    Query.equal('readAt', ''),
    Query.orderDesc('$createdAt'),
    Query.limit(READ_PAGE),
  ])
  for (const row of rows) {
    if (row.authorId === userId) continue
    // Best-effort: ein fehlgeschlagener Stempel kostet eine Auskunft, nicht
    // den Zähler — der steht schon.
    await db.update(MESSAGES_TABLE, row.$id, { readAt: now }, 'Message not found').catch(() => {})
  }
}

/* ── Entfernen (Davids Entscheidung 5) ───────────────────────────────────── */

/**
 * „Für mich entfernen". Erst wenn ALLE Teilnehmer es getan haben, verschwindet
 * die Zeile wirklich — genau Davids Formulierung „gelöscht wird sie, wenn
 * beide es getan haben".
 *
 * Die NACHRICHTEN gehen dabei mit: sie haben ohne ihre Konversation weder
 * Leser noch Ort. Gelöscht wird in Seiten, damit ein langer Verlauf nicht in
 * einem Request hängen bleibt; ein Abbruch dazwischen lässt Reste, die der
 * nächste Aufruf findet (idempotent).
 */
export async function closeConversationFor(
  event: H3Event,
  conversation: Conversation,
  userId: string,
): Promise<{ deleted: boolean }> {
  const db = readDb(event)
  const members = await listMembers(event, conversation.$id)
  const mine = members.find(member => member.userId === userId)
  if (!mine) throw createError({ status: 404, statusText: 'Conversation not found' })

  await db.update(CONVERSATION_MEMBERS_TABLE, mine.$id, { closed: true }, 'Member not found')

  const flags = members.map(member => (member.$id === mine.$id ? true : member.closed === true))
  if (!conversationIsAbandoned(flags)) return { deleted: false }

  for (let page = 0; page < 40; page++) {
    const { rows } = await db.list<PrivateMessage>(MESSAGES_TABLE, [
      Query.equal('conversationId', conversation.$id),
      Query.limit(READ_PAGE),
    ])
    if (rows.length === 0) break
    for (const row of rows) {
      await db.remove(MESSAGES_TABLE, row.$id, 'Message not found')
    }
  }
  for (const member of members) {
    await db.remove(CONVERSATION_MEMBERS_TABLE, member.$id, 'Member not found').catch(() => {})
  }
  await db.remove(CONVERSATIONS_TABLE, conversation.$id, 'Conversation not found')
  return { deleted: true }
}

/* ── Anzeige-Helfer ──────────────────────────────────────────────────────── */

/** Das Gegenüber einer 1:1-Konversation. */
export function partnerOf(conversation: Conversation, userId: string): string {
  return otherParticipant(conversation.participants ?? [], userId)
}

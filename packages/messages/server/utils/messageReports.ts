import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { moderatorVisibleBody, shouldFreezeSnapshot } from '../../shared/messageReport'
import { NOT_REPORTED_CODE } from '../../shared/messageErrors'
import { otherParticipant } from '../../shared/conversations'
import {
  CONVERSATIONS_TABLE,
  MESSAGES_TABLE,
  MESSAGE_REPORT_TARGET,
  type Conversation,
  type PrivateMessage,
  type ReportedMessageView,
} from '../../shared/types/message'

/**
 * DIE MODERATIONS-SEITE (Konzept § 2.2, Davids Entscheidung 2).
 *
 * ═══ DER GRUNDSATZ ═══════════════════════════════════════════════════════
 * Niemand vom Stab liest proaktiv private Nachrichten. Es gibt keine Ansicht
 * „alle Konversationen dieser Community". Lesbar wird GENAU die Nachricht, die
 * jemand gemeldet hat — und zwar als eingefrorene Kopie aus dem Moment der
 * Meldung.
 *
 * ═══ WARUM DAS EINE ROUTE-GRENZE IST UND KEIN PERMISSION-WALL ════════════
 * Das gehört ausgesprochen, weil es nach weniger klingt, als es ist: die
 * Moderations-Ansichten lesen über die Operator-Klinke der Datentür, und die
 * benutzt den Admin-Client, der Row-Permissions ABSICHTLICH umgeht. Eine
 * Permission, die den Moderator aussperrt, wäre für ihn also gar keine.
 *
 * Der Schutz besteht deshalb aus drei Dingen, die zusammen halten:
 *  1. Es gibt GENAU EINE Route, die den Text einer Nachricht an einen
 *     Moderator ausliefert (`/api/messages/moderation/[id]`), und sie hängt an
 *     dieser Datei.
 *  2. Sie liefert nur, was `openReportsForTarget` als offen gemeldet
 *     bestätigt — sonst 404 mit `not_reported`.
 *  3. Sie liefert nur `reportedBody`, NIE `body`. Auch nicht ersatzweise:
 *     genau dieser Ersatz wäre die Hintertür, durch die eine ungemeldete
 *     Nachricht herauskäme (`moderatorVisibleBody` gibt dafür `null`).
 *
 * Wer eine zweite Lese-Route baut, kann das aufweichen, ohne dass etwas rot
 * wird. Das Netz dagegen ist `packages/messages/scripts/verify-messages.mjs`,
 * das gegen eine laufende Instanz prüft, dass keine ungemeldete Nachricht über
 * eine Moderations-Route herauskommt.
 */

/** Moderation liest als Betreiber — und handelt auch als solcher (M13). */
function moderationDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/* ── Der Beleg (Eskalations-Handler) ─────────────────────────────────────── */

/**
 * Die gemeldete Nachricht EINFRIEREN.
 *
 * Gerufen vom Eskalations-Handler nach JEDER neuen Meldung — geschrieben wird
 * nur bei der ERSTEN. Würde jede Meldung überschreiben, wäre der Beleg genau
 * das nicht: eine zweite Meldung Stunden später, Text inzwischen geändert,
 * machte die erste wertlos.
 *
 * FAIL-SOFT: der Eskalations-Vertrag ist ausdrücklich best-effort, ein
 * Handler-Fehler darf die Meldung selbst nie scheitern lassen. Bleibt der
 * Beleg aus, sieht der Moderator eine Meldung ohne Text — unangenehm, aber
 * ehrlich; eine verworfene Meldung wäre schlimmer.
 */
export async function freezeReportedMessage(event: H3Event, messageId: string): Promise<void> {
  const db = moderationDb(event)
  const message = await db.get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found').catch(() => null)
  if (!message) return

  if (!shouldFreezeSnapshot({ reportedBody: message.reportedBody ?? '', reportedAt: message.reportedAt ?? '' })) return

  await db.update(MESSAGES_TABLE, messageId, {
    reportedBody: message.body ?? '',
    reportedAt: new Date().toISOString(),
  }, 'Message not found').catch((error: unknown) => {
    logEvent('warn', 'messages.freeze_failed', {
      messageId,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

/** Gibt es diese Nachricht im aktuellen Mandanten? (Melde-Registry, fail-closed) */
export async function messageExists(event: H3Event, messageId: string): Promise<boolean> {
  const row = await moderationDb(event)
    .get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found')
    .catch(() => null)
  return !!row
}

/* ── Die Warteschlange ───────────────────────────────────────────────────── */

/**
 * Die gemeldeten Nachrichten dieser Community.
 *
 * Gelistet wird ausschließlich, was EINGEFROREN ist (`reportedAt` gesetzt) —
 * das ist dieselbe Menge wie „wurde gemeldet". Eine Liste über alle
 * Nachrichten mit nachträglichem Filter wäre der Anfang der Ansicht, die
 * dieses Konzept ausschließt.
 */
export async function listReportedMessages(event: H3Event, limit: number): Promise<ReportedMessageView[]> {
  const { rows } = await moderationDb(event).list<PrivateMessage>(MESSAGES_TABLE, [
    Query.notEqual('reportedAt', ''),
    Query.orderDesc('reportedAt'),
    Query.limit(limit),
  ])
  return Promise.all(rows.map(row => toReportedView(event, row)))
}

/**
 * EINE gemeldete Nachricht — die einzige Route, die einen Text ausliefert.
 *
 * Ohne offene Meldung: 404 mit `not_reported`. Nicht 403 — für den Moderator
 * ist eine ungemeldete Nachricht schlicht nicht vorhanden, und ein 403 würde
 * bestätigen, dass es sie gibt.
 */
export async function getReportedMessage(event: H3Event, messageId: string): Promise<ReportedMessageView> {
  const open = await openReportsForTarget(event, MESSAGE_REPORT_TARGET, messageId)
  if (open.length === 0) {
    throw createError({
      status: 404,
      statusText: 'No open report for this message',
      data: { code: NOT_REPORTED_CODE },
    })
  }

  const message = await moderationDb(event).get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found')
  return toReportedView(event, message, open.length)
}

/**
 * Zeile → das, was ein Moderator sieht.
 *
 * `body` kommt aus `moderatorVisibleBody` und ist NIE der lebende Text. Die
 * Beteiligten stehen dabei, weil eine Meldung ohne sie nicht bearbeitbar wäre
 * — mehr Kontext gibt es in v1 ausdrücklich nicht: kein Verlauf, auch nicht
 * „die drei davor". Wer Kontext braucht, fragt den Melder; was der freiwillig
 * beilegt, steht im `note`-Feld der Meldung.
 */
async function toReportedView(
  event: H3Event,
  message: PrivateMessage,
  openReports?: number,
): Promise<ReportedMessageView> {
  const conversation = await moderationDb(event)
    .get<Conversation>(CONVERSATIONS_TABLE, message.conversationId, 'Conversation not found')
    .catch(() => null)

  const participants = conversation?.participants ?? []
  const recipientId = otherParticipant(participants, message.authorId)
  const names = await resolveUserNames(event, [message.authorId, recipientId].filter(Boolean))

  return {
    id: message.$id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    authorName: names.get(message.authorId) ?? '',
    recipientId,
    recipientName: names.get(recipientId) ?? '',
    body: moderatorVisibleBody({
      reportedBody: message.reportedBody ?? '',
      reportedAt: message.reportedAt ?? '',
    }) ?? '',
    reportedAt: message.reportedAt ?? '',
    sentAt: message.$createdAt,
    openReports: openReports ?? 0,
  }
}

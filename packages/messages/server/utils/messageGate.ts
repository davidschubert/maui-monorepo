import type { H3Event } from 'h3'
import {
  DAY_MS,
  MESSAGES_PER_MINUTE,
  MINUTE_MS,
  budgetExceeded,
  budgetKey,
  effectiveOpenerLevel,
  mayOpenAnotherConversation,
  newConversationBudget,
} from '../../shared/messageBudgets'
import {
  MESSAGES_DISABLED_CODE,
  MESSAGE_RATE_CODE,
  RECIPIENT_UNAVAILABLE_CODE,
} from '../../shared/messageErrors'

/**
 * DIE TÜR VOR DER TÜR — alle Schutzregeln an EINER Stelle (Konzept § 2).
 *
 * Jede Schreib-Route ruft genau eine dieser Funktionen. Der Grund ist
 * derselbe, aus dem die Datentür existiert: eine Regel, an die sich fünf
 * Routen erinnern müssen, ist keine Regel. Und der Schutz ist hier nicht die
 * Kür — Davids Rahmensetzung lautet, dass ein Nachrichtenweg ohne ihn gar
 * nicht erst ausgeliefert wird.
 *
 * ── DIE REIHENFOLGE IST ABSICHT ──────────────────────────────────────────
 *  1. Der OWNER-SCHALTER. Läuft das Produkt hier gar nicht, ist alles andere
 *     gegenstandslos — und diese Auskunft darf der Mensch bekommen (es ist
 *     eine Eigenschaft der Community, keine Aussage über ihn).
 *  2. Die SPERRE und die VERTRAUENSSTUFE. Beide enden im GLEICHEN Fehler, und
 *     das ist der ganze Punkt: „nicht wegen der Stufe" hieße „also blockiert".
 *  3. Die BUDGETS zuletzt, weil sie zählen — ein abgewiesener Versuch soll
 *     kein Kontingent verbrauchen.
 */

/**
 * Läuft das Produkt in dieser Community? (Owner-Schalter, § 2.6)
 *
 * 403 mit eigenem Code, nicht 404: hier ist nichts versteckt. Der Mensch soll
 * erfahren, dass diese Community keine privaten Nachrichten anbietet, sonst
 * sucht er den Fehler bei sich. Das PRODUKT-Gate (Tarif) antwortet weiter 404
 * wie eine Datentür — dort geht es um eine Fläche, die es für diesen Plan
 * nicht gibt.
 */
export async function requireMessagesEnabled(event: H3Event): Promise<void> {
  if (await messagesEnabled(event)) return
  throw createError({
    status: 403,
    statusText: 'Private messages are switched off in this community',
    data: { code: MESSAGES_DISABLED_CODE },
  })
}

/**
 * Darf zwischen diesen beiden geschrieben werden? (Sperre, beidseitig, § 2.3)
 *
 * Der Abgewiesene erfährt die TATSACHE, nicht den GRUND — derselbe Code wie
 * bei fehlender Vertrauensstufe und abgeschaltetem Empfang.
 */
export async function assertNotBlocked(event: H3Event, a: string, b: string): Promise<void> {
  if (!(await pairBlocked(event, a, b))) return
  throw createError({
    status: 403,
    statusText: 'This person does not accept messages from you',
    data: { code: RECIPIENT_UNAVAILABLE_CODE },
  })
}

/**
 * Ein Budget zählen und prüfen.
 *
 * Über den geteilten Rate-Limit-Store (Redis mit In-Memory-Rückfall,
 * fail-open). Der Schlüssel trägt Community UND Mensch — die Begründung steht
 * bei `budgetKey`.
 */
async function assertBudget(
  event: H3Event,
  kind: 'open' | 'send',
  userId: string,
  max: number,
  windowMs: number,
): Promise<void> {
  const tenant = useTenant(event)
  // Im Silo/Einzelbetrieb gibt es keinen Mandanten-Wert — dort ist das
  // Projekt die Grenze, und '' ist der Schlüssel-Anteil, den auch die
  // Datentür stempelt.
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}${budgetKey(kind, communityId, userId)}`, windowMs)
  if (!budgetExceeded(state.count, max)) return
  setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
  throw createError({
    status: 429,
    statusText: 'Too many messages',
    data: { code: MESSAGE_RATE_CODE },
  })
}

/**
 * EINE KONVERSATION ERÖFFNEN — die vollständige Prüfung.
 *
 * `messages.write` hängt an Vertrauensstufe 1 (§ 2.4) und wird über
 * `requireCommunityPermission` geprüft wie jedes andere Recht — NICHT über
 * eine `if (trustLevel >= 1)`-Zeile. Das ist Davids Architektur-Entscheidung
 * vom 2026-08-04: EIN Rechtesystem, eine Tür.
 *
 * TL1 verlangt laut `packages/posts/shared/trustLevels.ts` zwei Tage
 * Mitgliedschaft, einen eigenen Inhalt und eine vergebene Zustimmung. Ein
 * frisch angelegtes Wegwerf-Konto kann also gar nicht eröffnen — und ein
 * Spammer muss zwei Tage warten und sichtbar mitmachen. Sichtbar heißt:
 * moderierbar, BEVOR er den privaten Kanal erreicht. Das ist der stärkste
 * Spam-Schutz in diesem Produkt, weil er nichts erkennen muss.
 */
export async function requireMayOpenConversation(
  event: H3Event,
  senderId: string,
  recipientId: string,
): Promise<void> {
  await requireMessagesEnabled(event)

  // Wirft 403, wenn weder eine Rolle noch die Stufe das Recht gibt. Der Fehler
  // wird hier ABGEFANGEN und in denselben Code übersetzt wie die Sperre: der
  // Absender soll aus der Ablehnung nicht ablesen können, WARUM.
  //
  // `via` wird gebraucht, nicht nur geduldet: es sagt, ob das Recht aus der
  // STUFE oder aus einer ERNENNUNG kommt — und davon hängt das Budget ab
  // (`effectiveOpenerLevel`, Befund aus dem Live-Beweis).
  const via = await requireCommunityPermission(event, 'messages.write')
    .then(decision => decision.via)
    .catch((error: unknown) => {
      // 401 bleibt 401: „nicht angemeldet" ist keine Aussage über eine
      // Beziehung zwischen zwei Menschen und darf ehrlich durchgereicht
      // werden. Alles andere wird zum EINEN Code (§ 2.3).
      const status = error as { statusCode?: number, status?: number } | null
      if (status?.statusCode === 401 || status?.status === 401) throw error
      throw createError({
        status: 403,
        statusText: 'This person does not accept messages from you',
        data: { code: RECIPIENT_UNAVAILABLE_CODE },
      })
    })

  await assertNotBlocked(event, senderId, recipientId)

  /**
   * DIE SCHÄRFSTE UND BILLIGSTE BREMSE (§ 2.5): wer fünf Menschen
   * angeschrieben hat und von keinem eine Antwort bekam, kann keinen sechsten
   * anschreiben. Ein Massenversand endet damit nach fünf Empfängern —
   * unabhängig davon, wie geduldig er ist.
   *
   * Sie steht VOR dem Tages-Budget, weil sie ohne Zähler auskommt (eine
   * Abfrage auf die Konversations-Tabelle) und weil ein Abgewiesener kein
   * Tages-Kontingent verbrauchen soll.
   */
  const unanswered = await countUnansweredConversations(event, senderId)
  if (!mayOpenAnotherConversation(unanswered)) {
    throw createError({
      status: 429,
      statusText: 'Too many unanswered conversations',
      data: { code: MESSAGE_RATE_CODE },
    })
  }

  const trustLevel = await resolveTrustLevel(event)
  const budget = newConversationBudget(effectiveOpenerLevel(trustLevel, via))
  await assertBudget(event, 'open', senderId, budget, DAY_MS)
}

/**
 * IN EINER BESTEHENDEN KONVERSATION ANTWORTEN — die kürzere Prüfung.
 *
 * KEIN TL-Gate, und das ist Konzept § 2.4, Folge 1: „EMPFANGEN geht ab Stufe
 * 0 … wer angeschrieben wurde, darf zurückschreiben. Gesperrt ist nur das
 * ERÖFFNEN." Sonst könnte man niemandem antworten, der einen zuerst
 * angeschrieben hat — und der Kanal wäre eine Einbahnstraße für genau die,
 * die er schützen soll.
 *
 * Die SPERRE gilt hier sehr wohl, und beidseitig: sie ist der Weg, ein
 * begonnenes Gespräch zu beenden.
 */
export async function requireMayReply(
  event: H3Event,
  senderId: string,
  recipientId: string,
): Promise<void> {
  await requireMessagesEnabled(event)
  await assertNotBlocked(event, senderId, recipientId)
  await assertBudget(event, 'send', senderId, MESSAGES_PER_MINUTE, MINUTE_MS)
}

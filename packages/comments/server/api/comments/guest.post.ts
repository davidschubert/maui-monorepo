import { createHash } from 'node:crypto'
import { communityContentIsPublic } from '../../../../core/shared/communityAudience'
import { guestCommentSchema } from '../../../schemas/comment'
import { guestCommentsAllowed } from '../../../shared/guestComments'
import { COMMENTS_TABLE, GUEST_AUTHORS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'

/**
 * Gast-Kommentar (Embed E4, Task 20): Kommentieren OHNE Account (Name+E-Mail,
 * keine Verifikation — bewusste Produktentscheidung). Getrennter Pfad, weil
 * der reguläre POST /api/comments eine Session verlangt.
 *
 * Sicherheits-Leitplanken (unauth. Write in die geteilte, gepoolte Tabelle):
 *  - Dreifach-Gate: pukalani.comments.embed.enabled UND .guests müssen an sein
 *    UND die Community muss öffentlich sein (F4, guestCommentsAllowed) — sonst
 *    404 (keine Existenz-Preisgabe). Core-Default: beide Schalter aus.
 *  - Rate-Limit: eigener enger Bucket `comments:guest` (rate-limit.ts).
 *  - Quota: zählt gegen das Tenant-Budget (assertPoolWriteQuota).
 *  - Kein operatorTarget (interne Threads bleiben Operatoren vorbehalten).
 *  - Die E-Mail steht NIE auf der read(any)-Kommentar-Row — nur der Anzeigename.
 *    Kontaktdaten (Name/E-Mail/IP-Hash) landen in guest_authors (operator-read).
 *  - Gast-Rows haben authorId '' und KEINE update/delete-Permission (kein
 *    Session-Prinzipal, der sie je nutzen könnte).
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as {
    pukalani?: { comments?: { embed?: { enabled?: boolean, guests?: boolean }, operatorTargets?: string[] } }
  }
  const embed = appConfig.pukalani?.comments?.embed
  // Die COMMUNITY entscheidet mit (F4): in einer Community mit Publikum
  // 'members' trägt jede neue Zeile `read(label:<communityId>)` — ein Gast
  // schriebe in ein Loch, das er nie wieder öffnen kann. Der Grund und die
  // verworfenen Alternativen stehen bei guestCommentsAllowed().
  if (!guestCommentsAllowed({
    embedEnabled: !!embed?.enabled,
    guestsEnabled: !!embed?.guests,
    communityIsPublic: communityContentIsPublic(useTenant(event)),
  })) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  await assertCommentsWritable(event)
  await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })

  const body = await readValidatedBody(event, guestCommentSchema.parse)

  // Interne/Operator-Threads sind für Gäste tabu.
  const operatorTarget = (appConfig.pukalani?.comments?.operatorTargets ?? []).includes(body.targetType)
  if (operatorTarget) {
    throw createError({ status: 403, statusText: 'Guests cannot comment on this target' })
  }

  /**
   * Gast-Schreibweg: es gibt keine Sitzung, also Service-Credentials — und
   * damit ist die Tür hier die EINZIGE Mandantengrenze.
   *
   * WER HANDELT: `actor: 'guest'` (Audit-Befund 2026-08-01). Die Klinke sagt
   * nur, dass niemand da ist, dessen Sitzung man benutzen könnte; gehandelt hat
   * ein Mensch von außen. Das entscheidet hier ZWEI Dinge in verschiedene
   * Richtungen: ein Gast-Kommentar ist INHALT und fällt deshalb unter die
   * Sperre einer zahlungssäumigen Community (M13) — vorher lief er still daran
   * vorbei —, aber er macht niemanden zum MITGLIED (A5): ein Gast hat kein
   * Konto, dem eine Mitgliedschaft gehören könnte. Genau diese beiden Antworten
   * ließen sich mit einer einzigen Angabe nicht geben.
   */
  const db = tenantDb(event, { as: 'operator', actor: 'guest' })

  // Antwort: Parent laden → rootId/depth/maxDepth wie im regulären Pfad.
  let parent: Comment | null = null
  let rootId: string | null = null
  let depth = 0
  if (body.parentId) {
    parent = await db.get<Comment>(COMMENTS_TABLE, body.parentId, 'Parent comment not found')
    // Nur innerhalb desselben Targets antworten — kein Cross-Thread-Einschmuggeln.
    if (parent.targetId !== body.targetId || parent.targetType !== body.targetType) {
      throw createError({ status: 422, statusText: 'Parent belongs to a different thread' })
    }
    rootId = parent.rootId ?? parent.$id
    depth = parent.depth + 1
    if (depth > MAX_COMMENT_DEPTH) {
      throw createError({ status: 422, statusText: 'Maximum reply depth reached' })
    }
  }

  const row = await db.create<Comment>(COMMENTS_TABLE, {
      targetId: body.targetId,
      targetType: body.targetType,
      content: body.content,
      parentId: body.parentId ?? null,
      targetUrl: body.targetUrl ?? null,
      rootId,
      depth,
      editedAt: null,
      authorId: '',
      authorName: body.guestName,
      authorKind: 'guest',
      upvotes: 0,
      downvotes: 0,
      score: 0,
    status: 'active',
  }, {
    // Nur lesbar (Gast-Realtime wie bei Nutzer-Rows). KEINE update/delete-
    // Permission — es gibt keinen Prinzipal, der sie je einlösen könnte.
    //
    // C18/F4: `withPublishedRead` liefert hier IMMER `read(any)` — auf einer
    // geschlossenen Community wäre es `read(label:<communityId>)`, aber dort
    // kommt der Request gar nicht mehr an (das Gate oben, F4). Genau deshalb
    // steht die Sichtbarkeits-Frage vorn und nicht hier: eine Sonderbehandlung
    // beim Stempeln hieße, eine mitglieder-interne Zeile öffentlich zu machen.
    permissions: withPublishedRead([], event),
  }).catch((error) => {
    throw toH3Error(error, 'Could not create comment')
  })

  // Kontaktdaten getrennt ablegen (operator-read). Best-effort: schlägt das
  // fehl, bleibt der Kommentar bestehen — aber ohne moderierbare Kontaktspur.
  // Die Zeile verfällt nach 90 Tagen von selbst (guestAuthorPrune.ts): ein Gast
  // hat keine userId, an der die GDPR-Löschung ansetzen könnte.
  const ipHash = createHash('sha256').update(getRequestIP(event, { xForwardedFor: true }) ?? '').digest('hex')
  await db.create(GUEST_AUTHORS_TABLE, {
    commentId: row.$id, name: body.guestName, email: body.guestEmail, ipHash,
  }, { permissions: [] }).catch((error) => {
    logEvent('error', 'guest_author_persist_failed', { commentId: row.$id, error: String(error) })
  })

  const snippet = body.content.length > 140 ? `${body.content.slice(0, 140)}…` : body.content
  const link = (body.targetUrl ?? parent?.targetUrl) ?? '/'

  // Antwort auf einen echten Nutzer → benachrichtigen (Gäste haben keine
  // userId, senderId bleibt leer). Gast-Eltern können nicht benachrichtigt
  // werden (kein Konto) — kein Mail-Relay-Missbrauch über fremde Adressen.
  if (parent && parent.authorId && parent.authorKind !== 'guest') {
    // scope 'tenant' (C15): gehört in die Community des Threads.
    await notify(event, { recipientId: parent.authorId, type: 'reply', title: body.guestName, body: snippet, link, scope: 'tenant' })
  }

  setResponseStatus(event, 201)
  return row
})

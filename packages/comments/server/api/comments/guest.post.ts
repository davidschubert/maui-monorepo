import { createHash } from 'node:crypto'
import { ID, Permission, Role } from 'node-appwrite'
import { guestCommentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'

/**
 * Gast-Kommentar (Embed E4, Task 20): Kommentieren OHNE Account (Name+E-Mail,
 * keine Verifikation — bewusste Produktentscheidung). Getrennter Pfad, weil
 * der reguläre POST /api/comments eine Session verlangt.
 *
 * Sicherheits-Leitplanken (unauth. Write in die geteilte, gepoolte Tabelle):
 *  - Doppel-Gate: maui.comments.embed.enabled UND .guests müssen an sein,
 *    sonst 404 (keine Existenz-Preisgabe). Core-Default: beide aus.
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
    maui?: { comments?: { embed?: { enabled?: boolean, guests?: boolean }, operatorTargets?: string[] } }
  }
  const embed = appConfig.maui?.comments?.embed
  if (!embed?.enabled || !embed?.guests) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  await assertCommentsWritable(event)
  await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })

  const body = await readValidatedBody(event, guestCommentSchema.parse)

  // Interne/Operator-Threads sind für Gäste tabu.
  const operatorTarget = (appConfig.maui?.comments?.operatorTargets ?? []).includes(body.targetType)
  if (operatorTarget) {
    throw createError({ status: 403, statusText: 'Guests cannot comment on this target' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  // Antwort: Parent laden → rootId/depth/maxDepth wie im regulären Pfad.
  let parent: Comment | null = null
  let rootId: string | null = null
  let depth = 0
  if (body.parentId) {
    parent = await tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: body.parentId }).catch(() => null)
    if (!parent) {
      throw createError({ status: 404, statusText: 'Parent comment not found' })
    }
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

  const row = await tablesDB.createRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: ID.unique(),
    data: scopeRow(event, {
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
    }),
    // Nur lesbar (Gast-Realtime wie bei Nutzer-Rows). KEINE update/delete-
    // Permission — es gibt keinen Prinzipal, der sie je einlösen könnte.
    permissions: [Permission.read(Role.any())],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create comment')
  })

  // Kontaktdaten getrennt ablegen (operator-read). Best-effort: schlägt das
  // fehl, bleibt der Kommentar bestehen — aber ohne moderierbare Kontaktspur.
  const ipHash = createHash('sha256').update(getRequestIP(event, { xForwardedFor: true }) ?? '').digest('hex')
  await tablesDB.createRow({
    databaseId,
    tableId: 'guest_authors',
    rowId: ID.unique(),
    data: scopeRow(event, { commentId: row.$id, name: body.guestName, email: body.guestEmail, ipHash }),
    permissions: [],
  }).catch((error) => {
    logEvent('error', 'guest_author_persist_failed', { commentId: row.$id, error: String(error) })
  })

  const snippet = body.content.length > 140 ? `${body.content.slice(0, 140)}…` : body.content
  const link = (body.targetUrl ?? parent?.targetUrl) ?? '/'

  // Antwort auf einen echten Nutzer → benachrichtigen (Gäste haben keine
  // userId, senderId bleibt leer). Gast-Eltern können nicht benachrichtigt
  // werden (kein Konto) — kein Mail-Relay-Missbrauch über fremde Adressen.
  if (parent && parent.authorId && parent.authorKind !== 'guest') {
    await notify(event, { recipientId: parent.authorId, type: 'reply', title: body.guestName, body: snippet, link })
  }

  setResponseStatus(event, 201)
  return row
})

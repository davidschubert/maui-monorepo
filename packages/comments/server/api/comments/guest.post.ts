import { communityContentIsPublic } from '../../../../core/shared/communityAudience'
import { guestCommentSchema } from '../../../schemas/comment'
import { guestCommentsAllowed } from '../../../shared/guestComments'
import { COMMENTS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'

/**
 * Gast-Kommentar (Embed E4, Task 20): Kommentieren OHNE Account (nur ein frei
 * gewählter Anzeigename, keine Verifikation — bewusste Produktentscheidung).
 * Getrennter Pfad, weil der reguläre POST /api/comments eine Session verlangt.
 *
 * KEINE KONTAKTDATEN MEHR (F18, Davids Entscheidung 2026-08-02): bis hierher
 * legte diese Route zusätzlich Name, E-Mail und IP-Hash in `guest_authors` ab.
 * Diese Tabelle hatte im ganzen Repo KEINE Lese-Stelle — keine Moderations-
 * Ansicht, kein GDPR-Export, kein Skript; nur der Verfalls-Sweep, der sie
 * wieder löscht. Damit wurden personenbezogene Daten erhoben, ohne je genutzt zu
 * werden, und das ist unter DSGVO nicht die weiche, sondern die schlechteste
 * Variante. Die ehrliche Antwort auf „wir kommen an die Daten nicht heran" ist
 * deshalb, sie nicht zu erheben — nicht, nachträglich eine Lese-Stelle zu bauen.
 * Der ANZEIGENAME bleibt: er steht ohnehin öffentlich auf der Kommentar-Row und
 * ist keine Kontaktspur.
 *
 * Sicherheits-Leitplanken (unauth. Write in die geteilte, gepoolte Tabelle):
 *  - Dreifach-Gate: pukalani.comments.embed.enabled UND .guests müssen an sein
 *    UND die Community muss öffentlich sein (F4, guestCommentsAllowed) — sonst
 *    404 (keine Existenz-Preisgabe). Core-Default: beide Schalter aus.
 *  - Rate-Limit: eigener enger Bucket `comments:guest` (rate-limit.ts). Er
 *    arbeitet weiter mit der Client-IP — sie wird dort NICHT gespeichert,
 *    sondern nur für die Zählung im Redis-Fenster benutzt.
 *  - Quota: zählt gegen das Tenant-Budget (assertPoolWriteQuota).
 *  - Kein operatorTarget (interne Threads bleiben Operatoren vorbehalten).
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

  // HIER STAND DER SCHREIBVORGANG IN `guest_authors` (F18). Ersatzlos gefallen:
  // ein zweiter Datensatz mit Name, E-Mail und IP-Hash, den niemand je gelesen
  // hat. Was von ihm gebraucht wurde — der Anzeigename — steht eine Zeile
  // weiter oben auf der Kommentar-Row selbst.

  /**
   * Aktivität nachziehen wie im regulären Pfad (F1 Stufe 2). AUCH FÜR GÄSTE,
   * und das ist die Entscheidung dieser Zeile: eine Antwort ist eine Antwort —
   * wer sie geschrieben hat, ändert nichts daran, dass an diesem Thema gerade
   * etwas los ist. (Der Handler dahinter schreibt als `actor: 'operator'`,
   * ein Gast wird davon also weiterhin nicht zum Mitglied, A5.)
   */
  await notifyContentActivity(event, body.targetType, body.targetId, row.$createdAt)

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

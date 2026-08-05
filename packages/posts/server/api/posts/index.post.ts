import { Permission, Role } from 'node-appwrite'
import { postSchema } from '../../../schemas/post'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Post/Poll/Frage erstellen — member-led: JEDER eingeloggte User (Plan P5).
 * Schutz: Rate-Limit (Core-Middleware, Bucket posts:create), Zod-Limits,
 * Wartungsmodus-Gate. Mit scheduledAt → status 'scheduled' (nur der Autor
 * sieht die Row — kein read(any) bis zum Publish).
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  // Pool-Quota (No-Op, bis der Plan-Katalog posts-Limits trägt — der Hook
  // steht, damit die Zahlen nur noch Konfiguration sind, kein Code)
  await assertPoolWriteQuota(event, { kind: 'posts', tableId: POSTS_TABLE })

  const body = await readValidatedBody(event, postSchema.parse)
  /**
   * F1: die gewählte Kategorie VOR dem Anlegen prüfen (existiert, gehört
   * diesem Mandanten, ist aktiv). Bewusst hier und nicht im Zod-Schema — ein
   * Schema kann nicht in die Datenbank sehen.
   *
   * WER HANDELT bleibt unangetastet: das Anlegen eines Themas ist INHALT. Es
   * unterliegt weiter der Zahlungssperre (M13) und macht weiter zum Mitglied
   * (A5) — die Kategorie ändert daran nichts, sie ist nur ein Feld mehr.
   */
  // Datentür (member): stempelt tenantId; Session-Client wie bisher.
  const db = tenantDb(event)
  const categoryId = await resolveCategoryId(db, body.categoryId)

  const scheduled = !!body.scheduledAt
  const now = new Date().toISOString()

  const row = await db.create<CommunityPost>(POSTS_TABLE, {
    type: body.type,
    title: body.title || null,
    body: body.body,
    authorId: user.$id,
    authorName: user.name,
    status: scheduled ? 'scheduled' : 'published',
    scheduledAt: body.scheduledAt ?? null,
    publishedAt: scheduled ? null : now,
    // F1 Stufe 2: die Veröffentlichung IST die erste Aktivität. Ein geplanter
    // Beitrag bekommt sie bewusst nicht — er ist noch nicht da, und ein
    // Zeitstempel hier würde ihn in der Sortierung „Neueste" vordrängeln,
    // bevor ihn jemand sehen darf. publishDuePosts trägt ihn beim Fälligwerden
    // nach.
    lastActivityAt: scheduled ? null : now,
    pollOptions: body.type === 'poll' ? JSON.stringify(body.pollOptions) : null,
    pollEndsAt: body.type === 'poll' ? (body.pollEndsAt ?? null) : null,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    categoryId,
    /**
     * F1 Stufe 3: die drei Zustände starten leer, und zwar AUSDRÜCKLICH statt
     * über den Spalten-Default. Der Typ verlangt sie (posts-011), damit genau
     * diese Zeile hier steht — wer künftig einen weiteren Anlegeweg baut, muss
     * sich entscheiden, statt stillschweigend etwas anderes zu bekommen.
     * Es gibt keinen Weg, ein Thema angeheftet oder geschlossen zu ERÖFFNEN:
     * beides ist Moderation und läuft über state.patch.
     */
    pinned: false,
    closed: false,
    solved: false,
    // F1: ein frischer Beitrag ist nie bearbeitet. Ausdrücklich statt über den
    // Spalten-Default, aus demselben Grund wie die drei Zustände darüber.
    editedAt: null,
  }, {
    // Eigene Permissions statt des Standard-Publikums: published-Posts sind
    // VERÖFFENTLICHT wie Kommentare (Community-Feed); hidden/deleted entziehen
    // das wieder. scheduled: nur der Autor liest — Publish-on-read setzt die
    // Veröffentlichungs-Permission beim Fälligwerden.
    //
    // C18: `withPublishedRead([], event)` statt einer festen read(any)-Zeile —
    // auf einer geschlossenen Community entsteht `read(label:<communityId>)`.
    permissions: [
      ...(scheduled ? [Permission.read(Role.user(user.$id))] : withPublishedRead([], event)),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create post')
  })

  if (!scheduled) {
    /**
     * MITSCHREIBENDER ZÄHLER (F1): ein eigenständiger Beitrag ist da.
     *
     * NUR VERÖFFENTLICHTES zählt, deshalb steht die Meldung in diesem Zweig:
     * ein geplanter Beitrag ist noch nicht in der Welt. Nachgezählt wird er
     * beim Fälligwerden (`publishDuePosts`) — dieselbe Stelle, die auch
     * `lastActivityAt` nachträgt.
     *
     * ALLE Beiträge, mit und ohne Kategorie: „Thema eröffnet" meint die FORM
     * (etwas Eigenständiges gegen eine Antwort), nicht den Ort. Genau so
     * unterscheidet der Zähl-Vertrag `likedTopics` von `likedReplies`.
     */
    await recordUserCounterEvents(event, [{ userId: user.$id, kind: 'topicsCreated', delta: 1 }])

    // Activity-Feed + Meilenstein (Core-Verträge, best-effort)
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'post.published',
      objectType: 'post',
      objectId: row.$id,
      link: '/feed',
      metadata: { snippet: row.title || row.body.slice(0, 140) },
    })
    // Gescopt gezählt: der Meilenstein gehört DIESER Community, nicht dem
    // Pool (dieselbe Falle wie beim 1000-Kommentare-Meilenstein).
    const total = await db.count(POSTS_TABLE).catch(() => 0)
    await maybeRecordMilestone(event, { type: 'milestone.posts', count: total, link: '/feed' })
  }

  setResponseStatus(event, 201)
  const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
  return { ...row, authorAvatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined }
})

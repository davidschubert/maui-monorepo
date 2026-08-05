import { Query } from 'node-appwrite'
import { decideCommunityAccess } from '../../../../core/shared/communityAccess'
import { postEditSchema } from '../../../schemas/post'
import { decidePostAuthorAction } from '../../../shared/postAuthorPolicy'
import { postContentEdited } from '../../../shared/postEdit'
import { mayEditPost, mayEditPostFields, type PostEditActor, type PostEditField } from '../../../shared/postEditRights'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Titel/Body/Kategorie bearbeiten — nur published/scheduled. Polls sind nach
 * der ersten FREMDEN Stimme eingefroren (Plan §4): die Frage unter bereits
 * abgegebenen Stimmen zu ändern wäre Manipulations-Fläche.
 *
 * ── SEIT F1 TEILPAKET 3 NICHT MEHR NUR DER AUTOR ──────────────────────────
 * Bis hierher stand hier „nur der Autor", und das war eine echte Lücke: ein
 * falsch einsortiertes oder unglücklich betiteltes Thema konnte NIEMAND
 * korrigieren, auch kein Moderator. Davids v1-Rechte geben das jetzt zwei
 * Stufen, und zwar feldweise:
 *
 *   `posts.curate` (Stufe 3, Moderator+) → Titel und Einordnung, die HÜLLE.
 *   `posts.revise` (Stufe 4, Admin+)     → zusätzlich der TEXT.
 *
 * Geprüft wird nur, was sich TATSÄCHLICH ändert — das Formular schickt Titel
 * und Text bei jedem Speichern mit, und ein Kurator, der bloß die Kategorie
 * wechselt, darf daran nicht scheitern. Die Regel dafür ist pur und getestet
 * (`shared/postEditRights.ts`), die Autor-Regel (`postAuthorPolicy.ts`) bleibt
 * daneben unverändert: Status und Poll-Sperre gelten für JEDEN, der hier
 * tippt.
 *
 * Diese Route bleibt die AUTORITÄT: sie übersetzt das Urteil in die
 * HTTP-Antwort und zählt als Einzige die fremden Stimmen.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Wartungsmodus friert ALLE Schreibvorgänge ein, nicht nur das Anlegen —
  // Muster commentPolicy.assertNotMaintenance: dort steht auch das Bearbeiten
  // und Löschen EIGENER Inhalte still. Sonst ist der Schalter nur halb wirksam.
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const input = await readValidatedBody(event, postEditSchema.parse)
  // Datentür (member): Session-Client — die Row-Security des Autors bleibt
  // die erste Grenze, die Tür belegt zusätzlich die Zugehörigkeit.
  const db = tenantDb(event)

  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')

  const isAuthor = row.authorId === user.$id

  /**
   * WER IST DAS HIER? — die Stufen-Rechte werden NUR gefragt, wenn es nicht der
   * Autor ist. Für ihn ändert sich nichts (er darf alles, wie immer), und die
   * beiden Abfragen — Community-Rolle und Vertrauensstufe — kosten dann auch
   * nichts. Das ist der Normalfall dieser Route.
   */
  const actor: PostEditActor = { isAuthor, canCurate: false, canRevise: false }
  let staff = false
  if (!isAuthor) {
    const tenantScoped = !!event.context.tenant
    const role = tenantScoped ? await resolveCommunityRole(event) : null
    const labels = user.labels ?? []
    const trustLevel = await resolveTrustLevel(event)
    // PURE Frage statt `requireCommunityPermission`, aus demselben Grund wie in
    // der Zustands-Route: der Wächter WIRFT, und hier gibt es zwei Rechte, von
    // denen eines reichen kann. Ein try/catch um ihn würde zudem den
    // Break-Glass-Vermerk verschlucken oder Log-Rauschen erzeugen.
    actor.canCurate = decideCommunityAccess({ capability: 'posts.curate', labels, tenantScoped, role, trustLevel }).allowed
    actor.canRevise = decideCommunityAccess({ capability: 'posts.revise', labels, tenantScoped, role, trustLevel }).allowed
    // Ist er STAB? Daran hängt nur der `actor` an der Schreib-Tür (s. unten) —
    // nicht, ob er darf.
    staff = decideCommunityAccess({ capability: 'posts.moderate', labels, tenantScoped, role }).allowed
  }

  // 403 vor 409, unverändert: ein Unbefugter erfährt nicht, in welchem Zustand
  // die Zeile ist. `mayEditPost` fragt „irgendein Feld" — WELCHE, entscheidet
  // sich weiter unten an dem, was sich wirklich ändert.
  if (!mayEditPost(actor)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  /**
   * DER ZUSTAND DES BEITRAGS GILT FÜR ALLE, DIE HIER TIPPEN.
   *
   * Gefragt wird deshalb aus der Sicht des VERFASSERS (`row.authorId` statt
   * `user.$id`): „dürfte er selbst gerade noch?" Ein Kurator soll einen
   * ausgeblendeten Beitrag so wenig anfassen wie sein Verfasser, und die Frage
   * einer laufenden Umfrage bleibt eingefroren, egal wer sie ändern will — die
   * Manipulations-Fläche wird nicht kleiner, wenn ein anderer sie öffnet.
   *
   * Erste Frage OHNE Poll-Wissen: `hasForeignPollVotes: false` heißt hier
   * „noch nicht gezählt". Die Zählung ist eine eigene Abfrage und lohnt sich
   * nur, wenn der Status ohnehin passt — die Reihenfolge der Fehler (403 vor
   * 409) bleibt damit exakt die alte.
   */
  const contentGate = decidePostAuthorAction(
    { authorId: row.authorId, status: row.status, type: row.type, hasForeignPollVotes: false },
    row.authorId,
  )
  if (contentGate.reason === 'not_editable') {
    throw createError({ status: 409, statusText: 'Post is not editable' })
  }

  if (row.type === 'poll') {
    /**
     * Operator: fremde Vote-Rows zählen (tragen keine breite Read-Permission).
     *
     * „Fremd" heißt weiterhin „nicht vom VERFASSER" und ausdrücklich nicht
     * „nicht vom Bearbeitenden": die Sperre schützt die Stimmen der anderen vor
     * einer nachträglich geänderten Frage. Bei einem Kurator wäre `user.$id`
     * die falsche Bezugsgröße — seine eigene Stimme zählte dann nicht mit, und
     * die einzige Stimme eines Beitrags könnte ausgerechnet seine sein.
     */
    const foreign = await tenantDb(event, { as: 'operator' }).count(POLL_VOTES_TABLE, [
      Query.equal('postId', id),
      Query.notEqual('userId', row.authorId),
    ])
    // Dieselbe Regel, jetzt mit vollständigem Bild.
    const counted = decidePostAuthorAction(
      { authorId: row.authorId, status: row.status, type: row.type, hasForeignPollVotes: foreign > 0 },
      row.authorId,
    )
    if (counted.reason === 'poll_locked') {
      throw createError({ status: 409, statusText: 'Poll already has votes' })
    }
  }

  /**
   * F1: Umkategorisieren. Feld NICHT mitgeschickt ⇒ Kategorie bleibt, wie sie
   * ist — sonst würde jeder Alt-Aufrufer (der nur Titel und Text kennt) beim
   * Speichern still die Kategorie leeren. Mitgeschicktes '' ist dagegen die
   * ausdrückliche Ansage „zurück in den Feed".
   */
  const categoryChange = input.categoryId === undefined
    ? {}
    : { categoryId: await resolveCategoryId(db, input.categoryId) }

  /**
   * F1: „bearbeitet" heißt INHALT, nicht Formular abgeschickt.
   *
   * Dieses Formular schickt Titel und Text bei JEDEM Speichern mit — auch
   * dann, wenn nur die Kategorie gewechselt wurde. Ein blind gesetzter
   * Zeitstempel stünde also an Themen, an deren Text niemand war. Die Regel
   * ist pur und getestet (`shared/postEdit.ts`); die Zustands-Route
   * (`[id]/state.patch.ts`) schreibt ohnehin nur ihr eines Feld und kommt hier
   * gar nicht vorbei.
   */
  const contentEdited = postContentEdited(
    { title: row.title, body: row.body },
    { title: input.title || null, body: input.body },
  )

  /**
   * WAS ÄNDERT SICH WIRKLICH? (F1 Teilpaket 3.)
   *
   * Geprüft wird die tatsächliche Differenz, nicht der Umfang des Formulars —
   * sonst scheiterte ein Kurator, der nur die Kategorie wechselt, am
   * mitgeschickten unveränderten Text. Dieselbe Überlegung, aus der der
   * „bearbeitet"-Stempel eine Zeile höher an der ECHTEN Inhaltsänderung hängt.
   */
  /**
   * DIE SCHREIB-TÜR (F1 Teilpaket 3) — für den Autor unverändert die
   * MITGLIEDER-Klinke, für alle anderen die Operator-Klinke.
   *
   * Technik, nicht Rechte: eine Beitrags-Zeile gibt `update` nur ihrem AUTOR
   * (index.post.ts). Ein Kurator käme mit der Mitglieder-Klinke gar nicht an
   * die Zeile — dieselbe Lage wie in der Zustands-Route. Gelesen wurde oben
   * bewusst weiter über die Mitglieder-Tür: für den Normalfall (der Autor
   * bearbeitet sein eigenes) ändert sich damit gar nichts, die Row-Security
   * bleibt dort die erste Grenze.
   *
   * `actor` sagt, WER handelt: ein Kurator oder eine Stufe 4 ist ein MITGLIED —
   * die Inhalts-Sperre (M13) gilt für ihn, denn er ändert Inhalt. Nur der Stab
   * (`posts.moderate`) handelt als Operator, aus derselben Begründung wie
   * überall: eine zahlungssäumige Community muss moderierbar bleiben.
   */
  const writeDb = isAuthor ? db : tenantDb(event, { as: 'operator', actor: staff ? 'operator' : 'member' })

  const changed: PostEditField[] = []
  if ((input.title || null) !== row.title) changed.push('title')
  if (input.body !== row.body) changed.push('body')
  if (categoryChange.categoryId !== undefined && categoryChange.categoryId !== row.categoryId) changed.push('categoryId')

  if (!mayEditPostFields(changed, actor)) {
    // Der Grund reist mit (`reason` im Envelope): „du darfst hier den Titel
    // ändern, aber nicht den Text" ist eine Auskunft, mit der ein Mensch etwas
    // anfangen kann — ein nacktes 403 an einem Formular, das gerade noch
    // aufging, ist es nicht.
    throw createError({ status: 403, statusText: 'Forbidden', data: { code: 'field_not_allowed' } })
  }

  const updated = await writeDb.update<CommunityPost>(POSTS_TABLE, id, {
    title: input.title || null,
    body: input.body,
    ...categoryChange,
    ...(contentEdited ? { editedAt: new Date().toISOString() } : {}),
  }).catch((error) => { throw toH3Error(error, 'Could not update post') })

  /**
   * MITSCHREIBENDER ZÄHLER (F1) — Grundlage des Abzeichens „Editor".
   *
   * NUR EIGENE INHALTE, und seit F1 Teilpaket 3 steht das als BEDINGUNG da,
   * nicht mehr nur als Eigenschaft der Route: die Route lässt jetzt auch
   * Kuratoren und Stufe 4 an fremde Beiträge. Das Abzeichen belohnt, den
   * EIGENEN Text besser zu machen — nicht das Aufräumen bei anderen.
   */
  if (contentEdited && isAuthor) {
    await recordUserCounterEvents(event, [{ userId: user.$id, kind: 'edits', delta: 1 }])
  }

  return updated
})

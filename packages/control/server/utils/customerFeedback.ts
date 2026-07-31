import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  CUSTOMER_FEEDBACK_COMMENTS_TABLE,
  CUSTOMER_FEEDBACK_MUTES_TABLE,
  CUSTOMER_FEEDBACK_TABLE,
  CUSTOMER_FEEDBACK_VOTES_TABLE,
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_TRENDING_WINDOW,
  type CustomerFeedbackCommentRow,
  type CustomerFeedbackRow,
  type CustomerFeedbackVoteRow,
  type FeedbackActor,
  type FeedbackComment,
  type FeedbackEntry,
  type FeedbackListResult,
  decideModerate,
  decideParticipate,
  decideSubmit,
  deriveFeedbackTitle,
  feedbackVisibleFor,
  projectFeedbackEntry,
  sortFeedbackEntries,
  voterKeyFor,
} from '../../shared/customerFeedback'
import { feedbackCommentSchema, feedbackQuerySchema, feedbackSubmitSchema, feedbackUpdateSchema } from '../../schemas/customerFeedback'

/**
 * Das Kunden-Feedback, wie das CONTROL PLANE es sieht — die einzige Stelle mit
 * echtem Datenzugriff auf `customer_feedback*`.
 *
 * DIE ZWEI EINGÄNGE (und warum sie hier zusammenlaufen):
 *  - Eine RUNTIME-App fragt über die Service-Naht (Secret + geprüftes
 *    Appwrite-JWT) — Davids Entscheidung 1: „jedes Dashboard fragt seinen
 *    EIGENEN Server, der über dieselbe Service-Naht bei control nachfragt."
 *  - Die BETREIBER-App (apps/control) ist selbst das Control Plane und ruft
 *    dieselben Funktionen in-process auf (server/plugins/feedback-backend.ts).
 *    Ein Schleifen-HTTP-Aufruf an sich selbst wäre eine zusätzliche
 *    Fehlerquelle für exakt null Gewinn.
 *
 * Beide bauen ihren `FeedbackActor` SELBST und reichen ihn herein. Es gibt
 * keinen Weg, sich als jemand anderes auszugeben, weil hier nichts aus dem
 * Body als Identität gelesen wird — dieselbe Regel wie „tenantId kommt nie vom
 * Aufrufer".
 *
 * ABLEHNUNGSGRÜNDE reisen als `data: { code: … }` (core/server/error.ts hebt
 * sie als `reason` ins Envelope) — der Browser soll „diese Community ist
 * stummgeschaltet" von „irgendwas ging schief" unterscheiden können.
 */

function denied(reason: string, status = 403): never {
  throw createError({ status, statusText: 'Forbidden', data: { code: reason } })
}

function databaseId(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteDatabaseId
}

// ── Stummschaltung (Entscheidung 8) ────────────────────────────────────────

/**
 * Ist diese Community stummgeschaltet? Die Row-Id IST die communityId, also
 * genügt ein getRow; 404 heißt „nicht stumm". Fail-OPEN: antwortet die
 * Datenbank gar nicht, wird nicht blockiert — die Notbremse darf nicht zur
 * Vollbremsung für alle werden, und das Rate-Limit greift weiterhin.
 */
export async function isCommunityMuted(event: H3Event, communityId: string): Promise<boolean> {
  if (!communityId) return false
  const { tablesDB } = createAdminClient(event)
  try {
    await tablesDB.getRow({ databaseId: databaseId(event), tableId: CUSTOMER_FEEDBACK_MUTES_TABLE, rowId: communityId })
    return true
  }
  catch (error) {
    if ((error as { code?: number }).code === 404) return false
    logEvent('warn', 'feedback.mute_lookup_failed', { communityId })
    return false
  }
}

export async function setCommunityMuted(
  event: H3Event,
  actor: FeedbackActor,
  input: { communityId: string, communityName?: string, muted: boolean },
): Promise<{ muted: boolean }> {
  const decision = decideModerate(actor)
  if (!decision.ok) denied(decision.reason)
  if (!input.communityId) throw createError({ status: 400, statusText: 'Missing community id' })

  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)

  if (input.muted) {
    await tablesDB.createRow({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_MUTES_TABLE, rowId: input.communityId,
      data: {
        communityId: input.communityId,
        communityName: input.communityName ?? '',
        mutedBy: actor.userId,
      },
    }).catch((error) => {
      // 409 = schon stumm. Stummschalten ist idempotent, das ist kein Fehler.
      if ((error as { code?: number }).code === 409) return
      throw toH3Error(error, 'Could not mute community')
    })
    return { muted: true }
  }

  // destruktiv-ok: Aufheben der Stummschaltung IST das Löschen genau dieser
  // einen Zeile — sie trägt keine Historie, ihre Existenz ist die Aussage.
  await tablesDB.deleteRow({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_MUTES_TABLE, rowId: input.communityId,
  }).catch((error) => {
    if ((error as { code?: number }).code === 404) return
    throw toH3Error(error, 'Could not unmute community')
  })
  return { muted: false }
}

// ── Lesen ──────────────────────────────────────────────────────────────────

/** Die Stimmen DIESES Betrachters auf einer Menge von Einträgen — EINE Abfrage. */
async function votedIdsFor(event: H3Event, actor: FeedbackActor, feedbackIds: string[]): Promise<Set<string>> {
  if (feedbackIds.length === 0 || !actor.userId || !actor.projectId) return new Set()
  const { tablesDB } = createAdminClient(event)
  const rows = await tablesDB.listRows<CustomerFeedbackVoteRow>({
    databaseId: databaseId(event),
    tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
    queries: [
      Query.equal('voterKey', voterKeyFor(actor.projectId, actor.userId)),
      Query.equal('feedbackId', feedbackIds),
      Query.limit(feedbackIds.length),
    ],
  }).catch(() => null)
  // Fail-soft: ohne diese Information sehen die Knöpfe ungewählt aus. Ein
  // doppelter Klick wird ohnehin vom Unique-Index abgefangen.
  return new Set((rows?.rows ?? []).map(row => row.feedbackId))
}

export async function listFeedback(
  event: H3Event,
  actor: FeedbackActor,
  rawQuery: unknown,
): Promise<FeedbackListResult> {
  const query = feedbackQuerySchema.parse(rawQuery ?? {})
  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)

  // Versteckte Zeilen sieht nur der Betreiber (der Verfasser sieht seine eigene
  // über die Projektion — sie kommt deshalb bei ihm mit in die Menge).
  const visibility = actor.isOperator ? [] : [Query.equal('status', 'visible')]
  const stateFilter = query.state ? [Query.equal('state', query.state)] : []

  // „Trending" kann Appwrite nicht sortieren (gerechnete Größe) — Fenster
  // holen, im Speicher werten. `new`/`top` sortiert die Datenbank.
  const inMemory = query.sort === 'trending'
  const limit = inMemory ? FEEDBACK_TRENDING_WINDOW : FEEDBACK_PAGE_SIZE
  const offset = inMemory ? 0 : (query.page - 1) * FEEDBACK_PAGE_SIZE
  const order = query.sort === 'top' ? Query.orderDesc('voteCount') : Query.orderDesc('$createdAt')

  const res = await tablesDB.listRows<CustomerFeedbackRow>({
    databaseId: db,
    tableId: CUSTOMER_FEEDBACK_TABLE,
    queries: [...visibility, ...stateFilter, order, Query.limit(limit), Query.offset(offset)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load feedback')
  })

  const rows = res.rows.filter(row => feedbackVisibleFor(row, actor))
  const pageRows = inMemory
    ? sortFeedbackEntries(
        rows.map(row => ({ row, voteCount: row.voteCount, commentCount: row.commentCount, createdAt: row.$createdAt })),
        'trending',
      ).slice((query.page - 1) * FEEDBACK_PAGE_SIZE, query.page * FEEDBACK_PAGE_SIZE).map(item => item.row)
    : rows

  const voted = await votedIdsFor(event, actor, pageRows.map(row => row.$id))
  const entries: FeedbackEntry[] = pageRows.map(row =>
    projectFeedbackEntry(row, { actor, hasVoted: voted.has(row.$id) }))

  return {
    // Bei 'trending' ist die Gesamtzahl die des FENSTERS — alles andere wäre
    // eine Zahl, zu der es keine Seiten gibt.
    total: inMemory ? rows.length : res.total,
    entries,
    operator: actor.isOperator,
  }
}

export async function listFeedbackComments(
  event: H3Event,
  actor: FeedbackActor,
  feedbackId: string,
): Promise<{ comments: FeedbackComment[] }> {
  if (!feedbackId) throw createError({ status: 400, statusText: 'Missing feedback id' })
  const { tablesDB } = createAdminClient(event)

  const res = await tablesDB.listRows<CustomerFeedbackCommentRow>({
    databaseId: databaseId(event),
    tableId: CUSTOMER_FEEDBACK_COMMENTS_TABLE,
    queries: [Query.equal('feedbackId', feedbackId), Query.orderAsc('$createdAt'), Query.limit(100)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load comments')
  })

  const comments = res.rows
    .filter(row => row.status === 'visible' || actor.isOperator
      || (row.authorUserId === actor.userId && row.runtimeProjectId === actor.projectId && actor.userId !== ''))
    .map<FeedbackComment>(row => ({
      id: row.$id,
      body: row.body,
      // Kein Name = „Mitglied": die Community des Schreibenden bleibt fremden
      // Kunden verborgen (Entscheidung 2), der Name selbst ist bewusst
      // sichtbar — eine Diskussion mit lauter Anonymen ist keine.
      authorName: row.authorName || '',
      createdAt: row.$createdAt,
      mine: actor.userId !== '' && row.authorUserId === actor.userId && row.runtimeProjectId === actor.projectId,
      status: row.status,
    }))

  return { comments }
}

// ── Schreiben ──────────────────────────────────────────────────────────────

export async function submitFeedback(
  event: H3Event,
  actor: FeedbackActor,
  rawBody: unknown,
): Promise<{ id: string }> {
  const input = feedbackSubmitSchema.parse(rawBody)

  const decision = decideSubmit(actor, await isCommunityMuted(event, actor.communityId))
  if (!decision.ok) denied(decision.reason)

  const { tablesDB } = createAdminClient(event)
  const row = await tablesDB.createRow<CustomerFeedbackRow>({
    databaseId: databaseId(event),
    tableId: CUSTOMER_FEEDBACK_TABLE,
    rowId: ID.unique(),
    data: {
      area: input.area,
      productKey: input.area === 'product' ? (input.productKey ?? '') : '',
      title: deriveFeedbackTitle(input.message),
      message: input.message,
      state: 'under_review',
      status: 'visible',
      page: input.page ?? '',
      // HERKUNFT: kommt aus dem Actor, nie aus dem Body. Bei einem anonymen
      // Absender bleibt hier überall '' — das ist Entscheidung 4, wörtlich.
      communityId: actor.communityId,
      communityName: actor.communityName,
      runtimeProjectId: actor.projectId,
      authorUserId: actor.userId,
      authorName: actor.name,
      authorEmail: actor.email,
      voteCount: 0,
      // Der Absender ist die erste Community — sonst stünde bei jedem frischen
      // Eintrag „aus 0 Communities", was schlicht falsch wäre.
      communityCount: actor.communityId ? 1 : 0,
      commentCount: 0,
      lastVoteAt: null,
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not save feedback')
  })

  return { id: row.$id }
}

/**
 * Wählen ist ein UMSCHALTER: nochmal klicken nimmt die Stimme zurück. Zwei
 * Zähler wandern mit, und der zweite ist der interessante — „aus N
 * Communities" (Entscheidung 3) zählt BREITE. Dafür wird vor und nach dem
 * Schreiben geprüft, ob diese Community sonst noch eine Stimme hier hat.
 */
export async function toggleFeedbackVote(
  event: H3Event,
  actor: FeedbackActor,
  feedbackId: string,
): Promise<{ voted: boolean, voteCount: number, communityCount: number }> {
  const decision = decideParticipate(actor)
  if (!decision.ok) denied(decision.reason, 401)
  if (!feedbackId) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)
  const voterKey = voterKeyFor(actor.projectId, actor.userId)

  const row = await tablesDB.getRow<CustomerFeedbackRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId,
  }).catch((error) => {
    throw toH3Error(error, 'Feedback not found')
  })
  if (!feedbackVisibleFor(row, actor)) {
    throw createError({ status: 404, statusText: 'Feedback not found' })
  }

  const existing = await tablesDB.listRows<CustomerFeedbackVoteRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
    queries: [Query.equal('feedbackId', feedbackId), Query.equal('voterKey', voterKey), Query.limit(1)],
  }).catch((error) => { throw toH3Error(error, 'Could not read votes') })

  const mine = existing.rows[0]
  const voted = !mine

  if (mine) {
    // destruktiv-ok: Stimme zurücknehmen IST das Löschen dieser Zeile.
    await tablesDB.deleteRow({ databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE, rowId: mine.$id })
      .catch((error) => { throw toH3Error(error, 'Could not remove vote') })
  }
  else {
    await tablesDB.createRow({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE, rowId: ID.unique(),
      data: { feedbackId, voterKey, communityId: actor.communityId },
    }).catch((error) => {
      // 409 = der Unique-Index hat einen Doppelklick abgefangen. Dann steht die
      // Stimme bereits — kein Fehler für den Nutzer.
      if ((error as { code?: number }).code === 409) return
      throw toH3Error(error, 'Could not save vote')
    })
  }

  const counted = await tablesDB.listRows<CustomerFeedbackVoteRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
    queries: [Query.equal('feedbackId', feedbackId), Query.limit(1)],
  }).catch(() => null)
  const voteCount = counted?.total ?? Math.max(0, row.voteCount + (voted ? 1 : -1))

  // BREITE: die Zahl der verschiedenen Communities. Bewusst über ein
  // begrenztes Fenster gerechnet (die Stimmen EINES Eintrags), nicht per
  // Aggregat — Appwrite kennt kein DISTINCT, und 1000 ist reichlich Puffer für
  // eine Zahl, die als Größenordnung gelesen wird.
  const sample = await tablesDB.listRows<CustomerFeedbackVoteRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
    queries: [Query.equal('feedbackId', feedbackId), Query.limit(1000)],
  }).catch(() => null)
  const communities = new Set<string>()
  if (row.communityId) communities.add(row.communityId)
  for (const vote of sample?.rows ?? []) {
    if (vote.communityId) communities.add(vote.communityId)
  }
  const communityCount = communities.size

  await tablesDB.updateRow({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId,
    data: { voteCount, communityCount, lastVoteAt: new Date().toISOString() },
  }).catch((error) => { throw toH3Error(error, 'Could not update feedback') })

  return { voted, voteCount, communityCount }
}

export async function addFeedbackComment(
  event: H3Event,
  actor: FeedbackActor,
  feedbackId: string,
  rawBody: unknown,
): Promise<{ id: string, commentCount: number }> {
  const decision = decideParticipate(actor)
  if (!decision.ok) denied(decision.reason, 401)
  if (!feedbackId) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const { body } = feedbackCommentSchema.parse(rawBody)
  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)

  const row = await tablesDB.getRow<CustomerFeedbackRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId,
  }).catch((error) => { throw toH3Error(error, 'Feedback not found') })
  if (!feedbackVisibleFor(row, actor)) {
    throw createError({ status: 404, statusText: 'Feedback not found' })
  }

  const created = await tablesDB.createRow<CustomerFeedbackCommentRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_COMMENTS_TABLE, rowId: ID.unique(),
    data: {
      feedbackId,
      body,
      status: 'visible',
      authorUserId: actor.userId,
      authorName: actor.name,
      communityId: actor.communityId,
      runtimeProjectId: actor.projectId,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not save comment') })

  const commentCount = row.commentCount + 1
  await tablesDB.updateRow({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId, data: { commentCount },
  }).catch(() => {
    // Der Zähler ist Anzeige, der Kommentar ist die Tatsache — ein
    // fehlgeschlagenes Nachziehen darf den Beitrag nicht verwerfen.
    logEvent('warn', 'feedback.comment_count_stale', { feedbackId })
  })

  return { id: created.$id, commentCount }
}

/**
 * Verschieben und Verstecken — „Verschieben ist Betreiber-Sache" (Plan
 * § Board-Zustände) und „verstecken statt löschen" (Entscheidung 8).
 */
export async function updateFeedback(
  event: H3Event,
  actor: FeedbackActor,
  feedbackId: string,
  rawPatch: unknown,
): Promise<{ ok: true }> {
  const decision = decideModerate(actor)
  if (!decision.ok) denied(decision.reason)
  if (!feedbackId) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const patch = feedbackUpdateSchema.parse(rawPatch)
  const data: Record<string, unknown> = {}
  if (patch.state !== undefined) data.state = patch.state
  if (patch.status !== undefined) data.status = patch.status
  if (patch.title !== undefined) data.title = patch.title
  if (patch.area !== undefined) {
    data.area = patch.area
    // Bereich weg von „Ein Produkt" ⇒ der Produkt-Key ergibt keinen Sinn mehr.
    if (patch.area !== 'product') data.productKey = ''
  }
  if (patch.productKey !== undefined && (patch.area ?? 'product') === 'product') {
    data.productKey = patch.productKey
  }

  const { tablesDB } = createAdminClient(event)
  await tablesDB.updateRow({
    databaseId: databaseId(event), tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId, data,
  }).catch((error) => { throw toH3Error(error, 'Could not update feedback') })

  return { ok: true }
}

// ── DSGVO (Auskunft + Löschung) ────────────────────────────────────────────

/**
 * DIE ZWEI FUNKTIONEN, die es geben MUSS, weil hier Nutzerdaten liegen: „ein
 * Layer mit Nutzerdaten muss einen registerUserDataContributor mitbringen"
 * (CLAUDE.md, im Plan als Folge von Entscheidung 4 ausdrücklich benannt).
 *
 * Sie laufen im CONTROL PLANE, aufgerufen von der Runtime-App über die Naht —
 * der Nutzer lebt in einem anderen Appwrite-Projekt, seine Zeilen liegen hier.
 * Gescopt wird IMMER auf das Paar (runtimeProjectId, authorUserId): dieselbe
 * User-Id in zwei Projekten sind zwei verschiedene Menschen.
 */

function scopedUserQueries(projectId: string, userId: string, limit: number): string[] {
  return [
    Query.equal('runtimeProjectId', projectId),
    Query.equal('authorUserId', userId),
    Query.limit(limit),
  ]
}

export async function exportFeedbackUserData(
  event: H3Event,
  projectId: string,
  userId: string,
): Promise<{ customerFeedback: unknown[], customerFeedbackComments: unknown[] }> {
  if (!projectId || !userId) return { customerFeedback: [], customerFeedbackComments: [] }
  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)

  const entries = await tablesDB.listRows<CustomerFeedbackRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, queries: scopedUserQueries(projectId, userId, 500),
  }).catch(() => null)
  const comments = await tablesDB.listRows<CustomerFeedbackCommentRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_COMMENTS_TABLE, queries: scopedUserQueries(projectId, userId, 500),
  }).catch(() => null)

  return {
    customerFeedback: (entries?.rows ?? []).map(row => ({
      area: row.area, productKey: row.productKey, title: row.title, message: row.message,
      state: row.state, page: row.page, voteCount: row.voteCount, createdAt: row.$createdAt,
    })),
    customerFeedbackComments: (comments?.rows ?? []).map(row => ({
      feedbackId: row.feedbackId, body: row.body, createdAt: row.$createdAt,
    })),
  }
}

/**
 * LÖSCHEN HEISST HIER ANONYMISIEREN — und zwar aus demselben Grund, aus dem
 * Kommentar-Threads nicht hart gelöscht werden: an einem Feedback-Eintrag
 * hängen inzwischen die Stimmen und Beiträge ANDERER. Ihn wegen des Austritts
 * seines Verfassers zu entfernen, würde deren Beitrag mitlöschen und genau die
 * Zahl verfälschen, um die es beim ganzen Vorhaben geht.
 *
 * Der alte Silo-Layer löschte hart, und das war dort richtig: eine Rückmeldung
 * ohne Stimmen und ohne Diskussion hat keinen Kontext Dritter. Mit E10 hat sie
 * einen.
 *
 * Was WIRKLICH gelöscht wird, sind die STIMMEN: eine Stimme ist eine rein
 * persönliche Handlung ohne fremden Kontext, und sie ist der einzige Rest, der
 * die Person danach noch identifizierbar machen würde (voterKey enthält die
 * User-Id). Die Zähler werden dabei mitgezogen.
 */
export async function eraseFeedbackUserData(
  event: H3Event,
  projectId: string,
  userId: string,
): Promise<UserDataDeleteResult> {
  if (!projectId || !userId) return { deleted: 0, anonymized: 0 }
  const { tablesDB } = createAdminClient(event)
  const db = databaseId(event)
  let deleted = 0
  let anonymized = 0

  // STRIKT (kein catch um die Schreibvorgänge) — deleteUserCompletely gated
  // users.delete auf Voll-Erfolg. Nur das Lesen darf degradieren.
  const entries = await tablesDB.listRows<CustomerFeedbackRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, queries: scopedUserQueries(projectId, userId, 500),
  }).catch(() => null)
  for (const row of entries?.rows ?? []) {
    await tablesDB.updateRow({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: row.$id,
      data: { authorUserId: '', authorName: '', authorEmail: '' },
    })
    anonymized++
  }

  const comments = await tablesDB.listRows<CustomerFeedbackCommentRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_COMMENTS_TABLE, queries: scopedUserQueries(projectId, userId, 500),
  }).catch(() => null)
  for (const row of comments?.rows ?? []) {
    await tablesDB.updateRow({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_COMMENTS_TABLE, rowId: row.$id,
      data: { authorUserId: '', authorName: '' },
    })
    anonymized++
  }

  const votes = await tablesDB.listRows<CustomerFeedbackVoteRow>({
    databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
    queries: [Query.equal('voterKey', voterKeyFor(projectId, userId)), Query.limit(500)],
  }).catch(() => null)
  const touched = new Set<string>()
  for (const row of votes?.rows ?? []) {
    // destruktiv-ok: eine Stimme ist eine persönliche Handlung ohne fremden
    // Kontext — sie zu behalten hieße, die Person weiter zu führen.
    await tablesDB.deleteRow({ databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE, rowId: row.$id })
    touched.add(row.feedbackId)
    deleted++
  }
  for (const feedbackId of touched) {
    const rest = await tablesDB.listRows<CustomerFeedbackVoteRow>({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_VOTES_TABLE,
      queries: [Query.equal('feedbackId', feedbackId), Query.limit(1)],
    }).catch(() => null)
    if (!rest) continue
    await tablesDB.updateRow({
      databaseId: db, tableId: CUSTOMER_FEEDBACK_TABLE, rowId: feedbackId, data: { voteCount: rest.total },
    }).catch(() => {
      logEvent('warn', 'feedback.vote_count_stale', { feedbackId })
    })
  }

  return { deleted, anonymized }
}

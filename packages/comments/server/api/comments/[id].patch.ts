import { AppwriteException } from 'node-appwrite'
import { commentUpdateSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

/** Eigenen Kommentar bearbeiten — Row-Permission erlaubt nur den Autor. */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  await assertCommentsWritable(event)

  const { content } = await readValidatedBody(event, commentUpdateSchema.parse)
  const db = tenantDb(event)

  // Status prüfen: nur aktive/gemeldete Kommentare sind editierbar. Ohne diese
  // Sperre könnte der Autor per direktem Call den Inhalt eines ausgeblendeten
  // (hidden) oder soft-gelöschten (deleted) Kommentars überschreiben — die UI
  // versteckt „Bearbeiten" dort nur clientseitig.
  // `get` der Tür belegt zugleich die Mandanten-Zugehörigkeit.
  const existing = await db.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (existing.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not editable' })
  }

  /**
   * F1: hat sich der INHALT wirklich geändert?
   *
   * Die Antwort steuert NUR den mitschreibenden Zähler, NICHT `editedAt` —
   * dort bleibt das Verhalten dieser Route unverändert (jedes Speichern setzt
   * den Zeitstempel; anders als beim Beitrag schickt dieses Formular auch nur
   * das eine Feld, es gibt hier also keinen Kategorie-Wechsel, der sich als
   * Bearbeitung tarnen könnte). Für das Abzeichen „Editor" ist der Unterschied
   * trotzdem wichtig: zweimal „Speichern" ohne Änderung ist EINE Bearbeitung,
   * und ohne diese Frage wäre das Abzeichen mit zwei folgenlosen Klicks zu
   * haben.
   */
  const contentEdited = existing.content !== content

  try {
    // Sparse Update — Row-Security wirft 401, wenn nicht der Autor schreibt.
    // editedAt markiert die echte Bearbeitung (≠ $updatedAt, das auch Votes bumpen).
    const updated = await db.update<Comment>(
      COMMENTS_TABLE,
      commentId,
      { content, editedAt: new Date().toISOString() },
      'Comment not found',
    )

    /**
     * MITSCHREIBENDER ZÄHLER (F1) — Grundlage des Abzeichens „Editor".
     *
     * NUR EIGENE INHALTE, und das ist hier eine Eigenschaft der Route: die
     * Row-Security lässt ausschließlich den Autor schreiben (ein fremder
     * Versuch endet im 403 unten). Eine Moderation, die einen fremden
     * Kommentar anfasst, kommt hier gar nicht vorbei — und dürfte auch nicht
     * zählen: das Abzeichen belohnt, den EIGENEN Text besser zu machen.
     */
    if (contentEdited) {
      await recordUserCounterEvents(event, [{ userId: user.$id, kind: 'edits', delta: 1 }])
    }

    return updated
  }
  catch (error) {
    // Row-Security-401 (nicht der Autor) → 403; echte 5xx nicht als 403 tarnen.
    if (error instanceof AppwriteException && error.code === 401) {
      throw createError({ status: 403, statusText: 'Forbidden' })
    }
    throw toH3Error(error, 'Comment could not be updated')
  }
})

import type { ModeratableCommentRow } from '../utils/commentModeration'
import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * Auto-Hide-Threshold (OPEN-ITEMS Idee 5, Embed-Plan § 3f): erreichen die
 * OFFENEN Meldungen zu einem Kommentar den Schwellwert
 * maui.comments.autoHideReports (0 = aus, Default), wird er automatisch
 * zweiphasig ausgeblendet — inkl. Cascade (Antworten), wie beim manuellen
 * Hide. Die Meldungen bleiben OFFEN: der Moderator sieht den Fall weiter in
 * der Queue („Gemeldet" + Badge „Ausgeblendet") und entscheidet final
 * (Wiederherstellen hebt den Auto-Hide auf, Meldungen erledigen schließt ihn).
 */
export default defineNitroPlugin(() => {
  registerReportEscalationHandler('comment', async (event, { targetId, openCount }) => {
    const appConfig = useAppConfig(event) as { maui?: { comments?: { autoHideReports?: number } } }
    const threshold = appConfig.maui?.comments?.autoHideReports ?? 0
    if (threshold <= 0 || openCount < threshold) return

    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const databaseId = config.public.appwriteDatabaseId

    // Nur aktive Kommentare — hidden (schon moderiert/auto-versteckt),
    // deleted (Tombstone) und Junk-targetIds (Meldungen prüfen Existenz nicht)
    // bleiben unangetastet.
    const row = await admin.tablesDB.getRow<ModeratableCommentRow>({
      databaseId, tableId: COMMENTS_TABLE, rowId: targetId,
    }).catch(() => null)
    if (!row || row.status !== 'active') return

    await hideCommentRow(admin, databaseId, row)
    await hideCommentDescendants(admin, databaseId, row)
    console.warn(`[comments] Auto-Hide: Kommentar ${targetId} nach ${openCount} offenen Meldungen ausgeblendet (Threshold ${threshold}) — Meldungen bleiben offen für die Moderation.`)
  })
})

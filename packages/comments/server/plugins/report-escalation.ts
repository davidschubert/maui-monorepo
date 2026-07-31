import type { ModeratableCommentRow } from '../utils/commentModeration'
import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * Auto-Hide-Threshold (OPEN-ITEMS Idee 5, Embed-Plan § 3f): erreichen die
 * OFFENEN Meldungen zu einem Kommentar den Schwellwert
 * pukalani.comments.autoHideReports (0 = aus, Default), wird er automatisch
 * zweiphasig ausgeblendet — inkl. Cascade (Antworten), wie beim manuellen
 * Hide. Die Meldungen bleiben OFFEN: der Moderator sieht den Fall weiter in
 * der Queue („Gemeldet" + Badge „Ausgeblendet") und entscheidet final
 * (Wiederherstellen hebt den Auto-Hide auf, Meldungen erledigen schließt ihn).
 */
export default defineNitroPlugin(() => {
  registerReportEscalationHandler('comment', async (event, { targetId, openCount }) => {
    const appConfig = useAppConfig(event) as { pukalani?: { comments?: { autoHideReports?: number } } }
    const threshold = appConfig.pukalani?.comments?.autoHideReports ?? 0
    if (threshold <= 0 || openCount < threshold) return

    // Nur aktive Kommentare — hidden (schon moderiert/auto-versteckt),
    // deleted (Tombstone) und Junk-targetIds (Meldungen prüfen Existenz nicht)
    // bleiben unangetastet. Die Tür weist zusätzlich fremde Mandanten ab; ein
    // Auto-Hide über die Grenze hinweg wäre besonders tückisch, weil ihn
    // niemand auslöst und niemand sieht.
    const row = await tenantDb(event, { as: 'operator' })
      .get<ModeratableCommentRow>(COMMENTS_TABLE, targetId, 'Comment not found')
      .catch(() => null)
    if (!row || row.status !== 'active') return

    await hideCommentRow(event, row)
    await hideCommentDescendants(event, row)
    console.warn(`[comments] Auto-Hide: Kommentar ${targetId} nach ${openCount} offenen Meldungen ausgeblendet (Threshold ${threshold}) — Meldungen bleiben offen für die Moderation.`)
  })
})

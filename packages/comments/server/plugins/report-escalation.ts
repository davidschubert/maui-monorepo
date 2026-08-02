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
 *
 * Hier meldet comments AUSSERDEM an, dass 'comment' überhaupt ein meldbarer
 * Ziel-Typ ist (Moderations-Audit Befund 8) — dieselbe Stelle, weil derselbe
 * Layer auch die Queue baut, die die Meldungen später zeigt.
 */
export default defineNitroPlugin(() => {
  /**
   * MELDBAR: Kommentare. Die Prüfung läuft durch die Datentür als Operator —
   * ein Kommentar aus einer FREMDEN Community ist damit „nicht vorhanden", und
   * eine erfundene Id ebenso. Tombstones (`status: 'deleted'`) bleiben meldbar:
   * die Zeile existiert noch und kann Anlass zur Moderation geben.
   */
  registerReportTarget('comment', async (event, targetId) => {
    const row = await tenantDb(event, { as: 'operator' })
      .get<ModeratableCommentRow>(COMMENTS_TABLE, targetId, 'Comment not found')
      .catch(() => null)
    return !!row
  })

  registerReportEscalationHandler('comment', async (event, { targetId, openCount }) => {
    const appConfig = useAppConfig(event) as { pukalani?: { comments?: { autoHideReports?: number } } }
    const threshold = appConfig.pukalani?.comments?.autoHideReports ?? 0
    if (threshold <= 0 || openCount < threshold) return

    // Nur aktive Kommentare — hidden (schon moderiert/auto-versteckt) und
    // deleted (Tombstone) bleiben unangetastet. Die Tür weist zusätzlich
    // fremde Mandanten ab; ein
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

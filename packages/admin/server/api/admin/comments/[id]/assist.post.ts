import type { Models } from 'node-appwrite'
import type { ModerationAssist } from '../../../../../shared/types/admin'

/**
 * KI-Moderations-Assist (advisory): Zweitmeinung zu einem gemeldeten Kommentar
 * über core aiComplete (Gate maui.ai + NUXT_AI_KEY). Die KI ändert NICHTS —
 * wie bei der Ticket-Triage entscheidet der Mensch; die Antwort ist nur eine
 * Empfehlung fürs Queue-UI. Kommentar-Inhalt lädt admin selbst (darf beides
 * kennen), die Meldegründe kommen über den moderation-Vertrag
 * openReportsForTarget (Layer-Grenze A14 — moderation kennt keine Kommentare).
 */

type CommentRow = Models.Row & { content: string, authorName: string, status: string }

function buildPrompt(comment: CommentRow, reports: { reason: string, note: string | null }[]): string {
  return [
    'Du unterstützt die Moderation einer Community-Plattform. Ein Kommentar wurde',
    'von Nutzern gemeldet — gib eine Zweitmeinung ab, ob er gegen übliche',
    'Community-Regeln verstößt (Beleidigung, Hassrede, Belästigung, Spam,',
    'personenbezogene Daten, sexuelle/gewalttätige Inhalte, Illegales).',
    '',
    `Kommentar von ${comment.authorName}:`,
    '"""',
    comment.content.slice(0, 4000),
    '"""',
    '',
    `Meldungen (${reports.length}):`,
    ...reports.slice(0, 20).map(r => `- ${r.reason}${r.note ? `: ${r.note.slice(0, 300)}` : ''}`),
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    '  "action": "<hide|dismiss> — hide = Ausblenden empfohlen, dismiss = Kommentar ok, Meldungen verwerfen",',
    '  "severity": <1-5, wie gravierend der Verstoß ist; 1 = harmlos>,',
    '  "assessment": "<2-3 Sätze auf Deutsch: Begründung deiner Empfehlung>"',
    '}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<ModerationAssist> => {
  requirePermission(event, 'comments.moderate')

  if (!isAiAvailable(event)) {
    throw createError({ status: 503, statusText: 'AI assist not configured' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const comment = await admin.tablesDB.getRow<CommentRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'comments',
    rowId: commentId,
  }).catch((error) => { throw toH3Error(error, 'Comment not found') })

  const reports = await openReportsForTarget(event, 'comment', commentId)
  if (reports.length === 0) {
    throw createError({ status: 400, statusText: 'No open reports for this comment' })
  }

  // Effektive Config: app_config.aiModel (Laufzeit-Override) schlägt den Build-Default
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<Partial<ModerationAssist>>(event, buildPrompt(comment, reports), {
    model: aiConfig.model,
    maxTokens: 400,
    label: 'admin',
  })

  // Klemmen statt vertrauen — T aus aiCompleteJson ist eine Behauptung.
  return {
    action: parsed.action === 'hide' ? 'hide' : 'dismiss',
    severity: Math.min(5, Math.max(1, Number(parsed.severity) || 1)),
    assessment: String(parsed.assessment ?? '').slice(0, 1200),
    model: aiConfig.model,
  }
})

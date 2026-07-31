import { POSTS_TABLE, type CommunityPost, type PostModerationAssist } from '../../../../shared/types/post'

/**
 * KI-Moderations-Assist für gemeldete Posts (advisory) — gleiches Prinzip wie
 * der Kommentar-Assist im admin-Layer: core aiComplete (Gate pukalani.ai +
 * NUXT_AI_KEY), Meldegründe über den moderation-Vertrag openReportsForTarget,
 * die KI ändert NICHTS — der Moderator entscheidet.
 *
 * AUTORISIERUNG (S1): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 * Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */

function parsePollOptions(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map(o => String(o)) : []
  }
  catch {
    return []
  }
}

function buildPrompt(post: CommunityPost, reports: { reason: string, note: string | null }[]): string {
  const pollOptions = parsePollOptions(post.pollOptions)
  return [
    'Du unterstützt die Moderation einer Community-Plattform. Ein Beitrag wurde',
    'von Nutzern gemeldet — gib eine Zweitmeinung ab, ob er gegen übliche',
    'Community-Regeln verstößt (Beleidigung, Hassrede, Belästigung, Spam,',
    'personenbezogene Daten, sexuelle/gewalttätige Inhalte, Illegales).',
    '',
    `Beitrag (Typ: ${post.type}) von ${post.authorName}:`,
    '"""',
    ...(post.title ? [post.title, ''] : []),
    post.body.slice(0, 4000),
    ...(pollOptions.length ? ['', `Umfrage-Optionen: ${pollOptions.join(' · ')}`] : []),
    '"""',
    '',
    `Meldungen (${reports.length}):`,
    ...reports.slice(0, 20).map(r => `- ${r.reason}${r.note ? `: ${r.note.slice(0, 300)}` : ''}`),
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    '  "action": "<hide|dismiss> — hide = Ausblenden empfohlen, dismiss = Beitrag ok, Meldungen verwerfen",',
    '  "severity": <1-5, wie gravierend der Verstoß ist; 1 = harmlos>,',
    '  "assessment": "<2-3 Sätze auf Deutsch: Begründung deiner Empfehlung>"',
    '}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<PostModerationAssist> => {
  // Produkt-Gates (P4) VOR der Autorisierung — beide, nicht nur 'ai': dass
  // 'ai' heute den höheren Mindest-Plan hat (pro > personal), ist eine
  // KONFIGURATION der App (pukalani.tenancy.products), keine Garantie. Wer sie
  // umstellt, soll nicht versehentlich eine posts-Route öffnen.
  requirePlanProduct(event, 'posts')
  requirePlanProduct(event, 'ai')
  await requireCommunityPermission(event, 'posts.moderate')

  if (!isAiAvailable(event)) {
    throw createError({ status: 503, statusText: 'AI assist not configured' })
  }

  const postId = getRouterParam(event, 'id')
  if (!postId) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Datentür als Operator — get belegt die Zugehörigkeit (fremd → 404),
  // bevor Post-Inhalt an die KI geht.
  const post = await tenantDb(event, { as: 'operator' })
    .get<CommunityPost>(POSTS_TABLE, postId, 'Post not found')

  const reports = await openReportsForTarget(event, 'post', postId)
  if (reports.length === 0) {
    throw createError({ status: 400, statusText: 'No open reports for this post' })
  }

  // Effektive Config: app_config.aiModel (Laufzeit-Override) schlägt den Build-Default
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<Partial<PostModerationAssist>>(event, buildPrompt(post, reports), {
    model: aiConfig.model,
    maxTokens: 400,
    label: 'posts',
  })

  // Klemmen statt vertrauen — T aus aiCompleteJson ist eine Behauptung.
  return {
    action: parsed.action === 'hide' ? 'hide' : 'dismiss',
    severity: Math.min(5, Math.max(1, Number(parsed.severity) || 1)),
    assessment: String(parsed.assessment ?? '').slice(0, 1200),
    model: aiConfig.model,
  }
})

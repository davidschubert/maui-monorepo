import { POSTS_TABLE, type CommunityPost } from '../../shared/types/post'

/**
 * MELDBAR: Beiträge (Moderations-Audit Befund 8, 2026-08-01).
 *
 * posts hat eine Queue (`/dashboard/posts` + `/api/posts/moderation`), also
 * gehört der Typ 'post' in die Registry des moderation-Layers — sonst weist
 * `/api/reports` ihn ab. Umgekehrt gilt dasselbe: WEIL hier registriert wird,
 * ist die Zusage „ein Moderator sieht sich das an" für Beiträge gedeckt.
 *
 * Die Prüfung läuft durch die Datentür als Operator: ein Beitrag aus einer
 * FREMDEN Community ist damit „nicht vorhanden", eine erfundene Id ebenso.
 * Ausgeblendete und gelöschte Beiträge bleiben meldbar — die Zeile existiert,
 * und der Moderator entscheidet.
 */
export default defineNitroPlugin(() => {
  registerReportTarget('post', async (event, targetId) => {
    const row = await tenantDb(event, { as: 'operator' })
      .get<CommunityPost>(POSTS_TABLE, targetId, 'Post not found')
      .catch(() => null)
    return !!row
  })
})

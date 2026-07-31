import { POSTS_TABLE, type CommunityPost } from '../../../../shared/types/post'

/**
 * Moderation: Post ausblenden — zweiphasig wie comments (Status-Update
 * zuerst, damit das Realtime-Event Leser noch erreicht; dann read(any)
 * entziehen, sonst bleibt der Post per Roh-REST gast-lesbar).
 *
 * AUTORISIERUNG (S1): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 * Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4) VOR der Autorisierung — wie moderation.get.ts.
  requirePlanProduct(event, 'posts')
  const { user } = await requireCommunityPermission(event, 'posts.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Datentür als Operator: get belegt die Zugehörigkeit (fremder Mandant →
  // 404), erst dann wird moderiert.
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')
  if (row.status !== 'published') {
    throw createError({ status: 409, statusText: 'Only published posts can be hidden' })
  }

  const updated = await db.update<CommunityPost>(POSTS_TABLE, id, { status: 'hidden' })

  const withdrawn = withoutPublishedRead(updated.$permissions, event)
  if (withdrawn.length !== updated.$permissions.length) {
    const withdraw = () => db.updatePermissions(POSTS_TABLE, id, withdrawn)
    // Phase 2 muss halten — Retry für transiente Fehler, persistente laut loggen
    await withdraw()
      .catch(() => withdraw())
      .catch((error) => {
        console.error(`[posts] Permission-Entzug fehlgeschlagen — hidden-Post ${id} bleibt Roh-REST-lesbar bis zum Re-Hide:`, error)
      })
  }

  // Ausblenden schließt zugleich die offenen Meldungen (moderation-Vertrag,
  // wie der comments-Flow) — best-effort: der Hide ist bereits passiert,
  // ein Resolve-Fehler darf ihn nicht als gescheitert melden
  await resolveReportsForTarget(event, 'post', id, 'hidden', user.$id)
    .catch(error => console.error(`[posts] Meldungen zu Post ${id} konnten nicht aufgelöst werden:`, error))

  // Feed-Einträge des Posts entfernen (core-Vertrag) — sonst bleibt sein
  // metadata-Snippet im Activity-Feed sichtbar, obwohl der Inhalt weg ist
  await removeActivitiesForObject(event, { objectType: 'post', objectId: id })

  return { ok: true }
})

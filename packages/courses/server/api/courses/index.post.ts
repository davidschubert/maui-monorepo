import { courseSchema } from '../../../schemas/course'
import { COURSES_TABLE, type CourseRow } from '../../../shared/types/course'

/**
 * Kurs anlegen (courses.manage) — Slug-Duplikat → sauberes 409. Datentür als
 * Operator: create stempelt den Mandanten (nie der Aufrufer). Der Slug ist
 * seit courses-002 PRO MANDANT eindeutig (uq_tenant_slug) — zwei Communities
 * dürfen denselben Kurs-Slug haben.
 *
 * AUTORISIERUNG: `requireCommunityPermission` — im Pool entscheidet die Site-Rolle
 * (admin/owner tragen courses.manage), erst danach greift der protokollierte
 * Operator-Break-Glass. Ohne Mandanten-Kontext (Silo/Playground) fällt der
 * Gate auf das globale Operator-Label zurück: Verhalten unverändert.
 *
 * WER HANDELT (F17): ein Kurs ist INHALT der Community — die Person, die ihn
 * anlegt, ist Redaktion, kein Betreiber. Die Klinke bleibt `'operator'` (die
 * Tabelle trägt bewusst keine User-Schreibrechte), `actor` kommt aus dem Gate:
 * über die Rolle ⇒ 'member' (Inhalts-Sperre M13 und Beitritt A5 gelten), über
 * das Break-Glass ⇒ 'operator'.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { user, actor } = await requireCommunityPermission(event, 'courses.manage')

  // Pool-Quota (No-Op, bis der Plan-Katalog courses-Limits trägt — der Hook
  // steht, damit die Zahlen nur noch Konfiguration sind, kein Code)
  await assertPoolWriteQuota(event, { kind: 'courses', tableId: COURSES_TABLE })

  const body = await readValidatedBody(event, courseSchema.parse)
  // Kein Guard registriert ⇒ 'paid' wäre ein Kurs, den niemand buchen kann
  // (Befund 2, 2026-08-02) — dieselbe Wahrheit, die das Formular ausblendet.
  assertPaidAccessOffered(body.access)

  const status = body.status ?? 'draft'
  const row = await tenantDb(event, { as: 'operator', actor }).create<CourseRow>(COURSES_TABLE, {
    title: body.title,
    slug: body.slug,
    description: body.description,
    status,
    access: body.access,
    entitlementProduct: body.access === 'paid' ? (body.entitlementProduct ?? null) : null,
    authorId: user.$id,
    authorName: user.name,
    lessonCount: 0,
  }, {
    // published: Mitglieder lesen (read users); drafts nur Verwaltung
    permissions: status === 'published' ? [COURSE_READ_USERS] : [],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create course')
  })

  if (status === 'published') {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'course.published',
      objectType: 'course',
      objectId: row.$id,
      link: `/courses/${row.slug}`,
      metadata: { title: row.title },
    })
  }

  setResponseStatus(event, 201)
  return row
})

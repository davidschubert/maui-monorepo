import { ID } from 'node-appwrite'
import { courseSchema } from '../../../schemas/course'
import { COURSES_TABLE, type CourseRow } from '../../../shared/types/course'

/** Kurs anlegen (courses.manage) — Slug-Duplikat → sauberes 409. */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'courses.manage')

  const body = await readValidatedBody(event, courseSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const status = body.status ?? 'draft'
  const row = await admin.tablesDB.createRow<CourseRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COURSES_TABLE,
    rowId: ID.unique(),
    data: {
      title: body.title,
      slug: body.slug,
      description: body.description,
      status,
      access: body.access,
      entitlementFeature: body.access === 'paid' ? (body.entitlementFeature ?? null) : null,
      authorId: user.$id,
      authorName: user.name,
      lessonCount: 0,
    },
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

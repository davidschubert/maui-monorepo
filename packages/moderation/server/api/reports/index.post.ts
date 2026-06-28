import { AppwriteException, ID, Permission, Role } from 'node-appwrite'
import { createReportSchema } from '../../../schemas/report'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eine Meldung abgeben. Eine Meldung pro User/Target erzwingt der Unique-Index
 * `reporter_target` (409 → idempotent „bereits gemeldet"). Läuft als der User
 * (Session-Client) → Row gehört dem Melder, der sie selbst zurückziehen kann.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const parsed = createReportSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid report' })
  }
  const input = parsed.data

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  try {
    const report = await tablesDB.createRow<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      rowId: ID.unique(),
      data: {
        reporterId: user.$id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        note: input.note ?? null,
        status: 'open',
        resolvedBy: null,
        resolution: null,
      },
      permissions: [
        Permission.read(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ],
    })
    return { ok: true, report }
  }
  catch (error) {
    // Unique-Index getroffen → der User hat dieses Target bereits gemeldet
    if (error instanceof AppwriteException && error.code === 409) {
      return { ok: true, alreadyReported: true }
    }
    throw createError({ status: 500, statusText: 'Could not submit report' })
  }
})

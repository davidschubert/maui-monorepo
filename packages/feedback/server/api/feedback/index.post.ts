import { ID } from 'node-appwrite'
import { feedbackSchema } from '../../../schemas/feedback'
import { FEEDBACK_TABLE } from '../../../shared/types/feedback'

/**
 * Feedback senden — bewusst AUCH für Gäste (die Hürde soll minimal sein);
 * Spam-Schutz ist der Core-Rate-Limit-Bucket feedback:create (5/min/IP).
 * Schreibt über den Admin-Client (Gäste haben keine Session; die Table
 * trägt keine Permissions — gelesen wird nur über feedback.manage).
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, feedbackSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const user = event.context.user

  const row = await admin.tablesDB.createRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: FEEDBACK_TABLE,
    rowId: ID.unique(),
    data: {
      category: body.category,
      message: body.message,
      page: body.page ?? '',
      userId: user?.$id ?? '',
      userName: user?.name ?? '',
      status: 'open',
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not save feedback')
  })

  setResponseStatus(event, 201)
  return { ok: true, id: row.$id }
})

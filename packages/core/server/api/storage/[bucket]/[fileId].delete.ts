import { createSessionClient } from '../../../lib/appwrite'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const bucketId = getRouterParam(event, 'bucket')
  const fileId = getRouterParam(event, 'fileId')
  if (!bucketId || !fileId) {
    throw createError({ status: 400, statusText: 'Missing bucket or file id' })
  }

  const { storage } = createSessionClient(event)
  await storage.deleteFile({ bucketId, fileId })

  return { ok: true }
})

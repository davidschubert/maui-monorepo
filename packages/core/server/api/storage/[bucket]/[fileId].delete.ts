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
  const config = useRuntimeConfig(event)
  if (!config.public.appwriteAvatarsBucket || bucketId !== config.public.appwriteAvatarsBucket) {
    throw createError({ status: 403, statusText: 'Unknown bucket' })
  }

  const { storage } = createSessionClient(event)
  await storage.deleteFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })

  return { ok: true }
})

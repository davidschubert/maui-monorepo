import { ImageFormat, ImageGravity } from 'node-appwrite'
import { createSessionClient } from '../../../lib/appwrite'

/** Query-Param als ganze Zahl in [0, max], sonst 0 */
function clampInt(value: unknown, max: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, max)
}

/**
 * Liefert den Datei-Inhalt (SessionClient — anonym ok bei read(any)).
 * Mit ?w=&h=&q= eine zugeschnittene WebP-Preview via getFilePreview; fällt
 * auf die Originaldatei zurück, falls die Instanz kein Imagick hat.
 */
export default defineEventHandler(async (event) => {
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
  const query = getQuery(event)
  const width = clampInt(query.w, 2000)
  const height = clampInt(query.h, 2000)
  const quality = clampInt(query.q, 100)

  if (width || height) {
    try {
      const data = await storage.getFilePreview({
        bucketId,
        fileId,
        width: width || undefined,
        height: height || undefined,
        gravity: ImageGravity.Center,
        quality: quality || 85,
        output: ImageFormat.Webp,
      })
      setHeader(event, 'Content-Type', 'image/webp')
      setHeader(event, 'Cache-Control', 'public, max-age=3600')
      return Buffer.from(data)
    }
    catch {
      // Preview nicht verfügbar → Originaldatei unten ausliefern
    }
  }

  const meta = await storage.getFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })
  const data = await storage.getFileView({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })
  setHeader(event, 'Content-Type', meta.mimeType)
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return Buffer.from(data)
})

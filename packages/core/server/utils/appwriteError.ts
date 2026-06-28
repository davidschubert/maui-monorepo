import { AppwriteException } from 'node-appwrite'

/**
 * Mappt einen Server-SDK-Fehler (Appwrite) auf einen sauberen H3-/Nuxt-Fehler:
 * echte Client-Fehler (4xx) bleiben 4xx (richtiger Status), alles andere wird
 * 500. Es werden NIE Appwrite-Detailnachrichten an den Client geleakt — nur der
 * übergebene, generische Text. Aufruf: `throw toH3Error(error, 'message')`.
 */
export function toH3Error(error: unknown, message: string) {
  if (error instanceof AppwriteException && error.code >= 400 && error.code < 500) {
    return createError({ status: error.code, statusText: message })
  }
  return createError({ status: 500, statusText: message })
}

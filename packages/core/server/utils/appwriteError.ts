import { isError } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * Mappt einen Server-SDK-Fehler (Appwrite) auf einen sauberen H3-/Nuxt-Fehler:
 * echte Client-Fehler (4xx) bleiben 4xx (richtiger Status), alles andere wird
 * 500. Es werden NIE Appwrite-Detailnachrichten an den Client geleakt — nur der
 * übergebene, generische Text. Aufruf: `throw toH3Error(error, 'message')`.
 *
 * EIN BEREITS FERTIGER H3-FEHLER GEHT UNVERÄNDERT DURCH (M13, 2026-08-02).
 *
 * Warum das nötig wurde: die Aufrufstellen sehen fast immer so aus —
 *
 *   await tenantDb(event).create(TABLE, data).catch(e => { throw toH3Error(e, '…') })
 *
 * Das `.catch` fängt also nicht nur Appwrite-Fehler, sondern auch jeden Fehler,
 * den die DATENTÜR selbst wirft. Und die wirft bewusste, fachliche 4xx mit
 * `data.code` (Mandanten-Prüfung 404, Sperre 403 `community_suspended`). Ohne
 * diese Zeile wurde daraus ein 500 mit generischem Text: der Server wies
 * korrekt ab, meldete dem Client aber „interner Fehler" — und der fachliche
 * Grund, den das Envelope (core/server/error.ts) durchreichen soll, war weg.
 * Live erwischt beim M13-Beweis: die Zahlungssperre griff, antwortete aber 500.
 *
 * Sicher, weil ein H3Error hier IMMER aus eigenem Code stammt: `createError`
 * wird nur von uns gerufen, sein `statusText` ist bewusst client-sicher
 * formuliert, und Appwrite-Ausnahmen sind keine H3Errors — deren Behandlung
 * bleibt unverändert.
 */
export function toH3Error(error: unknown, message: string) {
  if (isError(error)) return error
  if (error instanceof AppwriteException && error.code >= 400 && error.code < 500) {
    return createError({ status: error.code, statusText: message })
  }
  return createError({ status: 500, statusText: message })
}

import { z } from 'zod'
import { PAGE_STATUSES } from '../shared/types/page'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export const MAX_PAGE_TITLE = 256
// utf8mb4-ZEILENbudget (nicht die Einzelspalte): body teilt sich die ~65 KB/Zeile
// mit title/slug/locale/status + Appwrite-Interna → 14.000 als sichere Obergrenze.
export const MAX_PAGE_BODY = 14_000

// slug = sprechender URL-Pfad (impressum, agb, datenschutz): klein, keine Slashes
const slugRe = /^[a-z][a-z0-9-]*$/
// locale-Code: en, de, en-US …
const localeRe = /^[a-z]{2}(-[A-Za-z]{2})?$/

/** Upsert einer Seite in EINER Sprache (Admin). */
export function createPageUpsertSchema(t: TranslateFn = identity) {
  return z.object({
    slug: z.string().trim().regex(slugRe, t('pages.validation.slugInvalid')).max(64),
    locale: z.string().trim().regex(localeRe, t('pages.validation.localeInvalid')).max(8),
    title: z.string().trim().min(1, t('pages.validation.titleRequired')).max(MAX_PAGE_TITLE, t('pages.validation.titleMax')),
    body: z.string().max(MAX_PAGE_BODY, t('pages.validation.bodyMax')),
    status: z.enum(PAGE_STATUSES, t('pages.validation.statusInvalid')),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }).strict()
}

// Server-seitige Instanz (Fehlertexte = Keys; die UI validiert mit t())
export const pageUpsertSchema = createPageUpsertSchema()

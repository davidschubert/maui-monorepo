import { z } from 'zod'
import { PAGE_STATUSES } from '../shared/types/page'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export const MAX_PAGE_TITLE = 256
// body ist MEDIUMTEXT (off-row, seit pages-002) — die Spalte fasst ~16 MB.
// 200.000 Zeichen sind ein reiner SSR-/Missbrauchsschutz (längste deutsche
// Datenschutzerklärungen liegen bei ~50–80k), kein Storage-Limit mehr.
export const MAX_PAGE_BODY = 200_000

// slug = sprechender URL-Pfad (imprint, terms, privacy): klein, keine Slashes
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

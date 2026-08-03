import { z } from 'zod'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export const SORT_MODES = ['top', 'new', 'trending', 'discussed'] as const

export function createCommentSchema(t: TranslateFn = identity) {
  return z.object({
    targetId: z.string().min(1, t('comments.validation.targetRequired')),
    targetType: z.string().min(1, t('comments.validation.targetRequired')),
    content: z
      .string()
      .min(1, t('comments.validation.contentRequired'))
      .max(10_000, t('comments.validation.contentMax')),
    parentId: z.string().min(1).optional(),
    // Seiten-URL für die Reply-Notification. Sicherheits-Guard: nur INTERNE
    // absolute Pfade. Genau EIN führender "/", danach KEIN /, \ oder % — sonst
    // werden "//evil", "/\evil" (Browser normalisiert \→/) und "/%2F%2Fevil"
    // zu protokoll-relativen Off-Site-Links → Open-Redirect. Body verbietet
    // zusätzlich jedes Whitespace und jeden Backslash (auch "/ /evil", "/\t//evil").
    targetUrl: z
      .string()
      .max(2000)
      .refine(v => /^\/(?![/\\%])[^\s\\]*$/.test(v), {
        message: 'targetUrl must be an internal absolute path',
      })
      .optional(),
  })
}

/**
 * Gast-Kommentar (Embed E4): dieselben Felder wie ein Nutzer-Kommentar plus
 * einem frei gewählten ANZEIGENAMEN. Kein Account, keine Verifikation (bewusste
 * Produktentscheidung).
 *
 * KEINE E-MAIL MEHR (F18, Davids Entscheidung 2026-08-02). Bis hierher verlangte
 * das Formular zusätzlich eine Adresse, die ausschließlich in `guest_authors`
 * landete — einer Tabelle, die NIEMAND las: keine Moderations-Ansicht, kein
 * Export, kein Skript. Gedacht war sie als Rückfragekanal für die Moderation
 * (docs/referenz/EMBED.md: „für Moderation + DSGVO"); gebaut wurde dieser Kanal
 * nie. Erhebung ohne Zweck ist unter DSGVO das schlechteste Muster, also fällt
 * die Erhebung und nicht die Zweckfrage.
 *
 * `z.object` STRIPPT unbekannte Schlüssel: ein Widget, das noch aus dem
 * Browser-Cache eines Einbetters kommt und `guestEmail` mitschickt, bekommt
 * weiter 201 — die Adresse wird nur verworfen statt gespeichert. Genau deshalb
 * steht hier kein `.strict()`.
 */
export function createGuestCommentSchema(t: TranslateFn = identity) {
  return createCommentSchema(t).extend({
    guestName: z
      .string()
      .trim()
      .min(2, t('comments.validation.guestNameRequired'))
      .max(60, t('comments.validation.guestNameMax')),
  })
}

export function createCommentUpdateSchema(t: TranslateFn = identity) {
  return z.object({
    content: z
      .string()
      .min(1, t('comments.validation.contentRequired'))
      .max(10_000, t('comments.validation.contentMax')),
  })
}

export const commentSchema = createCommentSchema()
export const guestCommentSchema = createGuestCommentSchema()
export const commentUpdateSchema = createCommentUpdateSchema()
export type CommentInput = z.infer<typeof commentSchema>
export type GuestCommentInput = z.infer<typeof guestCommentSchema>

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
})
export type VoteInput = z.infer<typeof voteSchema>

import { z } from 'zod'
import { MAX_POLL_OPTION_LENGTH, MAX_POLL_OPTIONS, MAX_POST_BODY, MAX_POST_TITLE } from '../shared/types/post'
import { textLength } from '../shared/postBody'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * Titel und Text messen CODEPOINTS, nicht UTF-16-Einheiten — genau wie die
 * Spalte, in die sie fallen (Begründung + Messung: shared/postBody.ts).
 * `.max()` von Zod täte hier das Falsche und lehnte einen Beitrag aus 6000
 * Emoji ab, den Appwrite anstandslos speichert.
 */
function titleField(t: TranslateFn) {
  return z.string().trim()
    .refine(v => textLength(v) <= MAX_POST_TITLE, t('posts.validation.titleMax'))
    .optional()
}

function bodyField(t: TranslateFn) {
  return z.string().trim()
    .min(1, t('posts.validation.bodyRequired'))
    .refine(v => textLength(v) <= MAX_POST_BODY, t('posts.validation.bodyMax'))
}

/** Geplante Posts: Termin in der Zukunft, max. 90 Tage voraus (Fat-Finger-Schutz) */
function scheduledAtSchema(t: TranslateFn) {
  return z.iso.datetime({ offset: true })
    .refine(v => Date.parse(v) > Date.now(), t('posts.validation.scheduleFuture'))
    .refine(v => Date.parse(v) < Date.now() + 90 * 24 * 3600_000, t('posts.validation.scheduleTooFar'))
    .optional()
}

const base = (t: TranslateFn) => ({
  title: titleField(t),
  body: bodyField(t),
  scheduledAt: scheduledAtSchema(t),
  /**
   * F1 Stufe 1: Kategorie (Row-Id) oder weglassen. Additiv und optional — ein
   * Beitrag OHNE Kategorie ist der Normalfall und bleibt es (Davids
   * Entscheidung 2: kategorisierte Beiträge bleiben im Feed, der Feed ist der
   * Strom über alles).
   *
   * Hier steht bewusst nur die FORM (Appwrite-Row-Id). Ob die Kategorie
   * existiert, aktiv ist und diesem Mandanten gehört, prüft die Route über die
   * Datentür — ein Zod-Schema kann nicht in die Datenbank sehen.
   */
  categoryId: z.string().trim().max(36).optional(),
})

export function createPostSchema(t: TranslateFn = identity) {
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('post'), ...base(t) }),
    z.object({ type: z.literal('question'), ...base(t) }),
    z.object({
      type: z.literal('poll'),
      ...base(t),
      pollOptions: z.array(z.string().trim().min(1).max(MAX_POLL_OPTION_LENGTH, t('posts.validation.optionMax')))
        .min(2, t('posts.validation.optionsMin'))
        .max(MAX_POLL_OPTIONS, t('posts.validation.optionsMax')),
      pollEndsAt: z.iso.datetime({ offset: true })
        .refine(v => Date.parse(v) > Date.now(), t('posts.validation.pollEndFuture'))
        .optional(),
    }),
  ])
}

export function createPostEditSchema(t: TranslateFn = identity) {
  return z.object({
    title: titleField(t),
    body: bodyField(t),
    /**
     * F1: Umkategorisieren durch den AUTOR.
     *
     * Drei Zustände, und die Unterscheidung ist der ganze Punkt:
     * `undefined` = Feld nicht mitgeschickt ⇒ unverändert (jeder bestehende
     * Aufrufer verhält sich damit exakt wie vorher), `''` = ausdrücklich keine
     * Kategorie mehr (das Thema wird wieder ein reiner Feed-Beitrag), sonst
     * die neue Kategorie.
     *
     * Warum das in Stufe 1 dabei ist, obwohl es nicht in der Aufgabenliste
     * steht: das URL-Schema begründet sich mit „Umkategorisieren ist gratis,
     * alte Links leiten um". Ohne einen Weg, ein Thema zu verschieben, wäre
     * der Kategorie-Zweig der 301-Regel unerreichbarer Code — eine Zusage,
     * die niemand einlösen kann.
     */
    categoryId: z.string().trim().max(36).optional(),
  })
}

export function createVoteSchema(t: TranslateFn = identity) {
  return z.object({
    // -1 wäre Toggle-Sonderfall — bewusst nur 0..5, Toggle = gleiche Option erneut
    optionIndex: z.number(t('posts.validation.optionRequired')).int().min(0).max(MAX_POLL_OPTIONS - 1),
  })
}

/** Up-/Downvote auf den Post (Toggle-Semantik wie comments) */
export function createScoreVoteSchema(t: TranslateFn = identity) {
  return z.object({
    value: z.union([z.literal(1), z.literal(-1)], t('posts.validation.voteInvalid')),
  })
}

// Server-seitige Instanzen (Fehlertexte = Keys; die UI validiert mit t())
export const postSchema = createPostSchema()
export const postEditSchema = createPostEditSchema()
export const voteSchema = createVoteSchema()
export const scoreVoteSchema = createScoreVoteSchema()

import { z } from 'zod'
import {
  SITE_CATEGORIES,
  SITE_DESCRIPTION_MAX,
  SITE_GOAL_IDS,
  SITE_MEMBER_RANGES,
  SITE_PURPOSES,
  SITE_VIBES,
  type SiteGoal,
  type SiteVibeId,
} from '../shared/onboarding'
import { createSlugSchema } from './tenant'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

// z.enum verlangt ein Tupel; die Katalog-Listen sind Arrays. Die Casts halten
// die LITERAL-Typen (nicht `string`), damit der geparste Body direkt in
// SiteProfile passt — sonst schlägt der Compiler erst an der Schreibstelle zu.
const VIBE_IDS = SITE_VIBES.map(vibe => vibe.id) as unknown as [SiteVibeId, ...SiteVibeId[]]
const GOAL_IDS = SITE_GOAL_IDS as unknown as [SiteGoal, ...SiteGoal[]]

/** Code-Format: der Betreiber stellt sie aus, der Kunde tippt sie ab —
 *  deshalb großzügig (Bindestriche erlaubt), aber längenbegrenzt. */
const inviteCodeRe = /^[A-Za-z0-9-]{6,64}$/

export const inviteCodeSchema = z.string().trim().regex(inviteCodeRe)

/** Nicht-verbrauchende Vorprüfung beim Betreten des Wizards. */
export const inviteCheckSchema = z.object({ code: inviteCodeSchema }).strict()

/**
 * Der Wizard-Abschluss (Schritt 7 → „Community erstellen").
 *
 * Bewusst EIN Aufruf mit allen Antworten statt sieben Teil-Schreibvorgängen:
 * so entsteht die Community entweder ganz oder gar nicht — kein halb
 * angelegter Mandant, wenn der Browser zwischen Schritt 4 und 5 zugeht
 * (DoD der Roadmap: „keine verwaiste Tenant-/Workspace-Row bei Abbruch").
 *
 * `slug` statt `host`: der Server baut den Hostnamen (s. createSlugSchema).
 * Es gibt bewusst KEINEN `plan`/`projectId`/`mode`-Parameter — Selbst-
 * bedienung landet immer im Pool mit der Testphase; alles andere bleibt
 * Betreiber-Weg.
 */
export function createOnboardingSiteSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string().trim().min(2, t('onboarding.validation.nameRequired')).max(120),
    slug: createSlugSchema(t),
    purpose: z.enum(SITE_PURPOSES),
    memberRange: z.enum(SITE_MEMBER_RANGES),
    category: z.enum(SITE_CATEGORIES),
    goal: z.enum(GOAL_IDS),
    description: z.string().trim().max(SITE_DESCRIPTION_MAX).optional(),
    vibe: z.enum(VIBE_IDS),
    inviteCode: inviteCodeSchema,
    /** Sprache des Erstellers — bestimmt die Locale der erzeugten Startseite. */
    locale: z.enum(['de', 'en']).optional(),
  }).strict()
}

export const onboardingSiteSchema = createOnboardingSiteSchema()

export type OnboardingSiteInput = z.infer<typeof onboardingSiteSchema>

/** Betreiber stellt einen Code aus (Studio, sites.manage). Der Klartext wird
 *  im Response EINMAL geliefert und nie gespeichert. */
export const inviteCodeCreateSchema = z.object({
  label: z.string().trim().max(120).optional(),
  maxUses: z.number().int().min(0).max(100_000).optional(),
  /** Tage bis zum Ablauf; fehlt = ohne Ablauf. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
}).strict()

export const inviteCodePatchSchema = z.object({
  status: z.enum(['active', 'revoked']),
}).strict()

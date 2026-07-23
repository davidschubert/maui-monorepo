import { z } from 'zod'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

// Kanonischer Hostname (klein, ohne Port/Protokoll/Pfad) — gleiche Regeln wie
// das tenants-Register (DNS-Labels ≤63, nur a-z0-9-, Punycode für Umlaute).
const hostRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
// targetType wie commentSchema (≤64), zusätzlich URL-/CSP-harmlos
const targetTypeRe = /^[\w-]{1,64}$/

function labelsValid(host: string): boolean {
  return host.split('.').every(label => label.length >= 1 && label.length <= 63)
}

/** Einbetter-Site anlegen/ändern (Betreiber, system.manage). */
export function createEmbedSiteSchema(t: TranslateFn = identity) {
  return z.object({
    host: z.string().trim().toLowerCase()
      .regex(hostRe, t('comments.embedAdmin.validation.hostInvalid'))
      .max(253)
      .refine(labelsValid, t('comments.embedAdmin.validation.hostInvalid')),
    label: z.string().trim().max(120).optional(),
    targetTypes: z.array(z.string().trim().regex(targetTypeRe, t('comments.embedAdmin.validation.targetTypeInvalid'))).max(20).optional(),
    active: z.boolean().optional(),
  }).strict()
}

export const embedSiteSchema = createEmbedSiteSchema()

/** PATCH: alles optional, aber nicht leer. */
export const embedSitePatchSchema = createEmbedSiteSchema().partial()
  .refine(body => Object.keys(body).length > 0, 'empty patch')

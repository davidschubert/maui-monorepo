/**
 * Zod-Schemas zu den Manifest-Typen (shared/types/manifest.ts) — genutzt vom
 * CI-Check (scripts/check-manifests.mjs) und ab M2 von der Laufzeit
 * (Feature-Gates/Katalog). Schema und Typ zusammenhalten!
 */
import { z } from 'zod'

const keyPattern = /^[a-z][a-z0-9-]*$/

const manifestTextSchema = z.object({
  en: z.string().min(1),
  de: z.string().min(1),
}).strict()

export const featureManifestSchema = z.object({
  key: z.string().regex(keyPattern),
  tier: z.enum(['foundation', 'optional']),
  requires: z.array(z.string().regex(keyPattern)).optional(),
  hasMigrations: z.boolean(),
  entitlementKey: z.string().regex(keyPattern).optional(),
  title: manifestTextSchema,
  description: manifestTextSchema,
  icon: z.string().min(1).optional(),
}).strict()

export const siteManifestSchema = z.object({
  siteId: z.string().regex(keyPattern),
  features: z.array(z.string().regex(keyPattern)),
}).strict()

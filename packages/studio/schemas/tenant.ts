import { z } from 'zod'
import { TENANT_MODES } from '../shared/types/tenantRecord'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

// Kanonischer Hostname (klein, ohne Port/Protokoll/Pfad, DNS-konform ≤253).
// Die Middleware normalisiert Request-Hosts genauso (normalizeHost, core).
const hostRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
// Appwrite-Projekt-/Row-Ids
const idRe = /^[a-z0-9][a-z0-9-]{0,35}$/i

/** Neuen Tenant anlegen (Betreiber, sites.manage). tenantId ist optional —
 *  der Server vergibt für pool automatisch eine frische Id. */
export function createTenantCreateSchema(t: TranslateFn = identity) {
  return z.object({
    host: z.string().trim().toLowerCase().regex(hostRe, t('studio.tenants.validation.hostInvalid')).max(253),
    mode: z.enum(TENANT_MODES, t('studio.tenants.validation.modeInvalid')),
    projectId: z.string().trim().regex(idRe, t('studio.tenants.validation.projectInvalid')),
    tenantId: z.string().trim().regex(idRe, t('studio.tenants.validation.tenantIdInvalid')).optional(),
  }).strict()
}

export const tenantCreateSchema = createTenantCreateSchema()

/** Status-Umschalter (active ⇄ disabled). */
export const tenantStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
}).strict()

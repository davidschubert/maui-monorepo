import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { Query } from 'node-appwrite'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../shared/types/entitlement'

/**
 * Signiertes Entitlement-Dokument einer Site ausstellen (F3/M8-Vorbereitung):
 * öffentlich (die Site pullt ohne Studio-Session; der Inhalt ist die
 * Feature-Liste, die Signatur verhindert Fälschung — § 8: Sites halten
 * keine Studio-Keys). Format + Regeln: core entitlementDocument.ts.
 * validUntil 24 h / graceUntil 7 Tage ab Ausstellung; suspended kommt aus
 * dem Site-Lifecycle (sites.status). Microcache 60 s pro Projekt —
 * kaufmännische Änderungen wirken über den 15-min-Pull der Site ohnehin
 * nicht schneller.
 */
const VALID_MS = 24 * 3_600_000
const GRACE_MS = 7 * 24 * 3_600_000

const docCache = createMicrocache<string>(60_000)

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId')
  if (!projectId || !/^[a-z][a-z0-9-]*$/.test(projectId)) {
    throw createError({ status: 400, statusText: 'Invalid project id' })
  }

  const config = useRuntimeConfig(event)
  if (!config.entitlementsPrivateKey || !config.entitlementsKid) {
    throw createError({ status: 503, statusText: 'Entitlement signing is not configured' })
  }

  const cached = docCache.get(projectId)
  if (cached) {
    setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return cached
  }

  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows: sites } = await admin.tablesDB.listRows<SiteRow>({
    databaseId, tableId: SITES_TABLE,
    queries: [Query.equal('projectId', projectId), Query.limit(1)],
  }).catch((error) => { throw toH3Error(error, 'Could not load site') })
  const site = sites[0]
  if (!site) {
    throw createError({ status: 404, statusText: 'Unknown site' })
  }

  const { rows: grants } = await admin.tablesDB.listRows<EntitlementRow>({
    databaseId, tableId: ENTITLEMENTS_TABLE,
    queries: [Query.equal('siteProjectId', projectId), Query.equal('status', 'active'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not load entitlements') })

  const now = Date.now()
  const payload = {
    v: 1,
    kid: config.entitlementsKid,
    siteProjectId: projectId,
    features: grants.map(grant => grant.featureKey).sort(),
    suspended: site.status === 'suspended',
    issuedAt: new Date(now).toISOString(),
    validUntil: new Date(now + VALID_MS).toISOString(),
    graceUntil: new Date(now + GRACE_MS).toISOString(),
  }

  let document: string
  try {
    const key = createPrivateKey({ key: Buffer.from(config.entitlementsPrivateKey, 'base64'), format: 'der', type: 'pkcs8' })
    const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const signature = cryptoSign(null, Buffer.from(segment, 'utf8'), key).toString('base64url')
    document = `${segment}.${signature}`
  }
  catch {
    throw createError({ status: 500, statusText: 'Could not sign entitlement document' })
  }

  docCache.set(projectId, document)
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return document
})

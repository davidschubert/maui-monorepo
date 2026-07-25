import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  TRIAL_PLAN,
  evaluateSiteQuota,
  resolveVibe,
  serializeSiteProfile,
  trialEndsAt,
  type SiteProfile,
} from '../../shared/onboarding'
import { slugToHost } from '../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { SITE_MEMBERS_TABLE, type SiteMemberRow } from '../../shared/types/siteMember'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../shared/types/workspace'
import type { InviteCodeRow } from '../../shared/types/inviteCode'
import type { RuntimeIdentity } from './onboardingService'

/**
 * Die eigentliche Anlage einer Self-Service-Community (SAAS-ROADMAP #1).
 *
 * Reihenfolge und Fehlerverhalten sind hier der Kern, nicht die Schreibbefehle:
 *
 *  - **Idempotenz über den Hostnamen.** Ein Retry mit derselben Nutzlast
 *    findet die Community wieder und gibt sie zurück, statt eine zweite
 *    anzulegen. Es braucht deshalb keinen Idempotency-Key und keinen
 *    zusätzlichen Zustand: der Host IST der natürliche Schlüssel (Unique-Index
 *    uq_host). Gehört der Host jemand ANDEREM, ist es ein 409 — nie eine
 *    stille Übernahme.
 *  - **Kompensation statt halber Community.** Legt der Tenant an, scheitert
 *    aber die Owner-Mitgliedschaft, wird der Tenant wieder gelöscht. Sonst
 *    stünde eine Community da, die niemandem gehört und die niemand
 *    aufräumen kann — genau die „verwaiste Row", die die Roadmap-DoD verbietet.
 *  - **Reihenfolge:** Workspace (wiederverwendet) → Tenant → Mitgliedschaft.
 *    Der Workspace kommt zuerst, weil ein übrig gebliebener leerer Workspace
 *    harmlos ist; eine Community ohne Owner ist es nicht.
 */

export interface ProvisionInput {
  name: string
  slug: string
  vibe: string
  profile: SiteProfile
  inviteCode: InviteCodeRow | null
}

export interface ProvisionResult {
  siteId: string
  host: string
  url: string
  plan: string
  trialEndsAt: string | null
  workspaceId: string
  /** true = derselbe Aufruf lief schon einmal durch (Retry/Doppelklick). */
  reused: boolean
}

function siteUrl(host: string): string {
  return `https://${host}`
}

async function findTenantByHost(event: H3Event, host: string): Promise<TenantRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  return rows[0] ?? null
}

/** Alle Communities, die diesem Runtime-User als Owner gehören. */
async function ownedSites(event: H3Event, identity: RuntimeIdentity): Promise<TenantRow[]> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const memberships: SiteMemberRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<SiteMemberRow>({
      databaseId,
      tableId: SITE_MEMBERS_TABLE,
      queries: [
        Query.equal('runtimeProjectId', identity.projectId),
        Query.equal('runtimeUserId', identity.userId),
        Query.equal('role', 'owner'),
        Query.limit(100),
        Query.offset(offset),
      ],
    })
    memberships.push(...page.rows)
    if (page.rows.length < 100) break
  }
  if (!memberships.length) return []

  // Die Tenants zu den Mitgliedschaften lesen. Query.equal mit Id-Liste statt
  // N Einzel-Reads; fehlende Ids (gelöschte Site, verwaiste Mitgliedschaft)
  // fallen einfach weg und blockieren das Kontingent damit nicht.
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: TENANTS_TABLE,
    queries: [Query.equal('$id', memberships.map(row => row.siteId)), Query.limit(100)],
  })
  return rows
}

async function findOrCreateWorkspace(event: H3Event, identity: RuntimeIdentity, fallbackName: string): Promise<WorkspaceRow> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const { rows } = await admin.tablesDB.listRows<WorkspaceRow>({
    databaseId,
    tableId: WORKSPACES_TABLE,
    queries: [Query.equal('ownerEmail', identity.email), Query.limit(1)],
  })
  if (rows[0]) return rows[0]

  return admin.tablesDB.createRow<WorkspaceRow>({
    databaseId,
    tableId: WORKSPACES_TABLE,
    rowId: ID.unique(),
    // Start immer im free-Plan: die Testphase ist eine Eigenschaft der SITE
    // (tenants.plan + trialEndsAt), nicht des Abrechnungs-Workspace. Sonst
    // müsste der Stripe-Sync später einen Plan zurückdrehen, den nie jemand
    // gekauft hat.
    data: {
      name: identity.name?.trim() || fallbackName,
      ownerEmail: identity.email,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      plan: 'free',
      status: 'active',
    },
  })
}

async function isOwner(event: H3Event, siteId: string, identity: RuntimeIdentity): Promise<boolean> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<SiteMemberRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITE_MEMBERS_TABLE,
    queries: [
      Query.equal('siteId', siteId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(1),
    ],
  })
  return rows[0]?.role === 'owner'
}

export async function provisionCommunity(
  event: H3Event,
  identity: RuntimeIdentity,
  input: ProvisionInput,
  now: number = Date.now(),
): Promise<ProvisionResult> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const host = slugToHost(input.slug)

  // ── Idempotenz / Host-Kollision ───────────────────────────────────────────
  const existing = await findTenantByHost(event, host)
  if (existing) {
    if (await isOwner(event, existing.$id, identity)) {
      return {
        siteId: existing.$id,
        host: existing.host,
        url: siteUrl(existing.host),
        plan: existing.plan || 'free',
        trialEndsAt: existing.trialEndsAt,
        workspaceId: existing.workspaceId || '',
        reused: true,
      }
    }
    throw createError({ status: 409, statusText: 'This address is already taken' })
  }

  // ── Konto-Kontingent (die eigentliche Missbrauchs-Bremse) ─────────────────
  const mine = await ownedSites(event, identity)
  const quota = evaluateSiteQuota(mine.map(row => ({ status: row.status, trialEndsAt: row.trialEndsAt })), now)
  if (!quota.allowed) {
    throw createError({
      status: 403,
      statusText: quota.reason === 'trial_single_site'
        ? 'One community per account during the trial'
        : 'Community limit reached',
    })
  }

  const workspace = await findOrCreateWorkspace(event, identity, input.name)
  const vibe = resolveVibe(input.vibe)
  // Dasselbe Projekt, gegen das die Identität geprüft wurde — der Tenant muss
  // im Projekt des Nutzers entstehen, sonst gehört ihm seine Site nicht.
  const projectId = identity.projectId

  const tenant = await admin.tablesDB.createRow<TenantRow>({
    databaseId,
    tableId: TENANTS_TABLE,
    rowId: ID.unique(),
    data: {
      name: input.name,
      host,
      mode: 'pool',
      projectId,
      tenantId: `t-${ID.unique()}`,
      status: 'active',
      wave: 'stable',
      // Testphase: Pro-QUOTA für 14 Tage. Die Pro-FEATURES (Feed, Events)
      // sind Early Access und damit ohnehin nicht Teil des Versprechens —
      // was hier gestaffelt wird, sind die Mengen-Limits.
      plan: TRIAL_PLAN,
      trialEndsAt: trialEndsAt(now),
      workspaceId: workspace.$id,
      theme: vibe.theme,
      variant: vibe.variant,
      // Privat als Default (G0-Entscheidung 7) — „öffentlich lesbar" ist ein
      // bewusster Schalter in den Einstellungen, keine Voreinstellung.
      audience: 'members',
      profile: serializeSiteProfile(input.profile),
      inviteCodeId: input.inviteCode?.$id ?? '',
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create community') })

  // ── Owner-Mitgliedschaft — mit Kompensation ───────────────────────────────
  try {
    await admin.tablesDB.createRow<SiteMemberRow>({
      databaseId,
      tableId: SITE_MEMBERS_TABLE,
      rowId: ID.unique(),
      data: {
        siteId: tenant.$id,
        runtimeProjectId: identity.projectId,
        runtimeUserId: identity.userId,
        role: 'owner',
        status: 'active',
        email: identity.email,
      },
    })
  }
  catch (error) {
    // Ohne Owner ist die Community unerreichbar UND unlöschbar für den Kunden
    // → zurückrollen, damit der Retry sauber neu anlegen kann.
    await admin.tablesDB.deleteRow({ databaseId, tableId: TENANTS_TABLE, rowId: tenant.$id })
      .catch(cleanup => logEvent('error', 'onboarding.rollback_failed', {
        siteId: tenant.$id,
        host,
        message: cleanup instanceof Error ? cleanup.message : String(cleanup),
      }))
    throw toH3Error(error, 'Could not create community')
  }

  logEvent('info', 'onboarding.site_created', {
    siteId: tenant.$id,
    host,
    workspaceId: workspace.$id,
    runtimeUserId: identity.userId,
    inviteCodeId: input.inviteCode?.$id ?? '',
    emailVerified: identity.emailVerified,
  })

  return {
    siteId: tenant.$id,
    host,
    url: siteUrl(host),
    plan: TRIAL_PLAN,
    trialEndsAt: tenant.trialEndsAt,
    workspaceId: workspace.$id,
    reused: false,
  }
}

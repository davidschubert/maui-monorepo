import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { SITE_INVITES_TABLE, type SiteInviteRow } from '../../../../../shared/types/siteInvite'
import { SITE_MEMBERS_TABLE, type SiteMemberRow } from '../../../../../shared/types/siteMember'
import { TENANTS_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../../utils/onboardingService'
import { hashInviteToken } from '../../../../utils/workspaceMembers'

/**
 * Einladung annehmen — der EINE Klick aus Davids Entscheidung 2.
 *
 * Bewusst OHNE `team.manage`: hier handelt die eingeladene Person, nicht der
 * Betreiber. Die drei Beweise sind trotzdem vollständig:
 *  1. Service-Secret (der Aufrufer ist unser Deployment),
 *  2. JWT (WER annimmt — vom Control Plane selbst geprüft),
 *  3. Token-Hash + E-Mail-Gleichheit (ein weitergeleiteter Link bindet nicht den
 *     falschen Account — dieselbe Regel wie bei den Workspace-Einladungen).
 *
 * `siteId` kommt aus der EINLADUNG, nie aus dem Body: sonst könnte ein gültiges
 * Token für eine fremde Community eingelöst werden.
 *
 * Idempotent und rückkehrfähig: existiert die Mitgliedschaft schon (Unique-Index
 * über das Tripel), wird sie AKTUALISIERT — genau das macht die Wieder-Einladung
 * einer entfernten Person möglich (status zurück auf 'active', Rolle neu).
 * Fehlermeldungen bleiben generisch, damit das Token kein Orakel wird.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** Aus dem Mail-Link. */
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /**
   * Aus der eigenen Einladungs-Liste (/api/control/site/invites/mine) — für den
   * Weg ohne Mail-Link. Sicher, weil die Adressgleichheit unten GENAUSO geprüft
   * wird: eine fremde inviteId zu erraten hilft nicht, sie gehört zu einer
   * anderen Adresse.
   */
  inviteId: z.string().min(1).max(36).optional(),
}).strict().refine(body => Boolean(body.token) !== Boolean(body.inviteId), {
  message: 'Either token or inviteId',
})

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  let invite: SiteInviteRow | null = null
  if (body.token) {
    const { rows } = await admin.tablesDB.listRows<SiteInviteRow>({
      databaseId,
      tableId: SITE_INVITES_TABLE,
      queries: [Query.equal('tokenHash', hashInviteToken(body.token)), Query.limit(1)],
    }).catch((error) => { throw toH3Error(error, 'Could not read invitation') })
    invite = rows[0] ?? null
  }
  else if (body.inviteId) {
    invite = await admin.tablesDB.getRow<SiteInviteRow>({
      databaseId, tableId: SITE_INVITES_TABLE, rowId: body.inviteId,
    }).catch(() => null)
  }

  const expired = invite ? Date.parse(invite.expiresAt) < Date.now() : true
  if (!invite || invite.status !== 'pending' || expired) {
    throw createError({ status: 400, statusText: 'Invalid or expired invitation' })
  }
  if (invite.email.trim().toLowerCase() !== (identity.email ?? '').trim().toLowerCase()) {
    throw createError({ status: 403, statusText: 'Invitation was issued for a different email address' })
  }

  // Die Community muss zu dem Projekt gehören, gegen das das JWT geprüft wurde —
  // sonst entstünde eine Mitgliedschaft mit fremder Runtime-Identität.
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: TENANTS_TABLE, rowId: invite.siteId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 400, statusText: 'Invalid or expired invitation' })
  }

  const { rows: existing } = await admin.tablesDB.listRows<SiteMemberRow>({
    databaseId,
    tableId: SITE_MEMBERS_TABLE,
    queries: [
      Query.equal('siteId', invite.siteId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const current = existing[0]
  if (current) {
    // Rückkehr oder Rollen-Wechsel per Einladung. Einen OWNER stuft eine
    // Einladung nie zurück — sonst könnte ein Admin den Inhaber per Mail
    // degradieren.
    await admin.tablesDB.updateRow<SiteMemberRow>({
      databaseId, tableId: SITE_MEMBERS_TABLE, rowId: current.$id,
      data: {
        status: 'active',
        removedAt: null,
        ...(current.role === 'owner' ? {} : { role: invite.role }),
        email: identity.email ?? current.email,
      },
    }).catch((error) => { throw toH3Error(error, 'Could not activate membership') })
  }
  else {
    await admin.tablesDB.createRow<SiteMemberRow>({
      databaseId, tableId: SITE_MEMBERS_TABLE, rowId: ID.unique(),
      data: {
        siteId: invite.siteId,
        runtimeProjectId: identity.projectId,
        runtimeUserId: identity.userId,
        role: invite.role,
        status: 'active',
        email: identity.email ?? invite.email,
        removedAt: null,
      },
    }).catch((error) => { throw toH3Error(error, 'Could not create membership') })
  }

  await admin.tablesDB.updateRow({
    databaseId, tableId: SITE_INVITES_TABLE, rowId: invite.$id,
    data: { status: 'accepted', acceptedBy: identity.userId },
  }).catch(() => {})

  logEvent('info', 'site.invite_accepted', {
    siteId: invite.siteId,
    inviteId: invite.$id,
    runtimeUserId: identity.userId,
    role: invite.role,
  })

  return { ok: true, siteId: invite.siteId, host: tenant.host, role: invite.role }
})

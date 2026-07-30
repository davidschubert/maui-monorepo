import { Query } from 'node-appwrite'
import { z } from 'zod'
import { SITE_INVITES_TABLE, type SiteInviteRow } from '../../../../../shared/types/siteInvite'
import { TENANTS_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../../utils/onboardingService'

/**
 * „Bin ich in DIESE Community eingeladen?" — die Antwort für die /join-Seite,
 * wenn kein Token im Link steckt (Glocken-Meldung, zweiter Besuch, Mail auf dem
 * anderen Gerät). Genau das macht Davids Entscheidung 2 wahr: wer schon ein
 * Konto hat, ist nach dem Anmelden EINEN Klick entfernt.
 *
 * KEIN `team.manage` — hier fragt die eingeladene Person nach sich selbst. Die
 * Grenze ist die geprüfte E-Mail-Adresse aus dem JWT: gefunden werden nur
 * offene Einladungen an DIESE Adresse und NUR für die mitgegebene Site (der Host,
 * auf dem die Seite läuft). Damit ist die Route kein Verzeichnis fremder
 * Einladungen und kein Konto-Orakel.
 *
 * Zurück geht weder Token noch Hash — die Annahme läuft über die inviteId, und
 * die prüft dieselbe Adressgleichheit noch einmal.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  siteId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: TENANTS_TABLE, rowId: body.siteId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const email = (identity.email ?? '').trim().toLowerCase()
  if (!email) return { invites: [], siteName: tenant.name }

  const { rows } = await admin.tablesDB.listRows<SiteInviteRow>({
    databaseId,
    tableId: SITE_INVITES_TABLE,
    queries: [
      Query.equal('siteId', body.siteId),
      Query.equal('email', email),
      Query.equal('status', 'pending'),
      Query.orderDesc('$createdAt'),
      Query.limit(5),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read invitations') })

  const now = Date.now()
  const invites = rows
    .filter(row => Date.parse(row.expiresAt) > now)
    .map(row => ({ id: row.$id, role: row.role, expiresAt: row.expiresAt }))

  return { invites, siteName: tenant.name }
})

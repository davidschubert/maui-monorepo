import { Query } from 'node-appwrite'
import { z } from 'zod'
import { tenantRoleHasCapability, isTenantRole } from '../../../../../core/shared/tenantAuthz'
import { isBuiltinThemeSelection } from '../../../../../themes/shared/builtinThemes'
import { SITE_MEMBERS_TABLE, type SiteMemberRow } from '../../../../shared/types/siteMember'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { isSafeThemeToken } from '../../../../shared/onboarding'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * Self-Service: das Erscheinungsbild EINER Community setzen (Davids
 * Entscheidung 12 vom 2026-07-28 — Theme + Variante gehören der Kundin).
 *
 * Der Schreibweg ist DERSELBE wie beim Registrierungs-Schalter (S1), und aus
 * demselben Grund: `tenants` gehört dem CONTROL PLANE, der Picker steht aber
 * im Dashboard der Kundin, das in der PLATFORM-App läuft. Die Platform-App hat
 * aufs Control Plane nur einen READ-ONLY-Key (Scope rows.read) und kann per
 * Design nicht schreiben. Es gibt genau EINEN vorgesehenen Kanal
 * (onboardingService.ts): Service-Secret im Header + Appwrite-JWT des Nutzers
 * im Body. Diese Route benutzt ihn, statt einen zweiten zu erfinden.
 *
 * DREI unabhängige Prüfungen, und alle drei müssen halten:
 *  1. Service-Secret — der Aufrufer ist unser eigenes Deployment (404 ohne
 *     konfiguriertes Secret, 401 bei falschem).
 *  2. JWT — WER umfärbt. Vom Control Plane SELBST gegen das Pool-Projekt
 *     geprüft; eine Identitätsbehauptung des Aufrufers gilt nicht.
 *  3. Site-Rolle — der JWT-Inhaber ist owner/admin GENAU DIESER Site
 *     (site_members, `branding.manage`). Deshalb ist eine mitgeschickte fremde
 *     `siteId` harmlos: ohne Mitgliedschaft endet sie in 403.
 *
 * BEWUSSTE HÄRTE — der Operator-Break-Glass reicht hier NICHT durch: die
 * Platform-App lässt einen Betreiber mit globalem Label per
 * requireSitePermission passieren (protokolliert), das Control Plane verlangt
 * aber eine echte `site_members`-Row. Ein Betreiber ohne Mitgliedschaft
 * bekommt also 403. Das ist dieselbe Regel wie bei registration.post.ts und
 * gewollt: das Control Plane glaubt dem Aufrufer nichts, auch nicht seine
 * Betreiber-Eigenschaft.
 *
 * GESCHRIEBEN WIRD AUSSCHLIESSLICH `theme` + `variant` — kein durchgereichtes
 * Body-Objekt. Wirksam wird die Änderung, sobald der Resolver-Cache der
 * Platform-App abgelaufen ist (≤30 s).
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** = tenants.$id. Wird NICHT geglaubt, sondern gegen die Mitgliedschaft geprüft. */
  siteId: z.string().min(1).max(36),
  /** Built-in-Katalog-Key (packages/themes) oder '' = Instanz-Einstellung. */
  theme: z.string().max(32),
  /** Tonale Variante DIESES Themes oder '' = Basisfarbe. */
  variant: z.string().max(32),
}).strict().refine(
  // Katalog-Prüfung gegen die EINZIGE Wahrheit (themeRegistry.gen.ts, aus
  // theme.catalog.ts generiert). Die Platform-App prüft dasselbe schon —
  // dass es hier NOCH einmal passiert, ist der Punkt der Naht.
  value => isBuiltinThemeSelection(value.theme, value.variant),
  { message: 'Unknown theme or variant' },
).refine(
  // Zweiter, KATALOG-UNABHÄNGIGER Wächter: die Werte landen später als
  // data-theme/data-variant im <html> jeder Seite dieser Community. Sollte der
  // Katalog je einen Key mit Sonderzeichen bekommen, fängt ihn diese Zeile —
  // dieselbe Funktion, die auch der Resolver benutzt (mapTenantRowToContext).
  value => (value.theme === '' || isSafeThemeToken(value.theme))
    && (value.variant === '' || isSafeThemeToken(value.variant)),
  { message: 'Unsafe theme token' },
)

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  // Rolle DIESES Runtime-Users auf DIESER Site. Fail-closed: keine aktive
  // Mitgliedschaft, unbekannte Rolle oder zu schwache Rolle → 403.
  const { rows: memberships } = await admin.tablesDB.listRows<SiteMemberRow>({
    databaseId,
    tableId: SITE_MEMBERS_TABLE,
    queries: [
      Query.equal('siteId', body.siteId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.equal('status', 'active'),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const role = memberships[0]?.role
  if (!role || !isTenantRole(role) || !tenantRoleHasCapability(role, 'branding.manage')) {
    logEvent('warn', 'site.branding_denied', {
      siteId: body.siteId,
      runtimeUserId: identity.userId,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  // Gehört die Site überhaupt zu dem Projekt, gegen das wir das JWT geprüft
  // haben? Ohne diese Zeile könnte eine Mitgliedschafts-Row mit dem richtigen
  // Projekt, aber einer siteId aus einer ANDEREN Runtime auf einen fremden
  // Tenant zeigen. 404 statt 403 — eine fremde Id soll sich nicht bestätigen.
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: TENANTS_TABLE, rowId: body.siteId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: TENANTS_TABLE,
    rowId: body.siteId,
    data: { theme: body.theme, variant: body.variant },
  }).catch((error) => { throw toH3Error(error, 'Could not update site') })

  logEvent('info', 'site.branding_changed', {
    siteId: row.$id,
    runtimeUserId: identity.userId,
    theme: body.theme,
    variant: body.variant,
  })

  return { siteId: row.$id, theme: row.theme ?? '', variant: row.variant ?? '' }
})

import type { H3Event } from 'h3'
import type { Capability } from '../../shared/types/authz'
import type { CurrentUser } from '../../shared/types/appwrite'
import { decideSiteAccess } from '../../shared/siteAccess'
import type { TenantRole } from '../../shared/tenantAuthz'

/**
 * Gate für SITE-BEZOGENE Routen (O5) — Inhalte und Moderation EINER Community.
 *
 * `requirePermission` bleibt für alles, was der ganzen INSTANZ gehört
 * (app_config, Themes-Katalog, Nutzerverwaltung, Audit): dort ist ein globales
 * Label die richtige Autorität, und ein Kunden-Owner hat keines — solche Routen
 * sind für ihn also schon heute geschlossen und bleiben es.
 *
 * Hier dagegen entscheidet die Mitgliedschaft in DIESER Site (G1), mit
 * Operator-Break-Glass als zweitem Weg. Der Break-Glass wird protokolliert:
 * die G1-Zusage ist „kein stiller Dauer-Bypass".
 *
 * MUSS awaited werden (die Rollen-Auflösung liest cross-Projekt).
 */
export async function requireSitePermission(
  event: H3Event,
  capability: Capability,
): Promise<{ user: CurrentUser, role: TenantRole | null }> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const tenant = event.context.tenant
  const tenantScoped = Boolean(tenant)
  const role = tenantScoped ? await resolveTenantRole(event) : null

  const decision = decideSiteAccess({
    capability,
    labels: user.labels ?? [],
    tenantScoped,
    role,
  })

  if (!decision.allowed) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  if (decision.via === 'operator') {
    // Betreiber greift auf eine KUNDEN-Site zu. Das ist erlaubt (Support), aber
    // niemals unsichtbar — die Zeile ist der Audit-Trail.
    logEvent('warn', 'site.operator_access', {
      capability,
      communityId: tenant?.communityId ?? '',
      userId: user.$id,
      hasSiteRole: Boolean(role),
    })
  }

  return { user, role }
}

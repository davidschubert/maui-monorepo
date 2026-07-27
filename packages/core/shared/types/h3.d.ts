import type { CurrentUser } from './appwrite'
import type { TenantContext } from './tenant'
import type { TenantRole } from '../tenantAuthz'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/auth.ts, undefined ohne Session */
    user?: CurrentUser
    /** Horizont-3 Mandant — gesetzt von server/middleware/00.tenant.ts (nur bei
     *  aktivem maui.tenancy-Gate + registriertem Resolver), sonst undefined. */
    tenant?: TenantContext
    /**
     * Site-Rolle des eingeloggten Users auf DIESEM Mandanten (N1) — gesetzt von
     * server/middleware/site-role.ts, NUR für Seiten-SSR (kein /api/-Pfad; API-
     * Routen autorisieren selbst über requireSitePermission/requireTenantPermission).
     * undefined = nicht aufgelöst (Gast, kein Tenant, API-Pfad); null = aufgelöst,
     * aber keine Mitgliedschaft.
     */
    siteRole?: TenantRole | null
    /**
     * Der Request lief auf einem KONTROLL-Host (Kundenbereich, z. B.
     * app.pukalani.app) — gesetzt von server/middleware/00.tenant.ts.
     *
     * Solche Hosts sind bewusst KEIN Mandant: `tenant` bleibt undefined. Genau
     * deshalb ist das Flag sicherheitsrelevant — ohne Mandanten würden
     * tenant-gescopte Routen dort UNGESCOPT laufen. Die Middleware
     * 01.control-center.ts lässt darum nur eine ausdrückliche Liste von
     * API-Pfaden zu und antwortet auf alles andere mit 404.
     */
    controlCenter?: boolean
  }
}

export {}

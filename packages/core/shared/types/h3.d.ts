import type { CurrentUser } from './appwrite'
import type { TenantContext } from './tenant'
import type { CommunityRole } from '../communityAuthz'
import type { TrustLevel } from '../trustLevel'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/02.auth.ts, undefined ohne Session */
    user?: CurrentUser
    /** Horizont-3 Mandant — gesetzt von server/middleware/00.tenant.ts (nur bei
     *  aktivem pukalani.tenancy-Gate + registriertem Resolver), sonst undefined. */
    tenant?: TenantContext
    /**
     * Site-Rolle des eingeloggten Users auf DIESEM Mandanten (N1) — gesetzt von
     * server/middleware/07.community-role.ts, NUR für Seiten-SSR (kein /api/-Pfad; API-
     * Routen autorisieren selbst über requireCommunityPermission).
     * undefined = nicht aufgelöst (Gast, kein Tenant, API-Pfad); null = aufgelöst,
     * aber keine Mitgliedschaft.
     */
    communityRole?: CommunityRole | null
    /**
     * Vertrauensstufe des eingeloggten Users in DIESER Community (F1 Teilpaket
     * 3) — gesetzt von derselben Middleware wie `communityRole` und aus
     * demselben Grund: das Dashboard und die Themen-Menüs blenden Knöpfe nach
     * Capabilities aus, und drei davon kommen seit diesem Teilpaket aus der
     * Stufe. Ohne den Spiegel sähe eine Stufe 4 ihre Werkzeuge nicht.
     *
     * NUR Seiten-SSR (kein /api/-Pfad) — API-Routen fragen selbst
     * (`requireCommunityPermission`, das ist und bleibt die Autorität).
     * undefined = nicht aufgelöst; 0 = aufgelöst, keine Stufe.
     */
    communityTrustLevel?: TrustLevel
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

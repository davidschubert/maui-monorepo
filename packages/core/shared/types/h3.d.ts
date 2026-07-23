import type { CurrentUser } from './appwrite'
import type { TenantContext } from './tenant'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/auth.ts, undefined ohne Session */
    user?: CurrentUser
    /** Horizont-3 Mandant — gesetzt von server/middleware/00.tenant.ts (nur bei
     *  aktivem maui.tenancy-Gate + registriertem Resolver), sonst undefined. */
    tenant?: TenantContext
  }
}

export {}

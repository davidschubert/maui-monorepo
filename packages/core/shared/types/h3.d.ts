import type { CurrentUser } from './appwrite'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/auth.ts, undefined ohne Session */
    user?: CurrentUser
  }
}

export {}

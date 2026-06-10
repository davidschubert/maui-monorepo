import type { Models } from 'node-appwrite'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/auth.ts, undefined ohne Session */
    user?: Models.User<Models.Preferences>
  }
}

export {}

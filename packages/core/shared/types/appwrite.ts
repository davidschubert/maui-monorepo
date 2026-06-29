import type { Models } from 'node-appwrite'

/**
 * Basis für Domain-Types in Feature Layern und Apps:
 *   interface Comment extends AppwriteRow { text: string; … }
 * Liegt in shared/ — sichtbar für app/ UND server/.
 */
export type AppwriteRow = Models.Row

/**
 * User-Profildaten leben in den Account-prefs — keine profiles Table (A1).
 * Apps können den Typ per Declaration Merging um eigene prefs erweitern.
 */
export interface MauiUserPrefs extends Models.Preferences {
  bio?: string
  avatarUrl?: string
}

export type CurrentUser = Models.User<MauiUserPrefs>

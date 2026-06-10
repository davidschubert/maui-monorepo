import type { Models } from 'node-appwrite'

/**
 * Basis für Domain-Types in Feature Layern und Apps:
 *   interface Comment extends AppwriteRow { text: string; … }
 * Liegt in shared/ — sichtbar für app/ UND server/.
 */
export type AppwriteRow = Models.Row

/** Typisierte Row-Liste, wie sie tablesDB.listRows<T>() zurückgibt */
export interface RowList<T extends AppwriteRow> {
  total: number
  rows: T[]
}

/**
 * Autorisierungs-Modell (RBAC) — siehe docs/RBAC-CONCEPT.md.
 *
 * Capabilities = atomare Fähigkeiten, gegen die Routen/UI gaten (Code-Identifier,
 * dürfen Punkte enthalten). Rollen = benannte Capability-Bündel, am User als
 * Appwrite-Label gespeichert (Label-Namen sind alphanumerisch).
 */
export type Capability =
  | 'dashboard.access'
  | 'comments.moderate'
  | 'users.manage'
  | 'changelog.manage'
  | 'system.manage'
  | 'storage.manage'
  | 'audit.read'

export type Role = 'admin' | 'moderator'

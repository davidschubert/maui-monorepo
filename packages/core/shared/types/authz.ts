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
  | 'reports.moderate'
  | 'users.manage'
  | 'changelog.manage'
  | 'system.manage'
  | 'storage.manage'
  | 'audit.read'
  | 'activity.manage'
  | 'media.manage'
  | 'sites.manage'
  | 'posts.moderate'
  | 'events.manage'
  | 'feedback.manage'
  | 'billing.manage'
  | 'courses.manage'
  | 'tickets.manage'
  | 'pages.manage'
  // G1 — Kunden-Site-Rollen (tenantAuthz.ts): feinere Caps, die die 5 Site-
  // Rollen sauber trennen (Autor ≠ Moderator ≠ Admin ≠ Owner).
  | 'posts.write' // Beiträge verfassen (Editor) — ohne posts.moderate
  | 'branding.manage' // Themes/Schriften der Site (Admin) — nicht Editor
  | 'team.manage' // Site-Mitglieder + Rollen (Owner/Admin) — nicht Moderator/Editor
  | 'site.transfer' // Owner-Übergabe (nur Owner)
  | 'site.delete' // Site löschen (nur Owner)

export type Role = 'admin' | 'moderator'

/**
 * Autorisierungs-Modell (RBAC) — siehe docs/referenz/RBAC-CONCEPT.md.
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
  // G1 — Community-Rollen (communityAuthz.ts): feinere Caps, die die 5 Rollen
  // sauber trennen (Autor ≠ Moderator ≠ Admin ≠ Owner). Die drei mit dem
  // Präfix "community." kann NUR der Owner EINER Community; sie hießen bis
  // E8 Etappe 4 (2026-07-30) "site.*". Capability-Werte werden NIRGENDS
  // persistiert (Rollen ja, Capabilities nie) — deshalb war das ein reiner
  // Code-Rename ohne Datenwanderung.
  | 'posts.write' // Beiträge verfassen (Editor) — ohne posts.moderate
  | 'branding.manage' // Themes/Schriften der Community (Admin) — nicht Editor
  | 'team.manage' // Community-Mitglieder + Rollen (Owner/Admin) — nicht Moderator/Editor
  | 'community.transfer' // Owner-Übergabe (nur Owner)
  | 'community.billing' // Abo der Community: Kauf + Stripe-Portal (nur Owner, A6)
  | 'community.delete' // Community löschen (nur Owner)

export type Role = 'admin' | 'moderator'

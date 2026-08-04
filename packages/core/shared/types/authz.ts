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
  /**
   * Fremde Termine moderieren (F15, 2026-08-03) — ausblenden/wiederherstellen
   * und die Meldungs-Queue lesen.
   *
   * BEWUSST GETRENNT von `events.manage`: das ist dieselbe Geschwister-Trennung
   * wie bei posts (`posts.write` ≠ `posts.moderate`). `events.manage` gehört dem
   * EDITOR — wer Termine verfasst, pflegt seine eigenen; Moderation ist das
   * Urteil über FREMDE Inhalte und gehört zum MODERATOR. Eine gemeinsame
   * Capability hätte jedem Editor die Moderation mitgegeben und jedem Moderator
   * das Anlegen — beides falsch herum.
   */
  | 'events.moderate'
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
  /**
   * Einbetter-Register des Kommentar-Widgets (F37, 2026-08-02): welche FREMDE
   * Seite das Widget dieser Community rahmen darf. Nur Owner.
   *
   * BEWUSST eine eigene Community-Capability statt `system.manage`: die
   * embed-sites-Routen trugen bis heute das INSTANZ-Label, und im Silo war das
   * richtig (dort ist der Betreiber der einzige Einbetter). Im Pool machte es
   * die Seite unbenutzbar — ein Kunden-Owner trägt nie ein globales Label,
   * konnte seine eigenen Einbetter also weder sehen noch anlegen.
   *
   * Warum Owner und nicht Admin: ein freigegebener Host bekommt
   * `frame-ancestors` UND (mit pukalani.auth.embedSession) ein partitioniertes
   * Session-Cookie auf der fremden Seite. Das ist dieselbe Klasse von
   * Entscheidung wie das Abo — sie bindet die Community nach außen. Dieselbe
   * Begründung wie bei `community.billing` (A6).
   */
  | 'community.embed' // Einbetter-Domains des Widgets (nur Owner)

export type Role = 'admin' | 'moderator'

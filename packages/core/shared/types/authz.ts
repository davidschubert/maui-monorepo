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
  /**
   * Die STRUKTUR der Discussions pflegen: Kategorien anlegen, umbenennen,
   * sortieren, stilllegen (F1 Stufe 1, 2026-08-03).
   *
   * DRITTE posts-Capability, und jede beantwortet eine andere Frage:
   * `posts.write` = eigene Beiträge verfassen (Editor), `posts.moderate` =
   * über fremde Beiträge urteilen (Moderator), `posts.manage` = den Rahmen
   * bestimmen, in dem beide arbeiten. Davids Vorgabe aus dem Konzept ist
   * eindeutig — „der Admin legt Kategorien fest, Mitglieder können KEINE
   * Kategorien anlegen". Deshalb sitzt sie im ADMIN und weder im Editor noch
   * im Moderator: ein Editor, der Kategorien anlegen könnte, wäre genau das
   * Mitglied, das die Vorgabe ausschließt; ein Moderator, der die Struktur
   * umbaut, überschriebe die Entscheidung des Owners.
   *
   * VERWORFEN: die Verwaltung an `posts.moderate` zu hängen, um keine neue
   * Capability zu brauchen. Das hätte die Struktur an die Moderation gekoppelt
   * — dieselbe Vermischung, die `events.moderate` (F15) gerade aufgelöst hat.
   */
  | 'posts.manage' // Kategorien der Discussions (Admin/Owner)
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
  /**
   * Besucherstatistik der Community (2026-08-04): welche Plausible-Site die
   * Seiten dieser Community melden. Nur Owner.
   *
   * Warum eine EIGENE Community-Capability und nicht `system.manage`: dieselbe
   * Lehre wie bei `community.embed` (F37) — eine Instanz-Capability hätte die
   * Fläche im Pool für den Kunden-Owner unerreichbar gemacht, obwohl es SEINE
   * Statistik ist. Der Operator-Admin trägt sie über ALL_CAPABILITIES weiter
   * (Silo-Weg).
   *
   * Warum Owner und nicht Admin: der eingetragene Wert wird zu einem
   * `<script src>` auf JEDER Seite der Community, und die Besuche ihrer
   * Mitglieder gehen an einen Dritten. Das bindet die Community nach außen —
   * dieselbe Klasse von Entscheidung wie `community.embed` und
   * `community.billing`. Ein Admin verwaltet, was INNEN passiert.
   */
  | 'community.analytics' // Plausible-Script-Id der Community (nur Owner)
  /**
   * FREMDE Themen umbenennen und umkategorisieren (F1 Teilpaket 3,
   * Vertrauensstufe 3 — Davids v1-Rechte vom 2026-08-04).
   *
   * DIE VIERTE posts-Capability, und sie schließt eine Lücke statt eine zu
   * öffnen: bis hierher konnte NIEMAND einen fremden Titel oder dessen
   * Einordnung korrigieren — `[id].patch.ts` lässt ausschließlich den Autor
   * durch, auch einen Moderator nicht. Ein falsch einsortiertes Thema blieb
   * also falsch einsortiert, bis sein Verfasser es selbst bemerkte.
   *
   * WARUM SIE NICHT `posts.moderate` HEISST: Moderation urteilt (ausblenden,
   * wiederherstellen, Meldungen), das hier ordnet nur ein. Genau diese Trennung
   * ist der Grund, warum die Stufe sie bekommen darf: ein langjähriges Mitglied
   * soll aufräumen können, ohne über andere richten zu dürfen.
   *
   * Gehalten wird sie AUCH von moderator/admin/owner. Nicht aus Symmetrie,
   * sondern weil das Gegenteil unerklärlich wäre: ein Mitglied der Stufe 3
   * dürfte sonst mehr als der Moderator, der es ernannt hat. Ein Zugewinn,
   * kein Entzug — `posts.moderate` bleibt unverändert, was es war.
   */
  | 'posts.curate' // fremde Themen umbenennen/umkategorisieren (TL3, Moderator+)
  /**
   * Die ZUSTÄNDE eines fremden Themas setzen — anheften, schließen, gelöst
   * (F1 Teilpaket 3, Vertrauensstufe 4).
   *
   * ABGESPALTEN von `posts.moderate`, und das ist der ganze Zweck: die
   * Zustands-Route prüfte bis hierher `posts.moderate` und hätte einer Stufe 4
   * damit auch die Melde-Queue, das Ausblenden und den KI-Assistenten
   * mitgegeben. Davids v1-Zuschnitt nennt ausdrücklich nur die drei Zustände.
   *
   * DIE ROUTE STELLT DESHALB WEITER ZWEI FRAGEN: diese hier entscheidet, ob
   * der Zustand gesetzt werden DARF; `posts.moderate` entscheidet daneben
   * unverändert, ob jemand STAB ist (Wartungsmodus-Ausnahme, Operator-Klinke
   * an der Datentür). Eine Stufe 4 ist ein Mitglied, kein Betreiber.
   */
  | 'posts.arrange' // Zustände fremder Themen: anheften/schließen/gelöst (TL4, Moderator+)
  /**
   * FREMDE Beiträge inhaltlich bearbeiten (F1 Teilpaket 3, Vertrauensstufe 4).
   *
   * Das schärfste der drei Stufen-Rechte, deshalb steht es allein: `posts.curate`
   * korrigiert die HÜLLE (Titel, Einordnung), das hier greift in den TEXT eines
   * anderen Menschen ein. Der Moderator bekommt es BEWUSST NICHT — sein Auftrag
   * ist zu urteilen (ausblenden), nicht umzuschreiben; Admin und Owner haben es,
   * weil ihnen die Inhalte der Community ohnehin gehören (`posts.manage`).
   *
   * Dass eine von Hand ernannte Stufe 4 hier mehr darf als ein Moderator, ist
   * kein Versehen: sie ist eine ausdrückliche Ernennung DURCH DEN OWNER, keine
   * automatisch erreichte Schwelle.
   */
  | 'posts.revise' // fremde Beiträge bearbeiten (TL4, Admin/Owner)
  /**
   * Die Vertrauensstufe 4 („Leader") von Hand ernennen und entziehen
   * (F1 Teilpaket 3) — NUR Owner.
   *
   * Warum Owner und nicht `team.manage` (Admin): Davids Entscheidung nennt den
   * Owner, und die Sache ist dieselbe Klasse wie `community.transfer` — hier
   * wird Macht über fremde Inhalte vergeben, dauerhaft und ohne Schwelle, die
   * sie rechtfertigt. Ein Admin verwaltet, was es gibt; wer Rechte VERSCHENKT,
   * ist der Eigentümer.
   *
   * Der Prefix bleibt `posts.` und nicht `community.`: die Stufe wirkt in den
   * Discussions, nicht auf die ganze Community. Owner-only ist die
   * ROLLEN-ZUORDNUNG (communityAuthz.ts), nicht der Namensraum.
   */
  | 'posts.appoint' // Vertrauensstufe 4 ernennen/entziehen (nur Owner)

export type Role = 'admin' | 'moderator'

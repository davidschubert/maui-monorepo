# `tenant` → `site`: die vollständige Umbenennung

**Status:** geplant, nicht ausgeführt · **Entschieden:** 2026-07-29 (David) ·
**Autor des Plans:** Claude

> Dieses Dokument liegt in `docs/plans/`, weil es NOCH NICHT gebaut ist. Sobald
> es ausgeführt ist: Datei nach `docs/archiv/`, Reste nach `docs/OPEN-ITEMS.md`
> (Doku-Ordnung, CLAUDE.md).

## Die Entscheidung und ihr Preis

Das Projekt hat zwei Wörter für dieselbe Sache: `tenant` (Tabelle `tenants`,
Spalte `tenantId` in 19 Tabellen, `tenantDb`, `tenantContext`,
`requireTenantPermission`) und `site` (`site_members.siteId`, das den Wert von
`tenants.$id` trägt, `requireSitePermission`, Site-Label). **Beide bezeichnen
die Kunden-Community.**

Gemessen am 2026-07-29:

| | Richtung `site` gewinnt | Richtung `tenant` gewinnt |
|---|---|---|
| Code-Vorkommen | 614 | 632 |
| Tabellen umbenennen | 2 (`tenants`, `tenant_plans`) + Kollision | 2 (`site_members`, `site_invites`) |
| **Spalten auf lebenden Kundenzeilen** | **19 Tabellen × bis zu 4 Instanzen** | 2 Tabellen in 1 Projekt |

**David hat `site` gewählt** — im Wissen um die Kosten. Meine Empfehlung war die
andere Richtung (oder gar keine); das ist dokumentiert, nicht relitigiert. Der
Grund für die Entscheidung ist gut: `site` ist das Wort, das der Kunde benutzt,
und die Kunden-Site ist das zentrale Objekt des Produkts. `tenant` beschreibt
eine Eigenschaft der Infrastruktur, nicht das Ding selbst.

**Das ist die riskanteste Operation, die dieses Projekt bisher gemacht hat** —
riskanter als der Control-Cutover, weil dort ein Projekt neben dem alten
aufgebaut und dann umgeschaltet wurde. Hier werden Spalten auf Zeilen bewegt,
die Kunden gehören.

## Der zweite Name, den es dafür braucht

`tenants` → `sites` **kollidiert**: es gibt schon eine Tabelle `sites` im
Control Plane (Operator-Register der Deploy-Ziele mit Health-Check, aus M6-T1).
Sie muss zuerst weichen.

**Entschieden (Claude, aus dem Vokabular des Projekts):** `sites` → **`instances`**.
CLAUDE.md nennt sie ohnehin so — „Jede App: EIGENE Appwrite-Instanz". Das
Register beschreibt Deployments, nicht Kunden-Sites. Damit ist `sites` frei und
der Name sagt endlich, was drinsteht.

Mit umzubenennen: `tenant_plans` → `site_plans`, `sites.manage` →
`instances.manage` (Capability-String), Route `/api/control/sites` →
`/api/control/instances`.

## Was NICHT umbenannt wird — und warum

Diese Liste ist der wichtigste Teil des Plans. Jede Zeile hier ist eine Falle,
in die eine Umbenennung sonst läuft.

1. **Werte, nicht Namen.** Das Site-Label ist `Role.label(<tenants.$id>)` — der
   VALUE ist eine Row-Id und ändert sich nie. Wird eine Zeile kopiert statt
   umbenannt, **muss die Row-Id explizit mitgegeben werden** (`rowId: alt.$id`).
   Sonst zeigt jede `tenantId` in jedem gepoolten Projekt und jedes vergebene
   Label ins Leere. Das ist der Punkt, an dem diese Migration Kundendaten
   verlieren kann.
2. **Appwrite-Projekt-Ids** (`pool`, `control`, `comments`, `portfolio`) — eine
   Id umzubenennen heißt, das Projekt neu anzulegen; Kundendaten verwaisen.
   Dieselbe Regel wie beim Theme-Key `default` und beim lokalen `studio-1xsl`.
3. **Gespeicherte Rollen-Werte** (`owner`/`admin`/`moderator`/`editor`/`viewer`)
   und Status-Werte (`active`/`removed`) — stehen in Zeilen.
4. **`docs/archiv/**` und `CHANGELOG.md`** — Protokoll, kein Nachschlagewerk
   (dieselbe Regel wie bei `studio-NNN` → `control-NNN` am 2026-07-29).
5. **Migrations-DATEINAMEN** — bleiben immer.

## Bestandsaufnahme: 19 Tabellen tragen `tenantId`

| Layer | Tabellen | Instanzen |
|---|---|---|
| comments | `comments`, `guest_authors`, `comment_votes`, `embed_sites` | pool, comments |
| posts | `community_posts`, `post_votes`, `poll_votes` | pool |
| events | `events`, `event_rsvps`, `event_tickets`, `event_votes` | pool |
| courses | `courses`, `lessons`, `enrollments`, `lesson_progress` | pool, comments |
| pages | `pages` | pool, comments |
| moderation | `reports` | pool, comments |
| media | `media_items` | comments |
| system | `activities`, `notifications` | **alle vier** |

Dazu die Indizes, die `tenant` im Namen tragen und alle neu gebaut werden
müssen (ein Index kann in Appwrite ebenso wenig umbenannt werden wie eine
Spalte): `idx_tenant`, `idx_tenant_feed`, `idx_tenant_vote`, `idx_tenant_rsvp`,
`idx_tenant_status`, `idx_tenant_status_start`, `idx_tenant_ticket`,
`idx_tenant_course_order`, `idx_tenant_enrollment`, `idx_tenant_progress`,
`idx_tenant_user`, `idx_tenant_published_order`, `idx_recipient_tenant`,
`uq_tenant_host`, `uq_tenant_slug`, `uq_slug_locale_tenant`.

**Die Unique-Indizes sind die heikelsten**: `uq_tenant_host` (comments-015),
`uq_tenant_slug` (courses-002), `uq_slug_locale_tenant` (pages-004). Ein
Unique-Index über die NEUE Spalte kann erst entstehen, wenn die Werte
vollständig kopiert sind — sonst kollidieren leere Werte miteinander.

## Der Weg: erweitern → umziehen → verengen

Appwrite kann eine Spalte nicht umbenennen (dieselbe Beschränkung wie bei
pages-002, siehe Memory „MariaDB/utf8mb4-Zeilenbudget"). Also je Tabelle:

1. **Erweitern** — Spalte `siteId` anlegen, auf `available` pollen. Additiv,
   ruhend, ohne Wirkung.
2. **Code schreibt BEIDE, liest `siteId` mit Rückfall auf `tenantId`.**
   Deployen. Ab hier ist jeder neue Datensatz doppelt gestempelt.
3. **Umziehen** — Werte kopieren (Skript, seitenweise, idempotent, protokolliert).
   Danach die Indizes auf der neuen Spalte anlegen.
4. **Verengen** — Code schreibt und liest nur noch `siteId`. Deployen.
5. **Aufräumen** — alte Indizes und Spalte `tenantId` löschen. **Erst hier ist
   der Weg zurück versperrt**, und erst nach einer Nacht ohne Auffälligkeiten.

Für `tenants` → `sites` und `sites` → `instances` gilt dasselbe eine Ebene
höher: neue Tabelle, Zeilen **mit ihrer Row-Id** kopieren, Code umstellen, alte
Tabelle löschen.

**Reihenfolge über das Ganze:**
`sites` → `instances` zuerst (macht den Namen frei), dann `tenants` → `sites`,
dann die 19 Spalten Layer für Layer. Die gepoolten Layer zuletzt, weil dort
Kundenzeilen liegen; `system` als letztes, weil es alle vier Instanzen berührt.

## Vor dem ersten Schritt

- [ ] **Probe gegen eine Wegwerf-Instanz**, nicht gegen prod. Präzedenzfall:
      die Restore-Probe (Dump in Wegwerf-MariaDB, Ziel #35). Ein Durchlauf
      Ende-zu-Ende, inklusive Rückweg.
- [ ] **Backup je Instanz** unmittelbar davor (Muster C0b: „vorher je Instanz
      gesichert, danach gegengeprüft").
- [ ] **Der Isolationsbeweis muss nach JEDEM Schritt grün sein** —
      `packages/comments/scripts/verify-pool-isolation.mjs`,
      `packages/core/scripts/verify-presence-boundary.mjs`,
      `packages/onboarding/scripts/verify-site-authz.mjs`. Diese drei sind der
      Grund, warum diese Umbenennung überhaupt verantwortbar ist: sie prüfen
      die Mandantengrenze gegen echte Appwrite, nicht gegen Mocks.
- [ ] **Der ESLint-Backstop muss mitwandern** (`no-restricted-syntax` auf rohes
      `.tablesDB` in `server/api/**` und `server/plugins/**` der gepoolten
      Layer) — sonst fällt beim Umbau still eine Tür aus.
- [ ] **Kein Wellen-Deploy während der Umbenennung.** Der Wellen-Pfad
      (`pnpm migrate --wave`) war bis 2026-07-29 kaputt und ist gerade erst
      repariert; er ist der Mechanismus, mit dem Silo-Instanzen versorgt werden.

## Warum das trotzdem gemacht wird

Zwei Wörter für ein Ding kosten jeden Tag ein wenig: jede neue Route muss
entscheiden, welches Vokabular gilt, und die beiden Autorisierungs-Funktionen
`requireTenantPermission` (synchron) und `requireSitePermission` (async, mit
`await` — ohne `await` fail-open) sind ein Zwillingspaar, das genau EINEN
Tippfehler von einem Sicherheitsloch entfernt ist. Nach der Umbenennung gibt es
davon eine.

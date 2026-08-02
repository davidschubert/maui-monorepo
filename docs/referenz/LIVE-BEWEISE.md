# Live-Beweise (`verify-*.mjs`) — was es gibt und was davon in CI läuft

**Stand: 2026-08-02 (F30).** Diese Datei ist eine ÜBERSICHT, keine Arbeitsliste
— Offenes gehört nach `docs/OPEN-ITEMS.md`.

Ein Live-Beweis ist ein Skript, das eine Zusage gegen die ECHTE Instanz prüft:
Schema, Row-Permissions, Autorisierung. Unit-Tests können das grundsätzlich
nicht — ein gemockter Row-Store hat kein Schema und nimmt jeden Feldnamen an.
Genau daran ist der Geldpfad wochenlang unbemerkt gestorben
(`verify-paid-ticket`, Befund 2026-08-02).

Der Wert eines Beweises hängt daran, dass er LÄUFT. Bis zum 2026-08-02 lief in
CI genau einer; alles andere prüfte, wer zufällig daran dachte. Das war F30.

## Die drei Gruppen

Was ein Beweis braucht, entscheidet, ob er in CI laufen kann. Es gibt genau
drei Stufen — und der Sprung von Gruppe 1 nach Gruppe 2 ist der teure.

| Gruppe | Braucht | In CI? |
| --- | --- | --- |
| **1 — nur Appwrite** | die migrierte Wegwerf-Instanz aus `e2e.yml` | **ja, eingehängt** |
| **2 — Dev-Server + Mandanten** | Platform-Server auf festem Port UND die Wegwerf-Communities `kunde-a`/`kunde-b` in einem Control-Plane-Projekt | nein — Bau steht aus |
| **3 — zwei Dev-Server** | zusätzlich `apps/control` (:3004), teils Mailpit | nein — Bau steht aus |

## Gruppe 1 — läuft in der CI-E2E (`.github/workflows/e2e.yml`)

Jeder hat einen EIGENEN Schritt mit sprechendem Namen: ein roter Lauf soll am
Schritt-Namen zeigen, WELCHE Zusage gebrochen ist. Alle sind idempotent und
räumen ihre Zeilen selbst weg — auch im Fehlerfall.

| Skript | Beweist | Laufzeit | Legt an / räumt auf |
| --- | --- | --- | --- |
| `packages/events/scripts/verify-paid-ticket.mjs` | Geldpfad: Ticket entsteht, wird gefunden, erlaubt RSVP — gegen das echte Schema | <1 s | 4 Rows · ja |
| `packages/comments/scripts/verify-pool-isolation.mjs` | tenant-Filter für `comments`/`reports`/`pages` auf DB-Ebene, inkl. Gegenprobe ohne Filter | ~1 s | 6 Rows · ja |
| `packages/posts/scripts/verify-pool-isolation.mjs` | dito für `feed`/`post_votes`/`poll_votes` | ~1 s | 6 Rows · ja |
| `packages/control/scripts/verify-audience-flip.mjs` | C18/F28: sieht ein GAST die Inhalte noch? Gelesen mit echtem Gast-Client, an unserem Code vorbei | ~2 s | 6 Rows, 2 Dateien, 1 Konto · ja |
| `packages/core/scripts/verify-presence-boundary.mjs` | A4: die Presences-API erzwingt die Leserechte wirklich (**nur Akt 1**) | ~1 s | 3 Nutzer, 2 Presences · ja |
| `packages/media/scripts/verify-index-nudge.mjs` | F19: `indexStep` überlebt einen vergifteten Metadaten-Cache — mit Gegenprobe ohne Anstoß | ~25 s | Wegwerf-Tabelle · ja |

**Aufschlag auf den E2E-Job: ~30 s** (auf bisher ~5 min).

Zwei Dinge, die man beim Lesen des Workflows wissen muss:

- **`verify-presence-boundary` läuft in CI nur zur Hälfte.** „Akt 2" (der Weg
  durch Middleware + Heartbeat) braucht einen Platform-Dev-Server und wird
  sauber übersprungen. Der Schritt setzt `PLATFORM_PORT` deshalb auf einen
  toten Port: das Überspringen ist eine ENTSCHEIDUNG und hängt nicht davon ab,
  dass zufällig nichts auf 3006 lauscht.
- **`verify-index-nudge` fragt `docker compose` nach dem Redis-Container**,
  statt den Namen `<projekt>-<dienst>-<n>` nachzubauen. Ein geratener Name wäre
  eine stille Kopplung; wäre er falsch, sähe das wie ein Produktfehler aus und
  würde jeden Deploy blockieren (die E2E ist ein Deploy-Gate).

## Gruppe 2 — braucht Platform-Server + Wegwerf-Communities

Alle diese Skripte fahren den echten Kundenpfad mit `Host:`-Headern gegen
`kunde-a.localhost` / `kunde-b.localhost`. Ohne diese beiden Communities im
Control Plane laufen sie nicht.

| Skript | Beweist | Fehlt konkret |
| --- | --- | --- |
| `events/verify-pool-isolation.mjs` | Produkt-Gate + Event-Isolation über die echte API | Platform-Server + 2 Communities |
| `events/verify-site-authz.mjs` | N5a: Events gehören dem Site-Owner, nicht dem globalen Label | dito (`--silo` zusätzlich: comments-Server) |
| `courses/verify-pool-isolation.mjs` | Kurs-Isolation + Operator-Break-Glass | dito |
| `courses/verify-silo-unchanged.mjs` | Gegenprobe: im Silo ändert die Datentür nichts | comments-Dev-Server (KEINE Mandanten) |
| `moderation/verify-report-boundary.mjs` | Meldungs-Grenze auf REALTIME-Ebene (Row-Permissions, nicht Route) | Platform-Server + 1 Community |
| `onboarding/verify-control-host.mjs` | O3: Kontroll-Host vs. Community-Host vs. unbekannter Host | Platform-Server + `kunde-a` |
| `onboarding/verify-dashboard-access.mjs` | N1: Site-Rollen öffnen das Kunden-Dashboard | Platform + Control-Server |
| `onboarding/verify-site-authz.mjs` | O5: Autorisierung je Community, Team-Verwaltung, Mitgliedschaft als Ereignis | Platform-Server + Control Plane |
| `onboarding/verify-site-branding.mjs` | Entscheidung 12 + B5: Theme/Variante/Grundton je Community | dito; wartet mehrfach 30 s Resolver-Cache aus |
| `onboarding/verify-trial-notice.mjs` | M13: Hinweis auf die ablaufende Testphase | dito; ebenfalls Cache-Wartezeiten |
| `onboarding/verify-my-overview.mjs` | F12: die Kunden-Übersicht auf `my.*` | Platform-Server mit drei Test-Hosts |
| `core/verify-rate-limits.mjs` | Drossel-Budgets signup/storage/presence | IRGENDEIN Dev-Server (2 s Laufzeit) |
| `core/verify-notification-mail-links.mjs` | D5: Mails verlinken den Host DER Community | Platform-Server + Mailpit + 2 Communities |

## Gruppe 3 — braucht zusätzlich `apps/control`

| Skript | Beweist | Fehlt konkret |
| --- | --- | --- |
| `control/verify-onboarding.mjs` | O2: Provisionierungs-Route inkl. Abwehr und Idempotenz | Control-Server (:3004) |
| `control/verify-account-bell.mjs` | C17: die Glocke im Kundenbereich, Ende zu Ende | Control + Platform + `POOL_KEY` |
| `control/verify-invite-requests.mjs` | control-017: Einladungs-Warteschlange bis zur Einlösung | Control + Platform + Mailpit |
| `control/verify-invite-stock.mjs` | control-017: Vorrat + Zuweisung mit echter Betreiber-Session | dito |
| `onboarding/verify-community-suspension.mjs` | M13: Sperr-/Missbrauchspfad, billing und abuse | Control + Platform; **~20 min** — gehört nie in den Push-Pfad |

## Der Hebel, der Gruppe 2 freischaltet

Nicht dreizehn einzelne Probleme, sondern EINES: es gibt in CI keine
Wegwerf-Communities. Wer das baut, schaltet die ganze Gruppe frei. Nötig sind:

1. ein ZWEITES Appwrite-Projekt `control` auf derselben Wegwerf-Instanz
   (`scripts/ci/appwrite-setup.mjs --project control` kann das schon),
2. `pnpm migrate` für die `control-*`-Migrationen,
3. ein Seed, der `kunde-a`/`kunde-b` als `tenants`-Rows anlegt (Plan, Produkte,
   `openRegistration`) und auf das Runtime-Projekt zeigt,
4. `pnpm --filter platform dev` auf festem Port mit den Tenancy-Envs, plus
   Warten auf `/api/health`.

**Warum das hier bewusst NICHT nebenbei entstanden ist:** die E2E ist ein
Deploy-Gate. Ein Dev-Server kompiliert jede Route beim ersten Zugriff (`/` gut
25 s), mehrere dieser Skripte warten zusätzlich den 30-s-Resolver-Cache aus,
und `verify-community-suspension` braucht allein ~20 Minuten. Eine halb
gebaute Bühne hätte rote Läufe erzeugt, die nichts über das Produkt aussagen —
und rot heißt hier: kein Deploy. Der Bau gehört in einen eigenen, gemessenen
Schritt, und die langen Beweise dann in einen nächtlichen `schedule:`-Lauf,
nicht in den Push-Pfad.

## Beweise von Hand laufen lassen

Die Aufruf-Zeile steht bei jedem Skript IM KOPF der Datei — sie ist die
verlässliche Quelle, nicht diese Tabelle. Zwei wiederkehrende Fallen:

- **Aus dem PAKET-Ordner starten** (`cd packages/<layer>`), sonst löst
  `node-appwrite` nicht auf.
- **Vor jedem Beweis prüfen, WELCHER Dev-Server auf dem Port liegt.**
  `lsof -nP -iTCP -sTCP:LISTEN` und dann das `cwd` des Prozesses ansehen: bei
  der Arbeit an F30 lag auf :3001 `apps/control` statt `apps/comments`, und der
  Beweis meldete daraufhin einen Produktfehler, den es nicht gab.

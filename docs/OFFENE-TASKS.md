# Offene Tasks

Stand: **2026-07-28**, nach Abschluss des Pool-Audits (P6–P11).
Ergänzt [OPEN-ITEMS.md](OPEN-ITEMS.md) (das große Master-To-do) um die
konkrete Rest-Liste dieser Audit-Woche. Legende: **[David]** nur David ·
**[Claude]** autonom machbar · **[beide]** Claude baut, David entscheidet.

---

## 1. Blockiert den ersten zahlenden Kunden

| # | Task | Wer | Warum jetzt |
| --- | --- | --- | --- |
| A1 | **Echte Rechtstexte** für pukalani.app (Impressum/Datenschutz/AGB). Die Routen stehen, die Texte sind Entwurf + `noindex`. | David (ggf. Anwalt) | Ohne verbindliche Texte kein Verkauf in DE |
| A2 | **Stripe Live-Modus**: Keys tauschen, Webhook auf `control` umstellen (hängt noch am `studio`-Alias), Preise live prüfen. Runbook: `docs/plans/STRIPE-LIVE-RUNBOOK.md` | David | Ohne Live-Mode kein Geldeingang |
| A3 | **Netto/Brutto-Angabe**. Weder Landing (`apps/marketing` PricingSection + Locales) noch Hilfe-Site (`apps/help/content/anleitung/5.abrechnung.md`) weisen MwSt. aus. | David entscheidet, Claude setzt um | **PAngV-Risiko** bei B2C in Deutschland |
| A4 | **Presence-Rows sind pool-weit lesbar** (Restrisiko aus Audit B1, s. u.) | David entscheidet, Claude baut | Kunde A kann die Online-Namen von Kunde B auslesen |

### A4 — Presence: Anwendungs-Filter steht, Datenbank-Grenze fehlt

Behoben ist die **Oberfläche**: Presencen tragen im Pool seit dem B1-Fix ein
`metadata.tenantId` (`packages/core/server/api/presence/heartbeat.post.ts`), und
beide Leser filtern fail-closed darauf — server-seitig
`toOnlinePresences` (`core/server/utils/presenceFilter.ts`, u. a. hinter
`GET /api/presence/count` und den Admin-User-Listen), client-seitig
`usePresence()` (`core/app/composables/usePresence.ts`). Kein Mandanten-UI zeigt
noch fremde Anwesende.

**Offen ist die Grenze darunter.** Die Presence-Row trägt `read("users")` — im
geteilten Pool-Projekt heißt das *jeder eingeloggte User aller Communities*. Wer
das Web-SDK von Hand bemüht (`presences.list()` mit dem eigenen Session-Cookie),
bekommt weiterhin `userId`, `userName` und `avatarUrl` sämtlicher gerade online
befindlicher User **aller** Mandanten. Der Filter ist Anwendungslogik, keine
Zugriffskontrolle.

**Entscheidungsfrage an David:** Wie wird zugemacht?

- **(a) Appwrite-Team pro Mandant** — `read("team:<tenantId>")` statt
  `read("users")`. Die Grenze zieht dann Appwrite selbst, Realtime und die
  ~280 ms Latenz bleiben. Kostet ein Team je Community plus Mitgliedschafts-
  Pflege an jedem Beitritt/Austritt (und einen Rückbau-Pfad für Bestandsuser).
- **(b) Presences server-only** — Permissions nur noch für den Owner, alle Leser
  gehen über Server-Routen. Wenig Bauaufwand, aber der direkte Realtime-Pfad
  entfällt: Anwesenheit käme über 20s-Polling statt in ~280 ms, spürbar bei
  Tipp-Indikatoren und „N sehen diese Seite".

Bis zur Entscheidung gilt: **keine PII über Name und Avatar hinaus** in die
Presence-metadata legen.

## 2. Entscheidungen, die Arbeit freischalten

| # | Frage | Empfehlung |
| --- | --- | --- |
| B1 | **Visual-Baselines** (9 Stück) sichten und neu aufnehmen — der Header-Umbau (S9) hat sie erwartungsgemäß gebrochen. Danach: `pnpm --filter comments e2e -- --update-snapshots themes-visual` | David sichtet, dann Claude |
| B2 | **og:image je Tenant-Seite** (S5-Rest): geteilte Links kommen ohne Bild an. Braucht eine Design-Entscheidung (generiertes SVG/PNG mit Theme-Farbe + Community-Name?) | David |
| B3 | **Theme-Name „Sunrise"** (früher „Maui") steht im Picker neben dem bestehenden „Sunset" — verwandt klingende Namen für Unverwandtes. Alternative „Aloha", eine Zeile. | David |
| B4 | **K4-Perf-Hebel**: (a) Appwrite-Web-SDK dynamisch laden (72 kB Entry, Umbau am Realtime-Subsystem, eigenes Paket) · (b) spekulative `prefetch`-Hints filtern (größter Messwert, kostet den Navigations-Vorsprung nach dem Login) | David wählt, Claude baut |
| B5 | **Besucher-Theme vs. Community-Theme**: Wer selbst ein Theme gewählt hat, sieht weiter seins statt der Community-Farbe. Soll das Branding auf Mandanten-Hosts den Besucher überstimmen? | David |

## 3. Claude kann sofort — Produkt-/Funktionslücken

| # | Task | Herkunft |
| --- | --- | --- |
| C0 | **media-002 auf prod fahren** — die Migration, die unveröffentlichte Bilder zusperrt, liegt im Repo und ist lokal bewiesen, aber prod läuft noch offen. Nur die zwei Silo-Instanzen mit media: **photos** und **comments**. ⚠️ **ERST Code deployen, DANN migrieren** (umgekehrt zeigt die Galerie für ein Fenster kaputte Bilder — Begründung im Migrations-Kopf). | Audit B3 |
| C1 | **Owner-Overview zeigt Nullwerte**: `/api/admin/stats\|analytics` sind Operator-only. Tenant-gescopte Kennzahlen über `requireSitePermission`. **Vorbedingung erledigt** (Audit B2): die drei Lesungen sind gescopt, das Öffnen leckt jetzt nicht mehr. Die Nutzerzahl fehlt im Pool bewusst — sie bräuchte einen Mitglieder-Count aus dem Control Plane. | N8 |
| C1b | **media und activity haben keine Datentür.** Der Rechte-Gate steht seit S3, aber beide Layer haben keine `tenantId`-Tabellen und gehen direkt über den Admin-Client. Vor dem ERSTEN Einsatz in `apps/platform`: tenantId-Migration + `tenantDb()`, sonst sieht jede Site die Galerie jeder anderen. Steht als Warnung in beiden `nuxt.config.ts`. | Audit S3 |
| C2 | **UI-Plan-Gate für Kurse** in der Nav (`maui.chrome.nav`, blueprint) — heute ist `/courses` per Direktlink erreichbar und läuft in den API-404. Events hat dasselbe Muster. | Kurse-Bericht |
| C3 | **Kompositionen für Events + Kurse in den Bauplan**: `EventDetail`/`LessonView` füllen ihren `#comments`-Slot bisher nur in `apps/comments`. Jetzt möglich, da beide Produkte im Pool sind. | Produkt-Bilanz |
| C4 | **Nav-Einträge events/courses** von `apps/comments/app/app.config.ts` in die Layer verschieben (Kommentar steht dort) — sie waren App-seitig, bis die Produkte durch die Tür waren. | S9-Bericht |
| C5 | **register/forgot/reset ohne `<title>`** — Brand-Kopf haben sie seit B3, Titel fehlen. | B3-Rest |
| C6 | **system-021**: Legacy-Spalte `app_config.entitlements` droppen — **erst wenn alle Instanzen neuen Code fahren**. Gibt Zeilenbudget frei. | N2 |
| C7 | **apple-touch-icon je Community** (PNG-Pflicht, aus dem SVG nicht ableitbar) | K2-Rest |
| C8 | **Suche in der internen Doku** (`control.pukalani.app/docs`) — bewusst weggelassen. | control/docs |

## 4. Bekannt und bewusst zu (nicht vergessen)

| # | Zustand | Öffnet sich, wenn … |
| --- | --- | --- |
| D1 | **Paid-Events und Paid-Kurse im Pool fail-closed** — der Stripe-Webhook stempelt keinen Mandanten, `grantEventTicket`/Kursbuchung landen ohne `tenantId` und werden von der Datentür nicht gefunden. Per Test genagelt. | Billing mandantenfähig wird |
| D2 | **`/changelog` auf Tenant-Hosts 404** (N7, gewollt) | — |
| D3 | **Demo ist indexierbar** (N4, Davids Entscheidung) | — |
| D4 | **Cloudflare Origin Certificate** für die Landing → erlaubt „Full (Strict)" und löst pukalani.app ganz aus Let's Encrypt. Privater Schlüssel muss durchs Dashboard. | David es einmal macht |

## 5. Betrieb / Hygiene

| # | Task | Anmerkung |
| --- | --- | --- |
| E1 | **`apps/control/.env.production` zeigt noch auf das gelöschte Projekt `studio`** (Altlast des Cutovers). Der Prod-Migrations-Pfad läuft über `~/.appwrite-secrets/migrations/control.env` und ist korrekt — die Datei im Repo-Ordner ist irreführend. | Claude, klein |
| E2 | **UptimeRobot**: Monitor für `help.pukalani.app` ergänzen (die anderen sechs stehen) | Claude |
| E3 | **Hetzner-Rescale** prüfen (CX23 knapp bei sechs Apps + Builds) | David |
| E4 | **Wellen-Migrationen**: Silo-Instanzen `photos`/`portfolio` fahren `system` mit — bei künftigen system-Migrationen mitdenken (`--wave`) | Doku steht |
| E5 | **Worktrees aufräumen**: `.claude/worktrees/agent-*` (alle gemergt, Branches können weg) | Claude, kosmetisch |

## 6. Später (bewusst geparkt)

- **Discussions** als eigenes Produkt — Konzept fertig in `docs/plans/DISCUSSIONS-KONZEPT.md` (Kategorien vom Admin, Threads von Mitgliedern, URL mit stabiler ID + austauschbarem Slug). Bau erst, wenn die Kundenselbstverwaltung rund läuft.
- **Block-Editor-Worktree** (`worktree-agent-a762b1bc42bba74d7`) — nie reviewt, Feature-Stopp.
- **Silo → Pool**: `comments` und `portfolio` laufen als eigene Instanzen. Langfristig ist der Pool das Produkt; Silo bleibt das Enterprise-Angebot.

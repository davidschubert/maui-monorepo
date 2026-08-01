# Erledigte Punkte (Archiv)

Das ist das **finale Archiv der erledigten offenen Punkte** — jeder Eintrag
steht hier vollständig, mit Begründung, Beweis und Datum, damit später
nachlesbar bleibt, warum etwas so gebaut wurde. **Es ist KEINE Arbeitsliste:**
was noch aussteht, steht ausschließlich in [OPEN-ITEMS.md](OPEN-ITEMS.md)
(Regel von David, 2026-07-30 — Erledigtes zieht sofort hierher um).

Diese Datei darf ausführlich sein: sie ist unser **Lern-Gedächtnis**. Wo etwas
nicht auf Anhieb funktionierte, steht am Ende des Eintrags eine Zeile
**Gelernt:** — was schiefging, warum, und welche Regel daraus wurde. Wer eine
ähnliche Aufgabe anfängt, liest zuerst diese Zeilen.

---

## 📌 Master-To-do — erledigte Brocken

Legende Wer: **[David]** nur David · **[Claude]** autonom machbar ·
**[beide]** Claude baut, David entscheidet/gibt frei.

| # | Task | Wer | Schwere | % | Status |
|---|------|-----|---------|---|--------|
| 3 | **Money-Path-Rest** — #6b Cross-Sub via Stripe-Autorität + #7a Workspace-Customer/Owner-Portal. Deployt 2026-07-22, Details [DECISION-LOG](DECISION-LOG.md). | — | — | 8 | ✅ fertig |
| 4 | **Horizont 3 — Pool+Silo Multi-Tenancy** ([Blueprint](referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md)) — **Kern KOMPLETT (2026-07-23):** Spike ✅ · Schicht 1 ✅ · 4.1 Pool-Datenpfad ✅ · Naht 1/2 ✅ · tenants-Register + Resolver ✅ · Onboarding-UI ✅ · **Prod-Rollout ✅** (platform.pukalani.app als 4. ploi-Site, Wildcard-DNS + ploi-verwaltetes Wildcard-TLS, Pool-Projekt `pool` mit 9 Tabellen, demo.pukalani.app live: 200 + gescopte Liste, unbekannte Hosts 404; Deploy-Kette + Secret; Learnings: platform-Build braucht 3584 MB Heap, `/api/health` + `/_i18n/` sind host-freie Infra-Pfade) · **4.2 Wellen-Migrationen ✅** (tenants.wave internal→canary→stable, `pnpm migrate --wave` + Control-UI, fail-loud, control-012 auf Dev+Prod) · **4.3 Quota ✅ scharf** (assertPoolWriteQuota, comments 1000/Tag + 50k gesamt im Pool, 429 lokal bewiesen — **Zahlen abnicken, s. Kasten unten**) · Microcaches tenant-aware ✅ (tenantCacheScope: changelog, features). **Fläche 2 ✅** reports (moderation-002) gepoolt. **Quota pro Plan ✅ (2026-07-23):** tenants.plan (control-013, free/pro/business) staffelt die Limits (free 200/Tag+5k · pro 1.000/50k · business 5.000/250k; Silo ohne Limit); limitsForPlan pure-getestet, Control-UI Plan-Badge+Select, Migration Dev+Prod. **Tenant-Homepage MVP ✅ (2026-07-23):** pages-Layer in platform gepoolt (pages-003), index.vue rendert die `home`-Seite des Tenants (Markdown + `[[comments]]`-Block, useRequestFetch für Host-Weitergabe), Isolation lokal bewiesen (kunde-a Seite / kunde-b Fallback). **Live-Isolationsskript** [verify-pool-isolation.mjs](../packages/comments/scripts/verify-pool-isolation.mjs). **Read-only-Control-Plane-Key ✅ (2026-07-24, autonom):** `platform-control-readonly` (NUR rows.read) live auf app-prod (Write-Probe 401, demo 200/unknown 404); dabei kompletten Provisioner-Cleanup nachgeholt (pool-Projekt → Pukalani-App-Team, Team provisioning + provisioner-Account weg — alle 4 Prod-Projekte gehören jetzt David) + geleakten comments/migrations-Key rotiert ([Runbook](runbooks/PLATFORM-CONTROL-KEY-SWAP.md)). **Community-Plattform G0+G1 ✅ (2026-07-24, autonom):** Produktvertrag ([G0](referenz/G0-PRODUKTVERTRAG.md), David: Nav, 5-Rollen, Tarif, EA-Scope; kanonische Kunden-Site = **der Tenant**) + Sicherheits-Naht ([Roadmap](archiv/SAAS-ROADMAP.md) G1): `control-015` (`tenants.workspaceId` + `site_members`), core `tenantAuthz` (5 Site-Rollen owner/admin/mod/editor/viewer), `requireTenantPermission` (Cross-Projekt, 30-s-Cache, fail-closed), **Naht 4** `tenantRowPermissionsFor` (read(label(siteId)), Mechanismus + 11 Tests) + **Isolationsbeweis** grün lokal+prod (162 core + 58 studio). **Nachtrag 2026-07-25/28:** Naht-4-Live-Wiring + Session-Label je Site sind mit O5 erledigt (Site-Label wird gesetzt, `requireSitePermission` gilt), „Admin per Tenant" ist mit den Site-Rollen (N1) erledigt — der Owner erreicht sein Dashboard und sieht nur seine Capabilities. **Gelernt:** (1) Der platform-Build braucht **3584 MB Heap** — mit dem Standard-Cap starb er auf dem Server, nicht lokal. (2) `/api/health` und `/_i18n/` müssen **host-frei** bleiben, sonst sperrt der Mandanten-Resolver die eigene Infrastruktur aus. (3) Ein Migrations-Key war geleakt und musste rotiert werden — Schlüssel gehören in Dateien unter `~/.appwrite-secrets/`, nie in Repo-nahe Env-Dateien. | Claude (Etappen-Go: David) | schwer | 40 | 🔨 39/40 — Kern fertig |
| 5 | **Embed-Widget E2–E4** ([Plan](archiv/EMBED-WIDGET.md)) — **E2 ✅ + E3 ✅ (2026-07-23):** E2 = Schreiben im iframe (Popup-Login + Handoff-Token + CHIPS-Cookie; CSRF-scharf; prod-bewiesen cross-site von davidschubert.com inkl. Cookie-Forensik). **E3 = Site-Registry** `embed_sites` (comments-012, Dev+Prod) + Admin-UI `/dashboard/embed` + Registry-gespeiste frame-ancestors-CSP (allowedOrigins jetzt `['http://localhost:*']` statt `['*']`; davidschubert.com in Prod-Registry) + `GET /api/comments/count` (CORS, `data-pukalani-count`-Loader) + Redis-Rate-Limit. Bewiesen: CRUD per API (Create/409/PATCH/DELETE), CSP-from-Registry + count-CORS + 3 Fehlermeldungs-Zweige, 10 Unit-Tests, Embed-E2E grün. **E4 ✅ (2026-07-23):** (1) **Gast-Kommentare** ohne Account (Name+E-Mail, ohne Verifikation) — POST `/api/comments/guest` (Gate `embed.guests`, Rate-Limit 5/min/IP, Tenant-Quota, kein operatorTarget), comments-013 (`authorKind` + operator-lesbare `guest_authors`-Tabelle; **E-Mail nie auf der read(any)-Row**), GuestCommentForm + „Gast"-Badge; live bewiesen (POST 201, keine E-Mail in der öffentlichen Liste, anon-Read von guest_authors 401, Browser-E2E). Aktiviert auf der comments-App. Migration: lokaler Pool, Prod-Pool, Prod-comments. (2) **Presence im Embed** — funktioniert out of the box (geteilter Realtime-Socket trägt sie ins iframe; heartbeat+realtime-token+presences alle 200 live nachgewiesen). (3) **Web-Component** `<pukalani-comments>` (public/pukalani-comments.js, Shadow DOM, sandboxed iframe → keine XSS-/CORS-Fläche); live bewiesen (Shadow-Root+iframe, Resize 308px). **Bewusst später (supervised):** echte Inline-Render-Variante ohne iframe (eigener Sanitizer + CORS-Allowlist) + E3-Task-17 (dedizierte apps/embed-comments). **Gelernt:** `localhost:PORT` gegen `localhost:PORT` ist same-**site** — ein lokaler „Cross-Origin"-Test beweist beim Cookie-Verhalten NICHTS. Cross-Site-Beweise brauchen echte Domains (deshalb der Prod-Beweis von davidschubert.com samt Cookie-Forensik). Und: die E-Mail eines Gastes darf nie auf einer `read(any)`-Row landen — dafür gibt es die getrennte `guest_authors`-Tabelle. | Claude | schwer | 12 | ✅ E2–E4 fertig |
| 6 | **Themes-Vollausbau 26×11** ([Plan](archiv/THEMES-VOLLAUSBAU.md)) — **✅ FERTIG (2026-07-24, E1–E7 alle per Empfehlung):** kuratierter Katalog `theme.catalog.ts` (21 Hue-Kreis-Welten + 5 gedeckte Ausreißer, je Basis+10 tonale Varianten = 286 Ramps), Generator mit Kontrast-Gate (Anker fest 500 — Bestands-500er byte-gleich, `--ui-primary` bleibt 600/400), committete `themeRegistry.gen.ts` + CI-Gate `check:themes` (lint.yml), Grid-Modal-Picker mit sticky Varianten-Reihe (E7b). Bewiesen: 62 Unit-Tests + Guard (26×11), SSR-Cookie-Beweis, Visual-Baselines 9/9 neu, Dark-Stichprobe. **Gelernt:** Generierte Dateien gehören ins Repo UND hinter ein CI-Gate (`check:themes`) — sonst laufen Katalog und erzeugtes CSS auseinander, ohne dass es jemand merkt. Der Kontrast-Anker muss FEST auf Stufe 500 stehen, sonst verschiebt jede Neugenerierung bestehende Kundenfarben. | Claude | schwer | 10 | ✅ fertig |
| 7 | **Deploy-RAM-Härtung** — Swap (18.07.) + NODE_OPTIONS-Cap 2560 in ploi-`~/.bashrc`; Praxistest: Deploys in Folge sauber. Nachtrag 23.07.: platform-Build braucht 3584 (Deploy-Script), Überhang läuft in den Swap. | — | — | 3 | ✅ fertig |
| 8 | **Shared Rate-Limit-Store** — ✅ 2026-07-23: Redis lief auf app-prod bereits (bei Server-Einrichtung mitinstalliert, localhost:6379). Core `rateLimitStore.ts` (Fixed-Window, peek/hit; Redis wenn `NUXT_REDIS_URL` gesetzt, sonst In-Memory; fail-open mit Log; Keys pro Appwrite-Projekt gescoped), Middleware umgestellt, Unit-Tests + lokaler E2E (5×200 → 429, geteilter Redis-Zähler). | — | — | 3 | ✅ fertig |
| 9 | **E2E studio + portfolio** — Playwright-Smoke (10 + 5 Tests) nach comments-Muster; `pnpm --filter <app> e2e`. | — | — | 3 | ✅ fertig |
| 13 | **Self-Service-Onboarding ✅ GEBAUT (2026-07-25, O1–O6)** — der öffentliche Trichter läuft: `app.pukalani.app` (Kontroll-Host, Nicht-Mandant mit fail-closed API-Allowlist) → Invite-Code → **Wizard in 7 Schritten** → Community steht → **Handoff, der eingeloggt ankommt**. Abnahme nach Roadmap-DoD: **10 unbeaufsichtigte Läufe, Median 0,3 s**, Retry idempotent, keine Waisen-Rows. Dazu: Branding pro Mandant (nicht pro Projekt), `requireSitePermission` (Site-Rolle vor protokolliertem Break-Glass), Site-Label für Naht 4, Startseite aus der Beschreibung, Testphasen-Sweep. **Hosts umbenannt (2026-07-25):** `control.` (Betreiber, Alias der Control-Site + Wildcard-Zertifikat) · `my.` (Kundenbereich) · `start.` (Kurz-Link in den Wizard) — alle live, Altnamen antworten weiter. Details: [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md) | Claude | schwer | — | ✅ Trichter fertig |
| 10 | **SaaS-Produkt-Roadmap + pukalani.app-Landingpage** — ✅ SPEZIFIZIERT (2026-07-24): der verlorene „10-Ideen"-Zettel wurde durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (9 Ideen, Davids Entscheidungen je Idee, UI/UX-Konzepte für Tenant-Selbstverwaltung/Dashboard-IA/Custom-Domains) + [PUKALANI-LANDINGPAGE.md](archiv/PUKALANI-LANDINGPAGE.md) (SEO+UX-Konzept). **✅ GEBAUT (2026-07-27):** die Landing ist live auf `pukalani.app` (ploi-Site 392338, Apex proxied über Cloudflare), Roadmap-Blöcke §A Dashboard-IA, #2 Tenant-Selbstverwaltung und #1 Self-Service-Onboarding sind umgesetzt. Rest: laufende Inhaltspflege (Netto/Brutto s. A3; og:image je Community ist seit 2026-07-29 erledigt, s. B2). | beide | mittel | 2 | ✅ Landing live |
| 11 | **GitHub-Klicks** — ✅ 2026-07-23: #16/#15/#2 hatte David am 21.07. gemergt; Release-PR #18 gemergt → **v2.2.0 released** (Changelog-Draft automatisch angelegt — Kuratieren + Publish von v2.1.0 UND v2.2.0 liegt bei David im Dashboard). Neu offen: Dependabot #19–23 (npm-Bumps, kein workflow-Scope nötig). | — | — | 1 | ✅ fertig |
| 12 | **Kleinkram** — ✅ Demo-Passwörter · ✅ >14k-Limit (MEDIUMTEXT) · ✅ Wegwerf-Projekte gelöscht (2026-07-24): alle 7 lokalen Probes (s0-*, s1-probe-*, s3-*) weg — 5 regulär via Console-API (Login als Spike-User s0-admin), 2 chirurgisch per DB (Appwrite-Delete warf `openssl_decrypt cipher_algo empty`-500; 132 präfix-verifizierte Tabellen gedroppt + Console-Rows entfernt), Wegwerf-Teams s0-org/pukalani-sites gelöscht, Spike-Console-User s0-admin (hartkodiertes PW!) entfernt, Redis-Cache geflusht; echte Projekte per Smoke verifiziert (401 vs 404). **Gelernt:** Appwrites Projekt-Löschung kann mit `openssl_decrypt cipher_algo empty` in einen 500 laufen — dann bleibt nur der chirurgische Weg über die DB, und der verlangt VORHER eine Präfix-Verifikation jeder Tabelle. Und: ein hartkodiertes Spike-Passwort überlebt den Spike, wenn niemand aufräumt. ✅ Dependabot #19–23: von Dependabot selbst geschlossen — die Bumps (u. a. @nuxt/ui 4.10, vue-tsc 3.3.8) kamen längst über den pnpm-Catalog rein. | — | — | 1 | ✅ fertig |

**Fertig-Anteil zum Stichtag 2026-07-30: 82 % ✅ (43 % + 39/40 von H3) ·
offener Rest (18 %) wartet fast vollständig auf David: Rechtstexte (5) +
Stripe-Live (12) + Audience-Entscheidung (1, inzwischen als C18 entschieden).**

> **📋 Quota-Zahlen (H3-4.3) — seit 2026-07-24 IM STUDIO EDITIERBAR:**
> Studio → Tenants → „Pläne & Limits": free 200/Tag + 5.000 gesamt ·
> pro 1.000/50.000 · business 5.000/250.000 (Seed = beschlossene Zahlen;
> 0 = unbegrenzt). Änderungen wirken im Pool nach ≤ 90 s ohne Deploy
> (tenant_plans, control-014 → Resolver legt Limits in den TenantContext;
> app.config bleibt Fallback). Silo-Kunden: ohne Limit (eigenes Projekt).

---

## A — erledigt (blockierte den ersten zahlenden Kunden)

| # | Task | Erledigt | Wer |
| --- | --- | --- | --- |
| A3 | **Netto/Brutto-Angabe** — ✅ ERLEDIGT (2026-07-29, Davids Entscheid: **Brutto**): 29 €/149 € sind Endpreise, Hinweis „inkl. 19 % MwSt." / „incl. 19 % VAT" steht AM Preis — Landing (`PricingSection` + FAQ, de/en), Hilfe (`anleitung/5.abrechnung.md`), Billing-Preistafel (`packages/billing`), Betreiber-Preisfeld (control) als „brutto" beschriftet. **REST [David], läuft in A2 weiter:** Stripe legt die Prices ohne `tax_behavior` an und die Checkouts laufen mit `automatic_tax` — steht das Konto-Default auf „exclusive", rechnet Stripe 19 % oben drauf und widerspricht der Landing. Prüfung vor dem Live-Gang: [STRIPE-GO-LIVE-RUNBOOK](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) §2.4. **Gelernt:** Eine Preisangabe ist erst dann konsistent, wenn auch die ZAHLSTELLE dasselbe rechnet — steht Stripes Konto-Default auf „exclusive", schlägt es 19 % auf den beworbenen Endpreis auf. Preis-Texte und `tax_behavior` immer im selben Arbeitsgang prüfen. | 2026-07-29 | ✅ Claude · Stripe-Rest David |
| A4 | ~~**Presence-Rows sind pool-weit lesbar**~~ — **erledigt 2026-07-29** (Weg (c), Davids Entscheidung): Presencen tragen im Pool `read("label:<siteId>")` statt `read("users")`, das Label vergibt `core/server/middleware/site-label.ts`. Der tenantId-Filter bleibt als Netz. Beweis in beide Richtungen: `packages/core/scripts/verify-presence-boundary.mjs` (23/23). **Nachtrag:** die damalige Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") ist mit A5 ersetzt — sie war mit C16 nicht mehr haltbar. Analyse + Umsetzungs-Stand: [PRESENCE-GRENZE.md](archiv/PRESENCE-GRENZE.md) Abschnitt 8. **Gelernt:** Die erste Fassung der Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") hielt keinen Tag — sie beschrieb ein VERHALTEN statt einer Tatsache und machte „Zugang entziehen" wirkungslos (→ A5). Eine Berechtigung muss an einem Datensatz hängen, den man entfernen kann, nicht an einer Beobachtung. Rest-Falle, die bleibt: eine Label-Änderung berechnet die Rollen bereits OFFENER WebSockets nicht neu. | 2026-07-29 | ✅ |
| A5 | ~~**„Zugang entziehen" wirkte nicht**~~ — **erledigt 2026-07-29** (Davids Entscheidungen 1+2): Mitgliedschaft ist jetzt ein EREIGNIS und das Site-Label folgt ihr, statt sie zu behaupten. Gesteuert vom bestehenden Schalter `tenants.openRegistration`: offen ⇒ Beitritt mit Rolle `viewer` bei (a) Kontoanlage auf dem Mandanten-Host und (b) erstem eigenen Schreibvorgang (abgefangen in der Datentür, nicht in zwanzig Routen) — ein bloßer Seitenaufruf löst bewusst nichts aus; geschlossen ⇒ nur per Einladung. Entfernen zieht Rolle UND Label (`revokeSiteLabel` + Kurzzeit-Notiz gegen den 30-s-Rollen-Cache) und ist gegen Wiederbeitritt gesperrt. Bestand aus der A4-Zeit (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst — kein Backfill-Skript. Mitgliederliste zeigt alle, Standardansicht filtert aufs Team. Beweis: `verify-site-authz.mjs` Abschnitt 10 (97/97) + `verify-presence-boundary.mjs` (23/23). **Gelernt:** Den Beitritts-Auslöser in die **Datentür** zu legen statt in zwanzig Routen war der Unterschied zwischen „einmal richtig" und „neunzehnmal richtig und einmal vergessen". Und: ein 30-s-Rollen-Cache macht jeden Entzug für eine halbe Minute wirkungslos — deshalb die Kurzzeit-Notiz `rememberSiteAccessRevoked`. | 2026-07-29 | ✅ |
| D7 | ✅ **ERLEDIGT 2026-07-30.** Neu ist `listOperatorIds()` in `packages/control/server/utils/inviteRequests.ts`: Appwrite filtert das Label jetzt SELBST (`Query.contains('labels', ['admin'])`, gegen eine laufende 1.9.6 verifiziert), dazu eine Cursor-Seitenschleife. Der `includes('admin')`-Nachcheck bleibt bewusst stehen — `contains` arbeitet auf Strings substring-artig, ein Konto mit Label `administrator` darf hier nicht mitgemeint sein. Wird der Seiten-Deckel erreicht, ist das eine LAUTE Log-Zeile statt einer stillen Kürzung. Dass die Grenze real ist, wurde beim Fix gemessen: die geprüfte Instanz hat **42 Konten**, davon 4 mit `admin` — mit `limit(25)` war das Durchrutschen keine Theorie mehr. Lint sauber, 139 Tests, Typecheck 0 Fehler. **Gelernt:** Jede Liste ohne explizite Seitenschleife ist ein stiller Datenverlust in Zeitlupe — Appwrites Default-`limit` ist 25. Und `Query.contains` arbeitet auf Strings substring-artig: `admin` matcht auch `administrator`, der Nachcheck im Code bleibt Pflicht. Erreichte Deckel gehören LAUT ins Log, nie still gekürzt. | 2026-07-30 | Claude |

---

## B — erledigte Entscheidungen

| # | Frage | Erledigt | Wer |
| --- | --- | --- | --- |
| B2 | ~~**og:image je Tenant-Seite**~~ — **erledigt 2026-07-29** (Davids Entscheidung: **automatisch generiert**, kein Upload-Feld und kein Einheitsbild). `/og/<key>.png` liefert je Community eine 1200×630-Karte aus Theme-Basisfarbe + Community-Name + dezenter Wortmarke; `useLocaleSeoHead()` (core) setzt og:image/width/height/type/alt + `twitter:card` als EINZIGE Stelle, absolut auf dem Request-Host. **PNG, nicht SVG** — Facebook/WhatsApp/LinkedIn zeigen SVG als og:image nicht. Gerastert OHNE Renderer im Betrieb: Chrome hat die Zeichen einmal in ein Deckungs-Atlas gebacken (`packages/themes/scripts/generate-brand-card-font.mjs`, 85 KB committet), der Server setzt sie zusammen (~16 ms Event-Loop, Kompression im Threadpool) und legt das Bild unter `/tmp` ab — je Community faktisch EINMAL. Beweis: `apps/platform/scripts/verify-og-image.mjs` (19/19 grün gegen demo.localhost). Gate `pukalani.seo.tenantOgImage` (Core-Default aus). **Offen als mögliche Ergänzung:** eigenes Bild hochladen (bewusst NICHT gebaut). **Gelernt:** Facebook, WhatsApp und LinkedIn zeigen **kein SVG** als og:image — die erste, elegante SVG-Lösung war unbrauchbar und musste als PNG neu gebaut werden. Beim Rastern gilt: kein Renderer im Betrieb (Chrome backt die Zeichen einmal in ein Atlas), und der Schlüssel in der Bild-URL darf nie EINGABE sein, sonst füllt ein Bot mit erfundenen Schlüsseln die Platte. Ablage in `tmpdir()`, nie in `.output` — Release-Slots wechseln den Pfad. | 2026-07-29 | ✅ |
| B3 | ~~**Theme-Name „Sunrise"** steht im Picker neben dem bestehenden „Sunset"~~ — **erledigt 2026-07-29** (Davids Entscheidung): das Standard-Theme heißt im Picker **„Aloha"**. Geändert wurde AUSSCHLIESSLICH das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n — Theme-Namen sind Eigennamen, de = en); die Id bleibt `default`, weil sie in `tenants.theme`, `data-theme`, den CSS-Dateinamen und gespeicherten Kunden-Configs steckt. Test hält Name + Eindeutigkeit fest (`tests/builtinThemes.test.ts`). **Gelernt:** Ein Anzeige-Label ist NICHT der Schlüssel. Wer ein Theme über seine Id umbenennt, bricht `tenants.theme`, `data-theme`, die CSS-Dateinamen und alle gespeicherten Kunden-Configs auf einmal. | 2026-07-29 | ✅ |
| B5 | ~~**Besucher-Theme vs. Community-Theme**~~ — **erledigt 2026-07-29** (Davids Entscheidung: die Community gewinnt). Auf einem Mandanten-Host wird das Theme-Cookie GAR NICHT mehr gelesen: `data-theme/data-variant` kommen aus `tenants.theme/variant`, ohne eigene Wahl aus der Instanz-Einstellung. Der Theme-Wähler VERSCHWINDET dort (öffentliches Anzeige-Menü + Dashboard-Kontomenü) statt beschriftet zu werden — er hätte auch „nur für dich" nicht mehr gewirkt. Hell/Dunkel, Neutral-Palette und Sprache bleiben Besucher-Wahl. Regel pur + getestet in `packages/themes/shared/themeSelection.ts` (11 Fälle); live belegt an `kunde-a.localhost` (Cookie `crimson` → SSR `data-theme="lagoon"`) gegen `app.localhost` (Cookie gewinnt weiter). **Rest ebenfalls erledigt (2026-07-29, Davids Entscheidung: JA):** die **Neutral-Palette folgt der Community**. Neue Spalte `tenants.neutral` (Migration **control-020**, additiv, `''` = keine eigene Wahl → Voreinstellung), zweite pure Funktion `resolveNeutralSelection` auf EIGENER Achse (die Herkunft kann von der des Themes abweichen, deshalb kein viertes Feld im Theme-Ergebnis) — 14 neue Fälle, Registry-Prüfung `isBuiltinNeutralSelection` gegen `NEUTRAL_REGISTRY`. Gesetzt wird sie als EINE Zeile „Grundton" neben Theme/Variante in `/dashboard/settings/community` (10 Chips inkl. „Voreinstellung"); der Besucher-Umschalter verschwindet auf Mandanten-Hosts aus Anzeige-Menü, Dashboard-Kontomenü und Theme-Studio (`canChooseNeutral`). Hell/Dunkel und Sprache bleiben Besucher-Wahl. Beweis: `packages/onboarding/scripts/verify-site-branding.mjs` 40/40 (u. a. `kunde-a` mit Cookie `pukalani-neutral=olive` → SSR `data-neutral="taupe"`, Kontroll-Host mit demselben Cookie → `olive`). **Offen [David], läuft als D6 weiter:** eine Änderung erreicht offene Fenster NICHT ohne Reload (`tenants` liegt im Control-Plane-Projekt, es gibt dafür kein Realtime) — gilt seit dem 2026-07-28 genauso für Theme/Variante. **Gelernt:** Ein Wähler ohne Wirkung ist eine Lüge — deshalb VERSCHWINDET der Theme-Umschalter auf Mandanten-Hosts, statt beschriftet zu werden. Die Regel selbst gehört in eine PURE Funktion mit Fallmatrix (11 + 14 Fälle); die Composables legen nur Cookies und Registry-Prüfung darum. Und `''` (keine eigene Wahl) darf nie in ein `USelectItem` — Nuxt UI verbietet leere Werte, deshalb Chips. | 2026-07-29 | ✅ |
| B6 | ✅ **ENTSCHIEDEN 2026-07-30 (David): `UTable` ist der Standard für Datenlisten** — Sortierung, Auswahl und Paginierung kommen mitgeliefert und verhalten sich überall gleich; handgebaute Listen nur mit Grund, und der gehört an die Stelle geschrieben. Steht als Regel in CLAUDE.md. **Offen ist damit nicht mehr die Frage, sondern das Ausrollen** auf die ~18 handgebauten Listen — das läuft mit E9 (Dashboard-Umbau), damit die Listen nicht zweimal angefasst werden. | 2026-07-30 | David |

---

## C — erledigt (Claude konnte sofort)

| # | Task | Erledigt | Herkunft |
| --- | --- | --- | --- |
| C0 | ✅ **ERLEDIGT 2026-07-28** — media-002 gegen Projekt `comments` gefahren. Vorher: Tabelle `rowSecurity=false` + `read("any")`, Bucket `fileSecurity=false` + `read("any")` — jeder Anonyme konnte Entwürfe samt Bild abrufen. Nachher: beide `rowSecurity/fileSecurity=true` mit leeren Table-/Bucket-Rechten, das Leserecht hängt an der Row bzw. Datei und folgt `published`. Der veröffentlichte Bestand (1 Eintrag) trägt jetzt `read("any")` + `read("label:admin")` und ist unverändert erreichbar (Galerie-URL → HTTP 200, image/webp). Ist-Zustand vorher als JSON gesichert. **Voraussetzung war**: dem `comments`-Migrations-Key fehlten Storage-Scopes — media-002 ist die erste Migration, die einen Bucket anfasst (David hat sie am 2026-07-28 ergänzt). `photos` war nie betroffen (nicht in Produktion). **Gelernt:** Migrations-Keys haben **Scopes** — media-002 war die erste Migration, die einen Bucket anfasst, und scheiterte, bis David dem `comments`-Key die Storage-Scopes gab. Vor jeder Migration prüfen, welche Ressourcenart sie berührt. Zweitens: den Ist-Zustand VORHER als JSON sichern, sonst gibt es keinen Vergleichspunkt für „nachher unverändert erreichbar". | 2026-07-28 | Audit B3 |
| C0b | ✅ **ERLEDIGT 2026-07-29** — die beiden ruhenden Migrationen sind auf prod gefahren. **system-021** (`activities.tenantId` + `idx_tenant`) auf ALLE vier Instanzen mit Appwrite: control, pool, comments, portfolio (marketing und help haben keine Datenebene). **media-003** (`media_items.tenantId` + `idx_tenant_published_order`) auf comments — die einzige Prod-Instanz mit media, weil photos nur lokal läuft. Vorher je Instanz gesichert, danach gegengeprüft: überall `tenantId` mit Status `available`, Spalten 8→9 bzw. 7→8, Indizes 3→4 bzw. 1→2, Zeilenbestand unverändert (comments 32 Aktivitäten, 1 Medien-Eintrag). Alle Kunden-Hosts danach 200. | 2026-07-29 | C1b / Audit B3 |
| C0c | ✅ **ERLEDIGT — war schon auf prod, die Zeile war veraltet** (nachgeprüft 2026-07-29). `system-022` (`notifications.tenantId` + `idx_recipient_tenant`) liegt auf **allen vier** Instanzen mit Datenebene: `control`, `pool`, `comments`, `portfolio` — je 8 Spalten, `tenantId` mit Status `available`, 4 Indizes inklusive `idx_recipient_tenant` (gelesen über `listColumns`/`listIndexes` gegen `https://api.pukalani.app/v1` mit den Migrations-Keys). Das Rückfall-Fenster, vor dem diese Zeile warnte, hat es also nie gegeben. `notifications` ist auf allen vier noch leer (0 Zeilen) — die Glocke ist jung, ein Backfill wäre ohnehin gegenstandslos. **Gelernt:** Eine Warnung in einer To-do-Liste ist eine BEHAUPTUNG, bis jemand nachmisst. Diese hier warnte vor einem Rückfall-Fenster, das es nie gab. Vor dem Handeln immer den Ist-Zustand gegen die Instanz lesen (`listColumns`/`listIndexes`), nicht gegen die Notiz. | 2026-07-29 | C15 |
| C1 | ✅ **ERLEDIGT 2026-07-28** — `/api/admin/stats\|analytics` gaten über `await requireSitePermission(event, 'dashboard.access')` statt label-only. Bewusst diese Capability: sie ist die Eintrittskarte, die alle fünf Site-Rollen auf die Übersicht bringt — enger gegated bliebe die Seite für Editor und Viewer leer, der Befund wäre nur verschoben. Kennzahl-genau geklemmt: `commentsReported` nur mit `comments.moderate` (offene Meldungen sind Moderations-Wissen), `usersTotal`/`usersInRange` bleiben im Pool `null` wie gehabt — Karte bzw. Balkenreihe entfallen dann, statt eine fremde Zahl zu zeigen. Mitgenommen: **Audit S2** — die Übersicht gatet ihre Widgets jetzt einzeln (Schnellmoderation `comments.moderate`, Aktivität `audit.read`, Speicher `storage.manage`), inklusive `immediate`, damit für Site-Rollen keine vorhersehbaren 403-Fetches mehr rausgehen. Beweise: `packages/admin/tests/dashboard-stats-authz.test.ts` (11 Fälle) + live 30/30 in `verify-site-authz.mjs` (neuer Abschnitt 6b: Owner 200, Fremder 403, Gast 401). | 2026-07-28 | Pool-Audit N8 |
| C1b | ✅ **ERLEDIGT 2026-07-28** — media und activity gehen durch die Datentür. Migrationen: **media-003** (`media_items.tenantId` + idx_tenant_published_order) und **system-021** (`activities.tenantId` + idx_tenant), beide additiv/ruhend ohne Backfill ('' = Silo, im Pool fail-closed). Alle sechs `server/api`-Routen über `tenantDb(event)`, `as:'operator'` nur wo fachlich nötig (Entwurfs-Rows ohne breites Leserecht, Rows ohne Schreibrechte) und je Fall am Code begründet. Auch die Helfer außerhalb des Backstops: `applyMediaVisibility` prüft selbst, `recordActivity` (core) stempelt Mandant + Site-Label statt `read(users)` — sonst hätte im Pool jedes Mitglied den Feed aller Communities bekommen, auch über Realtime. Der Activity-Realtime-Stream filtert zusätzlich clientseitig (`useTenantId`). ESLint-Backstop auf beide Layer erweitert; Isolationsbeweise `packages/{media,activity}/tests/tenant-isolation.test.ts` gegen echte Appwrite grün. **Prod-Migrationen nachgezogen mit C0b (2026-07-29).** **Ein Rest, kein Leck**: Entwurfs-DATEIEN im Bucket tragen nur den globalen Operator-Read — im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht vorschauen; Richtung (server-seitige Vorschau-Route) steht in `media/server/utils/mediaPermissions.ts`. **Gelernt:** Der ESLint-Backstop gegen rohes `.tablesDB` griff nur in `server/api/**` — der Stats-Contributor von comments liegt aber in `server/plugins/**` und zählte deshalb ungebremst pool-weit in eine Kunden-Ansicht. Wer einen `H3Event` bekommt, bedient einen REQUEST und gehört hinter dieselbe Tür wie eine Route. Zweitens: `recordActivity` stempelte `read(users)` — im Pool hätte damit jedes Mitglied den Feed ALLER Communities bekommen, auch über Realtime. Helfer außerhalb des Backstops sind die gefährlichsten Stellen. | 2026-07-28 | Dashboard-Audit S3 |
| C9 | ✅ **ERLEDIGT 2026-07-28** — Ursache war **keine** CI-Eigenheit und **nicht** die localhost-Falle: der Test war schlicht veraltet. Seit **E4** (Gast-Kommentare, 23.07.) steht der Zweig `data-guest-composer` im `v-else-if`-Band VOR `data-embed-login` und verdrängt ihn, sobald `pukalani.comments.embed.guests` an ist — der gesuchte Knopf `[data-embed-login] button` existierte seither nie. Lokal exakt reproduzierbar (also kein Umgebungsunterschied); ältester noch abrufbarer Lauf (26.07.) zeigt dieselbe Signatur. Zwei Änderungen: (1) der Popup-Login-Knopf trägt in BEIDEN Gast-Zweigen den Haken `data-embed-login-cta`, die Spec hängt am Knopf statt am Container; (2) der Test bekommt ein Budget von 150 s — mit den 30 s Standard riss er auf einem kalten Server schon im ersten Warteschritt ab und meldete „Hydration-Zeitüberschreitung" statt des echten Fehlers, was die Diagnose tagelang in die falsche Ecke schickte. Beim Nachmessen kam ein **zweiter**, echter Grund dazu — der Kaltstart des **Dev**-Servers, gegen den die Suite fährt (auch in CI): er kompiliert jede Route beim ersten Zugriff (kalt gemessen `/` gut 25 s, `/embed` samt Client-Bundle über 30 s). Das riss (a) das 30-s-Standardbudget von `realtime` und `embed-write` und (b) die harte 10-s-Kante in `public/embed.js`, die das iframe **endgültig** versteckt (`display:none` + „Comments could not be loaded"), wenn das Widget keine Höhe meldet — gedacht für den CSP-geblockten Einbetter, aber die Höhe kommt erst aus `onMounted`. Danach heilt kein Warten mehr. Deshalb drei Maßnahmen, jede an einer gemessenen Kante: Test-Budget global auf 90 s (embed-write 240 s, es fährt drei Dokumente hoch); beide Embed-Specs rufen `/embed` einmal **im Browser** auf und warten dort bis zur **Hydration**, bevor die Hostseite lädt (ein SSR-Abruf oder ein `goto` bis `load` lässt den Client-Graph unfertig — beides nachgemessen, beides reichte nicht); und die Lebendigkeits-Wartezeiten der Handoff-Kette stehen auf 60 s, weil `/api/auth/login\|embed-handoff\|embed-session` ebenfalls erst beim ersten Aufruf kompilieren. Ohne das war die Suite nur noch dank `retries: 1` grün, also „flaky" statt verlässlich. **Drittens** zeigte sich, dass der lange als „hängt halt 5 Minuten, nicht killen" abgetane Playwright-Teardown-Hang kein harmloses Warten ist: Playwright force-killt jeden Worker nach 300 s und zählt das als Fehler **ausserhalb jedes Tests** — Exit-Code 1 bei komplett grüner Suite. Das trifft **nur lokal** (macOS); in CI läuft dieselbe Suite in ~1,6 min sauber durch, dort taucht die Meldung nie auf. Naheliegende Ursache (die Test-eigenen `node:http`-Hostserver hielten Keep-alive-Sockets, `close()` wartete darauf) ist behoben — `closeAllConnections()` vor `close()`, richtige Hygiene —, **erklärt den Hang aber nicht**: er trifft auch Worker, die nie einen solchen Server hatten. Lokale Ursache bleibt offen (→ E7). Damit ein übersprungener Fall nicht mehr still verschwindet, läuft in CI zusätzlich der `list`-Reporter (der `github`-Reporter meldet nur „9 skipped" als Zahl). **Was der Job künftig fängt / was nicht**: siehe Notiz unter der Tabelle. **Gelernt (der lehrreichste Eintrag der ganzen Liste):** (1) Der E2E-Job war über EINEN TAG rot, ohne dass es jemand merkte — seither gehört `gh run list --branch main` in jeden Durchgang, die lokale Konsole reicht nicht. (2) Ein Test-Haken gehört ans **handelnde Element**, nie an einen Container: ein Config-Gate tauschte den Zweig aus, der Container blieb, der Knopf verschwand. (3) Ein zu knappes Zeitbudget meldet eine Zeitüberschreitung an BELIEBIGER Stelle statt der echten Ursache — das schickte die Diagnose tagelang in die falsche Ecke. (4) `retries: 1` macht aus einem echten Fehler ein „flaky" — grün, aber wertlos. (5) Ein Reporter, der nur „9 skipped" als Zahl meldet, versteckt übersprungene Fälle; deshalb zusätzlich der `list`-Reporter. (6) Ein „hängt halt fünf Minuten"-Verhalten kann ein Exit-Code-1 sein: Playwright force-killt Worker nach 300 s und zählt das als Fehler AUSSERHALB jedes Tests. | 2026-07-28 | CI-Beobachtung 28.07. |
| C10 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Bestätigungs-Vertrag existiert als `packages/core/app/composables/useConfirm.ts` und wird an **10** Stellen benutzt (`await confirm({...})`: Übersicht, System, Speicher, GDPR-Exporte, Changelog, Nutzer ×2, Embed, Kommentare …). Natives `window.confirm()` kommt im ganzen Repo nur noch EINMAL vor — im Docstring von `useConfirm.ts`, der beschreibt, was es ersetzt hat. Auch die Doppelklick-Sperren sind da (`saving`-Guard in `media.vue`, mit „Audit-Befund C10" annotiert). **Gelernt:** Ein Audit-Befund altert. Zwischen Befund und Abarbeitung lag hier die Umsetzung — wer ihn ungeprüft „abgearbeitet" hätte, hätte eine zweite Lösung neben die bestehende gebaut. Jeden Befund vor dem Fixen am Code nachmessen. | 2026-07-30 | Dashboard-Audit, UI-Hebel 2 |
| C11 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Baustein heißt `packages/core/app/components/core/EmptyState.vue` (= `<CoreEmptyState>`) und steht in **22** Dateien. Die Zeile suchte nach `UEmpty` und fand deshalb nichts — die Hausform ist die eigene Komponente, nicht die Nuxt-UI-Variante; CLAUDE.md führt sie inzwischen als Standard („Leerer Zustand über CoreEmptyState"). **Gelernt:** Eine Suche nach dem FREMDEN Namen (`UEmpty`) findet die Hausform nie. Wer prüft, ob ein Muster existiert, muss nach der Sache suchen, nicht nach der Schreibweise, die er erwartet — sonst meldet das Audit eine Lücke, die keine ist. | 2026-07-30 | Dashboard-Audit, UI-Hebel 1 |
| C13 | ✅ **GRÖSSTENTEILS ERLEDIGT 2026-07-28** — jeder Befund erst am Code nachgeprüft, dann gefixt: **S5** „Autor sperren" + Autoren-Link gaten auf `users.manage` (Muster aus dashboard/index.vue; dieselbe Stelle steckte auch in der Schnellmoderation der Übersicht) · **S7** `grantEventTicket` stempelt den Mandanten seines Events, s. D1 · **S8** Appwrite-Fehlertexte bleiben serverseitig (`publicContributorResults()` + strukturierte Logs) · **S10a** Produkt-Gate auf ALLE neun posts-Routen (nicht nur die vier gemeldeten — hide/restore/assist gehören zwingend dazu) · **S10b** Wartungsmodus auf patch/delete **und vote** (der Befund nannte `vote.post` irrtümlich als Referenz; die Prüfung sitzt in `score.post`) · **S10c** Triage-Gate in die Route gezogen. Vier neue Test-Suites, drei davon strukturell (jede Route trägt ihren Gate). **Offen abgespalten:** S6 → C15, S9 (tote Capabilities) → C16. Details + Prüfvermerke: [DASHBOARD-AUDIT-2026-07-28.md](archiv/audits/DASHBOARD-AUDIT-2026-07-28.md). **Gelernt:** Ein Audit-Befund kann die richtige Lücke mit der falschen Fundstelle melden — S10b nannte `vote.post`, die Prüfung sitzt in `score.post`. Und er kann zu klein zählen: gemeldet waren vier posts-Routen, betroffen waren neun. Immer die ganze Route-Familie absuchen, nicht die genannte Liste abarbeiten. Nachhaltig wurde es erst durch **strukturelle** Tests: „jede Route trägt ihr Gate" fängt auch die zehnte, die noch niemand geschrieben hat. | 2026-07-28 | Dashboard-Audit |
| C15 | ✅ **ERLEDIGT 2026-07-29** — die Glocke ist mandantenrichtig. **Migration `system-022`** (`notifications.tenantId` + `idx_recipient_tenant`, ohne Backfill; Prod-Lauf mit C0c bestätigt). Die Spalte trägt DREI Bedeutungen, gebündelt in der einen puren Regel `core/shared/notificationScope.ts`: `<tenantId>` = diese Community, `_account` = Kundenbereich (kollisionsfrei, weil eine Appwrite-Row-Id nie mit `_` beginnt), `''` = unbekannt. `notify()` verlangt jetzt ein **Pflichtfeld `scope: 'tenant' \| 'account'`** — kein Default, damit „mandantenlos" eine Entscheidung ist und kein vergessenes Feld; der TypeScript-Fehler ersetzt hier den ESLint-Backstop, der in `server/utils/**` nicht greift. Alle **acht** Aufrufer gestempelt (nicht sechs, wie hier stand): comments ×3, tickets ×2, events, control-Invites, Stripe-Webhook — die letzten beiden **`'account'`** (Davids Entscheidung 3: Vertrags-Meldungen gehören nicht in eine Kunden-Community). Beide Leserouten + der Realtime-`where` der Glocke filtern über dieselbe Regel. **Bestandszeilen bleiben sichtbar** (Davids Entscheidung 2) — bewusst fail-OPEN, die begründete Ausnahme von der sonst geltenden fail-closed-Regel: sonst leert sich jedem Nutzer im Deploy-Moment die Glocke, und Row-Security hält die Empfänger-Grenze ohnehin. Die Begründung steht an drei Stellen im Code, damit sie niemand „korrigiert". Dazu zwei Rückfälle für das Deploy-Fenster (Code vor Migration): Schreiben ohne Stempel, Lesen ohne Filter — beide **laut** geloggt. Der Digest-Sweep bleibt bewusst mandantenübergreifend (eine Mail pro Tag, nicht eine pro Community) und ist vom Stempel unberührt. Beweise: `packages/core/tests/notificationScope.test.ts` (16 Fälle, Stempel-Vertrag Pool/Silo/mandantenlos) + `packages/core/tests/notification-tenant-isolation.test.ts` (5/5 gegen echte Appwrite: ein Nutzer, zwei Communities, jede Glocke nur ihre eigenen; `_account` nie in einer Community; Bestandszeilen in beiden). **Reste abgespalten:** C17 (Kundenbereich hat keine Glocke), D5 (Mail-Links). **Gelernt:** (1) Ein **Pflichtfeld** ist der bessere Wächter als ein Default, wenn der ESLint-Backstop nicht greift — in `server/utils/**` gibt es keinen, also erzwingt der Typfehler die Entscheidung. Ein geratener Stempel hätte eine Zahlungswarnung in fremde Glocken gelegt. (2) Die sonst geltende fail-closed-Regel war hier FALSCH: ohne Backfill hätte sie jedem Nutzer im Deploy-Moment die Glocke geleert. Solche begründeten Ausnahmen gehören DREIMAL in den Code geschrieben, damit sie niemand „korrigiert". (3) Für das Deploy-Fenster (Code vor Migration) je einen LAUTEN Rückfall einbauen — still weiterlaufen heißt, den Fehler erst beim Kunden zu sehen. | 2026-07-29 | Dashboard-Audit S6 |
| C17 | ✅ **ERLEDIGT 2026-07-29 — die Glocke hängt jetzt dort, wo die Meldungen liegen.** Die Zeile hier hatte den falschen LESER im Verdacht: sie suchte die Anzeige auf `my.pukalani.app` (Platform-App, Pool-Projekt) und schloss daraus auf ein Cross-Projekt-Problem. Am Code nachgeprüft gibt es keines — **Absender, Empfänger und Leser liegen alle drei im `control`-Projekt**: `packages/billing/server/api/stripe/webhook.post.ts:113` (`recipientId: row.userId` aus `billing_subscriptions`, ein Konto DIESES Projekts) und `packages/control/server/utils/inviteRequests.ts:261` (Betreiber mit Label `admin`) laufen beide nur in `apps/control`; `apps/platform` hängt `@pukalani/billing` gar nicht ein und hat deshalb keinen einzigen `account`-Absender. Gefehlt hat nur die ANZEIGE: die Glocke wird ausschließlich aus `pukalani.chrome.utilities` gerendert, und dessen einziger Konsument ist das **blueprint**-Layout — ein Layer, den `apps/control` nicht extended. Fix: neuer Schalter `pukalani.chrome.accountBell` (Core-Default **aus**), gerendert im core-default-Layout (= Kopfzeile von `/workspace` und `/account/billing`) und in der Dashboard-Shell (Sidebar-Reihe neben der Suche — **nicht** als schwebendes Widget oben rechts: dort sitzen die Aktionen der Seiten-Kopfzeilen, das erste Layout verdeckte „Neuer Code"). `apps/control` schaltet ihn an, sonst ändert sich für keine App etwas. Dazu ein zweiter Befund aus demselben Weg: `invite.request` hatte in der Glocke **keinen Lesetext** und fiel auf `'replied'` zurück — die Betreiber-Glocke behauptete „hat auf deinen Kommentar geantwortet"; jetzt `notifications.inviteRequest` (de+en), und der `title` trägt die anfragende Adresse statt eines hartcodierten deutschen Satzes. Beweise: `packages/control/scripts/verify-account-bell.mjs` (**27 bestanden, 0 fehlgeschlagen** — echter Weg vom öffentlichen Anfrage-Formular über das Control Plane bis in die Glocke, Fremder sieht nichts, Gast sieht keine Glocke, plus die Gegenprobe im Pool: Community-Glocke ohne `_account`, Kundenbereich ohne Community-Meldung) + `packages/core/tests/notificationBellTexts.test.ts` (strukturell: jeder gesendete Typ braucht einen eigenen Lesetext in beiden Sprachen — verifiziert rot, wenn der Zweig fehlt). Browser-geprüft (Konsole sauber, nur die bekannte `i18n baseUrl`-Warnung). **KEINE Migration nötig.** Offen geblieben (bewusst): auf `my.pukalani.app` hängt weiter keine Glocke — dort gibt es heute nichts zu zeigen; kommt Pool-Billing (D1), braucht das Onboarding-Layout eine. **Gelernt:** Die Zeile hatte den falschen LESER im Verdacht und leitete daraus ein Cross-Projekt-Problem ab, das es nicht gab. Bei „X wird nicht angezeigt" zuerst Absender, Empfänger und Leser einzeln lokalisieren — hier lagen alle drei im selben Projekt, gefehlt hat nur ein Layout-Schalter. Zweitens: ein neuer `notify()`-Typ ohne eigenen Lesetext fällt still auf `'replied'` zurück, und die Glocke behauptet dann etwas Falsches. Deshalb der strukturelle Test, der jeden gesendeten Typ in beiden Sprachen einfordert. | 2026-07-29 | C15 |

**Was der E2E-Job (C9) beweist — und was nicht.** Er fährt eine echte
Wegwerf-Appwrite hoch und deckt danach 15 Fälle ab: öffentliche Seiten,
i18n-Routing und SSR-Render (smoke), den Auth-Guard, das Embed-Widget auf einer
echten Fremd-Origin samt `frame-ancestors`-Split und `noindex`, den kompletten
Popup-Handoff-Login mit anschließendem Schreiben (embed-write) und — das ist der
teuerste Fall — die **Realtime-Zustellung** gegen die echte Instanz: ein
serverseitig angelegter Kommentar muss live im Browser ankommen und beim Löschen
wieder verschwinden. Das ist der Regressionsschutz für die
SDK-Socket-Konsolidierung. **Nicht** abgedeckt: die 9 visuellen
Theme-Baselines (plattformspezifisch `-darwin`, laufen nur lokal — sie stehen
seit jeher als `skipped` im Log und heißen jetzt beim Namen), und das
CHIPS-Partitionierungs-Verhalten selbst: `localhost:PORT` gegen
`localhost:PORT` ist same-**site**, echtes Cross-Site-Gastverhalten braucht
echte Domains und bleibt ein Prod-Beweis
([EMBED.md](referenz/EMBED.md)).

---

## E — erledigte Betriebs-/Hygiene-Punkte

| # | Task | Erledigt |
| --- | --- | --- |
| E4 (Teil) | **Cutover-Krümel** ([CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md)): ploi-Alias `studio.` ✅ **entfernt 2026-07-30** (ploi → Domain aliases; `studio.pukalani.app` antwortet jetzt 404 über die Wildcard-Site `platform`, alle übrigen Hosts unverändert, verify-tls grün). Das „Doppel-Zertifikat" ist **kein Aufräum-Punkt**: control hat eine eigene Lineage, die den Alt-SAN `studio` bis zur nächsten automatischen Erneuerung mitführt — eine Anforderung nur zum Entfernen eines überzähligen Namens wäre reines Risiko ohne Nutzen. **Rest offen (Read-only-Key im Projekt `control`) steht in OPEN-ITEMS.md.** **Gelernt:** Beim Aufräumen des Cutovers starb einmal die portfolio-App, weil `pm2 jlist` auf ein cwd unter dem ALTEN Hostnamen zu prüfen war (`ops/pm2-heal.sh`). Eine Umbenennung zieht Meldungen mit, PFADE aber nicht — nach jedem Rename die Prozess-/Skript-Pfade einzeln nachsehen. Und: ein überzähliger Zertifikatsname ist KEIN Aufräumgrund; eine Neuanforderung nur zum Entfernen wäre Risiko ohne Nutzen. | 2026-07-30 |
| E6 | ✅ **ERLEDIGT 2026-07-30** — 47 Worktrees + 47 Zweige `worktree-agent-*` entfernt (alle in `main`, ohne `--force` gelöscht, keiner hatte ungesicherte Änderungen). **Stehen geblieben und zwar bewusst:** `worktree-agent-a762b1bc42bba74d7` = der geparkte **Seiten-Editor** (1 Commit, 108 Zeilen, Feature-Stopp) und VIER Worktrees anderer Claude-Sitzungen (`claude/epic-diffie`, `claude/pukalani-landingpage-optimization`, `claude/sleepy-leavitt`, `claude/upbeat-curran`) — deren Arbeit liegt zwar in `main`, aber sie gehören mir nicht und mindestens eine ist aktiv. **Gelernt:** Vor dem Löschen IMMER prüfen, ob ein Worktree einer fremden, laufenden Sitzung gehört — `--force` wäre hier fremder Arbeitsverlust gewesen. Ohne `--force` löschen ist der eingebaute Schutz: Zweige mit ungesicherten Änderungen verweigern sich von selbst. | 2026-07-30 |
| E8 (Etappen 1+2) | **Umbenennung auf `community`** — Davids Entscheidung (2026-07-29/30). Plan: [UMBENENNUNG-AUF-COMMUNITY.md](plans/UMBENENNUNG-AUF-COMMUNITY.md). **Etappe 1 LIVE:** `sites` → `websites` (control-022). **Etappe 2 LIVE (2026-07-30):** `site_members`/`site_invites` → `community_members`/`community_invites` + Spalte **`siteId` → `communityId`** in beiden UND in `invite_requests` (control-023); der Name `communityId` gilt jetzt überall, wo eine `tenants.$id` transportiert wird (TenantContext, Resolver-Verträge, Service-Naht). Beweise nachgefahren: **97/97** Site-Autorisierung · **23/23** Presence-Grenze · **17/17** + **19/19** Einladungen. Beim Ausrollen bewusst KEINE Kompatibilitäts-Brücke: das Deploy-Fenster (control vor platform, dieselbe Schleife, unter einer Minute) lässt die Naht kurz mit 400 antworten — bei leeren Tabellen und ohne Kunden verhältnismäßig, eine Brücke wäre ein neuer Halbzustand gewesen. **Das Aufräumen der Alt-Tabellen ist mit E11 miterledigt.** Etappen 3+4 stehen offen in OPEN-ITEMS.md. **Gelernt:** Eine Kompatibilitäts-Brücke ist nicht automatisch die vorsichtigere Wahl — sie wäre hier ein neuer HALBZUSTAND gewesen, den später wieder jemand hätte abbauen müssen. Bei leeren Tabellen und ohne Kunden ist ein Deploy-Fenster von unter einer Minute mit kurzen 400ern die ehrlichere Lösung. Die Entscheidung hängt an der Frage „wer sieht den Zwischenzustand?", nicht an der Technik. | Etappe 1+2: 2026-07-30 |
| E11 | **Vokabular aufräumen — ein Wort je Sache** ([VOKABULAR-AUFRAEUMEN.md](plans/VOKABULAR-AUFRAEUMEN.md)) — Davids Auftrag 2026-07-30. **`feature` → `product` ist DURCH (Etappen A+B, 2026-07-30):** Migrationen control-024 + system-023 + courses-003 auf allen vier Instanzen (lokal+Prod), 964 regelbasierte Ersetzungen in 226 Dateien + 43 git mv, Typecheck 10/10 + alle Tests + Gates grün. **Das ZUSAMMENZIEHEN ist DURCH (2026-07-30, Davids Go — Beobachtungsnacht erlassen):** control-025/026 + system-024 + courses-004 auf lokal + Prod, alle Übergangs-Spiegel/Aliasse entfernt; auch das E8-Aufräumen (Alt-Tabellen) ist damit erledigt. „Customize theme" ersetzt das Theme-Studio (Davids Entscheidung). NEU: Betreiber-Seite „Gesperrte Namen" (control-027) und A6 Schritte 0–2 (control-028, Community-Fulfillment). Ursprünglicher Kern war: **`feature` → `product`**, also `feature.manifest.ts` → `product.manifest.ts` (**18 Dateien**), `featureKey` (56), `featureGates` (18), `check:manifests` (13) — insgesamt **2.626 Zeilen in 413 Dateien**. **Bewusste Kehrtwende:** CLAUDE.md hält bis heute fest „im CODE bleibt das Vokabular `features`" (P4); das gilt damit nicht mehr. Zwei Stellen mit echtem Risiko waren: die Appwrite-Tabelle **`feature_catalog`** (kein Rename möglich ⇒ Muster control-022/023, Zeilen MIT `rowId: row.$id`, und die Row-Id ist hier der Feature-Key, der in `entitlements.featureKey` steckt) und die **öffentliche Route `/api/platform/features`**. Die Altlast **`pukalani.studio.*`** ist ebenfalls DURCH (2026-07-30: → `pukalani.control.*` samt Log-Präfixen, controlUserData, Prosa; RESERVED `studio` + Theme-Studio bleiben bewusst); übrig drei bewusste `reddit`-Kommentarreste. **Einzige offene Frage war `maui` vs. `pukalani`** — inzwischen entschieden und als eigener Punkt (E11b) in OPEN-ITEMS.md geführt. Reihenfolge zwingend seriell (alle fassen dieselben Dateien an): A6 → E8-3 → E8-4 → feature/product ✅ → pukalani.studio ✅ → E9/E10. **Gelernt (fünf Fallen, alle beim Bauen aufgetaucht):** (1) **`app_config` stand am utf8mb4-Zeilenbudget** — die neue Spalte `products` passte nicht mehr als `varchar(4000)` und musste als **MEDIUMTEXT** angelegt werden (off-row, kostet kein Zeilenbudget). Bei breiten Konfig-Tabellen vor jeder neuen Spalte das Budget rechnen. (2) **Die DRITTE Migrations-Lücke (`courses.entitlementFeature`) fiel erst beim Bauen auf**, nachdem schon zwei gefunden waren: dieselbe Vokabel liegt in MEHREREN Projekten. Regel: vor jedem Vokabular-Rename ALLE `scripts/migrations/**` nach dem Wort greppen — sowohl als `key:` (Spaltenname) wie als `tableId` — und die Trefferliste abhaken, statt sich auf das Gedächtnis zu verlassen. (3) **Die Changelog-Kategorie `'feature'` ist ein DATEN-WERT** („Neuerung") und kein Vokabel-Vorkommen — sie darf nie mitbenannt werden. Ein regelbasiertes Ersetzen muss Daten von Bezeichnern trennen; dasselbe gilt für **Locale-WERTE**: das Skript benennt Schlüssel um, niemals die Sprache dahinter. (4) **`entitlements.featureKey` war `required` + Unique-Index** — ohne Dual-Write wäre JEDER Insert im Umstellungsfenster gescheitert. Pflichtspalten mit Unique-Index brauchen immer die Doppelschreibphase. (5) Die Row-Id von `feature_catalog` IST der Feature-Key und steckt in `entitlements.featureKey` — beim Kopieren also `rowId: row.$id` mitführen, sonst zerreißt die Referenz. | 2026-07-30 |
| E11b | **`maui` → `pukalani` im Repo-INHALT** ([VOKABULAR-AUFRAEUMEN.md](plans/VOKABULAR-AUFRAEUMEN.md) Abschnitt 4) — Davids Entscheidung: **Inhalt jetzt, Ordner später.** Der lokale Ordner und das GitHub-Repo heißen weiter `maui-monorepo`, die Domain `maui.photos` bleibt überall unverändert (Vorgabe 2026-07-31). **Die 567 Dateien im Plan stammten von VOR Etappe A** — nachgemessen blieben am 2026-07-31 nur **180 Treffer in 84 Dateien** (ohne `docs/archiv/**`, `CHANGELOG.md`, `pnpm-lock.yaml`). Regelbasiert wie Etappe A/B: **88 Ersetzungen in 50 Dateien** über 11 Regeln + 1 `git mv`; **92 Treffer bleiben bewusst** (maui.photos · Insel Maui als Ort · Stripe-Datenschlüssel · Embed-Rückwärtskompatibilität · echter Repo-/Ordnername · historische Sätze · spikes). Beweise: 826 Unit-Tests, `check:manifests` 18 Layer/8 Apps, `check:single-copy`, `pnpm -r typecheck` 10/10 grün; `pnpm-lock.yaml` unverändert. **Gelernt (drei Fallen, alle Altlasten AUS Etappe A):** (1) **Ein Vokabel-Rename hinterlässt tote Bezeichner, die still weiterlaufen.** Fünf Gruppen zeigten ins Leere: `maui.*`-Config-Gates (Namensraum heißt `pukalani.*`), `@maui/*`-Importe (Scope heißt `@pukalani/*`), das Einladungscode-Präfix `MAUI-` (Codes heißen `PUKA-`), die Brand-Fallback-Kommentare (Fallback ist `'Pukalani'`) und `public/maui-comments.js`, dessen eigene Anleitung schon `/pukalani-comments.js` nannte — **die dokumentierte URL lieferte 404**. Regel: nach jedem Rename nicht nur greppen, sondern die Treffer GEGEN den neuen Zustand prüfen. (2) **Ein Beweis-Skript kann durch einen Rename lautlos wertlos werden.** `verify-invite-stock.mjs` prüfte NEGATIV auf `MAUI-` (passt seither immer) und einmal POSITIV (`Kunde hat den Code per Mail`) — Letzteres wäre rot gelaufen, Ersteres grün ohne Aussage. Prüfungen auf Abwesenheit brauchen nach einem Rename dieselbe Sorgfalt wie Prüfungen auf Anwesenheit. (3) **Blindes Ersetzen macht historische Sätze zur Lüge.** Etappe A schrieb in `themes/app/plugins/theme.ts` „die Head-Ids heißen `pk-*`, nicht mehr `pukalani-*`" — sie hießen `maui-*`, nie `pukalani-*` (git 00674664). Protokoll-Sätze gehören in die Ausnahmeliste, nicht in die Regel. | 2026-07-31 |

---

## 2026-07-30 — am selben Tag zusätzlich fertig geworden

Diese vier Punkte sind aus E11 hervorgegangen und standen deshalb nie als
eigene Zeile in OPEN-ITEMS.md. Sie stehen hier, weil ihre Lektionen sonst
verloren gingen.

| Was | Ergebnis | Gelernt |
| --- | --- | --- |
| **Zusammenziehen der Übergangs-Spiegel** (control-025 `product-contract-cleanup`, control-026 `drop-site-legacy`, system-024 `drop-app-config-features`, courses-004 `drop-entitlement-feature`) | Alle Doppel-Spalten und Aliasse aus der `feature`→`product`-Umstellung sind weg, lokal und auf Prod; damit ist auch das E8-Aufräumen (Alt-Tabellen `site_members`, `site_invites`, `sites`) erledigt. Davids Go kam ohne die geplante Beobachtungsnacht. | **Die Drop-Migrationen liefen ein paar Minuten VOR dem Cleanup-Deploy.** In diesem Fenster konnte der Health-Sweep nicht mehr in die bereits gelöschte Spalte spiegeln — der Fehler wurde gefangen und heilte sich mit dem Deploy selbst, war also folgenlos. **Regel:** Drop-Migrationen laufen IMMER erst, nachdem der Code live ist, der die Spalte nicht mehr braucht — und die Reihenfolge ist **je Instanz** zu prüfen, nicht einmal global. Additive Migrationen laufen vorher, löschende nachher. |
| **„Customize theme" ersetzt das Theme-Studio** (Davids Entscheidung) | Der Bereich heißt in der Oberfläche jetzt nach dem, was man dort tut, nicht nach einem internen Produktnamen. | Interne Produktnamen („Studio") wandern mit der Zeit in die Kundenoberfläche, wenn niemand sie stoppt. Ein Bereichsname sollte die HANDLUNG beschreiben. Der Schlüssel/Pfad bleibt dabei unangetastet — siehe die Lektion aus B3 (Label ≠ Id). |
| **Betreiber-Seite „Gesperrte Namen"** (Migration control-027 `reserved-names`) | Reservierte Subdomains sind nicht mehr nur eine Konstante im Code, sondern vom Betreiber pflegbar. | **Eine Appwrite-Row-Id fasst nur 36 Zeichen.** Weil der gesperrte Name selbst die Row-Id ist, musste das Namenslimit von 40 auf **36** — sonst antwortet `createRow` mit einem generischen 400, dessen Text nicht verrät, woran es liegt. **Regel:** Wenn ein Fachwert als Row-Id dient, ist seine Maximallänge 36, und das Formular muss das durchsetzen, nicht die Datenbank. |
| **A6 Schritte 0–2** (Migration control-028 `community-billing`) | Der Befund ist festgehalten und das Community-Fulfillment additiv angelegt; die Schritte 3–6 stehen offen in OPEN-ITEMS.md. | **Schritt 0 war ein PURER TEST, kein Dokument:** er hält fest, dass der Geldpfad nur `workspaceId` kannte. Beweis-Tests VOR dem Umbau zu schreiben kostet fast nichts und zahlt doppelt — sie belegen den Befund unbestreitbar, und beim Bauen drehen sie sich mit um, statt nachträglich erfunden zu werden. |

### Prozess-Lektion: geteilter Arbeitsbaum

Bei parallel laufenden Sitzungen im **selben** Arbeitsbaum ließ ein
`git stash push -u` / `pop` eines Sub-Agenten unkommittete Dateien der anderen
Sitzung vorübergehend verschwinden. Es kam am Ende alles zurück — der Schreck
war trotzdem echt, und bei einem abgebrochenen `pop` wäre es Arbeitsverlust
gewesen. **Regeln:** (1) früh und klein committen, statt große unkommittete
Stände liegen zu lassen; (2) Sub-Agenten **stashen nie** in einem geteilten
Baum — wer Isolation braucht, bekommt einen eigenen Worktree.

---

## Ältere, bereits abgeschlossene Abschnitte

Die folgenden Abschnitte standen bis 2026-07-30 unverändert in OPEN-ITEMS.md und
sind vollständig erledigt bzw. bewusst entschieden. Sie bleiben hier als
Begründungs-Archiv.

> **2026-07-06 bis 2026-07-09 — Produkt-Arc „Community-Plattform":**
> GOALS-Phasen 21–27 sind komplett (Feed, Events + v2 inkl. Serien, Billing,
> Courses, Posts), dazu Tickets-Board P1–P4 und das **KI-Paket** (core
> `aiComplete()`, Moderations-Assist für Kommentare + Posts, globales
> Laufzeit-Model-Override `app_config.aiModel`). Details: README-Status
> 56–60 + GOALS.md.
>
> **2026-07-02 — Großes Abarbeitungs-Paket:** ALLE offenen Findings des
> Gesamtchecks (🟠 + 🟡) wurden umgesetzt (siehe „Bereits erledigt"), dazu die
> Ideen 1–3 (App-Template, @-Mentions, Markdown). Für die größeren Blöcke
> liegen jetzt umsetzungsreife Pläne unter **docs/plans/**.

### 🟠 Ehemals „Offen — als Nächstes angehen"

- **Phase 17 – Production Deployment** — Plan + Schritt-für-Schritt-Checkliste
  für den Betreiber: [docs/archiv/PHASE-17-PRODUCTION.md](archiv/PHASE-17-PRODUCTION.md).
  **Vorarbeit ✅ (2026-07-11): Prod-Build lokal generalprobiert** — nuxi build
  + node .output, 14/14 funktionale E2E (inkl. Realtime) gegen den Build;
  Prod braucht nur noch NUXT_PUBLIC_I18N_BASE_URL + NUXT_SMTP_* auf echte Werte.
  (Empfehlung: 2 Hetzner-VMs, ploi-Daemon, deploy.yml via workflow_run,
  Realtime-Watchdog; ~60 abhakbare Schritte, ~25–28 €/Monat).
  **Komplett erledigt 2026-07-19 (s. unten „Roadmap").**
- ✅ **Changelog Track 2B AKTIV** (2026-07-19): Function `changelog-draft`
  läuft auf Prod, GitHub-Release-Webhook → `https://changelog.pukalani.app/`
  (Custom Domain mit Let's-Encrypt; functions-Subdomains bekommen auf 1.9.5
  kein Einzel-Cert). Smoke-/HMAC-Tests bestanden; echter Release-E2E läuft
  mit dem nächsten release-please-Release mit. Ist-Zustand + Betrieb:
  [docs/archiv/CHANGELOG-2B-AKTIVIERUNG.md](archiv/CHANGELOG-2B-AKTIVIERUNG.md).

### 📋 Ehemals „Pläne für größere Ausbauten"

- **Themes-Vollausbau 26×11**: [docs/archiv/THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md)
  — Generator-Script muss neu gebaut werden (nicht im Repo!), 9 Schritte,
  ~7–10 PT, 7 Entscheidungen (E1–E7). **Vorgezogen erledigt (2026-07-02):
  Theme-Studio** unter /dashboard/themes (themes-Layer via pukalani.admin.modules):
  Galerie aller Themes mit Live-Wechsel + Nuxt-UI-Showcase, EIGENE Themes
  anlegen/bearbeiten/sortieren/löschen (Runtime-Ramp-Generator
  themes/shared/ramp.ts mit WCAG-Kontrast-Check + CSS-Export; Table
  custom_themes via system-009, CRUD /api/admin/themes, öffentliche Liste
  /api/themes, SSR-flash-frei injiziert). Der 26-Themes-KATALOG aus dem Plan
  **ist seit 2026-07-24 gebaut** (Master #6).
- ✅ **packages/billing (Stripe)** — umgesetzt 2026-07-08 als GOALS-Phase 23
  ([Plan](archiv/BILLING-STRIPE.md) exekutiert): hosted Checkout/Portal,
  Webhook (Signatur/Allowlist/Stale-Guard), Entitlements + `useBilling`,
  Live-Matrix mit echtem Test-Key gefahren. Details README-Status 56.
- **Embed-Widget**: [docs/archiv/EMBED-WIDGET.md](archiv/EMBED-WIDGET.md)
  — **E0+E1 ✅ (2026-07-09): Read-only-MVP live** (iframe + embed.js,
  frame-ancestors-Split, Read-Rate-Limit, [docs/referenz/EMBED.md](referenz/EMBED.md)).
  **E2–E4 ✅ 2026-07-23** (Master #5).

### 🟡 Klein / Reste

- **Audit-Produktfragen (2026-07-05 ENTSCHIEDEN):**
  (a) **Presence-Sichtbarkeit — so lassen**: Presence-Metadata (`userName`/
  `avatarUrl` + Aktivität) bleibt per `read("users")` für alle eingeloggten
  User lesbar — Name/Avatar sind ohnehin öffentlich (Kommentare), „wer ist
  online/tippt/reviewt" IST das Feature; nur eingeloggte sehen es. Bei
  Kundenprojekten/Multi-Tenant neu bewerten (dann Reads über Server-Route
  proxien). *(Genau das ist mit A4/A5 passiert.)* (b) **deleted-Tombstones zählen
  mit**: sie sind sichtbare Listeneinträge („[gelöscht]", Reddit-Verhalten);
  Zähler = Liste; Nicht-Zählen würde Anzeige und total auseinanderlaufen lassen.
  (c) **X-Forwarded-For**: kein Code-Gate — als expliziter Checkpunkt im
  Phase-17-Plan verankert (App NUR hinter ploi-nginx, Port 3000 nie exponiert,
  Firewall erzwingt es). Akzeptiert ohne Fix: L15 (controversial-Cap 200,
  dokumentierte Grenze).
- ✅ **Kleinkram-Batch (2026-07-02)**: `appwrite.config.json` umbenannt (inkl.
  Doku-Referenzen); **Stats-Contributor-Registry** umgesetzt
  (`registerDashboardStatsContributor` in core, Plugins in comments/moderation,
  admin/stats kennt keine Feature-Tabellen mehr); A14-Vertragsliste + die
  bewusste core→system-Matrix-Ausnahme in CONCEPT dokumentiert; SEO-Caveat
  dokumentiert (s. u.).
- ✅ `redirectOn:'all'`-**SEO-Caveat GELÖST (2026-07-10)**: hreflang-Alternates
  + og:locale + canonical via `useLocaleHead` in den App-Shells; `detect-
  BrowserLanguage.fallbackLocale` entfernt (signal-lose Crawler-Requests
  bekamen auf /de/* EN-Content — jetzt URL-Locale als Autorität). Absolute
  URLs via `NUXT_PUBLIC_I18N_BASE_URL` — in Prod (Phase 17) auf die echte
  Domain setzen. Details README-Status 65.
- **Bewusst akzeptiert/zurückgestellt (2026-07-02 entschieden)**:
  **UserMenu → /dashboard**: bleibt als
  capability-gegateter localePath-Link (Apps ohne admin-Layer haben keine User
  mit dashboard.access — der Link erscheint dort nie). **PresenceAvatar auf
  UChip**: ✅ umgesetzt 2026-07-11 (Badge aus dem Chip-Theme, live verifiziert).
  **Flag-Registry statt commentsEnabled
  in core**: mittlerer Refactor der AppConfig-Typen, lohnt erst mit dem
  nächsten neuen Flag. `useFormatCurrency`: bleibt als Baukasten-Vorhaltung
  (billing-Plan nutzt sie).
- **Geprüft, bewusst NICHT umgesetzt**: `login.post` kann den Namen nicht
  billig an `logAuthEvent` durchreichen — das Session-Objekt enthält keinen
  Namen, jede Alternative kostet denselben users.get (2026-07-02 geprüft).
  Client-seitiges `usePresence.refresh()` bleibt bei limit 200 (jedes Event
  triggert ein list(); Pagination dort würde Requests vervielfachen — der
  SERVER paginiert seit 2026-07-02 bis 1000).

### 💡 Ideen fürs nächste Level — alle umgesetzt

1. ✅ **E-Mail-Notifications + Digest** (2026-07-10) — Opt-in-Mails (instant/
   digest) über den Core-SMTP-Mailer (nodemailer statt Appwrite Messaging —
   kein Console-Setup/Key-Scope nötig); Details README-Status 63.
2. ✅ **Admin-Bulk-Aktionen + CSV-Export** (2026-07-10) — Multi-Select in
   Queue + User-Liste, Bulk-Routen mit Einzel-Flow-Guards, CSV-Export;
   Details README-Status 64.
3. ✅ **Caching/Microcache** (2026-07-10) — core createMicrocache für
   Gast-Kommentare Seite 1, Changelog-Liste (Write-Invalidierung) und
   /api/stats (L11). SSR-Seiten-SWR bewusst NICHT (Session-State im HTML);
   Details README-Status 64.
4. ✅ **CI mit echter Appwrite-Instanz** (2026-07-10) — e2e.yml startet den
   1.9.5-Stack im Runner, Console-Setup per Script, bootstrap+seed, volle
   Playwright-Suite inkl. Realtime — grün; Details README-Status 64.
5. ✅ **Auto-Hide-Threshold** (2026-07-09) — Eskalations-Vertrag
   `registerReportEscalationHandler` (moderation) + Auto-Hide in comments
   (`pukalani.comments.autoHideReports`, zweiphasig + Cascade, Meldungen bleiben
   offen); Report-„Kategorien" existierten bereits als offener reason-Katalog.

### 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🔧 Cleanup / Improvements / NITs

- ✅ **Status-Codes** (2026-06-29): `status.patch`-`getRow` → 404 (statt 500) und `status.patch`-`updateRow` + `users/[id].delete`-`users.delete` via `toH3Error` gemappt. `comments/index.post` und `config.patch` waren bereits via `toH3Error` sauber, `users.get`/`appConfig` schon abgefangen.
- ✅ **i18n/A11y** (2026-06-29, bereits erledigt — Note war stale): Sidebar-Labels nutzen `t('dashboard.sidebar.*')` (Keys de+en vorhanden); [AnalyticsTrendChart.vue](../packages/admin/app/components/AnalyticsTrendChart.vue) hat `role="img"` + `aria-label` + per-Bar `<title>`; [OtpLoginForm.vue](../packages/core/app/components/auth/OtpLoginForm.vue)-`resend()` setzt `errorMessage = null` vor dem Request.
- ✅ **Dead Code** (2026-06-29): `useSeo.ts` entfernt (nur `useSeoMeta` wird genutzt). `useAnalytics.ts` und `RowList<T>` existierten schon nicht mehr.
- ✅ **Duplizierung** (2026-06-29, bereits konsolidiert — Note war stale): Avatar-Auflösung → `core/server/utils/avatars.ts` (`resolveAvatars`, von comments/presence/audit genutzt); GDPR-Export-Mapper → `core/server/utils/dataExport.ts` (`mapExport*`, beide Export-Endpoints); Changelog-Row→DTO → `admin/shared/changelog.ts` (`rowToChangelogEntry`, public + admin).
- ✅ **Coverage-Lücke** (2026-06-29, geprüft — keine echte Lücke): Der App-`nuxi typecheck` (comments extends ALLE Layer) prüft transitiv auch deren Server-Code — per absichtlichem Typfehler in `moderation/.../reportQueries.ts` verifiziert (wird gefangen). Kein `test`-Script-Gap: themes/moderation/system haben 0 Tests, comments/admin/core haben Tests + Script. Standalone-Typecheck pro Layer bräuchte je ein `.playground` (wie core) — bewusst nicht.
- ✅ **NITs** (2026-06-29, geprüft): `stats.get.ts` nutzt schon die moderne `users.list({ queries })`-Form; `.env.example` enthält `NUXT_PUBLIC_APPWRITE_PROJECT_NAME` nicht (mehr) und nirgends Code-Nutzung — beide stale. Bewusst akzeptiert: `isOutdated`-Prerelease-Ordering (installed/latest kommen aus stable-only package.json/Registry → Pfad triggert real nie, ein Fix wäre toter Code) und CI-`@vN`-Tags (Dependabot-managed, first-party/reputable Actions).
- ✅ **Hydration-Mismatch (relative Zeit)** (2026-07-01): „vor X Sekunden" renderte server/client mit unterschiedlichem `now` → ~16 Mismatches + Vue-Warnungen pro Load. Fix: `now`-Basis in [useFormatRelativeTime](../packages/core/app/composables/useFormatRelativeTime.ts) via `useState` (SSR→Client identisch), Update erst nach Mount + 30s-Ticker. Verifiziert: 0 Mismatches/0 Warnungen.
- ✅ **Destruktive Migration `comments-002`** (2026-07-01): Migration ist jetzt idempotent — sind beide Tables schon am Zielschema (Pflichtspalten `targetId`/`content` bzw. `commentId`/`userId`/`value` vorhanden), wird der DROP übersprungen (kein Datenverlust bei Re-Run). `createTable`/Spalten/Indizes sind ohnehin 409-idempotent; der Erst-Umbau (altes `postId`-Schema → Ziel) droppt weiterhin wie vorgesehen.
- ✅ **Zwei Presence-Systeme vereinheitlicht** (2026-07-01): Globale Online-, Thread- und Moderations-Presence teilen sich jetzt **eine** Presence pro User (`presenceId=userId`, metadata trägt `scope`/`action`/`typing`) über die Presences-API. `usePresenceState()` ist die einzige Upsert-Autorität, `usePresence(predicate)` liest gefiltert. Entfernt: `presence`-Table, `presenceRowId` (der `presence/leave`-Endpoint EXISTIERT weiterhin — er löscht die Presences-API-Presence per sendBeacon beim Verlassen). `admin/users`-Routen lesen `listOnlinePresences()`; „online jetzt" via `updatedAt`-Recency (60s). Neue Use-Cases: Moderations-Claim-Lock (`useModerationPresence`), Edit-Awareness auf Config/Changelog (`useEditAwareness`), Live-Online im Dashboard + Users-Liste. **Nachtrag (verifiziert per Playwright + Live-Appwrite):** In der SSR-Cookie-Architektur kann der Browser seine Presence nicht selbst schreiben (Web-SDK-Client ohne Session → `realtime.upsertPresence()` als Guest-WS verworfen, `PUT /presences` → 401). Der WRITE läuft daher server-seitig über `POST /api/presence/heartbeat` (Admin-Client, `read("users")`, `expiresAt` 90s); `usePresenceState` ruft die Route (Heartbeat 20s + `visibilitychange`/`focus`). Der Reader liest weiter direkt über die Presences-API (Cookie-GET). Ohne diesen Fix fielen eingeloggte User nach 60s auf „offline".
- ✅ **Echtes Realtime-Presence** (2026-07-01, ~280ms verifiziert, in production): (1) WS-Upsert (`realtime.upsertPresence`, JWT-Client, Owner-Rechte) — nur der WS-Weg löst das Event aus, der HTTP-Upsert nicht; (2) JWT-authentifizierter Reader-WS (empfängt `read("users")`-Events); (3) **gesunder realtime-Worker** — der laufende war durch einen Swoole-Crash degradiert und lieferte nichts, `docker compose up -d --no-deps appwrite-realtime` hat es gefixt. Poll (20s) ist jetzt nur noch Backstop. Betriebs-Hinweis: bei degradiertem Worker Container neu erstellen (der User hatte mit „muss neugestartet werden?" recht).
- ✅ **Presence-Use-Cases erweitert** (2026-07-01, verifiziert per Playwright): neue metadata-Felder `page`/`replyingTo`/`near` (je eigener Zweck). (a) **Betrachtungs-Presence** (`useViewingPresence` + `DashboardViewers`): „N andere sehen diese Seite" global im Dashboard → deckt „anderer Admin schaut denselben User/dieses Dashboard an" + Live-Betrachterzahl pro Seite ab. (b) **Antwort-Presence**: offenes Antwort-Formular meldet `replyingTo` → Kommentar zeigt „X antwortet gerade …". (c) **Lese-Präsenz**: IntersectionObserver meldet den sichtbarsten Kommentar als `near` → „N lesen hier" je Kommentar. (d) **`PresenceAvatar`** (core): Icon-Badge in der Ecke (Stift = tippt, Pfeil = antwortet) statt Farbpunkt. Damit sind alle vorgeschlagenen Presence-Beispiele umgesetzt.

### ⏸️ Ehemals „Zurückgestellt — brauchen Design"

- ✅ **Cross-Layer-Write (Notifications)** (2026-06-29): Core stellt jetzt `notify(event, {...})` ([core/server/utils/notify.ts](../packages/core/server/utils/notify.ts)) als Vertrag bereit (best-effort, Row-Security); comments ruft ihn statt direktem `tableId: 'notifications'`-Zugriff. Kein String-Coupling mehr (CONCEPT A14). Der `/`-Link-Teil war schon gelöst (`targetUrl` + Open-Redirect-Guard).
- ✅ **`total`-Semantik / Hide-Orphaning** (2026-06-30, gelöst): **Client** — Hide entfernt jetzt den ganzen Subtree (`removeWithDescendants` + reine, getestete `descendantIds`), keine verwaisten Replies, `rows`/`total` konsistent. **Server (Cascade-Hide, gewählt)** — `status.patch` blendet beim Ausblenden den Subtree mit aus (Thread per rootId laden → BFS → nur aktive Nachfahren), so zählt der globale `total` keine unerreichbaren non-hidden-Antworten mehr. Wiederherstellen kaskadiert bewusst nicht (nur der Parent; Antworten ggf. einzeln). Per-Nachfahre-Realtime-Events sind im Client reihenfolge-unabhängige No-ops.
- ✅ **Pro-Melder-Report-Modell** (2026-06-30, bereits gebaut als generischer `moderation`-Layer — Note war stale): `reports`-Tabelle mit `reporterId` + Unique-Index `reporter_target` (eine Meldung pro User/Target), eigener Rückzug (`index.delete` nach `reporterId` gefiltert), Status-Lifecycle, und Admin-Melder-Anzahl (`openReportsByTarget.counts` → `reportCount` in der Moderations-Queue). Das alte `'reported'`-Status-Flag am Kommentar ist entfernt (`status` = nur noch active/hidden/deleted). Übertrifft die ursprüngliche Spec (generisch statt comment-spezifisch). Einziger Rest: das akzeptierte LOW-`targetType`-Residual (s. Security-Review).
- ✅ **„Bearbeitet"-Indikator** (2026-06-29, bereits umgesetzt — Note war stale): `editedAt`-Spalte (Migration 005) wird beim Edit gesetzt ([id].patch.ts) und in CommentItem angezeigt — unabhängig von `$updatedAt`.

### 🗺️ Roadmap — bewusst ausgeklammert

- ✅ **Phase 17 – Production Deployment** (KOMPLETT 2026-07-19,
  [Checkliste + Learnings](archiv/PHASE-17-PRODUCTION.md)):
  **comments.pukalani.app ist LIVE** — Appwrite 1.9.5 auf api.pukalani.app,
  ploi-Site mit pm2 + Auto-Deploy-Kette (Push→Test→Deploy→pm2-Restart, e2e
  bewiesen), Offsite-Backups (Storage Box), UptimeRobot, Watchdog, HSTS,
  Schema-Bootstrap (29 Tables) + voller Smoke-Test inkl. OTP-Mail (Resend)
  und Realtime-ohne-Reload. A.10-Follow-ups: changelog-draft-Function
  deployen, Zero-Downtime Stufe 2.
- ✅ **Phase 18 – Realtime/Presence auf SDK** (KOMPLETT erledigt 2026-07-01
  auf 1.9.5+MariaDB — GOALS-Header nachgezogen + Trigger-Task
  `appwrite-release-watch` gelöscht am 2026-07-09):
  - ✅ **P2 Presence** — **komplette** Presence (global + Thread + Moderation) auf die **Presences API** vereinheitlicht: eine Presence pro User (`presenceId=userId`, metadata `scope`/`action`/`typing`), `usePresenceState` als einzige Upsert-Autorität + `usePresence(predicate)` als Reader. Alt-System (Endpoints `presence/heartbeat|leave`, `presence`-Table system-007, `presenceRowId`) entfernt. Multi-User end-to-end verifiziert. Use-Cases live: Claim-Lock, Edit-Awareness, Live-Online (s. erledigtes Finding oben).
  - ✅ **P1 Rows-Rückbau** (2026-07-01) — `useRealtimeRows` läuft jetzt auf der **einen geteilten, JWT-authentifizierten SDK-Realtime** ([useRealtimeClient.ts](../packages/core/app/composables/useRealtimeClient.ts)): `realtime.subscribe(Channel.tablesdb().table().row())` mit optionalem server-seitigem `queries`-Passthrough; `where`-Filter bleibt als sicherer Default. Presence, Row-Streams und Config-Flags multiplexen über **denselben Socket** (vorher: ein nativer WS pro Aufruf). `useRealtimeAccount` bleibt bewusst cookie-nativ (Instant-Session-Revoke hängt am Cookie-Close-Signal). Tote `appwrite.client.ts` entfernt. Verifiziert per Playwright (Gast-Tab): Row-Create + -Delete live über den JWT-Socket, sauberer Reload ohne Console-Fehler.
  - ✅ **P3 Email-Policies** — Signup-UX für Wegwerf-/Free-Adressen (422→i18n); Console-Toggle ist der Betreiber-Schritt.
- **Backlog**: ✅ Themes-Vollausbau (26×11) FERTIG 2026-07-24 (s. Master #6); obsidian-community-concept
  (`packages/billing` ✅ 2026-07-08 als Phase 23).
  - ✅ **E2E-Tests (Playwright)** (2026-07-01): comments hat eine erste E2E-Ebene ([e2e/smoke.spec.ts](../apps/comments/e2e/smoke.spec.ts)) — auth-freie Smoke-Tests (Routing, SSR-Render, i18n, öffentliche Seiten, 404) gegen System-Chrome, `pnpm --filter comments e2e`. Eingeloggte/Realtime-Flows bleiben manuell verifiziert (passwortbasierter Login). Weitere Apps: sobald vorhanden.
- ✅ **Changelog Track 2B** (2026-07-01, deploy-bereit): Appwrite Function [functions/changelog-draft](../functions/changelog-draft) + [appwrite.json](../appwrite.config.json) — GitHub-Release-Webhook (HMAC) → Commits via Compare-API → Entwurf. Teilt die Parsing-Logik mit Track 2A (`src/parse.js`, unit-getestet). **Aktiv erst mit Prod + öffentlicher Domain** (GitHub muss den Webhook per HTTPS erreichen); bis dahin bleibt `pnpm changelog:draft` (2A) der Weg. **Aktiv seit 2026-07-19.**
- **Sonstiges**: ✅ öffentliche `/changelog`-Vollhistorie-Seite existiert bereits ([changelog.vue](../packages/admin/app/pages/changelog.vue), auth-frei, alle Einträge). Die 10 gesammelten SaaS-Feature-Ideen sind durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (Master #10).

---

## ✅ Bereits erledigt (Referenz, historisch)

- **Gesamtaudit + Abarbeitung (2026-07-05)** — Read-only-Audit über 9 Slices
  (Orchestrator + audit-scout/audit-worker je Slice) gegen alle dokumentierten
  Invarianten: **0 Critical, 0 High**, Ergebnis in [docs/archiv/audits/GESAMTAUDIT-2026-07-05.md](archiv/audits/GESAMTAUDIT-2026-07-05.md)
  (inkl. Requested-Changes-Reconciliation: kein einziges „Regressed").
  Abarbeitung in 4 Paketen:
  - **Garantie-Fixes**: GDPR-Recipient-Query strikt statt geschlucktem catch
    (M1, system-Contributor), Sperr-Schritt in `deleteUserCompletely` strikt
    (L1), Hide-Phase-2 mit Retry + lautem Log statt Schlucken (L2).
  - **CSS-Sink-Härtung** (L3): `customFontCss`/`customThemeCss` prüfen die
    admin-Zod-Allowlists gespiegelt am Render-Sink (fail closed), Pointer-
    Kommentare in beide Richtungen, 7 Injection-Tests.
  - **Kleinkram** (L4–L10, L12–L14): Storage-Orphan-Scan auf Cursor,
    unread-Count über Gesamtmenge, `REPORTS_WINDOW`-Konstante + Überlauf-Log,
    `commentsReported`-Stat zum Konsumenten (comments) verschoben,
    Function ohne statischen Key-Fallback, bootstrap app-agnostisch
    (+ Package- statt Verzeichnisname in pnpm-Filtern), Migration 006→010,
    statusText-Leak, Return-Typ.
  - **Doku**: CONCEPT.md D1–D4 nachgezogen (A4 → geteilte JWT-Realtime,
    A14-Matrix ohne presence + mit custom_themes/fonts, Package-/Stack-Tabelle
    aktuell), migrate.mjs-Kommentar. Offene Produktfragen s. 🟡.
- **Observability-Gate `pukalani.observability` (2026-07-02)**: strukturierte
  JSON-5xx-Logs am ZENTRALEN `core/server/error.ts` (4xx bleiben still, keine
  Bodies/Header — PII), Client-Error-Inbox (`observability-errors.client.ts`:
  vue:error + window.onerror + unhandledrejection, dedupliziert, max
  10/Session → `POST /api/telemetry/error`, Zod + Rate-Limit 30/min),
  Sentry-Andockpunkt dokumentiert in `logEvent.ts` (bewusst ohne SDK-Dep).
  Core-Default aus; comments aktiviert. Live verifiziert: 500 → JSON-
  Zeile mit Pfad/Stack, 4xx still, Browser-Fehler beide Pfade geloggt,
  Rate-Limit greift (429). Unit-Tests für shapeErrorLog/logEvent.

- **GDPR-Löschung/-Export komplett (2026-07-02)** — Umsetzung des Plans
  [plans/GDPR-DELETE-AND-EXPORT.md](archiv/GDPR-DELETE-AND-EXPORT.md) mit den
  Plan-Defaults (E1–E8; u. a. Tombstone mit geleertem Content, Snapshot auch
  bei Selbst-Löschung, 30-Tage-Lazy-Cleanup):
  - **UserDataContributor-Vertrag** (`core/server/utils/userData.ts`) +
    Contributors in comments/moderation/system (je `server/plugins/user-data.ts`)
    — die A14-Verletzung core→comments im Export ist WEG (`dataExport.ts`
    kennt kein Feature-Schema mehr); system hat damit erstmals Server-Code.
  - **`deleteUserCompletely`**: Snapshot → Sperren → Audit (ohne Klarname) →
    Contributors sequenziell/isoliert → Avatar+Presence → `users.delete` NUR
    bei Voll-Erfolg (Teilfehler = gesperrter User + Report, idempotenter Re-Run).
    Kommentare → Tombstone in der ROW (Roh-REST ohne PII), Votes/Reports/
    Notifications (Empfänger + Verursacher via neuem `senderId`) hart gelöscht,
    Audit-Logs pseudonymisiert (actorName/ip/metadata.name/targetName leer).
  - **Exports vollständig**: `exportUserCompletely` (Self + Admin, Cursor-
    Pagination via `listAllRows`, alle Datenarten inkl. Votes/Reports).
  - **Snapshots**: Bucket `gdpr-exports` (bootstrap, encryption, keine
    Bucket-Permissions), Admin-Routen List/Download/Delete + Audit, UI-Tab
    unter /dashboard/admin, Lazy-Cleanup > 30 Tage.
  - **Migrationen**: comments-009 (votes-userId-Index), system-008
    (notifications.senderId + Index, audit_logs-target-Index) — auf Dev
    ausgeführt. `notify()` trägt jetzt `senderId` (Reply + Mention).
  - **Verifiziert**: 41/41 Live-E2E-Checks (Self-Delete-Vollprüfung mit allen
    PII-Arten, fremde Antwort überlebt, Roh-REST-Check, Admin-Delete +
    Download, RBAC least-privileged 403, Bucket-Allowlist), Unit-Tests
    (Registry, listAllRows), 12/12 Playwright, typecheck/lint grün.
    Akzeptiert: E8-Lücke (Alt-Notifications ohne senderId).

- **Gesamtcheck-Abarbeitung (2026-07-02)** — alle offenen 🟠/🟡-Findings + Ideen 1–3 in 10 Batches:
  - **admin ohne comments**: `stats.get` degradiert mit catch + 0-Fallback (search/analytics waren schon sauber).
  - **toH3Error-Serie**: changelog patch/delete, users status.patch/sessions.delete, admin-storage delete, core-storage get/delete, otp.post — 4xx statt unmaskiertem 500.
  - **Effizienz**: `assertNotLastAdmin` via `Query.contains('labels','admin')`+limit 2 (live auf 1.9.5/MariaDB verifiziert); `reports/resolve` parallel in 10er-Chunks; `presences.list total:false`.
  - **Vote-Privacy**: `comment_votes` Table-`read(users)` entfernt (Migration 007, auf Dev ausgeführt); 002 legt frisch ohne Table-Read an.
  - **Migrations entkoppelt + apps/_template**: zentraler Runner `scripts/migrate.mjs` (`pnpm migrate --app <app>`, Auto-Detect nur bei genau einer App, `--env-file` für CI/Prod); Layer-Scripts rufen den Runner; bootstrap.ts app-agnostisch; MDC/ProseMirror-Config in den admin-Layer gezogen; Template-App (Port 3002) mit README läuft in lint/typecheck der CI mit.
  - **i18n**: core `ui.cancel` (statt 7× Cross-Layer-Key), tote admin-Keys entfernt (gegen dynamische Kompositionen geprüft), `admin.users.notFound` statt hartkodiertem „— 404".
  - **9 Client-Bugs**: useLogout() mit Presence-Beacon + try/catch (3 Stellen dedupliziert); Dashboard-Suche Stale-Guard; Vote-In-Flight-Serialisierung (Client) ; useRealtimeAccount Stabilitätsfenster-Backoff + nur für eingeloggte User; pending-Reply-Puffer; WhatsNew-Unread auf `$createdAt`; IntersectionObserver re-observed bei temp-ID-Tausch; `?status=`-Watch; s.o.
  - **Vote-Lost-Update (Server)**: `serializePerComment` — Recount+Write pro Kommentar serialisiert (Multi-Instanz-Grenze im Util dokumentiert → Appwrite-Transactions).
  - **Kanten**: Antworten-Subtrees + Cascade-Hide-Thread + Changelog + users-active-Sort + Analytics auf Cursor-Pagination (Notanker mit Log statt stillem Cap); listOnlinePresences bis 1000; Rate-Limit-Fallback auf Session-Identität statt `unknown`-Sammeltopf; Avatar-Upload mit Magic-Bytes-Check.
  - **hidden-REST-Leak GESCHLOSSEN**: Lese-Sichtbarkeit auf Row-Ebene (Migration 008 + Backfill, auf Dev ausgeführt); Hide = zweiphasig (Status-Event → Permission-Entzug), Restore in einem Write; live verifiziert (Gast-REST 404 auf hidden, Gast-WS bekommt weiterhin Events).
  - **UAuthForm**: Regel präzisiert — UAuthForm ist Vorlage, die optimierten UForm-Implementierungen bleiben; Abweichungen dokumentiert in [docs/referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md); CLAUDE.md/CONCEPT.md angepasst.
  - **@-Mentions**: `resolveMentions()` gegen Thread-Teilnehmer (kein globaler Namensraum, max 5), notify(type:'mention'), Bell-Text je Typ, Autocomplete im CommentForm; live verifiziert.
  - **Markdown-Kommentare**: eigener sicherer Subset-Parser (`shared/markdown.ts`, 20 Tests inkl. XSS) + vnode-Renderer `CommentMarkdown.vue` (kein v-html; MDC bewusst NICHT für Fremd-Content); SSR-verifiziert.
  - **6 Plan-Dokumente** unter docs/plans/ (GDPR, Phase 17, Changelog 2B, Themes, Billing, Embed).

- **Appwrite 1.9.5 + MariaDB-Umstieg + Phase-18-P2 + Tooling (2026-07-01)**:
  - **Server-Upgrade** Appwrite 1.9.0 → 1.9.5 (Backup, manueller Tag-Bump da
    Web-Installer interaktiv, `migrate`) — dann **DB-Adapter-Umstieg MongoDB →
    MariaDB** (frische Instanz, empfohlener Default). Stolpersteine gelöst:
    Traefik-Segfault (Neustart), SMTP → Mailpit, Console-Whitelist, fehlende
    1.9.5-Schema-Attribute (`migrate`), inkonsistente `main`-DB-Metadaten
    (neu angelegt), API-Key-Scopes.
  - **P2 Presence** auf die Presences-API (s. Phase 18).
  - **P3 Email-Policies**-UX (422 → freundliche i18n-Meldung im Signup).
  - **Bootstrap-Tooling**: `pnpm bootstrap` (DB + Bucket + Platform + alle
    Migrationen, Guard gegen destruktiven Re-Run) + `pnpm seed` (Demo-User mit
    Rollen + Kommentare). Beide reproduzierbar/idempotent.
  - **Security-Test**: XSS/HTML/JS/SQL-Payloads als Kommentar-Inhalt → alle
    escaped (Vue-Autoescaping, kein `v-html`), 0 injizierte Elemente, DB intakt.
  - **Hydration-Fix** (relative Zeit) + README-/Doku-Update.
- **Pre-Production Security Review (2026-06-29)** — Review über `d1a2e13..HEAD`
  (2 Review-Agents: Authz + Input/Leak/Redirect, plus eigener Pass):
  - **MEDIUM behoben — Stored Open-Redirect via `targetUrl`**: der alte Guard
    (`startsWith('/') && !startsWith('//')`) ließ protokoll-relative Bypässe
    durch (`/\evil` — Browser normalisiert `\`→`/` —, `/%2F%2Fevil`,
    Whitespace-Tricks `/ /evil`, `/\t//evil`). Diese flossen unverändert in den
    Reply-Notification-Link → Off-Site-Navigation (Phishing). Fix: strenge
    Regex `^\/(?![/\\%])[^\s\\]*$` im
    [comment-Schema](../packages/comments/schemas/comment.ts) **+**
    `safeLink()`-Render-Guard in
    [NotificationBell.vue](../packages/core/app/components/NotificationBell.global.vue)
    (defense-in-depth gegen alt gespeicherte Rows) **+** Regressionstest
    [schema.test.ts](../packages/comments/tests/schema.test.ts).
  - **LOW behoben — `reports/resolve`-Input-Hygiene**: lose `typeof`-Checks +
    unbegrenztes `resolution` → `resolveReportSchema` (Zod, längenbegrenzt).
  - **LOW behoben — Rate-Limiting auf Schreib-Endpoints**: `rate-limit`-Middleware
    deckt jetzt auch `POST /comments`, `PATCH /comments/[id]`, Vote und
    `POST /reports` ab (eigenes, weiteres Budget `WRITE_MAX=60/min`; Vote-Spam
    über viele IDs teilt EINEN Bucket). `reports/resolve` bewusst ausgenommen
    (Moderator-gated).
  - **Akzeptiertes Restrisiko (LOW) — `reports.targetType` ungeprüft**: ein
    eingeloggter User könnte Meldungen mit beliebigem `targetType`/nicht
    existierendem `targetId` absetzen. Entschärft: die Moderations-Queue filtert
    Junk bereits über Comment-Existenz; nur die „Gemeldet"-KPI ließe sich minimal
    aufblähen. Moderation bleibt bewusst domänen-generisch → kein Existenz-Check
    (würde den Layer an Comments koppeln). Sauberer Fix kommt mit dem
    zurückgestellten `comment_reports`-Modell.
  - **Sauber bestätigt (kein Defekt)**: Error-Envelope leakt keine Appwrite-/
    Zod-/Stack-Details; alle Authz-Guards (reports/comments/admin) korrekt,
    `reporterId` server-autoritativ; Moderations-Inputs parameterisiert (keine
    Injection, keine `Role`-Spoofing-Fläche).
- **3. Review-Pass (2026-06-24)** — neue Funde abgearbeitet:
  Storage-Orphan-Erkennung paginiert jetzt ALLE User+Files (vorher nur 100 →
  Falsch-Orphans, die der Bulk-Delete gelöscht hätte); Passwortänderung beendet
  Fremd-Sessions; Analytics-Chart-Buckets und KPI-Totals aus derselben
  In-Range-Menge (kein Balken-vs-Legende-Widerspruch mehr); Status-Guards auf
  Comment-PATCH + Vote (kein Editieren/Voten auf hidden/deleted per Direktrequest);
  Rate-Limit-Budget je Methode+Route (Reset-Confirm teilt nicht mehr das
  Mail-Budget); avatarUrl auf relative Storage-URL/https eingeschränkt;
  Notifications mit zusätzlichem recipientId-Filter; loadAll iteriert über
  Seitenzahl (controversial überspringt keine Zeilen); changelog-date als
  ISO-datetime validiert; OAuth-Redirects locale-aware; xForwardedFor-Trust
  dokumentiert; Dead-Migration 001 entfernt; README-Baum korrigiert.
  Bewusst NICHT angefasst: report-Toggle-TOCTOU (`active↔reported` ist bereits
  geguardet; sauberer Fix = das zurückgestellte `comment_reports`-Modell).
- **🟠+🟡-Batch (2026-06-24)** — alle 14 Punkte abgearbeitet:
  Layer-Scan TTL-Cache (~60 s); Realtime-WebSocket `new WebSocket()` in
  try/catch + Backoff (rows + account); kein Falsch-Logout mehr
  (`refresh()` nullt nur bei 401/403, `onClose` feuert nur nach erfolgreichem
  `open`); Dashboard-`today` client-only (kein Hydration-Mismatch);
  comments-`migrate`-Script repariert (002→004 idempotent + `--env-file`);
  vote-`myVote` autoritativ aus der DB nachgelesen; users-`total` echte
  Gesamtzahl bei „Jetzt aktiv"; analytics-KPIs per Count-Query statt Sample;
  changelog-Patch-Audit `row.title`; healthCheck-Default `unknown`;
  changelog-Löschdialog `localized()`; GDPR-Export `account.get()` abgefangen
  (Fallback Context-User); NotificationBell Re-Subscribe via `watch`;
  release-please `bootstrap-sha` entfernt.
- **Code-Review Batches A–G**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME; GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell `<i18n-t>`; Vote-Flicker behoben (Single-Write, autoritative Counts) inkl. Flip-Race/Score-Drift/409; Controversial-Sort über Fenster; Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren); `assertNotLastAdmin` paginiert; `config.patch` 404-only; `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-Sortierung; admin-Middleware `status/statusText`; CI `permissions`+`concurrency`; Dependabot; `@nuxtjs/i18n` als echte Dep; `changelog-draft` `execFileSync`.
- **Kommentar-UI (Reddit-Stil)**: borderless, kompakte Aktionszeile, Edit/Delete/Report hinter ⋯, Antworten ein-/ausklappen, „Alle {x} laden"-Button (löst die verborgenen Kommentare + verwaiste Replies), **unreport** (Melden ⇄ zurückziehen).
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei; keine Prod-Fehler-Leaks (Nitro maskiert ungefangene Fehler).

### C19 — /de-Endlosschleifen-Fix ✅ 2026-07-31

3xx-Antworten mit leerem Location-Header werden im Core auf die App-Wurzel
normalisiert (Commit 5528d01); mit dem Deploy von Build 49442b7 auf allen
Hosts live, Nachweis per Ancestor-Check des Live-Builds.
**Gelernt:** Ein „im Code behoben"-Punkt ist erst zu, wenn der Fix nachweislich
im LIVE-Build steckt — der Ancestor-Check (`git merge-base --is-ancestor
<fix> <live-build>`) ist dafür der billigste Beweis, kein erneutes Deployen.

### E8-3 — tenants→communities + 19 communityId-Spalten ✅ 2026-07-31

Komplett in einem Tag, in drei Phasen je Instanz (4 Prod + 4 lokal):
(1) control-029 kopierte `tenants`→`communities` und `tenant_plans`→
`community_plans` GENERISCH (Spalten+Indizes aus der Quelle gespiegelt,
Zeilen MIT Row-Id, upsert-fähig); (2) acht Layer-Migrationen legten
`communityId` neben `tenantId` in alle 19 Pool-Tabellen (Backfill +
Index-Zwillinge, Unique erst nach vollständiger Kopie), Code-Umschaltung am
Engpass (Datentür: Filter neu, Stempel doppelt); (3) Aufräumer mit finalem
Drift-Backfill + Gegenprobe VOR jedem Löschen, control-030 ließ die
Alt-Tabellen fallen. Beweise: comments 13/13 · presence 10/10 · posts 7/7 ·
events 14/14 · courses 28/28; alle Instanzen paginiert nachverifiziert.
**Gelernt:** `listColumns` paginiert bei 25 — die spaltenreiche
events-Tabelle wurde vom generischen Skip STILL übersprungen und flog erst
im Isolationsbeweis auf (Query.limit(200) gehört in JEDEN Spalten-Scan;
Beweise nach jedem Schritt sind der Grund, warum so ein Umbau verantwortbar
ist). **Gelernt:** Tabellen liegen auf MEHR Instanzen als die Manifeste
sagen (events-Altbestand auf comments, pages auf control, media auf photos)
— Schema-Verifikation immer über ALLE Instanzen, nie über die Layer-Liste.

### E8-4 — der EINE Wächter + Community-Vokabular ✅ 2026-07-31

requireTenantPermission war bereits toter Code (null Aufrufer — organisch
gestorben); requireSitePermission/resolveTenantRole heißen jetzt
requireCommunityPermission/resolveCommunityRole in EINER Datei. 908
Ersetzungen in 129 Dateien, 51 Umbenennungen; EINE CommunityRole-Definition
(die Zweitkopie mit „muss identisch bleiben"-Kommentar ist weg), Capability-
Keys community.*, Routen /api/community/**. Beweise: alle Tests, Typecheck,
comments 13/13 · presence 23/23 · site-authz 97/97. E8 ist damit KOMPLETT
(Plan → docs/archiv/UMBENENNUNG-AUF-COMMUNITY.md).
**Gelernt:** Nitro sortiert Middleware lexikografisch — ein RENAME kann die
Ausführungs-Reihenfolge verschieben (community-label wäre vor csrf/rate-limit
gerutscht). Reihenfolge gehört EXPLIZIT in Nummern-Präfixe, nie an den Zufall
eines Dateinamens. **Gelernt:** „muss identisch bleiben"-Kommentare markieren
eine Kopie, die man zusammenführen sollte, nicht pflegen.

### A6 — die Community ist das zahlende Objekt ✅ 2026-07-31

Alle Schritte: Beweis-Test → control-028 → Community-Fulfillment (Cross-Sub-
Guards) → Checkout/Portal über die Service-Naht (Stripe-Testmodus Ende-zu-
Ende bewiesen: cs_test-URL + Portal) → Abo-Seite im Community-Dashboard →
Workspace-Rückbau (69 Dateien, −2364 Zeilen; Lizenz-Mechanik geparkt in
entitlementGrants/entitlementPlan) → control-031 (Bremse: keine lebende
Subscription, sonst Abbruch). Schritt 4 war leer (Pool hat null Nutzer).
**Gelernt:** Instanz-weite Capabilities (billing.manage) nie an Site-Rollen
vergeben — der Rollen-Trennungs-Test hat genau das gefangen; Site-Belange
brauchen EIGENE community.*-Capabilities. **Gelernt:** GDPR-Contributor nur
dort, wo die userId-Verankerung wirklich liegt — ein Contributor, der
strukturell nichts findet, täuscht Vollständigkeit vor.

### E9 — Menü-Umbau: eine Navigation, drei Ebenen ✅ 2026-07-31

scope 'operator'|'community'|'account' als Pflichtfeld je Registry-Modul,
PURE Filter-Regel (dashboardNav.ts, 20 Tests): dreiwertiger Ort, getrennte
Rechte-Quellen, fail-closed ohne scope. Gruppen nach Davids Entwurf; keine
Menüpunkte ins Leere — die 14 fehlenden Seiten kommen einzeln (Plan bleibt in
docs/plans/DASHBOARD-IA.md). **Gelernt:** die Silo-Ausnahme muss an
tenancy.enabled hängen, nicht an isTenantHost — sonst erscheinen
Community-Einträge auf Kontroll-Hosts, wo ihre APIs 404en.

### E10 — Customer Feedback zentral ✅ 2026-07-31

Nach Davids acht Vorab-Entscheidungen: feedback+tickets zogen von comments
nach control (Silo-Bestand vorher gesichert: 10 lokal/1 Prod), vier neue
Control-Tabellen (control-032, lokal+Prod gefahren), Feedback-Widget auf
jeder Community-Seite, /dashboard/feedback (Trending/Top/New) +
/dashboard/roadmap (vier Spalten), Naht „jedes Dashboard fragt seinen
eigenen Server" (controlService in core, in-process auf control,
fail-soft), origin nur für den Betreiber, eine Stimme pro Person,
Rate-Limits, GDPR-Contributor. Roadmap = Sicht auf Feedback, NICHT das
Ticket-Board (bleibt Betreiber-intern). Bewusst offen im Plan: Auto-
Changelog bei Complete, Owner-Sicht, Verfasser-Benachrichtigung (D5-Wand).
**Gelernt:** Wenn zwei Layer denselben Naht-Transport brauchen, gehört er
in core hochgezogen — nicht kopiert (controlService, Config-Schlüssel
unverändert, onboarding delegiert nur noch).

### C18 — Sichtbarkeit pro Community ✅ 2026-07-31

Wählbar unter Settings→Community (team.manage), neue Communities entstehen
öffentlich (dokumentierte Kehrtwende zu G0-7). Permissions-Flip in beide
Richtungen über pure Regel repermissionRow() (liest „veröffentlicht" am
BESTEHENDEN Array ab — öffnet nie, was zu war) + Registry/Cursor/Zeitbudget;
SEO zieht mit (noindex, robots, sitemap-404 VOR dem Datenlesen, og zu);
pages ohne Row-Permissions bekam die eigene Wache. Beweise:
verify-audience-flip 19/19, pool-isolation 13/13 unverändert; Demo nach dem
Deploy explizit public gestempelt (Status quo). **Gelernt:** Ein Feld, das
bisher nichts steuerte, macht beim Scharfschalten den BESTAND fail-closed
„halb zu" — der Betriebsschritt (Stempel-Einzelvorgang) gehört in denselben
Plan wie der Code. **Gelernt:** Mandantenübergreifende Schreiber (GDPR-
Tombstone) dürfen nie hart read(any) stempeln — sie öffnen sonst Inhalte
geschlossener Communities.

### C12 — Dashboard-Kleinteile ✅ 2026-07-31

Audit-Liste komplett (96 Dateien): Kunden-Labels statt interner IDs
(gebündelte Namens-Auflösung statt 50 Einzelabrufen), Jargon übersetzt,
Nuxt-UI statt Handbau, aria-Labels, Toasts 15→190 mit Beschreibung über
fünf parallele Gruppen — jede Beschreibung gegen den Code verifiziert.
**Gelernt:** error.statusMessage als Toast-Text ist unter HTTP/2 IMMER leer
(Reason-Phrase entfällt) — Beschreibungen brauchen übersetzte Fallbacks
(Rest als F1). **Gelernt:** Audit-Zeilennummern altern — Stellen per Inhalt
suchen, Erledigtes ausweisen statt doppelt bauen. **Gelernt:** Eine gute
Fehler-Beschreibung sagt, was NICHT passiert ist („dein Text steht noch im
Formular") — und muss gegen den Code geprüft sein, sonst ist sie gelogen.

**Rest: der UTable-Rollout (B6) ✅ 2026-07-31.** Die Audit-Zahl „18 handgebaute
Listen" stammt vom 2026-07-28 und war beim Nachmessen längst abgetragen: die
B6-Welle (Merge `d1692c49` plus `a2be6cae`, `7dcf4515`, `173c2bad` …) hat sie
umgebaut — heute halten **26 Dashboard-Seiten** plus die geteilte
`SessionsTable` eine `UTable`. Neu gemessen
wurde über alle `app/pages/dashboard/**` und `app/components/**` der Layer;
übrig blieben zwei echte Datenlisten, beide umgebaut: die **letzten Kommentare**
auf der Nutzer-Detailseite (`admin/users/[id].vue` — dieselbe Karten-Reihe, in
der Sitzungen und Protokoll schon Tabellen waren; Spaltenköpfe aus
`admin.moderation.col.*`, damit dieselben Felder nicht zweimal übersetzt
werden) und die **Abhängigkeiten** auf `dashboard/system.vue` (eine Tabelle JE
KATEGORIE, damit die Gruppierung bleibt; Inhalt 1:1, inkl. Dev-Update-Knopf).
Alles andere ist **bewusst keine Tabelle** und trägt den Grund jetzt AN DER
STELLE als Kommentar (B6 verlangt genau das): Vorschau-Kacheln der Übersicht
(`admin/dashboard/index.vue`, fünf Zeilen + „Alle ansehen") · Benachrichtigungs-
Kanäle in der schmalen Steuerspalte (`users/[id].vue`) · Schalter-mit-Erklärtext
statt Datensatz (`admin/products.vue`, `admin/config.vue`) · der Aktivitäts-Feed
(`activity.vue` — dieselbe Komponente wie öffentlich, Bündelung + Endlos-
Nachladen) · die Roadmap und das Ticket-Brett (der Status IST dort die Spalte;
die tabellarische Sicht auf dieselben Daten steht unter `/dashboard/feedback`) ·
die Beobachtet-Schublade (`tickets.vue`) · Preiskarten
(`settings/subscription.vue`) · der Quota-Katalog in `control/tenants.vue`
(Formular mit Eingabefeldern). **Gelernt:** Eine Audit-ZAHL altert wie eine
Zeilennummer — vor dem Ausrollen neu messen, sonst baut man an bereits
umgebauten Stellen. Und: „handgebaut" ist kein Befund, solange der Grund
danebensteht — die Arbeit an solchen Stellen ist, den Grund zu schreiben, nicht
die Bauweise zu wechseln.

### C16 — die drei toten Berechtigungen haben ein Ziel ✅ 2026-07-31

`branding.manage`, `posts.write` und `community.delete` standen in der
Rollen-Matrix und steuerten nichts. Jede hat jetzt eine Fläche — zwei davon
anders, als die Notiz es vorgezeichnet hatte:

**`branding.manage` (= F5).** Nicht „die Themes-Seiten auf branding.manage
ziehen": `custom_themes`, `custom_fonts` und `app_config.themeSettings` gehören
dem Appwrite-PROJEKT (read(any), Live-Propagation an ALLE Communities des
Pools) — ein Community-Admin hätte damit fremde Communities umgefärbt. Der
Schnitt heißt **Wahl ≠ Katalog**: die Wahl (`communities.theme/variant/neutral`)
zog aus der Settings-Karte auf eine eigene Seite `/dashboard/branding` im
**onboarding**-Layer (dort, wo ihre Route lebt — dieselbe Regel wie bei den
Mitgliedern), der Katalog bleibt `system.manage`, und das Theme-Studio ist
jetzt `scope: 'operator'`. Umgezogen, nicht kopiert.

**`posts.write`.** Der gemeldete Befund war schon halb erledigt: die Routen
prüften die Autorschaft längst (`row.authorId !== user.$id` ⇒ 403), das
Karten-Menü bot Bearbeiten/Löschen an. Die echte Lücke war das DASHBOARD — die
posts-Sektion verlangt `posts.moderate`, und Editor und Moderator sind in der
Matrix **Geschwister**, keine Kette. Also: die dreifach ausgeschriebene
Autoren-Regel zu einer puren Funktion zusammengezogen
(`postAuthorPolicy.ts`, 15 Tests) und eine zweite Nav-Registrierung +
`/dashboard/my-posts` (`GET /api/posts/mine`) für `posts.write` gebaut.

**`community.delete`.** Kehrtwende zur Entscheidung 3 vom 2026-07-29, mit einem
Schnitt, der deren Einwand auflöst: **stilllegen statt vernichten**
(`communities.status='disabled'` ⇒ Host 404 in ≤30 s, alle Mitgliedschaften
'removed', Labels eingezogen — INHALTE BLEIBEN). Gesperrt bei laufendem Abo
(409 `subscription_active`) und bei bereits stillgelegter Community. Volle
Begründung im [DECISION-LOG](DECISION-LOG.md#2026-07-31).

**Gelernt:** Eine tote Capability sagt nicht, WO ihre Fläche hingehört. Bei
zweien lag die Antwort im Datenmodell, nicht in der Nav — `branding.manage` an
die Themes-Seiten zu hängen hätte eine Mandanten-Grenze geöffnet, weil die
dortigen Tabellen dem Projekt gehören und nicht der Community. Erst die Frage
„wem gehören die Zeilen, die diese Seite schreibt?" ergab den Schnitt.
**Gelernt:** Ein Modul der Nav-Registry trägt genau EINE `requiredCapability` —
bei Geschwister-Rollen (Editor ⊥ Moderator) braucht deshalb jede Zielgruppe
ihren eigenen Eintrag; ein gemeinsamer stellte eine der beiden vor eine Wand.

### F2 — doppelter i18n-Schlüssel in der Mitgliederliste ✅ 2026-07-31

`members.role` war in de+en ZWEIMAL definiert (String-Spaltenkopf und Objekt
`role.done`). `JSON.parse` behält still den letzten — der Spaltenkopf „Rolle"
rendert dadurch als roher Key-Pfad. Objekt in `members.roleChange.*` umbenannt,
Nutzung nachgezogen. **Gelernt:** Weder `JSON.parse` noch `jq --stream` noch
ein Blatt-Pfad-Diff finden das, denn die Blätter heißen verschieden
(`members.role` vs. `members.role.done`) — es braucht einen Scanner über den
ROHTEXT, der Schlüssel pro Objekt zählt. Gegenprobe über alle 48 Locale-Dateien
des Repos: sonst keine Dubletten.

### C14 — Bild-Naht Schritt 2: `@nuxt/image` mit Appwrite-Anbieter ✅ 2026-07-31

**Zuerst gemessen, dann entschieden — die Messung hat den Default gedreht.**
Zwei Läufe: (a) sharp/libvips, also das, was `ipx` unter @nuxt/image auf dem
APP-Server täte, (b) Appwrite 1.9.6 selbst. sharp auf einem M1 Max: AVIF kostet
das **3- bis 24-Fache** an CPU (0,5 MP → 1280 px: 1348 ms CPU gegen 56 ms für
WebP; 2 MP: 2280 ms gegen 136 ms). Auf dem geteilten CX23/CX33 neben sieben
Apps ist das nicht vertretbar. Appwrite ist milder (1,0–3,0× Wanduhr, zweiter
Abruf ~5 ms aus dem Cache), aber der **Byte-Gewinn trägt den Aufpreis nicht**:
bei gleicher `quality` war AVIF nur unter ~q60 kleiner (10–40 %) und ab q78
sogar GRÖSSER als WebP. **Entscheidung: Default WebP, AVIF nur ausdrücklich je
Bild** (`format="avif"`), und `image.format: ['webp']` im Core-Layer, damit auch
`<NuxtPicture>` niemanden unbemerkt AVIF bezahlen lässt.

**Der Anbieter rechnet nichts.** Appwrite kann `/preview` mit
width/height/quality/output und cacht das Ergebnis — gegen die lokale Instanz
nachgemessen: `output` akzeptiert **jpg, jpeg, png, webp, heic, avif, gif**
(ein unbekannter Wert antwortet 400 und nennt genau diese Liste), Kante hart bei
4000 px. Der Anbieter ist deshalb ein reiner URL-Bauer; `ipx` (und damit `sharp`
samt der 26-teiligen `@img/sharp-*`-Plattform-Matrix) steht als
`ignoredOptionalDependencies` in `pnpm-workspace.yaml`. Netto neu im Lockfile:
**zwei** Pakete. Beide Prod-Builds (photos, comments) enthalten weder einen
`/_ipx`-Handler noch sharp.

**Gelernt (teuer, 188 Typfehler):** @nuxt/image referenziert die Typ-Vorlage
jedes EIGENEN Anbieters mit `{ nitro, nuxt, node, shared }` — die Anbieter-Datei
landet also in ALLEN VIER generierten tsconfigs, und in zweien davon gibt es
weder `#imports` noch die App-Auto-Imports. Ein `useRuntimeConfig` aus
`#imports` im Anbieter kostete 188 Fehler quer durch alle Layer, von denen nur
EINER auf die Anbieter-Datei zeigte; die anderen 187 sahen aus, als hätten die
Auto-Imports aufgehört zu funktionieren. Der Ausweg war zugleich die einfachere
Bauart: die URL, die `<NuxtImg>` bekommt, ENTHÄLT Endpoint und Projekt schon —
der Anbieter braucht überhaupt keine Konfiguration. **Ein Anbieter darf nur
importieren, was in jedem der vier Projekte existiert.**

**Gelernt (still und gefährlich):** `sizes="100vw"` OHNE Stufen-Präfix liest
@nuxt/image als Schlüssel `1px`, macht daraus eine Bildschirmbreite von 1 und
liefert ein srcset `1w, 2w` — ein 1-Pixel-Bild, ohne Fehlermeldung. Jede
Aufrufstelle schreibt deshalb `xs:100vw`; festgehalten in
`packages/core/tests/nuxtImageProvider.test.ts`.

**Umgestellt:** EventCard, EventDetail, Event-Formular (events), Medien-Tabelle
(media), Galerie-Raster und Hero (photos). Kein Layout verändert — nur `<img>`
zu `<NuxtImg>` plus `sizes`/`placeholder`. Statische Bilder (`about.vue`) und der
Core-Proxy `/api/storage/*` (admin) bleiben unangetastet: der Anbieter reicht
alles durch, was keine Appwrite-Storage-URL ist, und darf deshalb global der
Default sein. **Beweise:** 40 Unit-Tests, `pnpm -r test/typecheck/lint` und
`check:manifests`/`check:single-copy` grün, zwei Prod-Builds, und ein Lauf gegen
die lokale Appwrite, der die vom Anbieter gebauten URLs wirklich abruft (alle
Varianten 200, Content-Type und Maße geprüft, Testbild wieder gelöscht).
**Rest:** `srcset` in der Antwort von `/api/media` hat seither keinen Leser mehr.

### F3 — Kontolöschung räumt jetzt auch das Control Plane ✅ 2026-07-31

**Der Befund:** `deleteUserCompletely` räumt das Appwrite-Projekt der RUNTIME
ab. `community_members` und `community_invites` liegen aber im Control Plane —
einem anderen Projekt, auf das die Runtime nur einen read-only-Key hat. Nach
der Löschung eines Pool-Kontos blieb die Mitgliedschaft mit toter
`runtimeUserId` stehen, und — der eigentliche Punkt — die E-Mail-Adresse der
Person unbefristet in jeder Einladung an sie. Eine userId ohne Konto ist ein
Pseudonym ohne Auflösung; eine E-Mail ist ein Personenbezug.

**Gelöst über die BESTEHENDE Service-Naht**, keine neue Vertrauensfläche: zwei
Routen im Control Plane (`/api/control/community/members/user-data` und
`…/user-erase`, Gate = Service-Secret) plus ein GDPR-Contributor `onboarding`
in dem Layer, dem die Naht gehört (A14 — dieselbe Stelle wie der
Beitritts-Handler). Silo-Apps ohne onboarding bekommen keinen Contributor, und
das ist richtig: dort gibt es keine Mitgliedschaften.

**KEIN JWT, anders als bei allen anderen community-Routen.** Das ist die
einzige Möglichkeit, nicht eine Aufweichung: beim Aufruf ist das Konto gerade
gesperrt und verschwindet gleich — bei einem Betreiber-Auftrag oder einem
Re-Run nach Teilfehler existiert es womöglich gar nicht mehr. Ein JWT zu
verlangen hieße, die Löschung genau dann zu verweigern, wenn sie am nötigsten
ist (derselbe Schnitt wie bei `feedback/user-erase`). Identität ist das Paar
(runtimeProjectId, runtimeUserId), und alles wird hart darauf gescopt —
dieselbe userId in zwei Projekten sind zwei Menschen.

**Die Letzter-Owner-Regel** (pure, `decideMembershipErasure`, 7 Tests): der
Regelfall ist LÖSCHEN — an einer Mitgliedschaft hängt kein fremder Kontext.
Die einzige Ausnahme ist der letzte Owner einer AKTIVEN Community; dort bleibt
die Zeile als Struktur stehen, aber ohne Personenbezug (E-Mail geleert), und
jeder solche Fall reist im KLARTEXT (Community-Name + Rolle) in die Antwort
und ins Log — der Betreiber muss wissen, welche Community einen verwaisten
Owner-Platz hat. Verweigern wäre falsch (das Löschrecht hängt nicht daran, ob
jemand erbt), einfach löschen auch (dann hätte die Kontolöschung von hinten
aufgehoben, was „Zugang entziehen" von vorn verbietet). Ein Test nagelt beide
Wege aneinander: was `decideRemoval` als `last_owner` sperrt, bleibt hier
stehen.

Einladungen werden HART gelöscht (der Personenbezug einer Einladung IST die
Adresse — ohne Empfänger ist der Token-Hash wertlos) und über die Community
auf das rufende Projekt eingegrenzt, weil `community_invites` keine
`runtimeProjectId` trägt. Die Adresse geht nur mit, wenn sie BESTÄTIGT ist:
eine unbestätigte gehört nachweislich niemandem. Export degradiert bei
unerreichbarer Naht auf leer, Löschung NICHT — sie scheitert laut, damit das
Voll-Erfolgs-Gate von `deleteUserCompletely` greift.

**Gelernt:** Ein GDPR-Contributor gehört dorthin, wo die NAHT zu den Daten
liegt, nicht dorthin, wo die Tabelle steht — sonst müsste ein Fundament-Layer
ein Produkt kennen. **Gelernt:** Wenn eine Löschregel und eine Verwaltungsregel
dieselbe Sache schützen, müssen sie dieselbe pure Funktion benutzen oder
aneinander getestet sein; zwei Wege zu einer Community ohne Owner sind einer zu
viel.

### F4 — Gäste schreiben nur, wo Gäste lesen dürfen ✅ 2026-07-31

**Der Befund (C18-Kante):** eine Gast-Kommentar-Row bekommt beim Anlegen
`withPublishedRead()`, und in einer Community mit Publikum 'members' ist das
`read(label:<communityId>)`. Ein Gast trägt kein Label — er sah nach dem
nächsten Seitenaufbau weder seinen eigenen Beitrag noch irgendeinen anderen.

**Die POST-Response-Lösung trägt nur die halbe Strecke** und war schon da: der
Store hängt die Antwort des POST per `upsertRow` in den lokalen Zustand, der
Gast sieht seinen Kommentar also sofort. Das ist bei Gästen keine
Bequemlichkeit, sondern das Einzige, was funktioniert — ein Nachladen der Liste
brächte ihn nicht zurück. Es hilft aber nur bis zum Neuladen; danach schrieb
der Gast nachweislich in ein Loch.

**Die kleinste ehrliche Lösung ist deshalb, die Frage vorn zu stellen:** Gäste
schreiben genau dort, wo Gäste auch LESEN dürfen. Eine pure Regel
(`guestCommentsAllowed`, 5 Tests) mit zwei Konsumenten — die Route antwortet
404, die Ansicht zeigt den Composer nicht. Liefen sie auseinander, stünde ein
Formular da, dessen Absenden garantiert scheitert.

Verworfen: `read(any)` auf der Gast-Row (macht die geschlossene Community genau
dort auf, wo jeder Fremde schreiben darf) und ein kurzlebiges
Sichtbarkeitsfenster (eine Permission, die wieder verschwindet, ist eine zweite
Wahrheit über dieselbe Zeile).

**Gelernt:** Der alte Kommentar im Anlegepfad nannte den Widerspruch schon
richtig, verwies aber auf einen Schalter, der ihn nicht auflösen kann:
`pukalani.comments.embed.guests` gilt für die INSTANZ, `audience` je COMMUNITY
— im Pool hätte der Betreiber Gast-Kommentare nur für ALLE Communities
abschalten können. Ein Rat, der in der beschriebenen Situation nicht befolgbar
ist, ist keine Dokumentation eines bewussten Verhaltens, sondern ein offener
Befund.

### F6 — type-only-Imports in alten Migrationen ✅ 2026-07-31

Bereits behoben vorgefunden: alle Migrations-Ordner linten fehlerfrei (die
parallele Session hat die Imports mit ihrem Index-Race-Retry-Refactor
mitgezogen). **Gelernt:** Funde vor dem Fixen erst REPRODUZIEREN — in einem
Repo mit parallelen Sessions altern Befunde in Stunden.

### C5 + C2 — Seitentitel + Nav-Tarif-Gate ✅ 2026-07-31

C5: 26 titellose Dashboard-Seiten über 7 Layer (Audit sagte 17/3 — Zahlen
altern) + verify/join, exakt im Bestandsmuster (useHead/useBrandTitle), ein
einziger neuer i18n-Key. C2: planProduct-Feld in der Nav-Registry (Name aus
dem Chrome-Vertrag — kein zweites Wort für dieselbe Frage), Gate an der
EINEN Filterstelle, an planAllowsProduct genagelt (dieselbe pure Funktion
wie der Server); Nicht-Pool unverändert; +7 Tests. **Gelernt:** Undefined-
Behandlung gehört IN die pure Regel, nicht an jede Aufrufstelle — der
Testfall planOn=false hat den vergesslichen Aufrufer sofort reproduziert.

### C3 + C4 — Kompositionen und Nav-Einträge in ihre Layer ✅ 2026-07-31

Events-/Kurs-Kompositionen aus apps/comments in den blueprint-Layer (Pool
und Silo identisch — platform zeigt die Einträge jetzt ERSTMALS, obwohl es
die Layer längst zog: der C4-Gewinn); Nav-Einträge in ihre Produkt-Layer,
Dedup strukturell (Objekt-Map, Key = Id). **Gelernt:** Beim Umzug einer
Komposition reist jeder fest verdrahtete APP-Pfad mit und wird woanders zur
Lüge — der Ticket-Checkout-Pfad wurde ein expliziter Config-Vertrag
(pukalani.events.ticketCheckoutPath, leer = fail-closed „Bald verfügbar").


### F1 — leere Fehler-Beschreibungen (statusMessage) ✅ 2026-07-31

Bereits behoben vorgefunden: der C12-Commit (`7bf22c92`) hat die vier
gemeldeten Stellen mitgenommen — in `packages/{comments,pages,media,admin}`
steht heute NULL `statusMessage`. Nachgemessen repo-weit: die einzigen
verbliebenen Vorkommen sind die sieben Betreiber-Stellen in
`packages/control` (invites 2×, tenants, websites 3×, requests) und die
tragen alle schon den Fallback (`statusMessage || t('…Hint')`); `requests.vue`
lässt die Beschreibung bei 502 bewusst leer, weil der Titel dort die Ursache
nennt. Die Regel, die daraus überlebt: **Kunden-Dashboard = nur übersetzter
Text** (ein englischer Entwickler-Satz sagt dem Community-Betreiber nichts),
**Betreiber-Konsole = `statusMessage` vorn, übersetzter Fallback dahinter**.
Beides steht als Begründung IN den Dateien (embed.vue, media.vue, pages.vue,
system.vue, products.vue), nicht nur hier. **Beweise:** `pnpm -r test`
(51 Suiten), `check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die
6 bekannten Warnungen), plus eine statische i18n-Gegenprobe: 2877 Keys in de
und en, keiner nur auf einer Seite, jeder statisch auflösbare `t()`-Key der
fünf Pakete in beiden Sprachen vorhanden. **Gelernt:** Eine „Rest"-Zeile, die
MITTEN in der Ausführung des Elternpunkts geschrieben wird, ist am Ende oft
schon miterledigt — vor dem Fixen reproduzieren (dieselbe Lektion wie F6).

### C7 — App-Icon je Community ✅ 2026-07-31

`/icon/<key>.png` (512, `?size=180` für iOS' `apple-touch-icon`): randlose
Kachel in der Basisfarbe der Community + Initiale, gerastert ohne Renderer im
Betrieb aus demselben gebackenen Zeichensatz wie die Vorschau-Karte. Gate
`pukalani.seo.tenantAppIcon` (Core-Default AUS, platform AN), verdrahtet an
der EINEN Stelle, an der schon Favicon und og:image hängen
(themes/app/plugins/theme.ts). Die Karten-Zeichenwerkzeuge sind dafür nach
`shared/brandRaster.ts` gewandert — statt einer zweiten Kopie hat jetzt auch
das Icon dieselbe Fläche, Mischung und Glyphen-Skalierung. Neu darin ist das
VERGRÖSSERN (der Atlas ist bei 72 px gebacken, ein 512er-Icon will ~300 px):
bilinear plus Steilerstellen der Deckung um 0,5, gedeckelt auf Faktor 2.
Anders als das og:image bleibt das Icon auf „nur für Mitglieder"-Communities
ERREICHBAR — begründet in der Route: es entsteht nur, wenn ein Mitglied die
Seite selbst auf seinen Home-Bildschirm legt, liegt danach ausschließlich auf
dessen Gerät und trägt nichts nach außen (anders als eine Vorschau in fremden
Chats, C18). **Beweise:** 15 neue Tests (Maße + PNG-Magic-Bytes je Größe,
Größen-Allowlist, Schlüssel-Trennung zur Karte), `pnpm -r test`,
`check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die 6 bekannten
Warnungen), dazu drei gerenderte Muster angesehen. **Gelernt:** Zwei Dinge
kamen erst durchs Hinsehen. (1) Der Test „Icon-Schlüssel ≠ Karten-Schlüssel"
schlug fehl — beide Versionszahlen standen auf 1, der gemeinsame Hash lieferte
denselben Wert; ein Namensraum ('icon') macht die beiden Gestaltungs-Stände
wirklich unabhängig. (2) Die erste Kanten-Steilheit (Faktor 2,7) sah in der
gerenderten Datei am „C" wellig aus: Steilerstellen verstärkt nicht nur die
Kante, sondern auch die Ungenauigkeit der Vorlage. Ein PNG-Test prüft Maße und
Magic Bytes — wie es AUSSIEHT, sieht nur, wer es ansieht.

# Offene Punkte

Stand: **2026-07-28 (Master-To-do, gewichtet)**. Vollständige, eigenständige
Liste offener Themen (für eine frische Session als Startpunkt nutzbar).

> **⚠️ DIES IST DIE EINE LISTE.** Am 2026-07-28 stand kurzzeitig eine zweite
> (`docs/OFFENE-TASKS.md`) daneben — sie ist hier eingeflossen und wieder
> gelöscht. Neue offene Punkte kommen HIERHER: der gewichtete Master unten
> für Produkt-Brocken, die **Arbeitsliste** darunter für Feinkörniges.
> Plan-Dokumente in `docs/plans/` sind Beschreibung, nicht To-do — was aus
> ihnen offen bleibt, gehört in eine der beiden Listen hier.
> Wo welches Dokument liegt: [README.md](README.md) (Doku-Karte).

## 🔁 So arbeiten wir

Ein Durchgang, immer gleich — das ist die Arbeitsweise, die sich in den
Audit-Wochen bewährt hat:

1. **Griff wählen** — aus der Reihenfolge unten (Abschnitt „Reihenfolge"),
   nicht nach Lust. Ein Paket, nicht drei.
2. **Bauen** — bei mehreren unabhängigen Paketen je ein Agent in eigenem
   Worktree; sie committen dort, aber mergen NICHT.
3. **Prüfen, nicht glauben** — jeden Agenten-Befund am Code nachlesen, bevor
   er gemerged wird. Erfahrung: einzelne Meldungen halten der Prüfung nicht
   stand, und ein Agent hat schon Dinge „gefixt", die keine Fehler waren.
4. **Grün herstellen** — `pnpm lint`, `pnpm -r test`, `pnpm typecheck` der
   betroffenen Apps, `pnpm check:manifests`. **Und CI ansehen**
   (`gh run list --branch main --limit 8`), nicht nur die lokale Konsole: der
   E2E-Job war über einen Tag rot, ohne dass es jemand merkte (Arbeitsliste C9).
5. **Deployen + live nachmessen** — Build-SHA je Host, der konkrete Beweis für
   das Gefixte, `node scripts/ops/verify-tls.mjs`.
6. **Nachtragen** — Haken hier, Stand im Kopf, bei Architektur-Entscheidungen
   eine Zeile in [DECISION-LOG.md](DECISION-LOG.md) und ggf. CLAUDE.md.
   Dann melden und auf David warten (paketweise, kein Dauerlauf).

**Reihenfolge, in der abgearbeitet wird:**
**A** (blockiert Umsatz) → ~~C0/C1b~~ (Sicherheit halbfertig — beide
erledigt 2026-07-28) → **B**
(Entscheidungen, sobald David antwortet) → **C** (Produkt-/UI-Lücken) →
**E** (Betrieb) → **F** (geparkt). **D** wird nicht abgearbeitet, sondern
bewusst offen gehalten — dort steht, warum.

> **LIVE (7 Hosts):** **pukalani.app** (Landing, seit 2026-07-27 — Apex
> proxied über Cloudflare, braucht am Ursprung KEIN Zertifikat mehr und kann
> das Kunden-Wildcard damit nicht mehr überschreiben; TLS-Wächter alle
> 30 min), **control** (Betreiber) + **my/start** (Kundenbereich + Wizard),
> comments + portfolio, **platform** (Multi-Tenant, `*.pukalani.app`-Wildcard
> — demo.pukalani.app als erster Pool-Tenant, neue Kundensite = ein Klick im
> Control, kein Build), **help.pukalani.app** (Hilfe-Site, seit 2026-07-27)
> und die interne Doku unter `control.pukalani.app/docs`. Auto-Deploy
> (6 Sites), Zero-Downtime Stufe 2, Changelog-2B, Alerting, GDPR, pages-Layer
> (/imprint,/terms,/privacy editierbar + Footer-Links). M1–M9 komplett,
> Self-Service-Onboarding komplett, **alle sechs Kundenprodukte durch die
> Datentür** (comments, posts, pages, moderation, events, courses).
> Release **v3.0.0** (2026-07-28).
> **Als Betriebssystem für eigene Sites: ~98 %. Als verkaufbares SaaS: ~85 %.**
> Beschluss-/Ideen-Protokoll: [DECISION-LOG.md](DECISION-LOG.md).

## 📌 Master-To-do (gewichtet, Summe = 100 %)

Legende Wer: **[David]** nur David · **[Claude]** autonom machbar ·
**[beide]** Claude baut, David entscheidet/gibt frei.
Legende Status: **✅ fertig** · **🔨 in Bearbeitung** (Teiletappen laufen) ·
**👉 als Nächstes** (der empfohlene nächste Griff) · **⭕ offen**
(inkl. „wartet auf Entscheidung/Input").

| # | Task | Wer | Schwere | % | Status |
|---|------|-----|---------|---|--------|
| 1 | **Rechtstexte** — Entwürfe LIVE (2026-07-23): vollständige, stack-spezifische Texte (Impressum § 5 DDG, DSGVO-Datenschutzerklärung mit Hetzner/Resend/Stripe/Cookies/Betroffenenrechten, AGB mit Plänen/Kündigung/UGC/Haftung) DE+EN auf studio /imprint,/terms,/privacy — jeweils mit sichtbarem „Entwurf"-Hinweis. Rest [David]: Adresse/USt-IdNr.-Platzhalter im Dashboard ausfüllen + Anwalt drüberschauen lassen (schaltet #2.4 frei). | David | leicht | 5 | 🔨 Entwürfe drin |
| 2 | **Stripe-Live scharfschalten** ([Runbook](runbooks/STRIPE-GO-LIVE-RUNBOOK.md)): 2.1 Bank-Aktivierung [David] · 2.2 Live-Webhook [David] · 2.3 Keys in Server-.env [David] · 2.4 Live-Portal konfigurieren (braucht #1) [Claude] · 2.5 Minimal-Verifikation [beide] | beide | mittel | 12 | ⭕ offen (wartet auf #1 + David) |
| 3 | **Money-Path-Rest** — #6b Cross-Sub via Stripe-Autorität + #7a Workspace-Customer/Owner-Portal. Deployt 2026-07-22, Details [DECISION-LOG](DECISION-LOG.md). | — | — | 8 | ✅ fertig |
| 4 | **Horizont 3 — Pool+Silo Multi-Tenancy** ([Blueprint](referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md)) — **Kern KOMPLETT (2026-07-23):** Spike ✅ · Schicht 1 ✅ · 4.1 Pool-Datenpfad ✅ · Naht 1/2 ✅ · tenants-Register + Resolver ✅ · Onboarding-UI ✅ · **Prod-Rollout ✅** (platform.pukalani.app als 4. ploi-Site, Wildcard-DNS + ploi-verwaltetes Wildcard-TLS, Pool-Projekt `pool` mit 9 Tabellen, demo.pukalani.app live: 200 + gescopte Liste, unbekannte Hosts 404; Deploy-Kette + Secret; Learnings: platform-Build braucht 3584 MB Heap, `/api/health` + `/_i18n/` sind host-freie Infra-Pfade) · **4.2 Wellen-Migrationen ✅** (tenants.wave internal→canary→stable, `pnpm migrate --wave` + Control-UI, fail-loud, control-012 auf Dev+Prod) · **4.3 Quota ✅ scharf** (assertPoolWriteQuota, comments 1000/Tag + 50k gesamt im Pool, 429 lokal bewiesen — **Zahlen abnicken, s. Kasten unten**) · Microcaches tenant-aware ✅ (tenantCacheScope: changelog, features). **Fläche 2 ✅** reports (moderation-002) gepoolt. **Quota pro Plan ✅ (2026-07-23):** tenants.plan (control-013, free/pro/business) staffelt die Limits (free 200/Tag+5k · pro 1.000/50k · business 5.000/250k; Silo ohne Limit); limitsForPlan pure-getestet, Control-UI Plan-Badge+Select, Migration Dev+Prod. **Tenant-Homepage MVP ✅ (2026-07-23):** pages-Layer in platform gepoolt (pages-003), index.vue rendert die `home`-Seite des Tenants (Markdown + `[[comments]]`-Block, useRequestFetch für Host-Weitergabe), Isolation lokal bewiesen (kunde-a Seite / kunde-b Fallback). **Live-Isolationsskript** [verify-pool-isolation.mjs](../packages/comments/scripts/verify-pool-isolation.mjs). **Read-only-Control-Plane-Key ✅ (2026-07-24, autonom):** `platform-control-readonly` (NUR rows.read) live auf app-prod (Write-Probe 401, demo 200/unknown 404); dabei kompletten Provisioner-Cleanup nachgeholt (pool-Projekt → Pukalani-App-Team, Team provisioning + provisioner-Account weg — alle 4 Prod-Projekte gehören jetzt David) + geleakten comments/migrations-Key rotiert ([Runbook](runbooks/PLATFORM-CONTROL-KEY-SWAP.md)). **Community-Plattform G0+G1 ✅ (2026-07-24, autonom):** Produktvertrag ([G0](referenz/G0-PRODUKTVERTRAG.md), David: Nav, 5-Rollen, Tarif, EA-Scope; kanonische Kunden-Site = **der Tenant**) + Sicherheits-Naht ([Roadmap](archiv/SAAS-ROADMAP.md) G1): `control-015` (`tenants.workspaceId` + `site_members`), core `tenantAuthz` (5 Site-Rollen owner/admin/mod/editor/viewer), `requireTenantPermission` (Cross-Projekt, 30-s-Cache, fail-closed), **Naht 4** `tenantRowPermissionsFor` (read(label(siteId)), Mechanismus + 11 Tests) + **Isolationsbeweis** grün lokal+prod (162 core + 58 studio). **Nachtrag 2026-07-25/28:** Naht-4-Live-Wiring + Session-Label je Site sind mit O5 erledigt (Site-Label wird gesetzt, `requireSitePermission` gilt), „Admin per Tenant" ist mit den Site-Rollen (N1) erledigt — der Owner erreicht sein Dashboard und sieht nur seine Capabilities. Offen (Rest ~1 %): **Audience-Entscheidung privat/öffentlich** (David — davon hängt ab, ob Community-Inhalte überhaupt ohne Login lesbar sein sollen) · Silo-Admin-Key-Registry · Homepage-Block-Baukasten (später, geparkt) | Claude (Etappen-Go: David) | schwer | 40 | 🔨 39/40 fertig |
| 5 | **Embed-Widget E2–E4** ([Plan](archiv/EMBED-WIDGET.md)) — **E2 ✅ + E3 ✅ (2026-07-23):** E2 = Schreiben im iframe (Popup-Login + Handoff-Token + CHIPS-Cookie; CSRF-scharf; prod-bewiesen cross-site von davidschubert.com inkl. Cookie-Forensik). **E3 = Site-Registry** `embed_sites` (comments-012, Dev+Prod) + Admin-UI `/dashboard/embed` + Registry-gespeiste frame-ancestors-CSP (allowedOrigins jetzt `['http://localhost:*']` statt `['*']`; davidschubert.com in Prod-Registry) + `GET /api/comments/count` (CORS, `data-maui-count`-Loader) + Redis-Rate-Limit. Bewiesen: CRUD per API (Create/409/PATCH/DELETE), CSP-from-Registry + count-CORS + 3 Fehlermeldungs-Zweige, 10 Unit-Tests, Embed-E2E grün. **E4 ✅ (2026-07-23):** (1) **Gast-Kommentare** ohne Account (Name+E-Mail, ohne Verifikation) — POST `/api/comments/guest` (Gate `embed.guests`, Rate-Limit 5/min/IP, Tenant-Quota, kein operatorTarget), comments-013 (`authorKind` + operator-lesbare `guest_authors`-Tabelle; **E-Mail nie auf der read(any)-Row**), GuestCommentForm + „Gast"-Badge; live bewiesen (POST 201, keine E-Mail in der öffentlichen Liste, anon-Read von guest_authors 401, Browser-E2E). Aktiviert auf der comments-App. Migration: lokaler Pool, Prod-Pool, Prod-comments. (2) **Presence im Embed** — funktioniert out of the box (geteilter Realtime-Socket trägt sie ins iframe; heartbeat+realtime-token+presences alle 200 live nachgewiesen). (3) **Web-Component** `<maui-comments>` (public/maui-comments.js, Shadow DOM, sandboxed iframe → keine XSS-/CORS-Fläche); live bewiesen (Shadow-Root+iframe, Resize 308px). **Bewusst später (supervised):** echte Inline-Render-Variante ohne iframe (eigener Sanitizer + CORS-Allowlist) + E3-Task-17 (dedizierte apps/embed-comments). | Claude | schwer | 12 | ✅ E2–E4 fertig |
| 6 | **Themes-Vollausbau 26×11** ([Plan](archiv/THEMES-VOLLAUSBAU.md)) — **✅ FERTIG (2026-07-24, E1–E7 alle per Empfehlung):** kuratierter Katalog `theme.catalog.ts` (21 Hue-Kreis-Welten + 5 gedeckte Ausreißer, je Basis+10 tonale Varianten = 286 Ramps), Generator mit Kontrast-Gate (Anker fest 500 — Bestands-500er byte-gleich, `--ui-primary` bleibt 600/400), committete `themeRegistry.gen.ts` + CI-Gate `check:themes` (lint.yml), Grid-Modal-Picker mit sticky Varianten-Reihe (E7b). Bewiesen: 62 Unit-Tests + Guard (26×11), SSR-Cookie-Beweis, Visual-Baselines 9/9 neu, Dark-Stichprobe. | Claude | schwer | 10 | ✅ fertig |
| 7 | **Deploy-RAM-Härtung** — Swap (18.07.) + NODE_OPTIONS-Cap 2560 in ploi-`~/.bashrc`; Praxistest: Deploys in Folge sauber. Nachtrag 23.07.: platform-Build braucht 3584 (Deploy-Script), Überhang läuft in den Swap. | — | — | 3 | ✅ fertig |
| 8 | **Shared Rate-Limit-Store** — ✅ 2026-07-23: Redis lief auf app-prod bereits (bei Server-Einrichtung mitinstalliert, localhost:6379). Core `rateLimitStore.ts` (Fixed-Window, peek/hit; Redis wenn `NUXT_REDIS_URL` gesetzt, sonst In-Memory; fail-open mit Log; Keys pro Appwrite-Projekt gescoped), Middleware umgestellt, Unit-Tests + lokaler E2E (5×200 → 429, geteilter Redis-Zähler). | — | — | 3 | ✅ fertig |
| 9 | **E2E studio + portfolio** — Playwright-Smoke (10 + 5 Tests) nach comments-Muster; `pnpm --filter <app> e2e`. | — | — | 3 | ✅ fertig |
| 13 | **Self-Service-Onboarding ✅ GEBAUT (2026-07-25, O1–O6)** — der öffentliche Trichter läuft: `app.pukalani.app` (Kontroll-Host, Nicht-Mandant mit fail-closed API-Allowlist) → Invite-Code → **Wizard in 7 Schritten** → Community steht → **Handoff, der eingeloggt ankommt**. Abnahme nach Roadmap-DoD: **10 unbeaufsichtigte Läufe, Median 0,3 s**, Retry idempotent, keine Waisen-Rows. Dazu: Branding pro Mandant (nicht pro Projekt), `requireSitePermission` (Site-Rolle vor protokolliertem Break-Glass), Site-Label für Naht 4, Startseite aus der Beschreibung, Testphasen-Sweep. **Hosts umbenannt (2026-07-25):** `control.` (Betreiber, Alias der Control-Site + Wildcard-Zertifikat) · `my.` (Kundenbereich) · `start.` (Kurz-Link in den Wizard) — alle live, Altnamen antworten weiter. **Rest [beide]:** Trial-Banner + Ablauf-Erinnerung · Kundenbereich-Umzug `/workspace` → `my.*` · Abuse-/Suspend-Pfad · 301 von den Altnamen (bewusst später: Deploy-Verify und Stripe-Webhook hängen an `studio.*`) · Statusseite bei UptimeRobot. Details: [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md) | Claude | schwer | — | ✅ Trichter fertig |
| 10 | **SaaS-Produkt-Roadmap + pukalani.app-Landingpage** — ✅ SPEZIFIZIERT (2026-07-24): der verlorene „10-Ideen"-Zettel wurde durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (9 Ideen, Davids Entscheidungen je Idee, UI/UX-Konzepte für Tenant-Selbstverwaltung/Dashboard-IA/Custom-Domains) + [PUKALANI-LANDINGPAGE.md](archiv/PUKALANI-LANDINGPAGE.md) (SEO+UX-Konzept). **✅ GEBAUT (2026-07-27):** die Landing ist live auf `pukalani.app` (ploi-Site 392338, Apex proxied über Cloudflare), Roadmap-Blöcke §A Dashboard-IA, #2 Tenant-Selbstverwaltung und #1 Self-Service-Onboarding sind umgesetzt. Rest: laufende Inhaltspflege (Netto/Brutto s. Arbeitsliste A3; og:image je Community ist seit 2026-07-29 erledigt, s. B2). | beide | mittel | 2 | ✅ Landing live |
| 11 | **GitHub-Klicks** — ✅ 2026-07-23: #16/#15/#2 hatte David am 21.07. gemergt; Release-PR #18 gemergt → **v2.2.0 released** (Changelog-Draft automatisch angelegt — Kuratieren + Publish von v2.1.0 UND v2.2.0 liegt bei David im Dashboard). Neu offen: Dependabot #19–23 (npm-Bumps, kein workflow-Scope nötig). | — | — | 1 | ✅ fertig |
| 12 | **Kleinkram** — ✅ Demo-Passwörter · ✅ >14k-Limit (MEDIUMTEXT) · ✅ Wegwerf-Projekte gelöscht (2026-07-24): alle 7 lokalen Probes (s0-*, s1-probe-*, s3-*) weg — 5 regulär via Console-API (Login als Spike-User s0-admin), 2 chirurgisch per DB (Appwrite-Delete warf `openssl_decrypt cipher_algo empty`-500; 132 präfix-verifizierte Tabellen gedroppt + Console-Rows entfernt), Wegwerf-Teams s0-org/maui-sites gelöscht, Spike-Console-User s0-admin (hartkodiertes PW!) entfernt, Redis-Cache geflusht; echte Projekte per Smoke verifiziert (401 vs 404). ✅ Dependabot #19–23: von Dependabot selbst geschlossen — die Bumps (u. a. @nuxt/ui 4.10, vue-tsc 3.3.8) kamen längst über den pnpm-Catalog rein. | — | — | 1 | ✅ fertig |

**Fertig-Anteil: 82 % ✅ (43 % + 39/40 von H3) · offener Rest (18 %) wartet fast vollständig auf David: Rechtstexte (5) + Stripe-Live (12) + Audience-Entscheidung (1).**

> **📋 Quota-Zahlen (H3-4.3) — seit 2026-07-24 IM STUDIO EDITIERBAR:**
> Studio → Tenants → „Pläne & Limits": free 200/Tag + 5.000 gesamt ·
> pro 1.000/50.000 · business 5.000/250.000 (Seed = beschlossene Zahlen;
> 0 = unbegrenzt). Änderungen wirken im Pool nach ≤ 90 s ohne Deploy
> (tenant_plans, control-014 → Resolver legt Limits in den TenantContext;
> app.config bleibt Fallback). Silo-Kunden: ohne Limit (eigenes Projekt).

Zurückgestellt (bewusst, zählt nicht): Flag-Registry statt `commentsEnabled`
(lohnt erst mit dem nächsten Flag), `useFormatCurrency`-Vorhaltung,
targetType-LOW-Residual (kommt mit comment_reports-Modell).

---

## 🔧 Arbeitsliste (feinkörnig, Stand 2026-07-28)

Der Rest der Audit-Wochen (Pool-Audit 26.–27.07., Dashboard-Audit 28.07.) plus
die Krümel, die in Plan-Dokumenten hängen geblieben waren. Trägt **keine
Prozente** — das macht der gewichtete Master oben. Legende wie dort.

### A — blockiert den ersten zahlenden Kunden

| # | Task | Wer |
| --- | --- | --- |
| A1 | **Echte Rechtstexte** für pukalani.app (Impressum/Datenschutz/AGB). Routen stehen, Texte sind Entwurf + `noindex`. Identisch mit Master #1. | David (ggf. Anwalt) |
| A2 | **Stripe Live-Modus** — Keys, Live-Webhook (zeigt noch auf den `studio`-Alias!), Preise prüfen. Identisch mit Master #2. Vorstufe: **A2a** die 6 manuellen Testmodus-Schritte in [STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) durchspielen (ensure-prices, Monats-/Jahres-Checkout, Portal-Kündigung, Test-Clock-Periodenende, `payment_failed`) — das ist die Absicherung, bevor echtes Geld fließt. | David |
| A3 | **Netto/Brutto-Angabe** — ✅ ERLEDIGT (2026-07-29, Davids Entscheid: **Brutto**): 29 €/149 € sind Endpreise, Hinweis „inkl. 19 % MwSt." / „incl. 19 % VAT" steht AM Preis — Landing (`PricingSection` + FAQ, de/en), Hilfe (`anleitung/5.abrechnung.md`), Billing-Preistafel (`packages/billing`), Betreiber-Preisfeld (control) als „brutto" beschriftet. **REST [David]:** Stripe legt die Prices ohne `tax_behavior` an und die Checkouts laufen mit `automatic_tax` — steht das Konto-Default auf „exclusive", rechnet Stripe 19 % oben drauf und widerspricht der Landing. Prüfung vor dem Live-Gang: [STRIPE-GO-LIVE-RUNBOOK](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) §2.4. | ✅ Claude · Stripe-Rest David |
| ~~A4~~ | ~~**Presence-Rows sind pool-weit lesbar**~~ — **erledigt 2026-07-29** (Weg (c), Davids Entscheidung): Presencen tragen im Pool `read("label:<siteId>")` statt `read("users")`, das Label vergibt `core/server/middleware/site-label.ts`. Der tenantId-Filter bleibt als Netz. Beweis in beide Richtungen: `packages/core/scripts/verify-presence-boundary.mjs` (23/23). **Nachtrag:** die damalige Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") ist mit A5 ersetzt — sie war mit C16 nicht mehr haltbar. Analyse + Umsetzungs-Stand: [PRESENCE-GRENZE.md](archiv/PRESENCE-GRENZE.md) Abschnitt 8. | ✅ |
| ~~A5~~ | ~~**„Zugang entziehen" wirkte nicht**~~ — **erledigt 2026-07-29** (Davids Entscheidungen 1+2): Mitgliedschaft ist jetzt ein EREIGNIS und das Site-Label folgt ihr, statt sie zu behaupten. Gesteuert vom bestehenden Schalter `tenants.openRegistration`: offen ⇒ Beitritt mit Rolle `viewer` bei (a) Kontoanlage auf dem Mandanten-Host und (b) erstem eigenen Schreibvorgang (abgefangen in der Datentür, nicht in zwanzig Routen) — ein bloßer Seitenaufruf löst bewusst nichts aus; geschlossen ⇒ nur per Einladung. Entfernen zieht Rolle UND Label (`revokeSiteLabel` + Kurzzeit-Notiz gegen den 30-s-Rollen-Cache) und ist gegen Wiederbeitritt gesperrt. Bestand aus der A4-Zeit (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst — kein Backfill-Skript. Mitgliederliste zeigt alle, Standardansicht filtert aufs Team. Beweis: `verify-site-authz.mjs` Abschnitt 10 (97/97) + `verify-presence-boundary.mjs` (23/23). | ✅ |

### B — Entscheidungen, die Arbeit freischalten

| # | Frage | Wer |
| --- | --- | --- |
| B1 | **Visual-Baselines** (9 Stück) sichten, dann `pnpm --filter comments e2e -- --update-snapshots themes-visual` — der Header-Umbau (S9) hat sie erwartungsgemäß gebrochen. Die Theme-Entscheidungen vom 2026-07-29 (B3/B5) kommen NICHT dazu: `themes-visual` läuft gegen `apps/comments` (Silo, `maui.tenancy` aus ⇒ das Theme-Cookie der Specs gewinnt dort weiter), und das Label „Aloha" steht nur im geschlossenen Picker/Dropdown, nicht auf der `/visual`-Seite. | David sichtet, dann Claude |
| ~~B2~~ | ~~**og:image je Tenant-Seite**~~ — **erledigt 2026-07-29** (Davids Entscheidung: **automatisch generiert**, kein Upload-Feld und kein Einheitsbild). `/og/<key>.png` liefert je Community eine 1200×630-Karte aus Theme-Basisfarbe + Community-Name + dezenter Wortmarke; `useLocaleSeoHead()` (core) setzt og:image/width/height/type/alt + `twitter:card` als EINZIGE Stelle, absolut auf dem Request-Host. **PNG, nicht SVG** — Facebook/WhatsApp/LinkedIn zeigen SVG als og:image nicht. Gerastert OHNE Renderer im Betrieb: Chrome hat die Zeichen einmal in ein Deckungs-Atlas gebacken (`packages/themes/scripts/generate-brand-card-font.mjs`, 85 KB committet), der Server setzt sie zusammen (~16 ms Event-Loop, Kompression im Threadpool) und legt das Bild unter `/tmp` ab — je Community faktisch EINMAL. Beweis: `apps/platform/scripts/verify-og-image.mjs` (19/19 grün gegen demo.localhost). Gate `maui.seo.tenantOgImage` (Core-Default aus). **Offen als mögliche Ergänzung:** eigenes Bild hochladen (bewusst NICHT gebaut). | ✅ |
| ~~B3~~ | ~~**Theme-Name „Sunrise"** steht im Picker neben dem bestehenden „Sunset"~~ — **erledigt 2026-07-29** (Davids Entscheidung): das Standard-Theme heißt im Picker **„Aloha"**. Geändert wurde AUSSCHLIESSLICH das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n — Theme-Namen sind Eigennamen, de = en); die Id bleibt `default`, weil sie in `tenants.theme`, `data-theme`, den CSS-Dateinamen und gespeicherten Kunden-Configs steckt. Test hält Name + Eindeutigkeit fest (`tests/builtinThemes.test.ts`). | ✅ |
| B4 | **Perf-Hebel (K4)**: (a) Appwrite-Web-SDK dynamisch laden (72 kB Entry, Umbau am Realtime-Subsystem) · (b) spekulative `prefetch`-Hints filtern (größter Messwert, kostet den Navigations-Vorsprung nach dem Login). | David wählt, Claude baut |
| ~~B5~~ | ~~**Besucher-Theme vs. Community-Theme**~~ — **erledigt 2026-07-29** (Davids Entscheidung: die Community gewinnt). Auf einem Mandanten-Host wird das Theme-Cookie GAR NICHT mehr gelesen: `data-theme/data-variant` kommen aus `tenants.theme/variant`, ohne eigene Wahl aus der Instanz-Einstellung. Der Theme-Wähler VERSCHWINDET dort (öffentliches Anzeige-Menü + Dashboard-Kontomenü) statt beschriftet zu werden — er hätte auch „nur für dich" nicht mehr gewirkt. Hell/Dunkel, Neutral-Palette und Sprache bleiben Besucher-Wahl. Regel pur + getestet in `packages/themes/shared/themeSelection.ts` (11 Fälle); live belegt an `kunde-a.localhost` (Cookie `crimson` → SSR `data-theme="lagoon"`) gegen `app.localhost` (Cookie gewinnt weiter). **Rest [David]:** die Neutral-Palette (`data-neutral`, gedeckte Grau-Tönung) bleibt Besucher-Wahl — es gibt dafür keine Community-Einstellung. Soll sie auch der Community folgen? | ✅ |
| B6 | **Listen-Muster im Dashboard** — heute `UTable` in 2 von ~20 Listen, 18 handgebaut. `UTable` als Standard für Datenlisten, oder bewusst Karten und `UTable` nur mit Sortierung/Filter? Ohne diese Entscheidung bleiben die 18 Listen ungleich (Dashboard-Audit, UI-Hebel 3). | David |

### C — Claude kann sofort

| # | Task | Herkunft |
| --- | --- | --- |
| ~~C0b~~ | ✅ **ERLEDIGT 2026-07-29** — die beiden ruhenden Migrationen sind auf prod gefahren. **system-021** (`activities.tenantId` + `idx_tenant`) auf ALLE vier Instanzen mit Appwrite: control, pool, comments, portfolio (marketing und help haben keine Datenebene). **media-003** (`media_items.tenantId` + `idx_tenant_published_order`) auf comments — die einzige Prod-Instanz mit media, weil photos nur lokal läuft. Vorher je Instanz gesichert, danach gegengeprüft: überall `tenantId` mit Status `available`, Spalten 8→9 bzw. 7→8, Indizes 3→4 bzw. 1→2, Zeilenbestand unverändert (comments 32 Aktivitäten, 1 Medien-Eintrag). Alle Kunden-Hosts danach 200. | C1b / Audit B3 |
| ~~C0c~~ | ✅ **ERLEDIGT — war schon auf prod, die Zeile war veraltet** (nachgeprüft 2026-07-29). `system-022` (`notifications.tenantId` + `idx_recipient_tenant`) liegt auf **allen vier** Instanzen mit Datenebene: `control`, `pool`, `comments`, `portfolio` — je 8 Spalten, `tenantId` mit Status `available`, 4 Indizes inklusive `idx_recipient_tenant` (gelesen über `listColumns`/`listIndexes` gegen `https://api.pukalani.app/v1` mit den Migrations-Keys). Das Rückfall-Fenster, vor dem diese Zeile warnte, hat es also nie gegeben. `notifications` ist auf allen vier noch leer (0 Zeilen) — die Glocke ist jung, ein Backfill wäre ohnehin gegenstandslos. | C15 |
| ~~C0~~ | ✅ **ERLEDIGT 2026-07-28** — media-002 gegen Projekt `comments` gefahren. Vorher: Tabelle `rowSecurity=false` + `read("any")`, Bucket `fileSecurity=false` + `read("any")` — jeder Anonyme konnte Entwürfe samt Bild abrufen. Nachher: beide `rowSecurity/fileSecurity=true` mit leeren Table-/Bucket-Rechten, das Leserecht hängt an der Row bzw. Datei und folgt `published`. Der veröffentlichte Bestand (1 Eintrag) trägt jetzt `read("any")` + `read("label:admin")` und ist unverändert erreichbar (Galerie-URL → HTTP 200, image/webp). Ist-Zustand vorher als JSON gesichert. **Voraussetzung war**: dem `comments`-Migrations-Key fehlten Storage-Scopes — media-002 ist die erste Migration, die einen Bucket anfasst (David hat sie am 2026-07-28 ergänzt). `photos` war nie betroffen (nicht in Produktion). | Audit B3 |
| ~~C1~~ | ✅ **ERLEDIGT 2026-07-28** — `/api/admin/stats\|analytics` gaten über `await requireSitePermission(event, 'dashboard.access')` statt label-only. Bewusst diese Capability: sie ist die Eintrittskarte, die alle fünf Site-Rollen auf die Übersicht bringt — enger gegated bliebe die Seite für Editor und Viewer leer, der Befund wäre nur verschoben. Kennzahl-genau geklemmt: `commentsReported` nur mit `comments.moderate` (offene Meldungen sind Moderations-Wissen), `usersTotal`/`usersInRange` bleiben im Pool `null` wie gehabt — Karte bzw. Balkenreihe entfallen dann, statt eine fremde Zahl zu zeigen. Mitgenommen: **Audit S2** — die Übersicht gatet ihre Widgets jetzt einzeln (Schnellmoderation `comments.moderate`, Aktivität `audit.read`, Speicher `storage.manage`), inklusive `immediate`, damit für Site-Rollen keine vorhersehbaren 403-Fetches mehr rausgehen. Beweise: `packages/admin/tests/dashboard-stats-authz.test.ts` (11 Fälle) + live 30/30 in `verify-site-authz.mjs` (neuer Abschnitt 6b: Owner 200, Fremder 403, Gast 401). | Pool-Audit N8 |
| ~~C1b~~ | ✅ **ERLEDIGT 2026-07-28** — media und activity gehen durch die Datentür. Migrationen: **media-003** (`media_items.tenantId` + idx_tenant_published_order) und **system-021** (`activities.tenantId` + idx_tenant), beide additiv/ruhend ohne Backfill ('' = Silo, im Pool fail-closed). Alle sechs `server/api`-Routen über `tenantDb(event)`, `as:'operator'` nur wo fachlich nötig (Entwurfs-Rows ohne breites Leserecht, Rows ohne Schreibrechte) und je Fall am Code begründet. Auch die Helfer außerhalb des Backstops: `applyMediaVisibility` prüft selbst, `recordActivity` (core) stempelt Mandant + Site-Label statt `read(users)` — sonst hätte im Pool jedes Mitglied den Feed aller Communities bekommen, auch über Realtime. Der Activity-Realtime-Stream filtert zusätzlich clientseitig (`useTenantId`). ESLint-Backstop auf beide Layer erweitert; Isolationsbeweise `packages/{media,activity}/tests/tenant-isolation.test.ts` gegen echte Appwrite grün. **Prod-Migrationen offen**: media-003 → photos + comments, system-021 → ALLE Instanzen. **Ein Rest, kein Leck**: Entwurfs-DATEIEN im Bucket tragen nur den globalen Operator-Read — im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht vorschauen; Richtung (server-seitige Vorschau-Route) steht in `media/server/utils/mediaPermissions.ts`. | Dashboard-Audit S3 |
| C2 | **UI-Plan-Gate für Kurse/Events** in der Nav (`maui.chrome.nav`, blueprint) — heute per Direktlink erreichbar, läuft in den API-404. | Kurse-Bericht / Audit S4 |
| C3 | **Kompositionen Events + Kurse in den Bauplan** — `EventDetail`/`LessonView` füllen ihren `#comments`-Slot bisher nur in `apps/comments`. | Produkt-Bilanz |
| C4 | **Nav-Einträge events/courses** aus `apps/comments/app/app.config.ts` in die Layer verschieben. | S9-Bericht |
| C5 | **register/forgot/reset ohne `<title>`** (Brand-Kopf haben sie seit B3). | Pool-Audit B3-Rest |
| C6 | **Aufräum-Migration (nächste freie Nummer, system-023)**: Legacy-Spalte `app_config.entitlements` droppen — **erst wenn alle Instanzen neuen Code fahren**. (Vergeben sind 021 seit C1b (`activities.tenantId`) und **022 seit C15** (`notifications.tenantId`) — die Nummer hier ist auf **023** nachgezogen.) | Pool-Audit N2 |
| C7 | **apple-touch-icon je Community** (PNG-Pflicht, aus dem SVG nicht ableitbar). | Pool-Audit K2-Rest |
| C8 | **Suche in der internen Doku** (`control.pukalani.app/docs`) — bewusst weggelassen. | control/docs |
| C14 | **Bild-Naht Schritt 2: `@nuxt/image`** — Schritt 1 ist erledigt (2026-07-28): `core/shared/storageImage.ts` ist die eine Stelle, die Bild-URLs baut, und liefert `/preview` mit Breite/Qualität/WebP statt der Originaldatei; Medien-Galerie und Event-Cover nutzen sie, die Galerien tragen `srcset` + `sizes`. Gegen eine echte Appwrite gemessen: 480 px WebP → HTTP 200, `image/webp`, 480×600 (am Seed-Bild 67 % kleiner — bei echten Fotos deutlich mehr). Offen ist Schritt 2: `@nuxt/image` im core mit eigenem Appwrite-Provider (~30 Zeilen, mappt auf `/preview`) für `<NuxtImg>`, AVIF-Aushandlung und Platzhalter. **Vorher messen**, was die Transformationen auf der aktuellen Maschine an CPU kosten — sie läuft neben sieben Apps (E3). Hängt mit B4 zusammen. | Davids Entscheidung 2026-07-28 |
| ~~C9~~ | ✅ **ERLEDIGT 2026-07-28** — Ursache war **keine** CI-Eigenheit und **nicht** die localhost-Falle: der Test war schlicht veraltet. Seit **E4** (Gast-Kommentare, 23.07.) steht der Zweig `data-guest-composer` im `v-else-if`-Band VOR `data-embed-login` und verdrängt ihn, sobald `maui.comments.embed.guests` an ist — der gesuchte Knopf `[data-embed-login] button` existierte seither nie. Lokal exakt reproduzierbar (also kein Umgebungsunterschied); ältester noch abrufbarer Lauf (26.07.) zeigt dieselbe Signatur. Zwei Änderungen: (1) der Popup-Login-Knopf trägt in BEIDEN Gast-Zweigen den Haken `data-embed-login-cta`, die Spec hängt am Knopf statt am Container; (2) der Test bekommt ein Budget von 150 s — mit den 30 s Standard riss er auf einem kalten Server schon im ersten Warteschritt ab und meldete „Hydration-Zeitüberschreitung" statt des echten Fehlers, was die Diagnose tagelang in die falsche Ecke schickte. Beim Nachmessen kam ein **zweiter**, echter Grund dazu — der Kaltstart des **Dev**-Servers, gegen den die Suite fährt (auch in CI): er kompiliert jede Route beim ersten Zugriff (kalt gemessen `/` gut 25 s, `/embed` samt Client-Bundle über 30 s). Das riss (a) das 30-s-Standardbudget von `realtime` und `embed-write` und (b) die harte 10-s-Kante in `public/embed.js`, die das iframe **endgültig** versteckt (`display:none` + „Comments could not be loaded"), wenn das Widget keine Höhe meldet — gedacht für den CSP-geblockten Einbetter, aber die Höhe kommt erst aus `onMounted`. Danach heilt kein Warten mehr. Deshalb drei Maßnahmen, jede an einer gemessenen Kante: Test-Budget global auf 90 s (embed-write 240 s, es fährt drei Dokumente hoch); beide Embed-Specs rufen `/embed` einmal **im Browser** auf und warten dort bis zur **Hydration**, bevor die Hostseite lädt (ein SSR-Abruf oder ein `goto` bis `load` lässt den Client-Graph unfertig — beides nachgemessen, beides reichte nicht); und die Lebendigkeits-Wartezeiten der Handoff-Kette stehen auf 60 s, weil `/api/auth/login|embed-handoff|embed-session` ebenfalls erst beim ersten Aufruf kompilieren. Ohne das war die Suite nur noch dank `retries: 1` grün, also „flaky" statt verlässlich. **Drittens** zeigte sich, dass der lange als „hängt halt 5 Minuten, nicht killen" abgetane Playwright-Teardown-Hang kein harmloses Warten ist: Playwright force-killt jeden Worker nach 300 s und zählt das als Fehler **ausserhalb jedes Tests** — Exit-Code 1 bei komplett grüner Suite. Das trifft **nur lokal** (macOS); in CI läuft dieselbe Suite in ~1,6 min sauber durch, dort taucht die Meldung nie auf. Naheliegende Ursache (die Test-eigenen `node:http`-Hostserver hielten Keep-alive-Sockets, `close()` wartete darauf) ist behoben — `closeAllConnections()` vor `close()`, richtige Hygiene —, **erklärt den Hang aber nicht**: er trifft auch Worker, die nie einen solchen Server hatten. Lokale Ursache bleibt offen; siehe E-Liste. Damit ein übersprungener Fall nicht mehr still verschwindet, läuft in CI zusätzlich der `list`-Reporter (der `github`-Reporter meldet nur „9 skipped" als Zahl). **Was der Job künftig fängt / was nicht**: siehe Notiz unter der Tabelle. | CI-Beobachtung 28.07. |
| C10 | **Destruktive Aktionen ohne Rückfrage** — sechs Stellen löschen mit einem Klick (Einbetter-Domain, Lektion, Seite, Feedback, Event absagen, Kommentar verstecken), eine ruft natives `window.confirm()` (`media.vue:69`), acht machen es richtig mit `UModal` — und `events.vue` macht beides in derselben Datei. Ein Bestätigungs-Vertrag räumt das plus die fünf Doppelklick-Löcher gemeinsam ab. Der einzige UI-Befund, der Daten kosten kann. | Dashboard-Audit, UI-Hebel 2 |
| C11 | **Leerzustände** — ~20 Listen zeigen eine graue Textzeile, `UEmpty` wird 0× benutzt, `USkeleton` 0× im Dashboard. Ein Baustein (Icon + Satz + der eine nächste Schritt) trifft jede Seite auf einmal; die Texte sind größtenteils da. Erste Seite als Muster zeigen, dann ausrollen. | Dashboard-Audit, UI-Hebel 1 |
| C12b | **`platform.pukalani.app` liefert rohes JSON statt einer Seite.** Der Host ist weder Mandant noch Kontroll-Host, die Tenant-Middleware antwortet korrekt mit 404 „Unknown host" (Host-Härtung H3) — aber als nacktes Nitro-JSON. Dieselbe Klasse wie Audit B2, nur eine Ebene früher: die Middleware greift VOR dem Renderer, deshalb hat der B2-Fix sie nicht erwischt. Der Host wird nirgends beworben, daher klein. | Beobachtung 2026-07-29 |
| C12 | **Dashboard-Kleinteile** (Dashboard-Audit, Teil 2): `storage.vue` paginiert nicht · fehlende Leerzustände in `users/index.vue` + `admin/features.vue` · interne IDs im Kundenblick (`billing.vue` userId/planId, rohe Rollen-Keys, Appwrite-Event-Namen) · Jargon in Feldern („Slug", „Bucket", Platzhalter `paidCourses`) · handgebaut statt Nuxt UI (4× Button-Paar statt `URadioGroup`, Rollen-Picker, Online-Punkt, `UCollapsible`, Emoji-Badge) · 238 Toasts, nur 20 mit `description` · stumme Erfolge · Icon-Buttons ohne Label (8 Stellen) · ein hartcodierter Prosa-String (`themes/fonts.vue:249`) · `events.vue:309` ohne `flex-wrap`. | Dashboard-Audit |
| ~~C13~~ | ✅ **GRÖSSTENTEILS ERLEDIGT 2026-07-28** — jeder Befund erst am Code nachgeprüft, dann gefixt: **S5** „Autor sperren" + Autoren-Link gaten auf `users.manage` (Muster aus dashboard/index.vue; dieselbe Stelle steckte auch in der Schnellmoderation der Übersicht) · **S7** `grantEventTicket` stempelt den Mandanten seines Events, s. D1 · **S8** Appwrite-Fehlertexte bleiben serverseitig (`publicContributorResults()` + strukturierte Logs) · **S10a** Produkt-Gate auf ALLE neun posts-Routen (nicht nur die vier gemeldeten — hide/restore/assist gehören zwingend dazu) · **S10b** Wartungsmodus auf patch/delete **und vote** (der Befund nannte `vote.post` irrtümlich als Referenz; die Prüfung sitzt in `score.post`) · **S10c** Triage-Gate in die Route gezogen. Vier neue Test-Suites, drei davon strukturell (jede Route trägt ihren Gate). **Offen abgespalten:** S6 → C15, S9 (tote Capabilities) → C16. Details + Prüfvermerke: [DASHBOARD-AUDIT-2026-07-28.md](archiv/audits/DASHBOARD-AUDIT-2026-07-28.md). | Dashboard-Audit |
| ~~C15~~ | ✅ **ERLEDIGT 2026-07-29** — die Glocke ist mandantenrichtig. **Migration `system-022`** (`notifications.tenantId` + `idx_recipient_tenant`, ohne Backfill; **Prod-Lauf offen**, s. C0c). Die Spalte trägt DREI Bedeutungen, gebündelt in der einen puren Regel `core/shared/notificationScope.ts`: `<tenantId>` = diese Community, `_account` = Kundenbereich (kollisionsfrei, weil eine Appwrite-Row-Id nie mit `_` beginnt), `''` = unbekannt. `notify()` verlangt jetzt ein **Pflichtfeld `scope: 'tenant' \| 'account'`** — kein Default, damit „mandantenlos" eine Entscheidung ist und kein vergessenes Feld; der TypeScript-Fehler ersetzt hier den ESLint-Backstop, der in `server/utils/**` nicht greift. Alle **acht** Aufrufer gestempelt (nicht sechs, wie hier stand): comments ×3, tickets ×2, events, control-Invites, Stripe-Webhook — die letzten beiden **`'account'`** (Davids Entscheidung 3: Vertrags-Meldungen gehören nicht in eine Kunden-Community). Beide Leserouten + der Realtime-`where` der Glocke filtern über dieselbe Regel. **Bestandszeilen bleiben sichtbar** (Davids Entscheidung 2) — bewusst fail-OPEN, die begründete Ausnahme von der sonst geltenden fail-closed-Regel: sonst leert sich jedem Nutzer im Deploy-Moment die Glocke, und Row-Security hält die Empfänger-Grenze ohnehin. Die Begründung steht an drei Stellen im Code, damit sie niemand „korrigiert". Dazu zwei Rückfälle für das Deploy-Fenster (Code vor Migration): Schreiben ohne Stempel, Lesen ohne Filter — beide **laut** geloggt. Der Digest-Sweep bleibt bewusst mandantenübergreifend (eine Mail pro Tag, nicht eine pro Community) und ist vom Stempel unberührt. Beweise: `packages/core/tests/notificationScope.test.ts` (16 Fälle, Stempel-Vertrag Pool/Silo/mandantenlos) + `packages/core/tests/notification-tenant-isolation.test.ts` (5/5 gegen echte Appwrite: ein Nutzer, zwei Communities, jede Glocke nur ihre eigenen; `_account` nie in einer Community; Bestandszeilen in beiden). **Reste abgespalten:** C17 (Kundenbereich hat keine Glocke), D5 (Mail-Links). | Dashboard-Audit S6 |
| ~~C17~~ | ✅ **ERLEDIGT 2026-07-29 — die Glocke hängt jetzt dort, wo die Meldungen liegen.** Die Zeile hier hatte den falschen LESER im Verdacht: sie suchte die Anzeige auf `my.pukalani.app` (Platform-App, Pool-Projekt) und schloss daraus auf ein Cross-Projekt-Problem. Am Code nachgeprüft gibt es keines — **Absender, Empfänger und Leser liegen alle drei im `control`-Projekt**: `packages/billing/server/api/stripe/webhook.post.ts:113` (`recipientId: row.userId` aus `billing_subscriptions`, ein Konto DIESES Projekts) und `packages/control/server/utils/inviteRequests.ts:261` (Betreiber mit Label `admin`) laufen beide nur in `apps/control`; `apps/platform` hängt `@maui/billing` gar nicht ein und hat deshalb keinen einzigen `account`-Absender. Gefehlt hat nur die ANZEIGE: die Glocke wird ausschließlich aus `maui.chrome.utilities` gerendert, und dessen einziger Konsument ist das **blueprint**-Layout — ein Layer, den `apps/control` nicht extended. Fix: neuer Schalter `maui.chrome.accountBell` (Core-Default **aus**), gerendert im core-default-Layout (= Kopfzeile von `/workspace` und `/account/billing`) und in der Dashboard-Shell (Sidebar-Reihe neben der Suche — **nicht** als schwebendes Widget oben rechts: dort sitzen die Aktionen der Seiten-Kopfzeilen, das erste Layout verdeckte „Neuer Code"). `apps/control` schaltet ihn an, sonst ändert sich für keine App etwas. Dazu ein zweiter Befund aus demselben Weg: `invite.request` hatte in der Glocke **keinen Lesetext** und fiel auf `'replied'` zurück — die Betreiber-Glocke behauptete „hat auf deinen Kommentar geantwortet"; jetzt `notifications.inviteRequest` (de+en), und der `title` trägt die anfragende Adresse statt eines hartcodierten deutschen Satzes. Beweise: `packages/control/scripts/verify-account-bell.mjs` (**27 bestanden, 0 fehlgeschlagen** — echter Weg vom öffentlichen Anfrage-Formular über das Control Plane bis in die Glocke, Fremder sieht nichts, Gast sieht keine Glocke, plus die Gegenprobe im Pool: Community-Glocke ohne `_account`, Kundenbereich ohne Community-Meldung) + `packages/core/tests/notificationBellTexts.test.ts` (strukturell: jeder gesendete Typ braucht einen eigenen Lesetext in beiden Sprachen — verifiziert rot, wenn der Zweig fehlt). Browser-geprüft (Konsole sauber, nur die bekannte `i18n baseUrl`-Warnung). **KEINE Migration nötig.** Offen geblieben (bewusst): auf `my.pukalani.app` hängt weiter keine Glocke — dort gibt es heute nichts zu zeigen; kommt Pool-Billing (D1), braucht das Onboarding-Layout eine. | C15 |
| C16 | **Tote Capabilities — Rest.** ✅ `team.manage` und `site.transfer` sind seit 2026-07-29 gebaut (Mitglieder-Seite mit Einladungen, Rollenwechsel, Entfernen, Besitzübergabe) — und seit A5 hält „Entfernen" auch, was es verspricht (Label weg, kein Wiederbeitritt). Offen bleiben: `branding.manage` (Branding läuft heute nur über /dashboard/settings/community, das Theme-Studio verlangt `system.manage`), `posts.write` (das posts-Modul verlangt `posts.moderate` — ein **Editor** kommt an seine eigenen Beiträge nicht heran), und `site.delete` — bewusst später, unumkehrbares Löschen braucht erst eine Wiederherstellungs-Frist (Davids Entscheidung 2026-07-29). | Audit S9 |

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

### D — bekannt und bewusst zu

| # | Zustand | Öffnet sich, wenn … |
| --- | --- | --- |
| D1 | **Paid-Events und Paid-Kurse im Pool fail-closed** — der Stripe-Webhook hat keinen Tenant-Host. **Events-Hälfte erledigt (2026-07-28, S7):** `grantEventTicket` leitet den Mandanten aus dem EVENT ab und stempelt ihn; der Lesepfad findet das eigene Ticket, das des Nachbarn nicht, Bestands-Tickets bleiben fail-closed. Offen bleibt die Pool-VERDRAHTUNG (Checkout-Route + Fulfillment-Plugin gibt es nur in `apps/comments`) und die Kurs-Hälfte (für bezahlte Kurse existiert noch gar kein Webhook-Pfad; die Einschreibung läuft heute über eine normale Route und ist damit gestempelt). Per Test genagelt. | Billing mandantenfähig wird |
| D2 | **`/changelog` auf Tenant-Hosts 404** (N7, gewollt) | — |
| D3 | **Demo ist indexierbar** (N4, Davids Entscheidung) | — |
| D5 | **Benachrichtigungs-MAILS verlinken im Pool auf die Env-Basis, nicht auf den Community-Host** (Davids Entscheidung 4, 2026-07-29 — bewusst NICHT Teil von C15). Die In-App-Glocke ist seit `system-022` mandantenrichtig, die Mail nicht: `absoluteLink()` in `core/server/utils/notificationEmail.ts` setzt jeden Link auf `NUXT_PUBLIC_APP_URL` zusammen, also zeigt die Antwort-Mail aus Community A auf den App-Host statt auf `a.pukalani.app`. Was fehlt, präzise: (1) eine **Tenant→Host-Auflösung**, die aus einer `tenantId` den kanonischen Host macht — die Zuordnung liegt im **Control Plane**, also in einem anderen Appwrite-Projekt (Cross-Projekt-Abfrage plus Cache, sonst eine Abfrage pro Mail); (2) ein Weg, den Mandanten in den Mail-Bau zu tragen — der **Instant**-Zweig hat den Request und könnte ihn aus `useTenant(event)` nehmen, der **Digest-Sweep** hat gar keinen (er läuft im Intervall-Plugin ohne Host) und müsste ihn pro Zeile aus `notifications.tenantId` auflösen; (3) eine Entscheidung für die Sammel-Mail, die Zeilen aus MEHREREN Communities enthält (ein Link je Zeile mit je eigenem Host, oder Gruppierung nach Community). | Tenant→Host-Auflösung existiert |
| D4 | **Cloudflare Origin Certificate** für die Landing → erlaubt „Full (Strict)" und löst pukalani.app ganz aus Let's Encrypt. Privater Schlüssel muss durchs Dashboard. | David es einmal macht |

### E — Betrieb / Hygiene

| # | Task |
| --- | --- |
| E1 | **`apps/control/.env.production` zeigt noch auf das gelöschte Projekt `studio`** (Cutover-Altlast) — die Datei ist tot: die Keys darin gehören einem Projekt, das es nicht mehr gibt. **Sie liegt NICHT im Repo** (gitignored, kein Skript und kein Workflow verweist darauf; die frühere Formulierung „die Datei im Repo" war falsch) — es ist eine lokale Altlast auf Davids Rechner, und ein Aufruf `--env-file=apps/control/.env.production` würde gegen ein nicht existierendes Projekt laufen. Der richtige Pfad ist `~/.appwrite-secrets/migrations/control.env`. **Löschen ist Davids Klick** (Datei mit Schlüsselmaterial). Die anderen drei `.env.production` (platform → `pool`, comments, portfolio) sind korrekt. | David |
| E2 | **UptimeRobot**: Monitor für `help.pukalani.app` ergänzen · Monitor 803548622 heißt noch „studio…" (Friendly-Name nachziehen). |
| E3 | **Hetzner-Rescale** prüfen (CX33 knapp bei sechs Apps + Builds). [David] |
| E4 | **Cutover-Krümel** ([CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md)): ploi-Alias `studio.` + Doppel-Zertifikat der Control-Site aufräumen (geht erst, wenn der Stripe-Webhook auf `control` zeigt → hängt an A2) · Read-only-Key im Projekt `control` erzeugen [David, Console]. |
| E5 | **Wellen-Migrationen**: Silo-Instanzen `photos`/`portfolio` fahren `system` mit — bei künftigen system-Migrationen mitdenken (`--wave`). |
| E6 | **Worktrees aufräumen** — `.claude/worktrees/agent-*` (alle gemergt außer dem geparkten Block-Editor). |
| E8 | **`tenant` → `site`: die vollständige Umbenennung** — Davids Entscheidung vom 2026-07-29, gegen meine Empfehlung und im Wissen um die Kosten: das Wort `site` gewinnt überall, inklusive Tabellen- und Spaltennamen. Plan mit Bestandsaufnahme, Reihenfolge und Fallen: [TENANT-ZU-SITE-UMBENENNUNG.md](plans/TENANT-ZU-SITE-UMBENENNUNG.md). Kurzfassung: **19 Tabellen** tragen `tenantId` (auf bis zu 4 Instanzen), Appwrite kann Spalten nicht umbenennen ⇒ erweitern → umziehen → verengen je Spalte; `tenants` → `sites` braucht zuerst `sites` → **`instances`** (Name entschieden, Operator-Register der Deploy-Ziele). Der gefährliche Punkt ist EINER: beim Kopieren einer Zeile MUSS die Row-Id mitgegeben werden — `tenants.$id` steckt als Wert in jeder `tenantId` und in jedem vergebenen Site-Label. Voraussetzungen: Probe gegen eine Wegwerf-Instanz, Backup je Instanz, die drei Isolationsbeweise nach JEDEM Schritt, kein Wellen-Deploy währenddessen. **Nicht parallel zu anderen Paketen** — die Umbenennung berührt jeden gepoolten Layer. | Claude (Go: David) |
| E7 | **Playwright-Worker beenden sich lokal nicht** (macOS): nach grüner Suite meldet jeder Worker „did not exit within 300000ms after stop, force-killed it" — fünf Fehler ausserhalb der Tests, Exit-Code 1 trotz 15/15 grün, und ein Voll-Lauf dauert 17 statt 2 Minuten. **In CI tritt es nicht auf** (Ubuntu, ~1,6 min sauber), deshalb kein Blocker — aber lokal kostet es jeden Lauf eine Viertelstunde und macht „grün" von Hand nachzählbar statt ablesbar. Ausgeschlossen: die Test-eigenen `node:http`-Server (Keep-alive-Sockets werden jetzt getrennt, Hang bleibt und trifft auch Worker ohne Server). Nächster Verdacht: `channel: 'chrome'` (System-Chrome statt gebündeltem Chromium) — einmal mit dem Playwright-Chromium gegenprüfen. |

### F — später, bewusst geparkt

- **Discussions** als eigenes Produkt — Konzept fertig in
  [DISCUSSIONS-KONZEPT.md](plans/DISCUSSIONS-KONZEPT.md) (Kategorien vom Admin,
  Threads von Mitgliedern, URL mit stabiler ID + austauschbarem Slug). Bau erst,
  wenn die Kundenselbstverwaltung rund läuft.
- **Block-Editor-Worktree** (`worktree-agent-a762b1bc42bba74d7`) — nie reviewt,
  Feature-Stopp.
- **Silo → Pool**: `comments` und `portfolio` laufen als eigene Instanzen.
  Langfristig ist der Pool das Produkt; Silo bleibt das Enterprise-Angebot.

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

## 🟠 Offen — als Nächstes angehen

- **Phase 17 – Production Deployment** — Plan + Schritt-für-Schritt-Checkliste
  für den Betreiber: [docs/archiv/PHASE-17-PRODUCTION.md](archiv/PHASE-17-PRODUCTION.md).
  **Vorarbeit ✅ (2026-07-11): Prod-Build lokal generalprobiert** — nuxi build
  + node .output, 14/14 funktionale E2E (inkl. Realtime) gegen den Build;
  Prod braucht nur noch NUXT_PUBLIC_I18N_BASE_URL + NUXT_SMTP_* auf echte Werte.
  (Empfehlung: 2 Hetzner-VMs, ploi-Daemon, deploy.yml via workflow_run,
  Realtime-Watchdog; ~60 abhakbare Schritte, ~25–28 €/Monat).
- ✅ **Changelog Track 2B AKTIV** (2026-07-19): Function `changelog-draft`
  läuft auf Prod, GitHub-Release-Webhook → `https://changelog.pukalani.app/`
  (Custom Domain mit Let's-Encrypt; functions-Subdomains bekommen auf 1.9.5
  kein Einzel-Cert). Smoke-/HMAC-Tests bestanden; echter Release-E2E läuft
  mit dem nächsten release-please-Release mit. Ist-Zustand + Betrieb:
  [docs/archiv/CHANGELOG-2B-AKTIVIERUNG.md](archiv/CHANGELOG-2B-AKTIVIERUNG.md).

## 📋 Pläne für größere Ausbauten (bereit, brauchen Go + Entscheidungen)

- **Themes-Vollausbau 26×11**: [docs/archiv/THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md)
  — Generator-Script muss neu gebaut werden (nicht im Repo!), 9 Schritte,
  ~7–10 PT, 7 Entscheidungen (E1–E7). **Vorgezogen erledigt (2026-07-02):
  Theme-Studio** unter /dashboard/themes (themes-Layer via maui.admin.modules):
  Galerie aller Themes mit Live-Wechsel + Nuxt-UI-Showcase, EIGENE Themes
  anlegen/bearbeiten/sortieren/löschen (Runtime-Ramp-Generator
  themes/shared/ramp.ts mit WCAG-Kontrast-Check + CSS-Export; Table
  custom_themes via system-009, CRUD /api/admin/themes, öffentliche Liste
  /api/themes, SSR-flash-frei injiziert). Der 26-Themes-KATALOG aus dem Plan
  bleibt offen — der Studio-Generator ist dafür der Grundstein (Plan-Schritt 3).
- ✅ **packages/billing (Stripe)** — umgesetzt 2026-07-08 als GOALS-Phase 23
  ([Plan](archiv/BILLING-STRIPE.md) exekutiert): hosted Checkout/Portal,
  Webhook (Signatur/Allowlist/Stale-Guard), Entitlements + `useBilling`,
  Live-Matrix mit echtem Test-Key gefahren. Details README-Status 56.
- **Embed-Widget**: [docs/archiv/EMBED-WIDGET.md](archiv/EMBED-WIDGET.md)
  — **E0+E1 ✅ (2026-07-09): Read-only-MVP live** (iframe + embed.js,
  frame-ancestors-Split, Read-Rate-Limit, [docs/referenz/EMBED.md](referenz/EMBED.md)).
  Offen: E2 (Schreiben im iframe — Login-Popup + CHIPS-partitionierte Session;
  seriöse Verifikation braucht echte Cross-Site-Domains → passt gut ZU/nach
  Phase 17), E3 (Site-Registry, count-API, Redis-Rate-Limit), E4.

## 🟡 Klein / Reste

- **Audit-Produktfragen (2026-07-05 ENTSCHIEDEN):**
  (a) **Presence-Sichtbarkeit — so lassen**: Presence-Metadata (`userName`/
  `avatarUrl` + Aktivität) bleibt per `read("users")` für alle eingeloggten
  User lesbar — Name/Avatar sind ohnehin öffentlich (Kommentare), „wer ist
  online/tippt/reviewt" IST das Feature; nur eingeloggte sehen es. Bei
  Kundenprojekten/Multi-Tenant neu bewerten (dann Reads über Server-Route
  proxien). (b) **deleted-Tombstones zählen mit**: sie sind sichtbare
  Listeneinträge („[gelöscht]", Reddit-Verhalten) — Zähler = Liste; Nicht-
  Zählen würde Anzeige und total auseinanderlaufen lassen. (c) **X-Forwarded-
  For**: kein Code-Gate — als expliziter Checkpunkt im Phase-17-Plan verankert
  (App NUR hinter ploi-nginx, Port 3000 nie exponiert, Firewall erzwingt es).
  Akzeptiert ohne Fix: L15 (controversial-Cap 200, dokumentierte Grenze).
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

### 💡 Ideen fürs nächste Level (verbleibend, priorisiert)
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
   (`maui.comments.autoHideReports`, zweiphasig + Cascade, Meldungen bleiben
   offen); Report-„Kategorien" existierten bereits als offener reason-Katalog.

## 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🔧 Cleanup / Improvements / NITs

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

## ⏸️ Zurückgestellt — brauchen Design

- ✅ **Cross-Layer-Write (Notifications)** (2026-06-29): Core stellt jetzt `notify(event, {...})` ([core/server/utils/notify.ts](../packages/core/server/utils/notify.ts)) als Vertrag bereit (best-effort, Row-Security); comments ruft ihn statt direktem `tableId: 'notifications'`-Zugriff. Kein String-Coupling mehr (CONCEPT A14). Der `/`-Link-Teil war schon gelöst (`targetUrl` + Open-Redirect-Guard).
- ✅ **`total`-Semantik / Hide-Orphaning** (2026-06-30, gelöst): **Client** — Hide entfernt jetzt den ganzen Subtree (`removeWithDescendants` + reine, getestete `descendantIds`), keine verwaisten Replies, `rows`/`total` konsistent. **Server (Cascade-Hide, gewählt)** — `status.patch` blendet beim Ausblenden den Subtree mit aus (Thread per rootId laden → BFS → nur aktive Nachfahren), so zählt der globale `total` keine unerreichbaren non-hidden-Antworten mehr. Wiederherstellen kaskadiert bewusst nicht (nur der Parent; Antworten ggf. einzeln). Per-Nachfahre-Realtime-Events sind im Client reihenfolge-unabhängige No-ops.
- ✅ **Pro-Melder-Report-Modell** (2026-06-30, bereits gebaut als generischer `moderation`-Layer — Note war stale): `reports`-Tabelle mit `reporterId` + Unique-Index `reporter_target` (eine Meldung pro User/Target), eigener Rückzug (`index.delete` nach `reporterId` gefiltert), Status-Lifecycle, und Admin-Melder-Anzahl (`openReportsByTarget.counts` → `reportCount` in der Moderations-Queue). Das alte `'reported'`-Status-Flag am Kommentar ist entfernt (`status` = nur noch active/hidden/deleted). Übertrifft die ursprüngliche Spec (generisch statt comment-spezifisch). Einziger Rest: das akzeptierte LOW-`targetType`-Residual (s. Security-Review).
- ✅ **„Bearbeitet"-Indikator** (2026-06-29, bereits umgesetzt — Note war stale): `editedAt`-Spalte (Migration 005) wird beim Edit gesetzt ([id].patch.ts) und in CommentItem angezeigt — unabhängig von `$updatedAt`.

## 🗺️ Roadmap — bewusst ausgeklammert

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
- **Backlog**: ✅ Themes-Vollausbau (26×11) FERTIG 2026-07-24 (s. Tabelle #6); obsidian-community-concept
  (`packages/billing` ✅ 2026-07-08 als Phase 23).
  - ✅ **E2E-Tests (Playwright)** (2026-07-01): comments hat eine erste E2E-Ebene ([e2e/smoke.spec.ts](../apps/comments/e2e/smoke.spec.ts)) — auth-freie Smoke-Tests (Routing, SSR-Render, i18n, öffentliche Seiten, 404) gegen System-Chrome, `pnpm --filter comments e2e`. Eingeloggte/Realtime-Flows bleiben manuell verifiziert (passwortbasierter Login). Weitere Apps: sobald vorhanden.
- ✅ **Changelog Track 2B** (2026-07-01, deploy-bereit): Appwrite Function [functions/changelog-draft](../functions/changelog-draft) + [appwrite.json](../appwrite.config.json) — GitHub-Release-Webhook (HMAC) → Commits via Compare-API → Entwurf. Teilt die Parsing-Logik mit Track 2A (`src/parse.js`, unit-getestet). **Aktiv erst mit Prod + öffentlicher Domain** (GitHub muss den Webhook per HTTPS erreichen); bis dahin bleibt `pnpm changelog:draft` (2A) der Weg.
- **Sonstiges**: ✅ öffentliche `/changelog`-Vollhistorie-Seite existiert bereits ([changelog.vue](../packages/admin/app/pages/changelog.vue), auth-frei, alle Einträge). Offen (brauchen Input/Spec): die 10 gesammelten SaaS-Feature-Ideen (u. a. Embed-Widget) — nicht im Repo, in privaten Notizen.

---

## ✅ Bereits erledigt (Referenz)

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
- **Observability-Gate `maui.observability` (2026-07-02)**: strukturierte
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

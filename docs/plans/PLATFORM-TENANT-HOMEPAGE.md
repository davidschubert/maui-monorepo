# Platform: Tenant-Homepage (pro Tenant konfigurierbar)

> **Status:** ✅ MVP UMGESETZT (2026-07-23). pages-Layer in apps/platform
> eingehängt + gepoolt (pages-003 tenantId; Migration Pool-Projekt + studio
> Dev/Prod), platform `index.vue` rendert die `home`-Seite des Request-Tenants
> (locale-aware, `useRequestFetch` reicht den Host/Tenant an den SSR-internen
> Fetch weiter) mit Fallback; die Zeile `[[comments]]` im Body wird zum
> Kommentar-Block. Lokal bewiesen: kunde-a rendert seine Seite + Kommentare,
> kunde-b bekommt den Fallback und sieht NICHTS von kunde-a. Umsetzung der
> Entscheidungen: sicheres Markdown (kein Roh-HTML), eine Sprache genügt,
> Tenant-Theme wird geerbt, Silo nutzt dasselbe Muster.
>
> **Nachtrag (Pooling-Fix, pages-004):** Der Live-Isolationsbeweis
> (`packages/comments/scripts/verify-pool-isolation.mjs`, jetzt mit pages-Block)
> legte einen echten Pool-Bug offen — der Unique-Index `uq_slug_locale`
> (slug+locale) verbot ZWEI Tenants dieselbe `home`-Seite (der zweite `create`
> warf 409). Migration `pages-004` ersetzt ihn durch `uq_slug_locale_tenant`
> (slug+locale+tenantId); im Single-Tenant-Betrieb (tenantId '') identisches
> Verhalten. Ausgerollt auf lokalen Pool, Prod-Pool und studio Dev/Prod;
> Isolationsbeweis danach **13/13** auf lokalem UND Prod-Pool.
>
> **Offen (Folge-Etappen):** Block-Baukasten (bewusst später) · Reserved-
> `home`-Hinweis im pages-Admin (kleiner UX-Zusatz) · „wer editiert die
> Homepage pro Tenant" hängt am offenen Design „Admin-per-Tenant".
> Bezug: [HORIZONT-3-POOL-SILO-BLUEPRINT.md](HORIZONT-3-POOL-SILO-BLUEPRINT.md),
> `apps/platform`, `packages/pages` (CMS), `packages/comments` (Datenpfad).

## 1. Problem

Jeder Pool-Tenant (z. B. `demo.pukalani.app`) rendert an der Root-URL `/`
aktuell die **Template-Seite** aus `apps/_template` („New Maui app"). Für
einen echten Kunden ist das keine Startseite. Beschlossen: **jeder Kunde
bekommt eine eigene, im Dashboard konfigurierbare Homepage** — kein fixer
Standard-Inhalt, kein Code-Deploy pro Kunde.

## 2. Vorhandene Bausteine (nichts Neues nötig)

- **`packages/pages` (CMS)** liegt schon vor: Table `pages` (slug/locale/title/
  body/status/sortOrder), MEDIUMTEXT-Body (Markdown, gerendert über core
  `MarkdownContent`, kein v-html), Admin-UI `/dashboard/pages` mit WYSIWYG +
  Sprach-Reitern, öffentliches Rendern `[slug].vue`. Läuft heute in **studio**
  (Impressum/AGB/Datenschutz).
- **H3-Datenpfad** (`scopeQuery`/`scopeRow` + tenantId) ist etabliert
  (comments, reports) — dasselbe Muster trägt eine tenant-gescopte `pages`.
- **platform-App** extends bereits `admin` (Dashboard) + `core` — der pages-
  Layer müsste nur in `apps/platform` eingehängt werden (extends + Manifest).

## 3. Empfohlener Weg: pages-Layer als Homepage-Quelle

Der Kunde pflegt im Dashboard eine Seite mit dem reservierten slug `home`
(oder `index`); die platform-Root-Route rendert sie tenant-gescopt.

**Schritte (Schätzung M):**
1. `packages/pages` in `apps/platform` einhängen (extends + site.manifest +
   package.json + `pnpm check:manifests` grün).
2. pages-Tabelle in den Pool-Datenpfad: Migration `pages-00X` (tenantId +
   idx_tenant, spiegelt comments-011); alle pages-CRUD-Routen + die öffentliche
   Lese-Route auf `scopeQuery`/`scopeRow` (wie reports/comments). **Pflicht** —
   sonst sehen alle Pool-Tenants dieselben Seiten.
3. platform `app/pages/index.vue`: lädt die `home`-Page des Request-Tenants
   (locale-aware) und rendert sie über `MarkdownContent`; Fallback (kein
   `home`-Eintrag) = schlichte „Willkommen"-Seite mit Login/Widget-Hinweis.
4. Reservierter slug `home` im pages-Admin sichtbar/anlegbar machen (kleiner
   UI-Zusatz: „Diese Seite ist deine Startseite").
5. Migration Pool-Projekt + Dev; Isolationsbeweis (Tenant A ≠ Tenant B home).

## 4. Offene Fragen (vor dem Bau zu klären)

1. **Wie mächtig soll die Homepage sein?** Reines CMS-Markdown (Text, Bilder,
   Links — schnell, sicher) ODER Bausteine/Blöcke (Hero, Kommentar-Feed-Einbett,
   CTA — mächtiger, aber ein Block-Editor ist ein eigenes Projekt)? *Vorschlag:
   MVP = CMS-Markdown + optional EIN einbettbarer Kommentar-Thread-Block; Block-
   Baukasten später.*
2. **Darf der Kunde Rohes HTML/Skripte?** Nein empfohlen (XSS/Sicherheit im
   geteilten Pool) — Markdown-Subset wie im comments-Renderer. Bestätigen.
3. **Themes pro Tenant?** Das themes-System (custom_themes/fonts) ist bereits
   tenant-fähig gedacht — soll die Homepage das Tenant-Theme erben? *Vorschlag:
   ja, das Tenant-Theme greift ohnehin schon (data-theme im Head).*
4. **Mehrsprachig?** pages ist pro locale — soll die Tenant-Homepage de+en
   verlangen oder eine Sprache genügen? *Vorschlag: eine Sprache Pflicht, weitere
   optional (wie die Rechtstexte heute).*
5. **Silo-Tenants**: dieselbe Mechanik (pages im eigenen Projekt) — kein
   Sonderweg, nur ein anderes Backing-Projekt. Bestätigen.

## 5. Bewusst NICHT im MVP

- Voller Website-Baukasten / Drag-&-Drop-Blöcke (eigenes Großprojekt).
- Custom-Domains pro Tenant (kommt mit dem separaten Custom-Domain-Thema).
- Mehrseitige Kunden-Websites (Navigation/Menüs) — erst Homepage, dann ggf.
  mehr Seiten über denselben pages-Layer.

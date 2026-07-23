# Platform: Tenant-Homepage (pro Tenant konfigurierbar)

> **Status:** Konzept-Skizze (2026-07-23) — Entscheidung „pro Tenant
> konfigurierbar" ist gefallen (David), die Umsetzung ist noch NICHT gebaut.
> Dies ist die Landkarte + die offenen Fragen, damit der Bau auf Fakten steht.
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

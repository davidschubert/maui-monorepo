# M5 — Eigene Sites: media-Layer, apps/photos, apps/portfolio (Umsetzungsplan)

Stand: 2026-07-15 · Status: **in Umsetzung** (Go David) · Pakete mit Check-in.

## P1 — packages/media (der erste Manifest-geborene Feature-Layer)

Generische Medien-Galerie (Schema folgt dem realen Bedarf von
nuxt-maui-photos: title, location→subtitle, span→featured):

- **Table `media_items`** (media-001): title, subtitle, alt, fileId,
  featured, published, sortOrder · Bucket `media` (read(any); geschrieben
  wird NUR server-seitig über die manage-Route)
- **Routen** (Muster events-Cover): GET `/api/media` (öffentlich, published,
  sortiert) · POST/PATCH/DELETE mit Capability `media.manage`
  (Upload: Multipart, Magic-Bytes JPEG/PNG/WebP, Orphan-Cleanup)
- **Admin-UI** `/dashboard/media` (Modul-Registry, Gruppe design):
  Grid + Upload + Bearbeiten (title/subtitle/alt/featured) +
  Publish-Toggle + Löschen
- **Verkabelung**: feature.manifest (optional, apiPrefixes ['/api/media']),
  Registrier-Plugin, EXTENDS_ORDER + LAYER_ORDER + create-site,
  Capability in core authz
- **Verifikation live** im Vollausbau-Testgelände comments
  (bekommt media dauerhaft — passt zu seiner Rolle): Upload → öffentliche
  Liste → Feature-Toggle aus → /api/media 404
- Kein GDPR-Contributor nötig: Rows tragen bewusst KEINE User-Referenz
  (Attribution läuft übers Audit-Log der manage-Routen)

## P2 — apps/photos (Klasse-A-Site, Design aus nuxt-maui-photos)

- Scaffold via `pnpm create-site photos --skip-appwrite --features
  themes,admin,media` (Appwrite-Projekt auf der LOKALEN Haupt-Instanz legt
  David mit einem Kommando an — create-site druckt die Schritte; ich habe
  bewusst keinen Console-Zugang zu seiner Instanz)
- Design-Port: dunkles Editorial-Design (Cormorant Garamond, Galerie-Grid
  mit span-Kacheln, Seiten index/gallery/about/contact) — Galerie liest
  `/api/media` statt hartkodierter photos.ts
- Kontakt: v1 weiterhin mailto (Server-Formular = eigener Punkt)
- Verifikation: typecheck/lint/build; Runtime-Beweis nach Davids
  Appwrite-Schritt

## P3 — apps/portfolio (Neuaufbau ohne Strapi)

Eigenes Paket nach P2-Check-in — Scope-Gespräch nötig (welche Inhalte/
Seiten der alten nuxt3-davidschubert.com übernommen werden).

## Ergebnis

**P1 ✅ (2026-07-15):** media-Layer gebaut und im Testgelände comments
live bewiesen (Upload/RBAC/Entwürfe/Feature-Gate/Admin-UI) — Details im
Commit `453dda5`.

**P2 ✅ (2026-07-15):** apps/photos läuft auf Port 3003 — komplett autonom
provisioniert (Console-Provisioner-Account `provisioner@maui.local`,
Projekt `photos-qgry` auf der lokalen Haupt-Instanz, create-site
end-to-end = G1 auch lokal bestanden). Editorial-Design 1:1 portiert
(Layout `site`, Header/Footer/GalleryGrid, Seiten index/gallery/about/
contact, Cormorant Garamond, Page-Transitions); Galerie + Hero lesen den
media-Layer (3 Demo-Uploads, featured steuert Hero + breite Kachel),
Empty-States vorhanden. Site-Admin `admin@photos.local` angelegt
(Passwörter ändern!). Browser-verifiziert (Hero + Grid), typecheck/lint 0.

**Architektur-Fund dabei:** admin hatte eine unsichtbare harte Kopplung an
comments/moderation (Kommentar-Moderations-Routen + Queue-Seite nutzten
deren Verträge) — unsichtbar, weil photos die ERSTE App ohne comments ist.
Fix nach A14: die Scheibe (4 Routen + dashboard/comments.vue) zog zum
Owner comments um; API-Pfade unverändert, Queue live re-verifiziert.
Folge-Cleanup notiert: Moderations-TYPEN (ModeratedComment & Co.) liegen
noch in admin/shared (type-only-Import, build-sicher) — Eigentums-
Entwirrung bei Gelegenheit.

**P2-Polish ✅ (2026-07-17, browser-verifiziert):**
- Kontakt server-seitig: POST /api/contact (zod, Honeypot, eigener
  Mini-Rate-Limit 3/10 min pro IP, Versand über den Core-Mailer; SMTP aus
  → 503 und die Seite verweist sichtbar auf die direkte Adresse).
  Empfänger via NUXT_CONTACT_EMAIL. Mailpit-Beweis: Mail kam an.
- Font self-hosted: Google-Link raus; explizite font-family-Deklaration in
  photos.css (Registry-Muster) → @nuxt/fonts lädt Cormorant Garamond von
  /_fonts/*.woff2 inkl. generierter Fallback-Familie.
- photos.css gescopet auf body.photos-site (site-Layout setzt bodyAttrs;
  Vars auf body statt :root gegen Theme-Var-Kollisionen) — Login/Dashboard
  wieder im Plattform-Standard-Look, Site-Look unverändert.

**P3 ✅ (2026-07-17, browser-verifiziert) → M5 KOMPLETT:** apps/portfolio —
Scope-Beschluss David: **nur Landing + Cases**; Journal/Blog und pages
(Standardseiten) werden später EIGENE Feature-Layer. Provisioniert als
Dogfooding über den Studio-Job-Flow (Projekt `portfolio-g4ml`, Port 3005,
Features themes+admin, Register + Grants automatisch). Design = DNA der
alten nuxt3-davidschubert.com: Syne (self-hosted via @nuxt/fonts),
Uppercase-Hero („Digitale Markenerlebnisse", Original-de/en-Texte), dunkel
mit Glibbergreen (#A4F5B9); CSS gescopet auf body.portfolio-site (Muster
photos). Cases als typisierte Daten (app/data/cases.ts, drei echte
Projekte: Maui Platform, Comments, maui.photos) mit Detailseiten +
Next-Case-Navigation; i18n de/en; Kontakt = mailto-CTA (bewusst ohne
Server-Formular — die Site hat kein SMTP-Bedürfnis, LinkedIn/Mail reichen).
Community-Site: später entscheiden (Beschluss) — M5 gilt als komplett.

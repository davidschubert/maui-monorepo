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
- **Verifikation live** im Vollausbau-Testgelände reddit-comments
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

_(pro Paket nach Abschluss)_

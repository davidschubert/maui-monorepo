# Discussions — Produkt-Konzept (festgehalten 2026-07-27, NICHT in Bau)

Status: **eingefroren bis nach der Bilanz-Reihenfolge** (site-Layer → Pool-Vier
polieren → events → courses). Dieses Dokument konserviert Davids Entscheidungen,
damit das Konzept beim Baustart fertig auf dem Tisch liegt.

## Was es ist (Davids Worte, sinngemäß)

Ein Mittelding zwischen geführtem Forum und Reddit:

- Der **Admin legt Kategorien fest** (z. B. „maui", „gsap") — Struktur ist
  Admin-Sache, Mitglieder können KEINE Kategorien anlegen.
- **Mitglieder eröffnen Threads** innerhalb einer Kategorie.
- **Threads werden kommentiert** — über den normalen comments-Andockpunkt
  (targetType 'thread'), verdrahtet im site-Layer wie überall sonst.

Abgrenzung zu posts (Feed): Feed = ein Strom, alle posten durcheinander.
Discussions = Admin-Struktur + Threads. Beide nutzen comments darunter.

## Naming

- Kundenname: **Discussions / Diskussionen** (Landing nutzt das Wort schon).
- „Threads" vermieden (Meta-Produktname), „Forum" vermieden (klingt 2005).
- Code-Key beim Bau festlegen (Vorschlag: `discussions`); Kollision mit dem
  bisherigen Landing-Wording „Diskussionen" (dort = comments-Baustein) beim
  Baustart auflösen.

## URL-Schema (entschieden)

```
/discussions/<kategorie>                      z. B. /discussions/maui
/discussions/<kategorie>/<id>/<slug>          z. B. /discussions/maui/1v7ornq/polipoli-open-yet
```

- **Die ID ist die Wahrheit** (kurz, unveränderlich). Der Slug ist Deko für
  Menschen/SEO und wird aus dem Titel abgeleitet.
- Titel-Änderung ⇒ neuer Slug, alte Links bleiben gültig: der Server löst nur
  über die ID auf und leitet bei falschem/alten Slug per 301 auf die
  kanonische URL um (Reddit-/StackOverflow-Muster; genau dafür trägt Reddit
  die ID in der URL).

## Nicht verhandelbare Rahmenbedingungen (aus der Bilanz / Davids Prinzip)

- Konzept existiert EINMAL (eigener Layer), Komposition im site-Layer.
- Von Tag 1 durch die Datentür (`tenantDb`, tenantId, ESLint-Liste,
  Pool-Unique-Indizes mit tenantId) — kein Silo-Umweg wie bei events/courses.
- Produkt-Gate über `pukalani.tenancy.products` (Tarif-Zuordnung entscheidet David
  beim Baustart); An/Aus-Schalter im Dashboard als **USwitch** (nicht Checkbox).
- Nur Erscheinung ist mandanten-variabel (Theme/Schrift), Verhalten nie.

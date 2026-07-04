# Themes v2 — Konzept

Status: Entwurf (2026-07-02) · Baut auf der bestehenden Themes-Umsetzung auf
(Theme-Studio, OKLCH-Ramp-Generator, Built-in-Verwaltung — Commits a244b8d…546755b).

Referenzen (Leitplanken, nicht Kopiervorlagen):

- **uicolors.app** — Ramp aus einer Hex-Farbe, realistische Preview-Szenen
  (Cards, Dashboards, Charts, Branding), Brand-getönte Neutral-Skalen,
  Font-Pairing, Zufallsfarbe, Contrast-Checker
- **daisyui.com/theme-generator** — vollständiges semantisches Token-Set
  (base-100/200/300 + content-Paare, primary/secondary/accent, Status-Farben),
  Nicht-Farb-Tokens (Radius je Komponentenklasse, Border, Depth/Noise),
  Dock-Layout: Kontrollpanel links, Live-Komponenten rechts, Random-Button
- **tints.dev** — Generator-Parameter (Anker-Stufe, Hue-Shift, Saturation,
  Lightness Min/Max, linear/perceived) **mit Kurven-Visualisierung** (L/C/H-Graphen),
  Export in oklch/hex/hsl, URL-teilbarer Zustand

---

## 1. Diagnose: Was ist gut, was fehlt

### Bereits stark (behalten, nicht anfassen)

- **Ramp-Generator** (`packages/themes/shared/ramp.ts` + `oklch.ts`):
  funktional deckungsgleich mit tints.dev — Anker-Stufe mit Taper,
  L/C-Kurven auf Tailwind v4 kalibriert, Hue-Drift, Gamut-Clipping,
  30+ Tests. Die Mathematik ist fertig.
- **Runtime-Architektur**: SSR-Head-Rendering ohne Flash, Cookie-Persistenz,
  Fallback-Kette (Cookie → Instanz-Default → Core-Default), Built-in-Overrides,
  Varianten. Bleibt unverändert.
- **Server-API + RBAC**: CRUD über `system.manage`, öffentlicher
  `GET /api/themes`, defensive JSON-Parses. Bleibt; wird nur um neue
  Config-Felder erweitert.

### Lücken gegenüber den Referenzen

| # | Lücke | Referenz |
|---|-------|----------|
| L1 | Editor ist ein **Modal** — beengt, Preview konkurriert mit der Galerie | daisyUI/uicolors: Vollseiten-Werkzeug mit Dock-Layout |
| L2 | Preview ist ein generischer Komponenten-Showcase, keine **realistischen Szenen** | uicolors: Dashboard, Cards, Charts, Marketing |
| L3 | Nur **Primary** ist gestaltbar; Secondary/Status-Farben fix | daisyUI: volles semantisches Set |
| L4 | **Neutral** ist eine 9er-Auswahl, nicht generierbar — kein Brand-Tint in den Flächen | uicolors: „Neutral-Skalen" aus der Brand-Farbe; daisyUI: base-100/200/300 frei |
| L5 | Generator-Regler ohne **Kurven-Visualisierung** — Wirkung von Hue-Shift/Saturation ist abstrakt | tints.dev: L/C/H-Graphen |
| L6 | Kein **Zufalls-Theme** / spielerischer Einstieg | daisyUI „Random CSS", uicolors Leertaste |
| L7 | Export nur CSS; kein **JSON-Import/Export** (Theme zwischen Instanzen mitnehmen) | tints.dev URL-Schema, daisyUI Save/Share |
| L8 | Dark-Mode nur über den 600→400-Schwenk, kein Feintuning pro Theme | daisyUI: eigenständige Dark-Themes |

---

## 2. Leitidee

> **Ein Theme entsteht aus drei Entscheidungen: Name, Farbe, fertig.**
> Alles Weitere ist optional und sitzt hinter genau einem „Erweitert" —
> zugeklappt, mit guten Defaults, ignorierbar.

**Einfachheit ist das oberste Gestaltungsprinzip** (explizite Vorgabe):

1. **Standardansicht = 3 Entscheidungen.** Name, Primary-Farbe (Picker,
   Presets, Zufall), optional der eine Schalter „Flächen leicht einfärben"
   (Tinted Neutral). Mehr Controls sind im Default nicht sichtbar.
2. **Ein einziges „Erweitert",** nicht viele Sektionen. Darin: Kurven-Regler,
   Radius, Dark-Stufe, Varianten. Zugeklappt; wer es nie öffnet, verliert
   nichts — die Defaults sind die getesteten Werte von heute.
3. **Kein Regler ohne sichtbare Wirkung.** Jeder Regler, dessen Effekt man in
   der Preview nicht sofort sieht, fliegt raus oder wandert nach „Erweitert".
4. **Kein Slot-Zoo.** Das daisyUI-Vollset (Secondary, Accent, Status-Farben
   einzeln) wird NICHT in den Editor geholt — es bleibt Zukunftsoption
   (Abschnitt 3.1), falls ein realer Bedarf auftaucht.

Unser Vorteil bleibt der Ramp-Generator: Aus einer Hex-Farbe entsteht eine
volle 50–950-Ramp, Kontrastfarben ergeben sich aus der Ramp statt aus
weiteren Pickern. daisyUI liefert nur das Prinzip „Flächen gehören zum
Theme"; die Umsetzung bleibt Ramp-basiert, Nuxt-UI-nativ und minimal.

---

## 3. Token-Modell v2

### 3.1 Farb-Slots: bewusst nur zwei

Ein Theme v2 kennt genau **Primary** (wie bisher) und **Neutral** (3.2).
Das war's.

```ts
interface ThemeColorsV2 {
  primary: string                    // Hex — wie bisher, Pflicht
  neutral?: NeutralChoice            // Auswahl ODER brand-getönt (3.2)
}
```

Das daisyUI-Vollset (secondary, accent, info/success/warning/error je eigene
Farbe) wird **nicht umgesetzt** — es widerspricht der Einfachheits-Vorgabe
und die Nuxt-UI-Defaults für Status-Farben sind gut. Das Schema ist mit dem
`version`-Feld so angelegt, dass weitere Slots später ergänzt werden könnten,
ohne das Modell zu brechen — aber erst bei nachgewiesenem Bedarf, nicht auf
Vorrat.

### 3.2 Neutral: von der Auswahl zur generierten Ramp (der größte Hebel)

Der sichtbarste Qualitätsunterschied „professioneller" Themes sind
**brand-getönte Flächen** — Hintergründe, Borders und Text tragen einen Hauch
der Markenfarbe statt reinem Grau (uicolors macht genau das; daisyUIs
`base-100/200/300` sind dasselbe in manuell).

```ts
type NeutralChoice =
  | { kind: 'registry', id: string }   // wie bisher: slate, zinc, …
  | { kind: 'tinted' }                 // NEU: aus der Primary abgeleitet
```

- Im Editor ist das **ein Schalter** („Flächen leicht einfärben"), kein
  Regler-Set: `tinted` leitet die Neutral-Ramp aus dem Primary-Hue mit einem
  fixen, gut gewählten Chroma (~0.015) ab. Kein Hue-Override, kein
  Tint-Regler — wer den Effekt nicht mag, schaltet ihn ab oder wählt wie
  bisher eine Registry-Palette.
- Implementierung: derselbe Generator mit fixer, flacher Chroma-Kurve —
  eine kleine Erweiterung in `ramp.ts`, kein neues Modul.
- Rendering über den bestehenden `data-neutral`-Mechanismus: generierte
  Neutrals bekommen `data-neutral="c-<themeId>"` und landen im selben
  injizierten `<style>`-Block wie die Custom-Theme-Ramps.
- **Kein** eigenes `base-100/200/300`-Slot-Trio wie daisyUI: Nuxt UI leitet
  `--ui-bg`, `--ui-bg-elevated`, `--ui-border`, `--ui-text` bereits aus der
  Neutral-Ramp ab. Wir tauschen die Quelle, nicht das System.

### 3.3 Nicht-Farb-Tokens

- **Radius**: bleibt ein einzelner `--ui-radius` (existiert). daisyUIs
  Dreiteilung (selector/field/box) wird **abgelehnt** — Nuxt UI kennt nur einen
  Radius-Token; eine Dreiteilung hieße, gegen das Framework zu arbeiten.
- **Typografie**: kuratierte Schriftpaare, ein Dropdown — siehe 3.5.
- **Depth/Noise-Effekte** (daisyUI): **abgelehnt.** daisyUI-spezifische
  Komponenteneffekte ohne Gegenstück in Nuxt UI; reine Gimmicks für uns.

### 3.4 Dark-Mode-Feintuning

Appearance (light/dark/system) bleibt **orthogonal** zum Theme — daisyUIs
„Theme ist dark" (wie das dekodierte `aqua`) wird nicht übernommen, das würde
unsere getrennte Appearance-Einstellung kannibalisieren. Stattdessen minimal:

```ts
interface RampConfigV2 extends RampConfig {
  darkAlias?: 300 | 400 | 500        // Default 400 (Status quo)
}
```

Ein Regler „Dark-Stufe" pro Slot statt einer zweiten Ramp. Deckt 90 % des
Bedarfs (Primary wirkt im Dark-Mode zu grell/zu matt) mit einem Feld ab.
Volle Dark-Ramp-Overrides: bewusst **später**, erst wenn der eine Regler
nachweislich nicht reicht.

### 3.5 Typografie: kuratierte Schriftpaare (EIN Dropdown)

**Wie Nuxt UI Fonts behandelt** (Doku „Integrations → Fonts"): Nuxt UI
registriert automatisch `@nuxt/fonts`. Jede Schrift, die im CSS als
Tailwind-v4-Theme-Variable deklariert ist (`@theme { --font-sans: 'Public
Sans', sans-serif }`), wird beim **Build** automatisch geladen, self-hosted
und optimiert — kein Setup, kein Google-CDN zur Laufzeit (GDPR-freundlich).

**Konsequenz**: Frei wählbare Fonts aus der DB gehen nicht (der Build kennt
sie nicht). Kuratierte, im CSS deklarierte Fonts gehen perfekt — und der
Browser lädt ohnehin nur die Font-Dateien, deren `font-family` tatsächlich
auf der Seite verwendet wird. Eine kuratierte Liste kostet also nichts extra.

**Modell — maximal 3 Schriften pro Seite** (Vorgabe):

1. **Text-Schrift** (sans, alles)
2. **Überschriften-Schrift** (optional abweichend)
3. **Mono** (Code) — fix, nicht Teil des Themes

Im Editor ist das **ein einziges Dropdown „Schrift"** mit ~6 kuratierten
Paaren (Text + Überschrift zusammen gewählt, wie uicolors) — keine zwei
Picker, keine freie Font-Suche:

| Paar (Beispiel-Kuratierung) | Text | Überschriften |
|---|---|---|
| Standard | (aktueller App-Font) | = Text |
| Inter | Inter | Inter |
| Humanist | Source Sans 3 | Source Sans 3 |
| Editorial | Source Sans 3 | Source Serif 4 |
| Geometrisch | Nunito Sans | Sora |
| Klassisch | PT Sans | PT Serif |

**Umsetzung** (klein, kein neues System):

- `FONT_PAIR_REGISTRY` im Themes-Layer (analog `NEUTRAL_REGISTRY`), dazu eine
  statische CSS-Datei `public/themes/fonts.css`:
  `:root[data-font='editorial'] { --font-sans: 'Source Sans 3', …;
  --font-heading: 'Source Serif 4', …; }` + eine Regel, die
  `--font-heading` auf `h1–h6`/Prose anwendet (Default: `--font-sans`).
- Die Familien werden einmal in einer vom Build gesehenen CSS-Deklaration
  referenziert, damit `@nuxt/fonts` sie self-hosted bereitstellt.
- `data-font` läuft über denselben Mechanismus wie `data-theme`/`data-neutral`
  (SSR-Head, kein Flash); Persistenz im `config`-JSON: `font?: string`.
- Editor: Dropdown in der **Standardansicht** (vierte Entscheidung, aber eine
  simple — ein Select mit Vorschau im jeweiligen Font), Default „Standard"
  ändert nichts.
- **Abgelehnt**: freie Font-Eingabe, getrennte Text-/Heading-Picker,
  Font-Upload — alles Komplexität ohne proportionalen Nutzen.

---

## 4. Studio v2 — vom Modal zum Werkzeug

### 4.1 Struktur

```
/dashboard/themes            Galerie (bleibt): Karten, Default, Built-ins, Sortierung
/dashboard/themes/new        Studio-Editor, Vollseite
/dashboard/themes/[id]       Studio-Editor für bestehendes Custom Theme
```

Das Editor-Modal in `themes.vue` entfällt. Der Editor wird eine eigene Seite
im daisyUI-Dock-Layout:

```
┌────────────┬──────────────────────────────────────┐
│  Dock      │  Preview (scrollt unabhängig)        │
│  (~360px)  │                                      │
│            │  Tabs: Komponenten · Dashboard ·     │
│  Name      │        Content                       │
│  Farbe     │                                      │
│  Presets/🎲│  Szene rendert unter data-theme=     │
│  ☐ Flächen │  'c-draft' — Live wie bisher         │
│    einfärben│                                     │
│            │  Footer: Kontrast-Ampel (WCAG-Badges │
│  ▸ Erweitert│  der kritischen Paare, wie bisher)  │
└────────────┴──────────────────────────────────────┘
```

Die bestehende Draft-Mechanik (`data-theme='c-draft'`, injiziertes
`<style>`, Cleanup bei Verlassen) wird 1:1 übernommen — nur der Rahmen
wechselt vom Modal zur Route (+ Guard bei ungespeicherten Änderungen).

### 4.2 Dock: Standard + ein „Erweitert"

**Standard (immer sichtbar, mehr nicht):**

1. Name
2. Primary-Farbe: Picker + Hex, Presets, **Zufalls-Button** (Würfel-Icon +
   Leertaste wie uicolors — billig, hoher Spielwert, senkt die Einstiegshürde)
3. Schalter **„Flächen leicht einfärben"** (Tinted Neutral, 3.2) mit
   Mini-Streifen als Sofort-Feedback
4. Dropdown **„Schrift"** (kuratierte Paare, 3.5), Default „Standard"

**„Erweitert" (EIN Accordion, zugeklappt, gute Defaults):**

5. Neutral-Palette (Registry-Auswahl, falls der Schalter aus ist)
6. Kurven-Regler (Anker, Hue-Shift, Saturation, Lightness Min/Max, Modus)
   mit **Kurven-Graph** (4.3)
7. Radius (bestehende Buttons)
8. Dark-Stufe (`darkAlias`)
9. Varianten (wie bisher, bis 6)

Kein eigener Dark-Preview-Toggle an der Szene (in Paket 3 gebaut, nach
Review bewusst wieder entfernt): Hell/Dunkel folgt dem App-Modus über den
vorhandenen Erscheinungsbild-Umschalter — ein Schalter weniger.

### 4.3 Kurven-Visualisierung (tints.dev-Prinzip)

Nur innerhalb von „Erweitert", direkt unter den Reglern: ein kompaktes
SVG-Panel (rein aus `generateRamp()`-Output berechnet, kein neues Modul) mit
drei Mini-Graphen **L / C / H über die 11 Stufen**, Anker-Stufe markiert,
live mit den Reglern. Damit wird sichtbar, *was* Hue-Shift und Saturation
tun — heute muss man es aus den Farbfeldern erraten. Wer „Erweitert" nie
öffnet, sieht die Graphen nie — richtig so.

### 4.4 Preview-Szenen (uicolors-Prinzip)

Statt eines einzigen Showcase-Grids **drei** Tabs mit realistischen Szenen —
alle aus Nuxt-UI-Komponenten, i18n-Keys, keine Screenshots:

- **Komponenten** — der bestehende Showcase (Regression-Wert behalten)
- **Dashboard** — Sidebar-Ausschnitt, Stat-Cards, Tabelle, Badges (nutzt
  Primary + Neutral-Flächen intensiv → zeigt den Tinted-Neutral-Effekt)
- **Content** — Hero, Prose, Card-Grid, Formular mit Fehlerzustand

Eine vierte Charts-Szene (Ramp als Datenpalette) ist nette Kür für später —
drei Tabs reichen, um jede Editor-Entscheidung sichtbar zu machen.

Die Szenen sind eigene Komponenten unter
`packages/themes/app/components/studio/scenes/` und werden vom Styleguide
mitverwendet (eine Quelle für visuelle Regression, kein Duplikat).

### 4.5 Import/Export

- **CSS-Export**: bleibt (bestehende Funktion).
- **JSON-Export/Import** (neu): Theme als JSON-Datei (name, colors, config,
  variants, Schema-`version`-Feld). Import validiert mit demselben
  Zod-Schema wie `POST /api/admin/themes`. Deckt „Theme auf andere Instanz
  mitnehmen" ab — bewusst **statt** tints.devs URL-Encoding: unsere Themes
  leben in der DB, ein URL-Schema wäre ein zweiter Persistenz-Pfad.

---

## 5. Datenmodell & API (minimal-invasiv)

- **Keine neue Table.** `custom_themes.config` (JSON) trägt v2:

  ```json
  {
    "version": 2,
    "ramp": { "anchor": "auto", "hueShift": 0, "saturation": 1,
              "lightnessMax": 97, "lightnessMin": 16, "darkAlias": 400 },
    "neutral": { "kind": "tinted" },
    "font": "editorial",
    "radius": 0.375
  }
  ```

  Ohne `version`-Feld ⇒ v1 (flache RampConfig, nur Primary) — der Parser in
  `themes.get.ts`/`ramp.ts` behandelt beide, bestehende Rows bleiben gültig.
  Migration nur als neue Migrationsdatei, falls Spaltengrößen (config-Länge)
  angepasst werden müssen; idempotent über den zentralen Runner
  (`pnpm migrate --app <app>`).
- **API**: Zod-Schemas der Admin-Routen um `version`/`neutral`/`darkAlias`
  erweitern; Routen selbst unverändert. `GET /api/themes` liefert config
  weiterhin durch.
- **CSS-Budget**: unkritisch — pro Theme kommt höchstens eine zweite Ramp
  (Tinted Neutral) hinzu; gerendert wird nur, was gesetzt ist.

---

## 6. Phasenplan

**Phase A — Studio-UX (sichtbarster Gewinn, kein Datenmodell angefasst)**
1. Editor-Modal → Vollseiten-Route: Standard-Dock (Name, Farbe, Presets,
   Zufall) + ein „Erweitert" mit den *bestehenden* Reglern (4.1, 4.2)
2. Preview-Szenen als Tabs (Komponenten, Dashboard, Content), Styleguide
   konsumiert dieselben Szenen (4.4)
3. Kurven-Visualisierung in „Erweitert" (4.3)

**Phase B — Tinted Neutral, Schriftpaare, Dark-Stufe**
4. `config`-Schema v2 + Parser (v1-kompatibel), Zod-Erweiterung
5. Schalter „Flächen leicht einfärben" (3.2)
6. Schriftpaar-Registry + `fonts.css` + Dropdown (3.5)
7. `darkAlias` (3.4)

**Phase C — Kür (nur bei Bedarf)**
8. JSON-Import/Export (4.5)
9. Charts-Szene; ggf. weitere Farb-Slots, falls real vermisst (3.1)

Jede Phase endet grün (lint/typecheck/vitest) und mit README-Update.
Ramp-Tests werden in Phase B um Tinted-Neutral-Fälle erweitert.

---

## 7. Bewusste Entscheidungen (Leitplanken-Abgleich)

| Idee aus Referenz | Entscheidung | Begründung |
|---|---|---|
| Dock-Layout, Vollseiten-Editor (daisyUI) | **(a) bauen** | Modal ist die größte UX-Schwäche |
| Realistische Preview-Szenen (uicolors) | **(a) bauen** | Theme-Wirkung wird erst im Kontext beurteilbar |
| Kurven-Graphen (tints.dev) | **(a) bauen** | Macht vorhandene Regler erst verständlich |
| Zufalls-Theme (daisyUI/uicolors) | **(a) bauen** | Billig, hoher Spielwert |
| Volles semantisches Token-Set (daisyUI) | **(c) später / (d)** | Widerspricht der Einfachheits-Vorgabe; Nuxt-UI-Status-Defaults sind gut. Schema lässt Erweiterung offen |
| `base-100/200/300`-Flächen (daisyUI) | **(b) Prinzip** | Als EIN Schalter „Flächen leicht einfärben" (Tinted Neutral) statt drei Picker |
| Theme trägt eigenen Color-Scheme (daisyUI `aqua`) | **(d) ablehnen** | Kollidiert mit orthogonaler Appearance; stattdessen `darkAlias` |
| Radius dreigeteilt, Border, Depth/Noise (daisyUI) | **(d) ablehnen** | Kein Gegenstück in Nuxt UI; gegen das Framework |
| Font-Pairing (uicolors) | **(b) Prinzip** | Kuratierte Paare als EIN Dropdown; `@nuxt/fonts` self-hostet build-bekannte Fonts automatisch — freie Font-Wahl abgelehnt |
| URL-teilbarer Zustand (tints.dev) | **(b) Prinzip** | Als JSON-Import/Export statt zweitem Persistenz-Pfad |
| Volle Dark-Ramp pro Theme | **(c) später** | Erst wenn `darkAlias` nachweislich nicht reicht |

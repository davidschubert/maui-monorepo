# Plan: Themes-Vollausbau (26×11)

Stand: 2026-07-24 · Status: **✅ UMGESETZT** · Backlog-Referenz:
[GOALS.md → Backlog](../GOALS.md) und [OPEN-ITEMS.md](../OPEN-ITEMS.md).

> **Umsetzung (2026-07-24, Entscheidungen E1–E7 vom 2026-07-23):**
> Kuratierter Katalog [`theme.catalog.ts`](../../packages/themes/theme.catalog.ts)
> — 26 Farbwelten (E1b: default zählt nicht): 21 chromatische über den
> oklch-Hue-Kreis (~17°-Raster, kuratiert benannt: Crimson→Coral→Sunset→…→
> Flamingo) + 5 gedeckte Ausreißer (Graphite, Espresso, Sage, Plum, Steel);
> je Basis + 10 Varianten (E2a) über ein einheitliches tonales Schema
> (soft/muted/vivid/deep/bright/warm/cool/dawn/dusk/pastel; ocean/forest/
> sunset behalten ihre 2 Bestands-Varianten, graphite hat Material-Tönungen).
> **Abnahme-Entscheidung Anker:** Basis fest auf Stufe 500 (RAMP_CONFIG in
> themeGen.ts) statt Auto-Anker — der Auto-Anker verschob helle Basen sichtbar
> (sunset 500: #f47e2a→#a64d00, abgelehnt); mit Anker 500 bleiben alle
> Bestands-500er byte-gleich und `--ui-primary` überall 600/400. Kontrast-Gate
> verschiebt selbst (citrus/bright 600→700, plum/deep 400→300 u. a.).
> Registry: `themeRegistry.gen.ts` committet, `THEME_REGISTRY` = default +
> GENERATED_THEMES (E6a); CI-Gate `pnpm --filter @maui/themes check:themes`
> in lint.yml (Regenerieren darf kein Diff erzeugen; byte-genau verifiziert).
> Picker: `ThemePickerModal` (E7b) — Swatch-Grid + sticky Varianten-Reihe,
> DisplaySettingsMenu zeigt die aktive Wahl und öffnet das Modal. Bewiesen:
> 62 Unit-Tests + 4 Guard-Tests (26×11, IDs unique, Dateien existieren,
> Farben distinkt), SSR-Beweis (Cookie→data-theme+CSS-Link, ungültig→Default),
> Visual-Baselines 9/9 neu + grün, Dark-Stichprobe neue Themes.

---

## 1. Was bedeutet „26×11"? (verifiziert)

Die Zahl ist an drei Stellen belegt und meint überall dasselbe:

| Quelle | Wortlaut |
| --- | --- |
| `docs/CONCEPT.md` (Zeile 109) | „Das Multi-Theme-System (**26 Themes × 11 Farbvariationen**, Cookie-Persistenz)" |
| `docs/GOALS.md` (Phase 15 + Backlog) | „Eckdaten: **26 Themes × 11 Farbvariationen**, useTheme + Cookie, CSS pro Theme, dynamischer Import" |
| Obsidian-Notiz `design-system.md` | „**26 Custom Themes** · **11 Farbvariationen pro Theme** · useTheme Composable mit Cookie-Persistenz" |

**Bedeutung: 26 Themes, jedes mit 11 wählbaren Farbvariationen** — also
26 kuratierte „Farbwelten" (Ocean, Forest, Sunset, …), die je 11 Primary-
Farbstellungen anbieten. Im heutigen Code-Modell: pro Theme eine Basis-
Primary-Ramp plus `data-variant`-Overrides.

Zwei Detail-Interpretationen sind möglich (die Quellen legen es nicht fest):

- **(a) 11 = Basis + 10 Varianten** — die Basis-Farbe zählt als eine der 11
  Variationen; pro Theme werden 10 `data-variant`-Blöcke generiert.
- **(b) 11 = 11 zusätzliche Varianten** — pro Theme 12 wählbare Stellungen
  (Basis + 11).

**Empfehlung: (a).** Sie passt zur heutigen UX (der Varianten-Untermenü-Eintrag
„Standard" ist bereits die erste Auswahl), hält die Menüs eine Position
kürzer und liest „11 Farbvariationen pro Theme" wörtlich als „11 wählbare
Farbstellungen". Ergebnis: **26 × 11 = 286 Primary-Ramps** (26 Basis +
260 Varianten).

_Nicht_ gemeint ist mit „11" die Anzahl der Farbstufen einer Ramp — die
Ramps haben zwar zufällig ebenfalls 11 Stufen (50–950, Tailwind-Konvention),
aber alle drei Quellen sprechen ausdrücklich von „Farbvariationen pro Theme".
Die Neutral-Paletten (`data-neutral`) sind eine **separate, unabhängige
Achse** und zählen nicht in die Matrix (siehe offene Entscheidung E3).

---

## 2. Ist-Stand (Phase 15, abgeschlossen 2026-06-10)

### 2.1 Vorhandene Themes und Paletten

`packages/themes/app/utils/themeRegistry.ts`:

- **9 Themes** in `THEME_REGISTRY`:
  - `default` („Maui", `file: null` — Core-Default, monochrom, keine eigene CSS)
  - `ocean`, `forest`, `sunset` — handkuratiert (Hex), **je 2 Varianten**
    (teal/indigo, lime/moss, rose/violet)
  - `midnight`, `berry`, `crimson`, `citrus`, `graphite` — aus Tailwind-v4-
    oklch-Paletten generiert, **0 Varianten**
- **9 Neutral-Paletten** in `NEUTRAL_REGISTRY` (`neutral`, `slate`, `gray`,
  `zinc`, `stone`, `mist`, `taupe`, `mauve`, `olive`; Default `mist`) —
  unabhängige Achse, alle in einer immer geladenen `neutral.css`.

Varianten-Füllstand heute: 3 Themes × 2 + 5 Themes × 0 = **6 von 260** Ziel-
Varianten; Themes: **9 von 26** (falls `default` mitzählt, siehe E1).

### 2.2 Token-Modell (was ein Theme definiert)

Jede Theme-CSS (`packages/themes/public/themes/<id>.css`, statisch
generiert und committet, **keine Runtime-Generierung**) setzt pro Block:

| Token | Anzahl | Zweck |
| --- | --- | --- |
| `--ui-color-primary-{50…950}` | 11 Stufen | Primary-Ramp (überschreibt Nuxt-UI-Ramp) |
| `--ui-primary` | 1 (light) + 1 (dark) | aktiver Primary-Ton: `-600` light, `-400` dark |
| `--ui-radius` | 1 | Radius (bisher überall `0.375rem`) |

Varianten sind `[data-theme='x'][data-variant='y']`-Blöcke, die **nur die
Primary-Ramp** (11 Stufen) überschreiben. `neutral.css` definiert analog
`--ui-color-neutral-{50…950}` je `data-neutral`-Palette; alle semantischen
Nuxt-UI-Tokens (`--ui-bg`, `--ui-text-muted`, `--ui-border`, …) hängen per
`var()` daran und folgen automatisch — in Light und Dark.

### 2.3 Infrastruktur (Registry, Auswahl, Persistenz)

- **Registry**: typisierte `THEME_REGISTRY: MauiTheme[]` (`id`, `name`,
  `file`, `color` = primary-500 für den Swatch-Punkt, `variants[]`) —
  aktuell **handgepflegt**, muss zu jeder CSS-Datei passen.
- **Auswahl/Persistenz**: `useTheme()` (`app/composables/useTheme.ts`) —
  drei Cookies (`maui-theme`, `maui-theme-variant`, `maui-neutral`, 1 Jahr,
  `sameSite: lax`), Werte werden gegen die Registry validiert, ungültige
  fallen still auf den Default zurück. Theme-Wechsel resettet die Variante.
- **Anwendung**: universelles Plugin (`app/plugins/theme.ts`) schreibt
  `data-theme`/`data-variant`/`data-neutral` + den **einen** Stylesheet-Link
  des aktiven Themes in den SSR-Head → kein Theme-Flash, es wird nur die
  eine CSS-Datei geladen (`neutral.css` immer).
- **UI**: `DisplaySettingsMenu.vue` — UDropdownMenu mit Sektionen Theme
  (Themes als Checkbox-Items, Varianten als Untermenü mit „Standard" +
  Varianten), Neutral, Erscheinungsbild (light/dark/system), Sprache.
  Swatch-Punkte über `color`-Felder der Registry.
- **Demo/QA-Seite**: `app/pages/styleguide.vue` — Nuxt-UI-Komponenten in
  allen Zuständen + Live-Panel mit echter Primary-/Neutral-Ramp + Radius.
- **Core-Default**: `packages/core/app/app.config.ts` → `ui.colors`
  (`primary: 'sky'`, `neutral: 'mist'`); das Maui-Default-Theme ist
  monochrom. Core bleibt themes-frei (Layer-Matrix CONCEPT A14: themes
  besitzt Tokens/CSS/Switcher, kein Appwrite, keine Business-Logik).
- **App-Einbindung**: `apps/comments/nuxt.config.ts` →
  `extends: ['../../packages/themes', …, '../../packages/core', …]`
  (früher gelistet = höhere Priorität). Apps ohne themes-Layer (z.B.
  core/.playground) ignorieren die Cookies einfach.
- **i18n**: `packages/themes/i18n/locales/{de,en}.json` (`themes.*`-Keys);
  Theme-/Varianten-Namen sind Eigennamen (nicht übersetzt).

### 2.4 Lücke: Generator-Script fehlt im Repo

GOALS.md Phase 15 sagt „generiert via Script, committet" — die CSS-Outputs
sind committet, **das Script selbst existiert nicht im Repo** (weder
`scripts/` noch `packages/themes/scripts/`, auch nicht in der Git-Historie).
Für 286 Ramps ist ein committetes, reproduzierbares Generator-Script die
Grundvoraussetzung; es muss (wieder) gebaut werden.

---

## 3. Ziel-Zustand

1. **26 Themes** in der Registry, jedes mit **11 Farbvariationen**
   (Basis + 10 `data-variant`-Overrides, Empfehlung 1a) → 286 Primary-Ramps.
2. **Eine Quelle der Wahrheit**: eine Design-Spezifikation
   (`themes.config.ts` o.ä.) mit Basisfarben je Theme/Variante; daraus
   generiert ein committetes Script deterministisch (a) alle
   `public/themes/*.css` und (b) die Registry-Daten (statt Handpflege).
3. **Qualität garantiert per Generator**: jede Ramp oklch-basiert mit
   konsistenten Helligkeitsstufen (Tailwind-v4-Kurve), automatischer
   WCAG-Kontrast-Check für die kritischen Token-Paare in Light und Dark —
   der Generator schlägt fehl statt schlechte Themes zu committen.
4. **Skalierende Auswahl-UX**: der Theme-Picker funktioniert mit 26 Themes ×
   11 Varianten (das heutige Dropdown skaliert nicht auf 286 Einträge).
5. **Unverändert bleiben**: Cookie-Persistenz + SSR-Head-Mechanik (kein
   Flash), „nur die eine aktive CSS-Datei laden", Neutral-Achse, Layer-
   Grenzen (keine Appwrite-Abhängigkeit, keine Runtime-CSS-Generierung),
   Verhalten von Apps ohne themes-Layer.

---

## 4. Token-Matrix-Design

### 4.1 Die Matrix

```
                     Variation 0 (Basis)   Variation 1 … 10 (data-variant)
Theme 1  (ocean)     Primary-Ramp 11st.    je Primary-Ramp 11 Stufen
Theme 2  (forest)    …                     …
⋮
Theme 26             …                     …
```

- **Zeile** = Theme: definiert Basis-Ramp, `--ui-primary` (light `-600` /
  dark `-400`), `--ui-radius`, künftig optional weitere Theme-Charakter-
  Token (siehe E5).
- **Spalte** = Variation: überschreibt ausschließlich die Primary-Ramp
  (11 Stufen) via `[data-theme][data-variant]` — bewährtes Muster aus
  ocean/forest/sunset beibehalten.
- **Orthogonal, nicht Teil der Matrix**: `data-neutral` (9 Paletten),
  Color-Mode (light/dark/system), Sprache.

### 4.2 Design-Spezifikation als Input (neu)

```ts
// packages/themes/theme.spec.ts (Arbeitstitel; NICHT in app/ — Build-Input)
interface ThemeSpec {
  id: string            // 'ocean'
  name: string          // 'Ocean'
  base: string          // Basisfarbe (oklch oder Hex) → Ramp wird generiert
  variants: { id: string, base: string }[]  // exakt 10
  radius?: string       // Default '0.375rem'
}
```

Der Generator erzeugt daraus:
- `public/themes/<id>.css` — Basis-Block + 10 Varianten-Blöcke
  (Format identisch zu heute: `:root[data-theme]`, `.dark[data-theme]`,
  `:root[data-theme][data-variant]`),
- `app/utils/themeRegistry.gen.ts` — `THEME_REGISTRY` mit `color`-Feldern
  (primary-500) aus den generierten Ramps (Chip-Punkte stimmen immer).

Ramp-Erzeugung: Basisfarbe nach oklch konvertieren, auf die 11 Tailwind-v4-
Helligkeits-/Chroma-Stützstellen der nächstliegenden Referenzpalette mappen
(Hue beibehalten, L/C interpolieren). Deterministisch, keine Runtime-Kosten.

### 4.3 Größenabschätzung

Eine Theme-CSS mit 11 Blöcken ≈ 11 × ~15 Zeilen ≈ 6–9 KB unkomprimiert
(< 2 KB gzip) — unkritisch, da weiterhin nur die aktive Datei geladen wird.
286 Ramps × 11 Stufen = 3 146 Farbwerte: **nur automatisiert beherrschbar**,
Handpflege scheidet aus.

---

## 5. Arbeitsschritte (Todo-Liste)

Schätzung: **S** ≤ ½ Tag · **M** ≈ 1 Tag · **L** ≈ 2–3 Tage.

1. **[S] Entscheidungen E1–E5 fixieren** (Abschnitt 7) — insbesondere
   Zählweise (Basis+10), zählt `default` zu den 26, Varianten-Semantik.
   Ergebnis in dieser Datei + CONCEPT.md nachziehen.
2. **[M] Theme-Katalog kuratieren**: Liste der 26 Themes (Namen + Basis-
   Farbwert) und je 10 Varianten-Farben festlegen. Bestehende 9 Themes
   übernehmen (ocean/forest/sunset-Varianten als erste 2 von 10 behalten),
   17 neue Farbwelten definieren (z.B. über den oklch-Hue-Kreis verteilt +
   kuratierte Ausreißer wie graphite). Als `theme.spec.ts` anlegen.
3. **[L] Generator-Script bauen** — **VORARBEIT ✅ (2026-07-11, ohne Katalog):**
   Logik pure/testbar in `shared/themeGen.ts` (Ramps via bestehendem
   `generateRamp`, Kontrast-Gate ≥3:1 aus Schritt 4 integriert, Stufen-Shift
   statt schlechtem Theme), CLI `scripts/generate-themes.ts` (Runner jiti,
   `pnpm --filter @maui/themes generate`), Input `theme.catalog.ts` (statt
   theme.spec.ts — *.spec.ts kollidiert mit Vitest) mit den 9 Bestands-Themes
   als PLATZHALTER, Output nach `.generated/` (Vorschau; `--write` erst nach
   visueller Abnahme — die vereinheitlichte Anker-Kurve verschiebt z. B.
   oceans 500er von #2f7fee auf #0565d5, bewusst abzunehmen). 8 Unit-Tests
   (Determinismus byte-gleich verifiziert, Format, Gate-Invariante).
   OFFEN aus dem ursprünglichen Schritt: Abnahme + `--write`-Übernahme.
   (Ursprünglicher Text: `packages/themes/scripts/generate-themes.mjs`,
   Node 22, keine neuen Runtime-Deps; ggf. `culori` als devDependency für
   oklch-Konvertierung): Spec → Ramps → CSS-Dateien + `themeRegistry.gen.ts`.
   Idempotent/deterministisch (gleicher Input = byte-gleicher Output),
   `pnpm --filter @maui/themes generate` als Script-Eintrag. Abnahme:
   Regeneration der 9 Bestands-Themes ist visuell äquivalent (ocean/forest/
   sunset dürfen minimal abweichen, wenn die Ramp-Kurve vereinheitlicht wird
   — bewusst abnehmen).
4. **[M] Kontrast-Gate in den Generator**: pro Theme × Variante × Mode
   prüfen: (a) weißer/`--ui-text-inverted`-Text auf `--ui-primary` ≥ 4.5:1
   (AA normal text) oder dokumentiert ≥ 3:1 für UI-Komponenten (WCAG 1.4.11),
   (b) `--ui-primary` gegen `--ui-bg` light/dark ≥ 3:1. Bei Verstoß: Build-
   Fehler mit Vorschlag (nächste Stufe wählen, z.B. `-700` statt `-600`).
   Der Generator darf pro Theme/Mode die `--ui-primary`-Stufe verschieben.
5. **[M] Registry-Umbau**: `themeRegistry.ts` importiert/re-exportiert die
   generierten Daten (`THEME_REGISTRY` aus `.gen.ts`), Typen (`MauiTheme`,
   `MauiVariant`) und `NEUTRAL_REGISTRY` bleiben handgepflegt.
   `useTheme`/Plugin unverändert lassen (API-stabil); Guard-Unit-Test:
   26 Themes, je 11 Variationen, IDs unique, jede `file`-Referenz existiert.
6. **[M] Picker-UX skalieren**: `DisplaySettingsMenu` bei 26 Einträgen mit
   je 11er-Untermenü wird unhandlich → Theme-Sektion auf ein Modal/Popover
   mit Swatch-Grid umstellen (Themes als Grid mit Farb-Punkten, darunter
   Varianten-Reihe des aktiven Themes; Nuxt-UI `UModal`/`UPopover` +
   `USelectMenu`-Suche). Dropdown-Fallback für ≤ 9 Themes entfernen oder
   behalten (App-Entscheidung). i18n-Keys ergänzen (de+en).
7. **[S] Styleguide erweitern**: Matrix-Ansicht (alle Varianten des aktiven
   Themes als Ramp-Streifen), damit QA pro Theme auf einen Blick geht;
   Kontrast-Badges (AA pass/fail) aus `getComputedStyle` live anzeigen.
8. **[M] QA-Durchlauf** (Abschnitt 6): automatisierte Checks + manuelle
   Stichprobe (je 3 Themes hell/dunkel in comments + styleguide),
   E2E-Smoke ergänzen (Cookie setzen → `data-theme` + Link im SSR-HTML,
   ungültiger Cookie → Default; analog Phase-15-Nachweis).
9. **[S] Doku + Abschluss**: CONCEPT.md (Themes-Abschnitte), GOALS.md
   (Backlog-Eintrag → erledigt/Phase), Obsidian `design-system.md`
   aktualisieren, README-Status ✅ + Datum, committen, pushen
   (Memory: „README nach jedem Goal aktualisieren").

Reihenfolge: 1 → 2 → 3 → 4 (3+4 verzahnt) → 5 → 6/7 parallel → 8 → 9.
Gesamtaufwand grob **7–10 Personentage**; gut in 2–3 Goals schneidbar
(Goal A: Spec+Generator+Gate [1–5], Goal B: UX [6–7], Goal C: QA+Doku [8–9]).

---

## 6. Qualitätssicherung

- **Kontrast/A11y (automatisiert, im Generator — Schritt 4)**:
  - `--ui-primary` vs. Button-Text (white/`--ui-text-inverted`): ≥ 4.5:1
    anstreben, hart ≥ 3:1 (WCAG 2.1 1.4.11 für UI-Komponenten); Verstöße
    brechen den Build.
  - `--ui-primary` vs. `--ui-bg` in **beiden Modes** (light: `-600` auf
    weiß/mist-50, dark: `-400` auf neutral-900/950): ≥ 3:1.
  - Kritische Kombination Neutral-Achse: Check gegen die hellste
    (`neutral-50`) und dunkelste (`stone`/`olive`) Palette als Worst-Case,
    nicht gegen alle 9 (Neutral ändert die semantischen Flächen).
- **Dark Mode**: jede Variante erbt die `.dark`-Regel des Themes
  (`--ui-primary: -400`) — der Generator schreibt sie pro Theme einmal;
  QA-Stichprobe: styleguide in dark je Theme-Familie (Buttons solid/soft,
  Links, Focus-Ringe).
- **SSR/Flash**: E2E prüft, dass `data-theme`/`data-variant`/`data-neutral`
  + Stylesheet-Link im SSR-HTML stehen (curl), kein FOUC.
- **Regression**: Playground (ohne themes-Layer) rendert unverändert und
  ignoriert Cookies; ungültige/veraltete Cookie-Werte (z.B. entferntes
  Theme) fallen still auf Default (bestehende Validierung deckt das ab —
  Test ergänzen).
- **Toolchain**: `nvm use 22`; `pnpm --filter @maui/themes lint`, App-
  `nuxi typecheck` (prüft transitiv), `pnpm --filter comments e2e`.
  Erst grün, dann nächster Schritt.

---

## 7. Offene Entscheidungen

| # | Frage | Optionen | Empfehlung |
| --- | --- | --- | --- |
| **E1** | Zählt `default` (Maui, monochrom) zu den 26? | (a) ja — 25 neue Farbwelten nötig · (b) nein — Default ist „kein Theme", 26 echte Farbwelten | **(b)**: Default bleibt der Core-Zustand ohne CSS-Datei; „26 Custom Themes" (design-system.md) liest sich als 26 zusätzliche |
| **E2** | 11 = Basis+10 oder Basis+11? | s. Abschnitt 1 | **Basis+10** (Interpretation a) |
| **E3** | Neutral-Achse Teil der Matrix? | (a) separat lassen · (b) pro Theme kuratierte Neutral-Empfehlung | **(a)** separat lassen; optional später (b) als `recommendedNeutral`-Feld (S) |
| **E4** | Woher die 26 Farbwelten? | (a) kuratierte Namensliste (wie bisher: Ocean, Forest, …) · (b) systematische Hue-Rotation (26 × ~13.8°) | **(a) mit (b) als Startpunkt**: Hue-Raster generieren, dann kuratieren/benennen — verhindert 26 beliebige, aber auch 26 seelenlose Themes |
| **E5** | Definieren Themes künftig mehr als Primary+Radius (Fonts, Radius-Differenzierung, secondary)? | (a) nein, 26×11 rein farblich · (b) Radius/Font pro Theme variieren | **(a)** für den Vollausbau; (b) als separates Backlog-Item — hält den Generator einfach und die Matrix vergleichbar |
| **E6** | Registry generiert oder handgepflegt? | (a) `.gen.ts` committet (Review-bar) · (b) Build-time-Generierung | **(a)**: committet + CI-Check „Generator-Output ist aktuell" (Regenerieren darf kein Diff erzeugen) |
| **E7** | Picker-UX | (a) Dropdown behalten (scrollt) · (b) Modal/Grid · (c) Command-Palette | **(b)**, s. Schritt 6 — Dropdown mit 26×11 ist nicht bedienbar |

---

## 8. Referenzen (Ist-Stand-Dateien)

- `packages/themes/app/utils/themeRegistry.ts` — Registry (9 Themes, 9 Neutrals)
- `packages/themes/app/composables/useTheme.ts` — Cookies + Validierung
- `packages/themes/app/plugins/theme.ts` — SSR-Head (data-Attribute + Link)
- `packages/themes/app/components/DisplaySettingsMenu.vue` — Picker-UI
- `packages/themes/app/pages/styleguide.vue` — Demo/QA-Seite
- `packages/themes/public/themes/*.css` — 8 Theme-CSS + `neutral.css`
- `packages/core/app/app.config.ts` — Maui-Default (`ui.colors`: sky/mist)
- `apps/comments/nuxt.config.ts` — Layer-Einbindung via `extends`
- `docs/CONCEPT.md` (Z. 98/109/465/522–525), `docs/GOALS.md` (Phase 15,
  Backlog), Obsidian: `02 - Projects/maui-design-system/design-system.md`

# Vokabular aufräumen — ein Wort je Sache

> **Status:** Bestandsaufnahme + Plan, teilweise noch nicht entschieden.
> Davids Auftrag vom 2026-07-30: „will, dass alles einen sauberen Stand
> bekommt."
> **Keine Doppelpflege:** Der Community-Teil (`tenants` → `communities`,
> Etappen 3 und 4) steht vollständig in
> [UMBENENNUNG-AUF-COMMUNITY.md](UMBENENNUNG-AUF-COMMUNITY.md) und wird hier
> nur eingeordnet, nicht wiederholt.

## Gemessen am 2026-07-30

Zeilen bzw. Dateien in `packages/`, `apps/`, `scripts/` (ohne
`node_modules`, ohne Worktrees, ohne `.output`):

| Vokabel | Zeilen | Dateien | Zustand |
| --- | ---: | ---: | --- |
| `tenant*` | 3.924 | 547 | wird `community` — E8 Etappe 3/4 |
| `site*` | 2.899 | 451 | teils erledigt (Etappe 1/2), Rest Etappe 4 |
| `community*` | 1.590 | 197 | das Ziel-Wort, schon breit da |
| `workspace*` | 1.157 | 98 | **verschwindet** mit A6 |
| `feature*` | 2.626 | 413 | soll `product` werden (siehe unten) |
| `product*` | 427 | 109 | heute nur Kundensprache |
| `maui*` | 1.964 | 567 | interner Name; Marke ist Pukalani |
| `pukalani*` | 292 | 92 | die Marke |
| `ticket*` | 2.134 | 201 | Board/Roadmap-Frage (E10) |
| `Board` (als Wort) | 66 | — | wird „Roadmap" (E10) |

## 1. `feature` → `product` (Davids Auftrag 2026-07-30)

### Das ist eine bewusste Kehrtwende

CLAUDE.md hält heute fest: „Kundensprache: **Produkte** statt
Features/Bausteine (Landing, UI, Pricing). Im CODE bleibt das Vokabular
`features` (Manifeste, Gates)." Das war die P4-Entscheidung. David will jetzt
**ein** Wort überall. Legitim und sauberer — aber es ist eine Umkehr und wird
hier als solche vermerkt, damit später niemand die alte Zeile für gültig hält.

### Fläche

- **18 Manifest-Dateien** `feature.manifest.ts` → `product.manifest.ts`
- `featureKey` in **56 Dateien**
- `featureGates` in **18 Dateien**
- `pukalani.features` / `features:` in **105 Dateien**
- `check:manifests` (CI-Gate) in **13 Dateien**
- **Tabelle `feature_catalog`** im Control Plane (6 Dateien) — echte Daten
- **Öffentliche Route** `/api/platform/features` — externe Schnittstelle
- Der Katalog wird von `scripts/control-jobs.mjs` aus den Manifesten gesynct

### Die zwei Stellen mit echtem Risiko

1. **`feature_catalog` ist eine Appwrite-Tabelle.** Appwrite kann nicht
   umbenennen ⇒ dasselbe Muster wie control-022/023: neue Tabelle anlegen,
   Zeilen **mit `rowId: row.$id`** kopieren, Code umstellen, alte Tabelle
   separat löschen. Die Row-Id ist hier der Feature-Key selbst
   (`rowId: manifest.key`) — sie steckt in `entitlements.featureKey`.
2. **`/api/platform/features` ist öffentlich.** Wer sie konsumiert, muss
   mitziehen oder eine Übergangszeit bekommen.

Alles Übrige ist mechanisch (Bezeichner, Dateinamen, i18n-Schlüssel) und
durch `pnpm check:manifests` + Typecheck abgesichert.

### NICHT ANFASSEN — die Fallen (gemessen 2026-07-30)

Ein pauschales `feature` → `product` richtet hier Schaden an. Drei Gruppen
sehen aus wie Treffer und sind keine:

| Bezeichner | Vorkommen | Warum es bleiben MUSS |
| --- | ---: | --- |
| `featured` / `Featured` | 106 | heißt **„hervorgehoben"**, nicht „Feature" — u. a. die Appwrite-Spalte `media_items.featured`. Ersetzt man blind, steht dort `productd`. |
| `UPageFeature` / `PageFeature` | 137 | **Nuxt-UI-Komponente** (in `apps/marketing` benutzt) — fremde API. Umbenennen zerlegt die Marketing-Seiten. |
| `FeatureCtor` | — | stammt aus `node_modules`, gehört uns gar nicht. Frühere Zählungen hatten es fälschlich mitgezählt. |

Die Ersetzung muss also regelbasiert laufen wie bei `maui` (Etappe A), nicht
per `sed`. Bewährte Vorgehensweise von dort: Trockenlauf mit Zählung je Regel,
dann schreiben, dann `grep` auf Reste, dann Typecheck — der die Lücken zeigt,
die die Regeln übersehen haben.

### ⚠️ Die Reihenfolge ist umgekehrt — Appwrite ZUERST

Wir hatten geplant: erst Code (Etappe B), dann Appwrite (Etappe C). **Das
würde die Produktion brechen.** Grund, am Code nachgeprüft am 2026-07-30:

`featureKey` ist nicht nur ein TypeScript-Bezeichner, sondern **zugleich der
Appwrite-Spaltenschlüssel**. In `scripts/control-jobs.mjs:142` steht
`data: { siteProjectId, featureKey, status: 'active', … }` — die
Objekt-Eigenschaft IST der Spaltenname im Schreibvorgang. Benennt man sie im
Code um, schreibt der Code gegen eine Spalte `productKey`, die es in Appwrite
nicht gibt. Dasselbe gilt für `features` (`app_config.features`,
`websites.features`) und `entitlementFeature` (`courses.entitlementFeature`).

Richtige Reihenfolge — dasselbe Ausdehnen-Umziehen-Zusammenziehen wie bei
control-022/023:

1. **Migration (additiv):** `product_catalog` anlegen und Zeilen **mit
   `rowId: row.$id`** kopieren (die Row-Id IST hier der Produkt-Schlüssel und
   steckt in `entitlements.featureKey`); neue Spalten `productKey`,
   `products`, `entitlementProduct` **neben** den alten anlegen und befüllen.
   Danach existiert beides — alter Code läuft unverändert weiter.
2. **Code umstellen** (Etappe B) — schreibt und liest ab jetzt die neuen Namen.
3. **Deploy**, eine Nacht beobachten.
4. **Zusammenziehen:** alte Spalten und `feature_catalog` löschen.

Wer 1 und 2 vertauscht, hat zwischen Migration und Deploy ein Fenster, in dem
der Geld- und Produkt-Pfad ins Leere schreibt.

### Etappe A ist erledigt (2026-07-30)

`maui` → `pukalani` ist durch: 884 Ersetzungen in 327 Dateien, Paket-Scope
`@pukalani/*`, Namespace `pukalani.*`, Cookies, Code-Präfix `PUKA-`.
Typecheck 0 Fehler (control/comments/platform), 790 Unit-Tests grün, alle vier
CI-Gates grün. **Kein Appwrite-Anteil** — `maui` kam dort in keiner Tabelle und
keiner Spalte vor.

## 2. `pukalani.studio.*` — Altlast des Control-Cutovers

Der Layer heißt `control`, die App heißt `control`, der Host heißt `control`
— aber der **Config-Namespace heißt weiter `pukalani.studio.*`**
(`defaultPoolProject`, `plans`). Genau das Muster aus der Erfahrung
„Umbenennung lässt Pfade zurück": die Meldungen zogen mit, die Bezeichner
nicht. Klein, mechanisch, ohne Datenrisiko — und heute schon irreführend,
weil „Studio" inzwischen das **Kundenangebot** meint und nicht die
Betreiber-Konsole.

## 3. `reddit`-Reste

Im Quelltext nur noch **drei** Stellen, alle in Kommentaren/Docstrings
(`packages/comments/nuxt.config.ts`, dessen Migration 002, und ein Hinweis in
`packages/control/nuxt.config.ts`). Die Treffer in `apps/*/.output/` sind
Build-Artefakte (Icon-Namen `reddit-logo`) und irrelevant.

**Aber:** das LOKALE Appwrite-Projekt heißt weiterhin `reddit-comments` —
darauf verweist der Kommentar in `control/nuxt.config.ts` ausdrücklich. Das
ist Entwicklungsumgebung, kein Produktivsystem, und ein Projekt-Rename in
Appwrite ist teuer. Bewusst stehen lassen, aber wissen, dass es so ist.

## 4. Offen: `maui` vs. `pukalani` — die größte Frage

Der Paket-Scope ist `@pukalani/*`, der Config-Namespace ist `pukalani.*`, das Repo
heißt `maui-monorepo` — in **567 Dateien**. Die Marke ist **Pukalani**
(92 Dateien). CLAUDE.md notiert zum Theme-Namen bereits, dass „Maui" ein
**interner Produktname vor Kunden** war (Befund N6) und deshalb aus der
Oberfläche verschwunden ist.

Im Code ist er geblieben. Das ist **nicht automatisch falsch**: ein interner
Scope darf anders heißen als die Marke, und `pukalani.*` taucht in keiner
Kundenoberfläche auf. Aber „ein sauberer Stand" heißt womöglich auch hier ein
Wort.

**Das ist eine Entscheidung, keine Aufgabe** — und die teuerste von allen:
Paket-Scope, Config-Namespace, Repo-Name, jede `app.config.ts`, jeder Import.
Sie sollte **nicht** nebenbei mitlaufen.

## Reihenfolge

Die Umbenennungen fassen dieselben Dateien an. Nacheinander, nie parallel:

1. **A6** — `workspaces` verschwinden (1.157 Zeilen fallen ersatzlos weg;
   alles, was man vorher umbenennt, wäre verschwendet)
2. **E8 Etappe 3** — `tenants` → `communities` (Daten, vier Instanzen)
3. **E8 Etappe 4** — `site*`-Vokabular im Code zusammenführen
4. **`feature` → `product`** — inklusive `feature_catalog`-Migration
5. **`pukalani.studio.*` → `pukalani.control.*`** — kann jederzeit mitlaufen, klein
6. **E9/E10** — Menü und Roadmap-Benennung
7. *(offen)* `maui` → `pukalani`, falls entschieden

## Warum nicht alles auf einmal

Jede dieser Umbenennungen ist für sich mechanisch, aber sie überlappen in
denselben Dateien. Zwei gleichzeitig heißt: Konflikte, ein unlesbarer Diff und
keine Möglichkeit, einen einzelnen Schritt zurückzunehmen. Die Etappen 1 und 2
haben gezeigt, dass die Scheibchen-Taktik trägt — je Etappe eine Migration,
ein Deploy, ein Beweis.

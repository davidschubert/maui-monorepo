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

### Etappe B ist erledigt (2026-07-30) — und das ZUSAMMENZIEHEN auch

> Zusammenziehen 2026-07-30 spätabends (Davids Go, Beobachtungsnacht
> erlassen): control-025 (idx_site_product zuerst, dann idx_site_feature +
> featureKey; websites.features; feature_catalog), system-024, courses-004 —
> lokal + Prod gefahren; alle Dual-Writes/Aliasse/Doppelfelder entfernt.
> feature→product ist damit KOMPLETT. Gleichzeitig E8-Aufräumen: control-026
> (site_members, site_invites, sites, invite_requests.siteId) mit
> Zeilen-Gegenprobe vor jedem Löschen.

Regelbasiert wie Etappe A: 964 Ersetzungen in 226 Dateien + 22 handgepflegte
Locale-Werte, 43 Dateiumbenennungen (git mv). Camel-/Pascal-Komposita wurden
englisch (`productKey`), alleinstehende Prosa deutsch („Produkt-Layer",
inkl. Genitiv-Sonderregel „des Produkts"). Vorab liefen **system-023**
(`app_config.products`, MEDIUMTEXT — app_config ist am utf8mb4-Zeilenbudget,
N2) und **courses-003** (`courses.entitlementProduct` — DRITTE Lücke, beim
Bauen gefunden: die Spalte liegt in den Runtime-Projekten, control-024 deckte
nur das Control-Projekt) auf allen vier Instanzen, lokal und Prod.

Zwei beim Schreiben gefundene Zusatz-Fallen, jetzt Ausnahmen:
- **Changelog-Kategorie `feature`** heißt „Neuerung" und steht als WERT in
  Changelog-Rows — die ganze Changelog-Domäne (Seiten, Routen, Seeds, Tests,
  i18n-Schlüssel `admin.changelog.category.feature`) bleibt unangetastet.
- **Locale-WERTE** sind Anzeigetexte je Sprache: das Skript benennt in
  i18n/locales/*.json NUR Schlüssel um; die control-Werte wurden von Hand auf
  „Produkte"/“Products" gezogen, generisches Englisch („old features" über
  Wettbewerber) und „Neue Funktionen zuerst" bleiben.

ÜBERGANGS-KANTEN (alle mit Kommentar „Übergang bis zum Zusammenziehen"):
`entitlements.featureKey` ist required + Unique-Index ⇒ Inserts SPIEGELN die
alte Spalte (workspaceGrants.ts, control-jobs.mjs); ebenso app_config.features
(Admin-PATCH), websites.features (Health-Sweep), courses.entitlementFeature
(beide Schreib-Routen). `/api/platform/features` bleibt als Alias (alter
Health-Sweep + Fallback für Wellen-Nachzügler), das signierte
Entitlement-Dokument trägt `products` UND `features` (alte Verifizierer
verlangen das Feld; gespeicherte last-known-good-Dokumente bleiben lesbar),
der Job-Payload-Leser nimmt `products ?? features` (alte Queue-Einträge).

**Zusammenziehen (nach einer Nacht Beobachtung, eigene Migration + Commit):**
alte Spalten (`entitlements.featureKey` + Index `idx_site_feature` ⇒ vorher
`idx_site_product` anlegen!, `websites.features`, `app_config.features`,
`courses.entitlementFeature`, Alt-Tabellen `feature_catalog`/`sites`) löschen,
Dual-Writes/Aliasse/Doppelfeld entfernen. Verwaiste `courses`-Tabelle auf
portfolio-Prod (Altlast vor dem Manifest-Filter) bewusst NICHT angefasst.

### Etappe A ist erledigt (2026-07-30)

`maui` → `pukalani` ist durch: 884 Ersetzungen in 327 Dateien, Paket-Scope
`@pukalani/*`, Namespace `pukalani.*`, Cookies, Code-Präfix `PUKA-`.
Typecheck 0 Fehler (control/comments/platform), 790 Unit-Tests grün, alle vier
CI-Gates grün. **Kein Appwrite-Anteil** — `maui` kam dort in keiner Tabelle und
keiner Spalte vor.

## 2. `pukalani.studio.*` — Altlast des Control-Cutovers — ✅ ERLEDIGT 2026-07-30

> Umbenannt auf `pukalani.control.*` (Definition, alle Konsumenten und
> Typ-Casts, `[studio]`-Log-Präfixe → `[control]`, `studioUserData` →
> `controlUserData`, stale Prosa und Kommando-Beispiele `--layer studio`).
> BEWUSST geblieben: RESERVED_SUBDOMAINS `studio` (Phishing-Sperre),
> `themes.studio.*` (das Theme-Studio ist ein Produkt, keine Altlast) und
> historische Notizen („zeigte bis 2026-07-29 auf apps/studio").

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

## 4. `maui` vs. `pukalani` — ✅ ERLEDIGT 2026-07-31 (E11b, Etappe C)

Davids Entscheidung: **Inhalt jetzt, Ordner später.** Das Wort verschwindet
aus dem Repo-INHALT; der lokale Ordner und das GitHub-Repo heißen weiter
`maui-monorepo`, und die Domain `maui.photos` bleibt überall unverändert.

Die Zahl **567 Dateien** oben stammt von VOR Etappe A. Etappe A hatte Scope
(`@pukalani/*`), Namensraum (`pukalani.*`), Cookies und Code-Präfix (`PUKA-`)
schon gezogen; gemessen blieben am 2026-07-31 nur noch **180 Treffer in
84 Dateien** (ohne `docs/archiv/**`, `CHANGELOG.md`, `pnpm-lock.yaml`).
Davon **88 Ersetzungen in 50 Dateien** geschrieben (11 Regeln), dazu
1 `git mv`; **92 Treffer bleiben bewusst stehen.**

Die Regeln waren nicht nur Kosmetik — fünf Gruppen waren **tote Bezeichner**,
die Etappe A übersehen hatte und die deshalb ins Leere zeigten:
`maui.*`-Config-Gates (der Namensraum heißt `pukalani.*`), `@maui/*`-Importe
(der Scope heißt `@pukalani/*`), das Einladungscode-Präfix `MAUI-` (Codes
heißen `PUKA-`, ein Beweis-Skript prüfte deshalb positiv auf einen Code, den
es nicht mehr gibt), die Brand-Fallback-Kommentare (der Fallback ist längst
`'Pukalani'`) und die Web-Component-Datei `public/maui-comments.js`, deren
eigene Integrationsanleitung schon `/pukalani-comments.js` nannte — die
dokumentierte URL lieferte 404. Umgekehrt hatte Etappe A **einen
historischen Satz verfälscht** (`themes/app/plugins/theme.ts`: die Head-Ids
hießen `maui-*`, nie `pukalani-*`) — das wurde zurückgestellt.

**Bewusst geblieben**, je Gruppe mit Grund:

| Gruppe | Wo | Warum |
| --- | --- | --- |
| `maui.photos` | `apps/photos/**`, `cases.ts`, MULTI-SITE, README | echte Domain + E-Mail (Davids Vorgabe 2026-07-31) |
| Insel Maui | photos-Inhalte, Landing-Story, Demo-Seed | geografischer Ort, kein Produktname |
| Stripe-Datenschlüssel | `maui_pro_monthly`/`_yearly`, `metadata['maui_key']` | liegen als Daten in Test- UND Live-Stripe; Umbenennen ohne Stripe-Migration zerreißt die Zuordnung (Lehre aus `feature_catalog`) |
| Embed-Rückwärtskompatibilität | `data-maui-count`, `getElementById('maui-comments')` | steht im HTML FREMDER Seiten, die wir nicht mitmigrieren können |
| Echter Repo-/Ordnername | GitHub-URLs, `git clone`, Verzeichnisbäume | der Ordner heißt so — ein umbenannter Pfad wäre eine Lüge |
| Historische Sätze | CLAUDE.md N6, themeRegistry, CONCEPT-Changelog, GOALS-`/goal`-Blöcke, README-Phasentabelle | Protokoll im Satz |
| `spikes/**` | `acme.maui.app` im s5-Spike | Protokoll, nicht in CI (deploy.yml ignoriert `spikes/`) |

Beweis: `pnpm -r test`, `check:manifests`, `check:single-copy`, `pnpm -r
typecheck` grün; `pnpm-lock.yaml` unverändert (der Root-Paketname ist
`private`).

## Reihenfolge

Die Umbenennungen fassen dieselben Dateien an. Nacheinander, nie parallel:

1. **A6** — `workspaces` verschwinden (1.157 Zeilen fallen ersatzlos weg;
   alles, was man vorher umbenennt, wäre verschwendet)
2. **E8 Etappe 3** — `tenants` → `communities` (Daten, vier Instanzen)
3. **E8 Etappe 4** — `site*`-Vokabular im Code zusammenführen
4. **`feature` → `product`** — inklusive `feature_catalog`-Migration
5. ~~**`pukalani.studio.*` → `pukalani.control.*`**~~ ✅ erledigt 2026-07-30
6. **E9/E10** — Menü und Roadmap-Benennung
7. ~~`maui` → `pukalani` (Inhalt)~~ ✅ erledigt 2026-07-31 — s. Abschnitt 4

## Warum nicht alles auf einmal

Jede dieser Umbenennungen ist für sich mechanisch, aber sie überlappen in
denselben Dateien. Zwei gleichzeitig heißt: Konflikte, ein unlesbarer Diff und
keine Möglichkeit, einen einzelnen Schritt zurückzunehmen. Die Etappen 1 und 2
haben gezeigt, dass die Scheibchen-Taktik trägt — je Etappe eine Migration,
ein Deploy, ein Beweis.

### ⚠️ control-024 war UNVOLLSTÄNDIG — `app_config.features` fehlt

Beim Trockenlauf von Etappe B am 2026-07-30 aufgefallen, bevor geschrieben
wurde: `features` in `AppConfigRow` (`packages/core/shared/types/config.ts:39`)
ist **die Appwrite-Spalte `app_config.features`** (angelegt in system-018),
nicht bloß ein TypeScript-Feld. `control-024` hat nur `entitlements.productKey`
und `websites.products` vorbereitet.

Hätte man die Umbenennung jetzt geschrieben, läse und schriebe der Code auf
**allen vier Instanzen** (control, pool, comments, portfolio) gegen eine Spalte
`app_config.products`, die es nirgends gibt — und `app_config` steuert die
Produkt-Gates. Dasselbe Muster wie beim ersten Fund, nur eine Ebene tiefer.

**Vor Etappe B fehlt also noch:** eine `system`-Migration, die
`app_config.products` NEBEN `features` anlegt und befüllt, gefahren auf allen
vier Instanzen (`--wave`-Regel beachten: photos/portfolio fahren `system` mit).
Erst danach darf der Code umgestellt werden.

Zwischenstand Etappe B (gemessen, noch nicht geschrieben): 1.662 Ersetzungen
in 299 Dateien, dazu 40 Dateiumbenennungen — Migrations-DATEINAMEN bewusst
ausgenommen (Protokoll, CLAUDE.md).

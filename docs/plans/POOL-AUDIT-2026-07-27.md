# Pool-Audit 2026-07-27 — Nutzersicht der Pool-Vier (konsolidierte Befunde)

Bilanz-Schritt 2. Vier read-only-Agenten (Live-Gast auf demo.pukalani.app,
Code-Kanten, i18n/Wording, Layout-Analyse), danach Gegencheck jeder
kritischen Behauptung im Hauptstrang. Fixes NUR nach Davids Priorisierung.

Begriffe (Davids Festlegung): der Vorgang heißt **Audit**, die Einträge
heißen **Findings/Befunde**.

## Gegencheck-Ergebnisse (wichtig — nicht alles stimmte)

- ✅ BESTÄTIGT: 404 liefert rohes Nitro-JSON, auch mit `Accept: text/html`.
- ✅ BESTÄTIGT: `/login` hat kein `<title>`-Element.
- ✅ BESTÄTIGT: canonical/hreflang/og:url zeigen auf `platform.pukalani.app`
  (Ursache: `NUXT_PUBLIC_I18N_BASE_URL` ist EINE Env pro App — im Pool
  braucht jeder Tenant-Host seine eigene Basis).
- ❌ FEHLALARM: die `useFetch`-Funde des Code-Agenten („kein Host-Forwarding").
  Live bewiesen: demo rendert Tenant-Seed-Content im SSR — Nuxt 4 leitet bei
  `useFetch` die Request-Header intern über `useRequestFetch` weiter. Die
  Regel gilt nur für rohes `$fetch` im SSR-Pfad (der pages-Bug von gestern).
- ⏳ ÜBERHOLT: „Kommentar-Button ohne Zähler im Feed" — der Agent testete den
  Stand VOR dem blueprint-Deploy; nach dem Deploy erneut prüfen.
- ✅ i18n-Parität de/en: makellos (23/23 Paare identisch) — kein Handlungsbedarf.

## BLOCKER (aus Kundensicht nicht verkaufbar) — ALLE BEHOBEN ✅ (2026-07-27, Paket A)

Live-Beweise nach Deploy e02de81 auf demo.pukalani.app: canonical/hreflang/og:url
= demo-Origin (B1) · 404 = text/html mit „404 · Morgenlicht" (B2, heilt ALLE
Apps — comments-404 jetzt ebenfalls HTML) · Login „Anmelden · Morgenlicht" +
sichtbarer Brand im Markup (B3). Silo-Gegenprobe: comments-canonical unverändert
env-basiert. Rest-Notizen: register/forgot/reset haben Brand-Kopf, aber noch
keinen <title> (kleiner Folgeschritt mit S1); nacktes curl ohne Accept-Header
bekommt bewusst JSON (Nuxt-Heuristik für API-Clients — Browser/Crawler HTML).

| # | Befund | Ort/Ursache |
| --- | --- | --- |
| B1 | canonical/hreflang/og:url aller Tenant-Seiten zeigen auf platform.pukalani.app — Google indexiert die Kundendomain nicht, Sprachlinks führen zum falschen Host | i18n.baseUrl statisch aus Env; muss im Pool pro Request-Host aufgelöst werden |
| B2 | Es gibt KEINE 404-Seite (von David selbst bestätigt): unbekannte Pfade liefern rohes Nitro-JSON statt einer gebrandeten Fehlerseite mit Weg zurück (auch /impressum, /robots.txt, /sitemap.xml). Die vorhandene app/error.vue (CoreErrorPage-Wrapper) greift auf Tenant-Hosts nicht | Fehler schlägt vor dem Vue-Renderer auf; Diagnose beim Fix. Fix umfasst BEIDES: Ursache (Renderer erreicht error.vue nicht) UND eine gestaltete, tenant-gebrandete 404-Seite |
| B3 | /login ohne `<title>`, ohne sichtbares Tenant-Branding im Markup | core-Login-Seite setzt keinen Titel; Brand nur im JS-Payload |

## STÖREND — Stand nach Paket B (2026-07-27, gemergt; Live-Beweis nach Deploy)


| # | Befund | Anmerkung |
| --- | --- | --- |
| ✅ S1 | Register-Sackgasse: Login verlinkt „Register", die ohne Invite-Code nirgends hinführt | Produktentscheidung: Hinweis/Code-Feld oder Link ausblenden |
| ✅ S2 | Avatar-Initialen „L(" bei „Lena (Coach)" — Initialen-Logik nimmt 1. Zeichen jedes Wortes | core-Avatar-Utility |
| ✅ S3 | Deutsche CMS-Texte verlinken EN-Routen (/feed statt /de/feed), dazu nofollow + harter Reload auf interne Links | pages-Renderer: interne Links lokalisieren + als Client-Navigation |
| ✅ S4 | Seed-Inhalte nur deutsch — EN-Besucher sieht „zweisprachig" nur bei Buttons | Demo-Content-Entscheidung (zweisprachige Seeds?) |
| ✅¹ S5 | Keine meta description/og:title/og:image auf Tenant-Seiten — geteilte Links nackt | ¹ Basis behoben: Titel-Muster (useBrandTitle) + description/og:description aus CMS-Excerpt bzw. Feed-Text. OFFEN: og:image (Design-Entscheidung) |
| ✅ S6 | robots.txt + sitemap.xml fehlen auf Tenant-Hosts | Server-Routen der platform-App, PRO HOST: Tenant = Allow + Sitemap auf die eigene Origin; Sitemap aus echten Daten (Startseite + veröffentlichte CMS-Slugs über `tenantDb`, `/feed` nur wenn der Plan `posts` erlaubt) + hreflang de/en. Kontroll-Hosts (my./start.) = `Disallow: /` und sitemap 404 |
| S7 | Footer ohne Impressum/Datenschutz-Links; /impressum 404 auf demo | rechtlich relevant für DE-Kunden; CMS-Seiten + legalLinks je Tenant |
| ✅ S8 | Titel „Feed"/„About me" ohne Community-Namen, EN=DE titelgleich | Titel-Muster „Seite · Tenant" |
| ✅ S9 | Layout-Drift: comments-Layout hartcodiert Brand „Hawaii Studio" (ignoriert Tenant-Kette); toter legalLinks-Footer in platform; 3 Bauweisen für Nav/Sprache/Footer | Konsolidierung ins blueprint-Layout (Analyse liegt vor, 3 Geschmacksfragen bei David) |
| ✅ S10 | billing-Kundenbereich nennt Pläne noch „Free/Pro" statt Basic/Personal/Pro (Plan-Katalog der Silo-Workspaces) | Wording-Angleich; control-Texte „free" ebenso |

## KOSMETIK

| # | Befund |
| --- | --- |
| ✅ K1 | Demo-Banner ist handgebautes div statt `UBanner` (Nuxt UI 4.10) — Davids Regel: offizielle Komponenten |
| ✅ K2 | favicon 78-Byte-Platzhalter, kein apple-touch-icon/theme-color je Tenant |
| ✅ K3 | interne Produktnamen im DOM (id="maui-theme-css") |
| ✅¹ K4 | Login lädt changelog.css + ~68 Chunks (Bundling unaufgeräumt) |
| ✅ K5 | __NUXT__-Payload der Login-Seite enthält Plan/entitlementsDoc im Klartext |
| ✅ K6 | Markdown mit Unterstrich-Betonung wird nicht gerendert (_…_ sichtbar) |
| ✅ K7 | Sprachwechsler „DE / EN" wirkt wie Debug-Element (kein Label/aria) |
| ✅ K8 | Platzhalter-Literale statt i18n (embed.vue:126/132, pages.vue:194); createError-Vertrag verletzt (pages [slug].vue statusCode/statusMessage; embed.vue englische statusText) |
| ✅ K9 | Embed-Site Aktiv/Inaktiv als UButton statt USwitch (Davids UX-Regel) |
| ✅ K10 | Wording „Features" in Admin-/Control-Oberflächen (betreiberseitig — Entscheidung, ob „Produkte" auch intern gilt) |
| ✅ K11 | app.tagline-Reste „Neue Maui-App" in _template/control/photos; platform-tagline „Community-Plattform von Pukalani" pro Tenant ausgespielt |

## Positiv (bestätigt sauber)

- Keine i18n-Key-Lecks im sichtbaren Text (0 Treffer auf 6 Seiten)
- Demo-Banner korrekt platziert (auf Inhaltseiten, NICHT auf /login)
- lang/dir pro Locale korrekt; localePath überall in Nav-Code verwendet
- Keine TODO/FIXME-Leichen in den Pool-Vier
- de/en-Schlüsselparität 23/23

## Paket-B-Bilanz (2026-07-27)

Vier Opus-Worktree-Agenten, konfliktfrei gemergt. Behoben: S2 (avatarInitials-
Util im core, Unicode-fest, 8 Tests — Ursache lag in Nuxt UIs Avatar-Fallback),
S3 (contentLinks-Klassifizierung im core-MarkdownContent: eigene Pfade werden
NuxtLink + localePath ohne nofollow, fremde bleiben unverändert — heilt auch
posts/comments/Tenant-Homepage), S5-Basis + S8 (useBrandTitle-Muster + og:title,
descriptions lokalisiert; register/forgot/reset betitelt = B3-Rest), S10
(Plan-Label Basic — Keys/Stripe unangetastet, Key/Label-Trennung im Code
kommentiert), K1 (UBanner statt Hand-div), K8 (Platzhalter in i18n; createError-
Vertrag in [slug].vue; embed.vue war schon korrekt, dort Kommentar statt Fix),
K9 (USwitch), K11 (Taglines; dabei entdeckt und behoben: home.subtitle spielte
den _template-Anleitungstext LIVE auf Tenant-Startseiten und my./start. aus).
Suite: 18 Layer konsistent, alle Layer-Tests grün (core 221), Parität 23/23.

Weiter OFFEN: S1 Register-Sackgasse (Produktentscheidung) · S4 zweisprachige
Demo-Seeds (Entscheidung) · S7 Impressum/
Datenschutz je Tenant + Footer · S9 Layout-Konsolidierung (3 Geschmacksfragen
bei David) · og:image (S5-Rest) · K2 Favicon je Tenant · K3 interne Namen im
DOM · K4 Bundling der Login-Seite · K5 __NUXT__-Payload · K6 Unterstrich-
Markdown · K7 Sprachwechsler-UI (Teil der S9-Entscheidung) · K10 Features-
Wording im Admin (Entscheidung).

## Nachtschicht-Bilanz (2026-07-28, 8 Worktree-Agenten)

Behoben und gemergt: S9+K7 (EIN Community-Layout im blueprint, chrome-Registry
als Map mit Override/Abschalten, Inline-Nav mit Überlauf, DisplaySettingsMenu,
Config-Footer mit Legal-CMS-Links; App-Layouts + Platform-Components gelöscht) ·
Events durch die Datentür (13 Routen + 4 Utils, Migration events-006,
Isolationsbeweis 14/14, in platform montiert, Plan-Gate pro) · S1 (Offene
Registrierung pro Community: Schalter über die Service-Naht mit
site_members-Pflicht, Server-Gate 403, Hinweis-Seite; Migration studio-018) ·
S4 (Morgenlicht zweisprachig, LIVE geseedet; dabei Key-Fix: Seed lief mit
blindem Migrations-Key) · S6 (robots+sitemap je Tenant, Datentür) · S7
(Impressum/Datenschutz-Vorlagen als Entwurf je neuer Community + Backfill) ·
K10 (Produkte-Wording im Kunden-Dashboard) · K5 (entitlementsDoc aus dem
Payload + /api/config typisiert projiziert) · K6 (Unterstrich-Markdown).

NEUE Befunde aus der Nacht (offen):
- N1 (WICHTIG): Site-Owner erreichen /dashboard nicht — Zugang hängt an
  globalen Operator-Labels, Site-Rollen werden nicht in den Client gespiegelt.
  Der Kunden-Registrierungs-Switch ist serverseitig fertig, per UI erst nach
  diesem Spiegeln erreichbar. (S1-Bericht Punkt 1)
- N2: app_config ist Table-read(any) und trägt die entitlements-Spalte —
  Appwrite-Direktweg umgeht die Payload-Diät; braucht system-Migration.
- N3: 9 themes-visual-Baselines brechen erwartungsgemäß (Header-Umbau) —
  David sichtet, dann `pnpm --filter comments e2e -- --update-snapshots`.
- N4: Demo indexierbar? (S6) Produktfrage David.
- N5: Paid-Events im Pool fail-closed bis Webhook Mandanten stempelt;
  Site-Owner-Eventverwaltung braucht requireSitePermission-Verdrahtung.

## P10-Bilanz (2026-07-28) — das Audit ist damit ABGESCHLOSSEN

Behoben: N1 (Site-Rollen gespiegelt, Dashboard-Zugang + gefilterte Nav fuer
Owner, 30/30-E2E — die Kunden-Selbstverwaltungs-Kette ist komplett) · N2
(entitlements in app_secrets mit leeren Permissions, 2-Wege-Read, Altspalte
wird aktiv geleert; Nebenfund behoben: system-Migrationen waren seit 019 auf
Bestandsinstanzen nicht mehr idempotent; system-020 auf allen 4 Prod-Instanzen
angewendet) · N5a (Events-Verwaltung via requireSitePermission/events.manage,
20/20 Pool + 7/7 Silo; N5b fail-closed per Test genagelt) · K2 (Bildmarke je
Community: Theme-Farbe + Initial, gegated, Silo unveraendert) · K3 (pk-Ids;
Cookies/postMessage-Vertraege bewusst unangetastet) · K4¹ (ehrlich vermessen:
Chunks = normales Nuxt-Prefetch; ein Hebel umgesetzt −3 Preload-Chunks;
groessere Hebel als Entscheidungen dokumentiert). Dazu ausserhalb des Audits:
apps/help (freigegeben, Deploy-Kette offen) + control.pukalani.app/docs
(interne Doku hinter Betreiber-Auth inkl. Content-API-Guard + Prerender-Falle).

NEUE Befunde aus P10 (offen):
- N6: Default-Theme heisst im Kunden-Picker sichtbar "Maui" — Namensentscheidung David.
- N7: /changelog antwortet auf Tenant-Hosts 200 (Betreiber-Changelog fuer
  Kunden-Besucher erreichbar) — Scope-Entscheidung, Route gaten oder oeffnen.
- N8: Owner-Overview zeigt Nullwerte (Stats-Routen Operator-only) —
  Folgeschritt tenant-gescopte Stats via requireSitePermission.
- N9: Theme-Studio verlangt system.manage — duerfen Owner ihre Themes selbst
  waehlen? (Davids Erscheinungs-Prinzip spricht dafuer.)
- K4-Hebel (Entscheidungen): Appwrite-Web-SDK dynamisch laden (72 kB Entry,
  eigenes Paket, Realtime-E2E noetig) · prefetch-Hints filtern (groesster
  Hebel, kostet Navigations-Vorsprung) · Legacy-Spalten-Drop system-021
  (erst wenn ALLE Instanzen neuen Code fahren).

WEITER OFFEN (David): N3 Baselines sichten · N4 Demo indexierbar? ·
Netto/Brutto · og:image-Design · help.pukalani.app-Host bestaetigen +
Deploy-Kette · apps/control/.env.production zeigt noch auf studio (Altlast).

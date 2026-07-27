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

## STÖREND

| # | Befund | Anmerkung |
| --- | --- | --- |
| S1 | Register-Sackgasse: Login verlinkt „Register", die ohne Invite-Code nirgends hinführt | Produktentscheidung: Hinweis/Code-Feld oder Link ausblenden |
| S2 | Avatar-Initialen „L(" bei „Lena (Coach)" — Initialen-Logik nimmt 1. Zeichen jedes Wortes | core-Avatar-Utility |
| S3 | Deutsche CMS-Texte verlinken EN-Routen (/feed statt /de/feed), dazu nofollow + harter Reload auf interne Links | pages-Renderer: interne Links lokalisieren + als Client-Navigation |
| S4 | Seed-Inhalte nur deutsch — EN-Besucher sieht „zweisprachig" nur bei Buttons | Demo-Content-Entscheidung (zweisprachige Seeds?) |
| S5 | Keine meta description/og:title/og:image auf Tenant-Seiten — geteilte Links nackt | Tenant-SEO-Grundausstattung |
| S6 | robots.txt + sitemap.xml fehlen auf Tenant-Hosts | Feature-Entscheidung (pro Tenant generieren) |
| S7 | Footer ohne Impressum/Datenschutz-Links; /impressum 404 auf demo | rechtlich relevant für DE-Kunden; CMS-Seiten + legalLinks je Tenant |
| S8 | Titel „Feed"/„About me" ohne Community-Namen, EN=DE titelgleich | Titel-Muster „Seite · Tenant" |
| S9 | Layout-Drift: comments-Layout hartcodiert Brand „Hawaii Studio" (ignoriert Tenant-Kette); toter legalLinks-Footer in platform; 3 Bauweisen für Nav/Sprache/Footer | Konsolidierung ins blueprint-Layout (Analyse liegt vor, 3 Geschmacksfragen bei David) |
| S10 | billing-Kundenbereich nennt Pläne noch „Free/Pro" statt Basic/Personal/Pro (Plan-Katalog der Silo-Workspaces) | Wording-Angleich; control-Texte „free" ebenso |

## KOSMETIK

| # | Befund |
| --- | --- |
| K1 | Demo-Banner ist handgebautes div statt `UBanner` (Nuxt UI 4.10) — Davids Regel: offizielle Komponenten |
| K2 | favicon 78-Byte-Platzhalter, kein apple-touch-icon/theme-color je Tenant |
| K3 | interne Produktnamen im DOM (id="maui-theme-css") |
| K4 | Login lädt changelog.css + ~68 Chunks (Bundling unaufgeräumt) |
| K5 | __NUXT__-Payload der Login-Seite enthält Plan/entitlementsDoc im Klartext |
| K6 | Markdown mit Unterstrich-Betonung wird nicht gerendert (_…_ sichtbar) |
| K7 | Sprachwechsler „DE / EN" wirkt wie Debug-Element (kein Label/aria) |
| K8 | Platzhalter-Literale statt i18n (embed.vue:126/132, pages.vue:194); createError-Vertrag verletzt (pages [slug].vue statusCode/statusMessage; embed.vue englische statusText) |
| K9 | Embed-Site Aktiv/Inaktiv als UButton statt USwitch (Davids UX-Regel) |
| K10 | Wording „Features" in Admin-/Control-Oberflächen (betreiberseitig — Entscheidung, ob „Produkte" auch intern gilt) |
| K11 | app.tagline-Reste „Neue Maui-App" in _template/control/photos; platform-tagline „Community-Plattform von Pukalani" pro Tenant ausgespielt |

## Positiv (bestätigt sauber)

- Keine i18n-Key-Lecks im sichtbaren Text (0 Treffer auf 6 Seiten)
- Demo-Banner korrekt platziert (auf Inhaltseiten, NICHT auf /login)
- lang/dir pro Locale korrekt; localePath überall in Nav-Code verwendet
- Keine TODO/FIXME-Leichen in den Pool-Vier
- de/en-Schlüsselparität 23/23

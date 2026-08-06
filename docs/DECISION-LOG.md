# Decision Log

Laufendes Protokoll bewusster **Entscheidungen, Korrekturen und Ideen** — das,
was NICHT aus Code/Git-Historie hervorgeht (das „warum", verworfene Alternativen,
Kurskorrekturen). Neueste zuerst. Ergänzt die großen `docs/plans/*`-Dokumente um
die kleinen, verstreuten Beschlüsse.

---

## 2026-08-04 — Private Nachrichten: alle sieben Konzept-Entscheidungen

**Davids Entscheidungen** (strukturierte Fragen; Volltext:
PRIVATE-NACHRICHTEN-KONZEPT.md § 8): 1. Nachrichten leben **je Community**
(Datentür/Moderation/TL-Gate/Host — kontoweit hätte vier Grundpfeiler neu
erfunden) · 2. Moderation sieht **nur die gemeldete Nachricht** als
Snapshot · 3. Sperre **je Community + Häkchen „überall"** · 4. Owner-Schalter
**Default AUS** (Owner öffnet den Kanal bewusst) · 5. Aufbewahrung
**unbegrenzt + selbst entfernbar** (Frist wäre Datenverlust, kein
Datenschutz) · 6. **Datenmodell n:m-fähig, gebaut wird v1 nur 1:1**
(Gruppen = TL2-Recht, kommen ohne Migration) · 7. Tarif **ab Personal, wie
posts** (PN hängen an den Vertrauensstufen aus member_counters). Konzept
damit entscheidungskomplett; Bau wartet auf Go.

## 2026-08-04 — Trust Levels: Schwellen „Mittel" + v1-Rechte

**Davids Entscheidungen** (strukturierte Fragen, Teilpaket 3): **Schwellen
„Mittel"** — TL1 Basic: 2 Tage dabei + 1 eigener Inhalt + 1 vergebenes
Upvote · TL2 Member: 15 Tage + 5 Inhalte + 10 vergeben + 5 erhalten ·
TL3 Regular: 60 Tage + 25 Inhalte + 50 vergeben + 25 erhalten · TL4 Leader
nur von Hand. **v1-Rechte:** TL3 darf fremde Themen umbenennen und
umkategorisieren; TL4 bekommt anheften/schließen/gelöst + fremde Beiträge
bearbeiten; TL1/TL2 sind v1 sichtbarer Status + Abzeichen (ihre
Katalog-Rechte kommen automatisch mit PN/Einladungen/Tages-Likes). Kein
Abstieg; Besuchs-/Lese-Tracking bleibt draußen (Teil 4).

## 2026-08-04 — Gemeinsames Paket: TL-Architektur, Aufstieg, Mehrfach-Verleihung

**Davids Entscheidungen** (strukturierte Fragen; Volltext: DISCUSSIONS-KONZEPT.md
Teil 5): (1) **Trust Levels speisen das bestehende RBAC** — Stufe aus Zählern
berechnet, Capabilities vergibt der vorhandene Resolver; ein paralleles
TL-Prüfsystem ist abgelehnt (das „eigene Ja" aus § 3.6). (2) **TL1–TL3
automatisch** über Schwellen, **TL4 nur von Hand**, kein Abstieg. (3)
**Mehrfach-Verleihung für ALLE sinnvoll zählbaren Abzeichen** — bewusst gegen
die Empfehlung (nur Posting-Gruppe) und als Revision der Stufe-4-Regel „genau
einmal": auch der Jahrestag kommt jährlich neu.

## 2026-08-04 — Stufe 4: Badge-Zuschnitt, Tracking abgelehnt, vier soziale Mechaniken

**Davids Entscheidungen** (Volltext: DISCUSSIONS-KONZEPT.md Teil 4): Stufe 4
baut **nur heute messbare Badges** · das **Tracking-Bündel entfällt dauerhaft**
(Lese-Fortschritt, Besuchs-Streaks, Klick-Zählung — Widerspruch zu
„Datenschutz-nativ"; kostet 9 Badges) · Schreib-Werkzeuge **Zitieren,
Emoji-Auswahl, Themen-Rückverweise**, **kein Onebox** (SSRF) · **alle vier**
sozialen Mechaniken: Mitglieder-Einladungen, Tages-Like-Limit,
Emoji-Reaktionen, private Nachrichten. Bei den Reaktionen hatte ich abgeraten
(drittes Signal); Entscheidung steht, deshalb die Folgeregel: **Badges zählen
weiter nur Upvotes**, Reaktionen sind badge-neutral. **Private Nachrichten
bekommen ein eigenes Konzept** vor dem Bau.

**Davids Vorgabe zum Editor:** Editor-Funktionen ausschließlich über die
Nuxt-UI-Bausteine (`UEditor` inkl. Blockquote, `UEditorToolbar`,
`UEditorEmojiMenu`, `UEditorMentionMenu`, `UEditorSuggestionMenu`,
`UEditorDragHandle`) — nichts selbst bauen. Steht jetzt in CLAUDE.md.

---

## 2026-08-04 — Zwei Stufe-2-Nachfragen (Team-Liste, Seitenleiste)

**Davids Entscheidungen** (je der Empfehlung gefolgt): **Team-Liste redigiert
öffnen** — neuer `view`-Parameter an der Control-Naht, nur Rollen
owner/admin/moderator, Name + Avatar, E-Mail LEER; damit zeigt die
About-Seite jedem, wer die Community führt, ohne Adressen preiszugeben.
**Seitenleisten-Hälfte „kommentiert" in Stufe 3** — als fünfter Core-Vertrag
in der Bauart des Aktivitäts-Vertrags; bis dahin zählt „gepostet" sichtbar,
nicht gefaked. Beides Teil des Stufe-3-Zuschnitts.

---

## 2026-08-04 — Vier Folge-Entscheidungen (Landing-URL, Stufe 2, ci.env, portfolio)

**Davids Entscheidungen** (strukturierte Frage-Runde, je der Empfehlung
gefolgt): **Landing-URL zieht um** — der Kommentar-Baustein liegt jetzt unter
`/products/comments` bzw. `/de/produkte/kommentare`, beide Altpfade (auch
`/products/discussions`) 301 DIREKT dorthin, keine Ketten; der interne Key
bleibt `diskussionen` (Label ≠ Key). Grund ist Namensraum, nicht SEO: das
echte Discussions-Produkt braucht `/products/discussions` später selbst.
**Discussions Stufe 2** (Views, About, Guidelines) schließt direkt an — läuft
parallel zu A1/A2, die bei David liegen. **`ci/appwrite/ci.env`** verliert den
Klartext-Schlüssel; `_APP_OPENSSL_KEY_V1` wird je CI-Lauf erzeugt (Repo ist
öffentlich). **portfolios verwaiste Tabellen bleiben liegen** bis F3
entscheidet — Löschen wäre unumkehrbar ohne aktuellen Nutzen.

---

## 2026-08-03 — Discussions: alle sieben Konzept-Entscheidungen gefallen

**Davids Entscheidungen** (je der Empfehlung gefolgt; Volltext + Begründungen:
docs/plans/DISCUSSIONS-KONZEPT.md § 3.8): **Weg B** (Kategorie als Dimension
von `posts`, kein eigener Layer) · kategorisierte Beiträge **bleiben im Feed**
· Produktname **Discussions**, der Landing-Kommentar-Baustein wird zu
„Kommentare" · **Like = Upvote** (Downvotes bleiben, badge-neutral) · **Trust
Levels später** (eigener Entwurf nach Stufe 1–4) · Regelwerk **nur Guidelines
jetzt** (ToS/Privacy je Community erst nach Anwalts-Klärung, hängt an A1) ·
Seitenleiste = **meine letzten 5 Kategorien** mit Rückfall auf die größten.

Verworfen u. a.: eigener Layer (doppelte Härtung), Herz neben den Stimmen
(zwei Signale am selben Beitrag), Trust Levels von Anfang an (größtes Stück
zuerst). Das Konzept ist damit entscheidungskomplett; es wartet nur noch auf
das Ende des Feature-Stopps.

---

## 2026-08-03 — Zwei Nicht-Aufgaben aus der offenen Liste geholt

**Davids Entscheidungen, unverändert gültig** — sie standen bisher unter
„Geparkt / wartet" in OPEN-ITEMS.md und warteten dort auf „nichts, bewusst so".
Das ließ die Liste länger aussehen, als Arbeit da war:

- **Der öffentliche Changelog antwortet auf Community-Hosts mit 404** (N7). So
  gewollt: der Changelog ist BETREIBER-Inhalt und hat auf einem Mandanten-Host
  nichts zu suchen. Durchgesetzt an beiden Enden — Seite über
  `useIsTenantHost()`, Route über `useTenant(event)`; die Chrome-Registry
  versteckt zusätzlich die Links. Kontroll-Hosts und Silo-Apps sind unberührt.
- **Die Demo-Community ist bei Google auffindbar.** So gewollt: sie ist das
  Schaufenster, kein Testsystem.

Beide bleiben in Kraft — nur der Ort stimmt jetzt. Eine Liste offener Punkte
führt, was noch zu tun ist; was entschieden ist, steht hier.

---

## 2026-08-02 — F8: Abrechnungsdaten überleben die Kontolöschung

**Davids Entscheidung.** Löscht der (letzte) Owner sein Konto, bleiben
`communities.stripeCustomerId` und `billingStatus` OHNE Löschfrist stehen.
Grund: kaufmännische Aufbewahrungspflicht (§147 AO / §257 HGB), und
Art. 17 Abs. 3 lit. b DSGVO nimmt gesetzliche Aufbewahrung ausdrücklich vom
Löschrecht aus. Der Personenbezug ist durch die F3-Kette bereits versorgt
(Mitgliedschaft entpersonalisiert, Einladungen/Anfragen gelöscht) — was
bleibt, ist der Zahlungs-Verweis auf Stripe. Verworfene Alternative: eine
eigene Löschfrist hätte genau die Belege gekappt, die bei einer Prüfung
vorzulegen sind. NICHT mitentschieden: die Löschfrist für
`abuse_reports.reporterEmail` (Melder ohne Konto) — bleibt als F8-Rest offen.

**Nachtrag vom selben Tag — F8-Rest ist entschieden:** die Melder-Adresse
verfällt nach **90 Tagen ab der Meldung** (`$createdAt`), unabhängig vom
Status; die ZEILE bleibt, nur das Feld wird geleert. Anker ist bewusst die
Meldung und nicht die Bearbeitung (`handledAt`): sonst hinge die Frist an der
Warteschlangen-Disziplin des Betreibers, und eine lange liegengebliebene
Meldung hielte die Adresse beliebig lange fest. Die Zeile bleibt, weil sie der
Beleg für eine womöglich verhängte Sperre ist. Umgesetzt als vierter Mitfahrer
im stündlichen `trial-sweep` des Control Plane
(`packages/control/server/utils/abuseReportPrune.ts`) — Melder ohne Konto
erreicht kein GDPR-Contributor, deshalb braucht diese eine Spalte einen
eigenen Sweep.

## 2026-07-31 — C16: „Community löschen" heißt Stilllegen, nicht Vernichten

**Ausgangslage:** `community.delete` stand seit G1 in der Owner-Rolle und hatte
kein Ziel. Am 2026-07-29 war das eine bewusste Entscheidung (Davids
Entscheidung 3: „später — ein unumkehrbares Löschen braucht erst eine
Wiederherstellungs-Frist"). Mit C16 hat David den Punkt selbst wieder
eingereiht.

**Der Schnitt, mit dem der alte Einwand aufgelöst ist:**

> **Löschen = `communities.status` auf `disabled` + jede Mitgliedschaft auf
> `removed` + Community-Labels einziehen. INHALTE BLEIBEN.**

Der Host antwortet danach binnen ≤30 s (Resolver-Cache) mit 404, niemand hat
mehr Zugang — aber keine einzige Zeile wird gelöscht. Drei Gründe:

1. **F3-Grundsatz „nie destruktiv".** Ein Hard-Delete ohne Frist ist
   Datenverlust auf einen Klick. Genau daran ist die Entscheidung vom
   2026-07-29 gescheitert.
2. **Es gibt schon einen Löschpfad**, und er ist geprüft: die DSGVO-Kette
   (`deleteUserCompletely`, Contributor-Registry). Ein zweiter daneben wäre
   eine zweite Stelle, an der etwas übrig bleibt.
3. **Die Inhalte gehören nicht nur dem Owner** — an Threads hängen die
   Beiträge anderer Mitglieder.

**Zwei Sperren, beide mit Grund** (pure Regel `decideCommunityDeletion`,
`packages/control/shared/communityTeam.ts`, 4 Tests):

- **Laufendes Abo ⇒ 409 `subscription_active`.** Stilllegen kündigt bei Stripe
  NICHTS; die Rechnung liefe weiter für etwas, das niemand mehr sehen kann.
  Erst kündigen, dann löschen. Die Rechnung „läuft ein Abo?" teilt sich jetzt
  eine Funktion mit der Übergabe-Sperre (`hasLiveSubscription`) — vorher stand
  sie inline, und `past_due` (laufender Vertrag mit offener Forderung!) wäre in
  der zweiten Kopie leicht vergessen worden.
- **Schon stillgelegt ⇒ 409 `already_disabled`**, bewusst kein stiller Erfolg.

**Was bewusst NICHT gebaut ist:** echtes Hard-Delete (Rows weg, Bucket leer,
Projekt weg) und das Freigeben des Hostnamens. Der Slug bleibt vergeben, sonst
könnte ihn morgen jemand anders registrieren und alte Links zeigten auf eine
fremde Community. Ein Hard-Delete wäre Davids FOLGE-Entscheidung und braucht
einen eigenen Plan (Frist, Export, Reihenfolge über zwei Projekte hinweg).

**Aufbau wie bei „Zugang entziehen" (A5): zwei Schritte, zwei Projekte.** Das
Control Plane nimmt Status und Rollen (seine Tabellen), die Runtime nimmt das
Lese-Publikum (Labels leben im Pool-Projekt, das Control Plane hat dafür keinen
Schlüssel). Ohne den zweiten Schritt wäre die Community offline, ihre
`read(label:…)`-Zeilen aber weiterhin für jedes ehemalige Mitglied lesbar.

---

## 2026-07-30 — C18: Sichtbarkeit je Community, und die Kehrtwende zu G0-7

**Davids Entscheidung:** die Sichtbarkeit einer Community ist **wählbar**, und
**neue Communities entstehen ÖFFENTLICH**. Das dreht die G0-Entscheidung 7 vom
2026-07-24 („privat als Default, öffentlich opt-in") um. Grund: eine frische
Community, die niemand finden kann, wächst nicht — der Wizard verspricht
Wachstum, und der Startzustand hat dagegen gearbeitet. „Nur für Mitglieder"
bleibt vollwertig, ist aber die bewusste Ausnahme.

**Was daran NICHT gedreht wurde**, und das ist der Teil, der die Entscheidung
tragfähig macht:

- Die Spalte wird weiter **fail-closed** gelesen (`resolveTenantAudience`):
  eine Row ohne Eintrag gilt als privat. Der neue Default gilt beim ANLEGEN,
  nicht beim Lesen — Bestand wird nicht stillschweigend aufgemacht.
- `read(Role.label(communityId))` bleibt die harte Grenze (Naht 4). Neu ist,
  dass `tenantReadRolesFor` die WAHL DER COMMUNITY über die ABSICHT DER ZEILE
  stellt: aus `read: 'public'` wird auf einer geschlossenen Community das
  Mitglieder-Publikum. Umgekehrt NIE — eine offene Community macht
  mitglieder-interne Zeilen (Activity, Presence, Benachrichtigungen) nicht auf.

**Der Schalter ist nicht nur ein Feld** — die vier Dinge, die mitziehen, sind
der eigentliche Umfang von C18:

1. **Der Bestand.** `audienceRepermission.ts` (core) zieht die schon
   geschriebenen Zeilen um, `read(any)` ⇄ `read(label:<id>)`, seitenweise,
   idempotent, protokolliert und damit wiederaufnehmbar. Die pure Regel liest
   „veröffentlicht" am BESTEHENDEN Permission-Array ab statt den Status neu
   auszuwerten — deshalb kann sie nichts aufmachen, was zu war (Entwürfe,
   ausgeblendete Kommentare). Welche Tabellen mitziehen, melden die Layer per
   Nitro-Plugin an (Muster `registerUserDataContributor`).
2. **Die Suchmaschinen.** `noindex, nofollow` im zentralen Kopf-Aufruf,
   `Disallow: /` in robots.txt, 404 auf sitemap.xml und auf `/og/<key>.png`.
   Der Hinweistext im Dashboard sagt ausdrücklich, dass Google Tage bis Wochen
   braucht — ein Versprechen, das wir nicht halten können, wird nicht gegeben.
3. **`pages`.** Deren Zeilen tragen bewusst KEINE Permissions; öffentlich macht
   sie eine Route mit der Operator-Türklinke. Dort gibt es nichts umzuziehen,
   also steht da eine eigene Wache (`assertCommunityContentReadable`). Ohne sie
   wäre die Startseite einer geschlossenen Community weiter für jeden lesbar.
4. **Der Bestand VOR C18.** Bis heute hat die Spalte NICHTS gesteuert: die
   Zeilen der Alt-Communities tragen `read(any)`, ihre Seiten sind im Index —
   sie sind de facto öffentlich, und nur ihr Eintrag (`null`) sagt etwas
   anderes. Mit dem Deploy fängt der Eintrag an zu wirken. **Wer öffentlich
   bleiben soll, braucht einmal den Stempel**
   (`packages/control/scripts/stamp-audience.mjs`, Einzelvorgang mit
   Trockenlauf) — allen voran `demo.pukalani.app`. Bewusst KEIN Backfill-Sweep:
   „alle auf öffentlich" wäre genau die stillschweigende Entscheidung über
   fremde Communities, die die fail-closed-Regel verhindern soll.

Beweis: `packages/control/scripts/verify-audience-flip.mjs` (Gast-Client ohne
Key gegen die echte Instanz, beide Richtungen, Bestand eingeschlossen).

---

## 2026-07-23 (Fragerunde) — Entscheidungen für die offenen Blöcke

David hat per Fragerunde alle offenen Design-/Freigabe-Punkte beantwortet
(autonome Umsetzung freigegeben). Reihenfolge der Abarbeitung: **Key-Tausch →
Quota → Homepage → E4**, danach Themes-Vollausbau.

- **Read-only-Control-Plane-Key**: Tausch freigegeben (mit Vorab-curl-Test +
  altem Key als Rollback). **BEFUND/BLOCKER:** die Key-ERSTELLUNG braucht
  Console-Rechte im `studio`-Projekt (Team „Pukalani App"), OTP-gebunden = David.
  Die einzige lingernde Console-Session gehört `provisioner@pukalani.app` —
  ein Account, der laut Cleanup (Task #69, `session-handover-2026-07-16`)
  gelöscht sein sollte. Bewusst NICHT für eine Prod-Sicherheitsoperation
  genutzt (Gegenteil von least-privilege; Session gehört ohnehin entfernt).
  → Runbook für David in [PLATFORM-CONTROL-KEY-SWAP.md](runbooks/PLATFORM-CONTROL-KEY-SWAP.md);
  **zusätzlich: verwaisten Provisioner-Account/Session prüfen + löschen.**
- **Quota-Zahlen**: Plan-Staffelung übernommen — free 200/Tag + 5.000 gesamt ·
  pro 1.000/Tag + 50.000 · business 5.000/Tag + 250.000; Silo ohne Limit. Ich
  verdrahte Plan→Limit (die assertPoolWriteQuota-Mechanik steht seit H3-4.3).
- **Tenant-Homepage** (pro Tenant konfigurierbar, „pro Tenant"): MVP =
  CMS-Markdown (sicheres Subset, KEIN Roh-HTML) + optional EIN einbettbarer
  Kommentar-Block; EINE Sprache Pflicht (weitere optional); Tenant-Theme wird
  geerbt; Silo nutzt dasselbe pages-Muster. Konzept:
  [PLATFORM-TENANT-HOMEPAGE.md](archiv/PLATFORM-TENANT-HOMEPAGE.md).
- **Embed E4**: alle drei bauen, Reihenfolge Presence → Gast → Web-Component.
  **Gast-Kommentare**: Name+E-Mail OHNE Verifikation (Disqus-Gastmodus,
  niedrigste Hürde), Spam über Auto-Hide + Rate-Limit + Honeypot.
- **Themes-Vollausbau E1–E7** (alle Plan-Empfehlungen bestätigt): E1 Default
  zählt NICHT (26 echte neue Farbwelten) · E2 11 = Basis+10 · E3 Neutral bleibt
  separate Achse · E4 Hue-Raster (26×~13,8°) als Startpunkt, dann kuratieren+
  benennen · E5 Themes rein farblich (Fonts/Radius = Backlog) · E6 committete
  `.gen.ts` + CI-„Output aktuell"-Check · E7 Grid-Modal-Picker (Dropdown mit
  26×11 unbedienbar). Umsetzung: [THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md).
- **Aufräumer**: Hetzner-Rescale-Thema geschlossen (CI-Build-Deploy → CX23
  reicht, Server baut nichts). Themes-Vollausbau rückt nach vorn.

## 2026-07-22 (3) — apps/platform: der Multi-Tenant-Beweis end-to-end

Die erste echte Multi-Tenant-App (aus apps/_template, Features themes/admin/
comments/moderation): `pukalani.tenancy` AN, Resolver = createTenantsTableResolver
gegen das Control Plane (NUXT_PLATFORM_CONTROL_*, eigener read-only-Key;
ohne Env → dokumentiert fail-open + Warnung, CI-Build-sicher). Port 3006.

**Lokaler E2E-Beweis** (ein Dev-Server, EIN Pool-Projekt, tenants-Register im
lokalen studio): kunde-a.localhost sieht NUR den A-Kommentar, kunde-b NUR den
B-Kommentar (auch im Cache-Hit-Pfad), fremd.localhost → 404, SSR 200.

**Echter Fund des E2E (der Grund, warum man so testet):** der GAST-MICROCACHE
der Kommentar-Liste keyte ohne Tenant — Kunde A füllte den Cache, Kunde B bekam
Kunde-A-Inhalt (Cross-Tenant-Leak). Fix: tenantId im Cache-Key (Single-Tenant:
konstantes Präfix, Verhalten unverändert). **Lehre für die Fläche: JEDER
Microcache, der auf der Platform-App lebt, braucht den Tenant im Key** — als
Nächstes betrifft das den admin-changelogCache (notiert in OPEN-ITEMS #4).

**Prod-Rollout (braucht David):** (a) Wildcard-DNS `*.pukalani.app` (oder
eigene Kundendomains via CNAME), (b) ploi-Site für platform + Deploy-Kette,
(c) echtes Pool-Appwrite-Projekt (Migrationen comments+moderation+system) +
Control-Plane-read-only-Key. Bis dahin lebt die App nur lokal/CI.

---

## 2026-07-22 (2) — H3 Naht 1/2: Tenant-Auflösung produktiv (ruhend)

Nach Etappe 4.1 (Pool-Datenpfad) die Auflösungs-Schicht, exakt nach Blueprint:

- **Naht 1:** `core/server/middleware/00.tenant.ts` (läuft vor auth.ts) —
  Config-Gate `pukalani.tenancy.enabled` (Core-Default AUS → No-Op, heutiger
  Betrieb ungeändert). Aktiv gilt die Spike-Semantik: bekannter Host →
  `event.context.tenant`; unbekannter Host → 404 (keine Default-Site);
  Resolver-Fehler → 500 (fail-loud, NIE still ins Default-Projekt).
  Auflösungsquelle ist ein von der App registrierter **Resolver-Vertrag**
  (`registerTenantResolver`, A14: core kennt keine tenants-Tabelle — die
  kommt mit der Platform-App, gecacht via createMicrocache).
- **Naht 2:** `resolvedProjectId()` in den Client-Factories + Cookie-Name —
  Tenant-Projekt vor .env-Projekt, ohne Tenant exakt wie bisher.
  **Bewusste Grenze:** dynamischer Silo-ADMIN-Zugriff (fremdes Projekt →
  fremder Key) wirft 501 statt mit dem falschen Key 401-Salat zu produzieren;
  die Key-Registry ist eine spätere Etappe. Pool (gleiches Projekt) läuft.
- Beweise: normalizeHost pure-getestet (Ports/IPv6/FQDN), core 104 Tests grün,
  studio-E2E 10/10 mit aktiver-aber-ruhender Middleware. Der SCHARF-Beweis
  (Gate an + echter Resolver) kommt naturgemäß mit der Platform-App, die den
  Resolver registriert — die Semantik selbst ist im Spike s5 bewiesen.

---

## 2026-07-22 — Abarbeitung Master-To-do (#7, #12, #3 komplett)

David gab Freigabe, alle offenen Punkte nacheinander umzusetzen (Blockierte
überspringen). Stripe ist noch NICHT live → der sichere Moment für die
Money-Path-Umbauten.

- **#7 Deploy-RAM — ERLEDIGT (server-seitig).** App-Server hatte bereits
  4,7 GB Swap (seit 18.07.), der 21.07.-Incident war also Swap-Thrashing.
  Fix: `NODE_OPTIONS=--max-old-space-size=2560` im Kopf der ploi-User-
  `~/.bashrc` (VOR dem PS1-Guard — ploi-Deploys laufen als ssh→bash und lesen
  genau diesen Kopf; pm2-Laufzeit via cron-resurrect bleibt unberührt).
  Verifiziert: ssh-Kommando zeigt 2752-MB-Heap-Limit. Backup:
  `~/.bashrc.bak-node-options`.
- **#12 Demo-Passwörter — GEGENSTANDSLOS (verifiziert).** Alle 3 Prod-
  Instanzen haben KEINE @demo.local-User (nur Davids Konten, Betreiber
  passwortlos/OTP). Die Seed-Demo-User mit Repo-Passwort existieren nur
  lokal/CI — dort ist das bekannte Passwort gewollt.
- **#3.1 (#6b) Cross-Sub VOLLSTÄNDIG — GEFIXT (Stripe als Autorität).**
  Statt Einzel-Abo-Zwangskündigung (destruktiv, verworfen): der free-Fallback
  fragt jetzt DIREKT bei Stripe nach, ob für den Workspace ein anderes
  lebendes Abo existiert (`listCustomerSubscriptionSummaries`, billing;
  injizierter `hasOtherActiveSubscription`-Vertrag, A14 via App-Plugin).
  Damit ist die apply-plan-Rebind-Lücke des Teilfixes egal — die lokale
  stripeSubscriptionId ist nur noch Vorfilter, Stripe entscheidet. Fehlerpfade
  jetzt konsistent: transiente Fehler WERFEN (Webhook 500 → Stripe retryt),
  404-Workspace = legitimer Skip; das frühere stille return hätte den Retry
  verhindert.
- **#3.2 (#7a) Owner-Portal-Mismatch — GEFIXT (Workspace-Customer).** Beide
  Workspace-Checkouts (Betreiber + Owner) binden ans neue
  `ensureWorkspaceCustomer` (App-Utility, `createStandaloneCustomer` aus
  billing, Race-Dedupe nach B11-Muster, Id auf der workspace-Row). Das
  Owner-Portal öffnet `workspace.stripeCustomerId` statt des userId-Lookups —
  kein 404 mehr nach Betreiber-Checkout, und kein Daten-Leak (jeder Workspace
  hat seinen eigenen Customer). App-eigene Abos (billing-Layer) bleiben
  user-gebunden, unverändert.

---

## 2026-07-21 (Tag 2) — Money-Path-Härtung Runde 3 (vor Stripe-Live)

Abarbeitung der offenen Analyse-Funde (unten), soweit ohne Live-Billing-Risiko
autonom machbar:

- **HOCH Cross-Sub-Kannibalisierung — TEILWEISE gehärtet, Restrisiko OFFEN.**
  Migration control-009 gibt `workspaces.stripeSubscriptionId`; der Handler
  speichert bei `apply-plan` die maßgebliche Sub und degradiert bei
  `subscription.deleted` nur, wenn die gekündigte Sub die hinterlegte ist
  (pure `shouldApplyFreeFallback`, unit-getestet, + fail-CLOSED bei Lesefehler).
  Das schließt den häufigen Fall (altes Abo sofort gekündigt, neues gilt).
  **Nicht vollständig** (adversariales Re-Audit, 2026-07-21): der APPLY-Pfad
  überschreibt `stripeSubscriptionId` bedingungslos (last-writer-wins). Bei
  ZWEI koexistierenden aktiven Abos rebindet ein Zwischen-`active`-Event des
  cancel-at-period-end-Abos den Speicher aufs alte Abo → beim späteren
  `deleted` fällt der Workspace auf free, obwohl das zweite Abo zahlt. Auch der
  umgekehrte Fall (das gespeicherte Abo wird gekündigt, ein älteres bleibt
  aktiv) degradiert falsch. **Vollständiger Fix (offen, braucht David — Live-
  Billing):** Einzel-Abo-Invariante durchsetzen (bei `apply-plan` andere
  aktive Workspace-Abos via Stripe kündigen) ODER free-Fallback nur, wenn
  KEIN weiteres aktives Abo des Workspace existiert (Query gegen die billing-
  `subscriptions` — braucht einen billing-Vertrag, A14). Die Vorbedingung
  (zwei aktive Abos) entsteht nur über eine Checkout-Race gegen den noch nicht
  angewandten Webhook — der `isPaidPlanKey`-Doppelabo-Guard ist check-then-act.
- **LOW Duplicate-Import `BillingInterval` — GEFIXT.** studio-Typ zu
  `WorkspaceBillingInterval` umbenannt (A14: studio bleibt vom billing-Layer
  entkoppelt, eigener Name statt Cross-Layer-Import) — Nuxt-Warnung weg.
- **LOW stille Truncation Plan-Sync — GEFIXT.** `applyWorkspacePlan` paginiert
  jetzt ALLE Sites eines Workspace (statt `Query.limit(100)`), damit ein
  Abo-Update nie still nur die ersten 100 Sites grantet.
- **MITTEL Owner-Portal-Mismatch — BEWUSST OFFEN (braucht Davids Freigabe).**
  Der saubere Fix ändert, an WELCHEN Stripe-Customer ein Live-Abo gebunden
  wird (Owner- statt Betreiber-scoped). Nicht autonom auf dem Money-Path
  geändert; das heutige Verhalten (404 im Owner-Portal, wenn der Betreiber
  ausgecheckt hat) ist SICHER — der naive Fix (Betreiber-Customer im
  Owner-Portal öffnen) würde im Agentur-Modell fremde Abos desselben
  Customers exponieren (Daten-Leak). **Empfohlener Fix:** Workspace-scoped
  Stripe-Customer beim Checkout (Customer pro Workspace/Owner, auf der
  workspace-Row gespeichert), Portal öffnet `workspace.stripeCustomerId`.
  Braucht eine billing-Util-Erweiterung (`createSubscriptionCheckoutSession`
  mit explizitem Customer statt immer `event.context.user`) — vor Stripe-Live
  mit David.

---

## 2026-07-21 (Nacht) — Autonomer Durchlauf: Fixes + Analyse + Live-Preise

David gab Freigabe, nachts so viele offene Punkte wie möglich umzusetzen und
aktiv nach neuen zu suchen. Ergebnis:

### Live-Preise angelegt (Stripe-Connector)
Über den autorisierten Stripe-Connector 4 **Live**-Preise idempotent angelegt
(EUR, von David bestätigt): `workspace_pro_monthly` 19 €, `workspace_pro_yearly`
190 €, `workspace_business_monthly` 49 €, `workspace_business_yearly` 490 € —
Produkte `prod_UvTbOz5jtnqCXn` (Pro) / `prod_UvTcGRkKpAlYse` (Business). Der
Connector läuft im **LIVE**-Modus (`livemode:true`) — vor jedem Schreiben geprüft.

### Bugfix: Plan-Wechsel-Doppelabo (Guard)
Beide Workspace-Checkout-Routen (Kunde + Betreiber, apps/control/server) blocken
jetzt einen zweiten Checkout, wenn der Workspace schon einen Bezahl-Plan hat
(409 → Portal). Pure `isPaidPlanKey` + Tests. Verhindert Doppelabrechnung.

### Deploy-Härtung: Verify akzeptiert Nachfahren-SHA
Die wiederkehrende Push-Race (ploi baut latest-main, Verify erwartet Trigger-SHA)
ist behoben: das Verify akzeptiert BUILD auch, wenn git beweist, dass EXPECTED
ein Vorfahre von BUILD ist (git fetch + merge-base --is-ancestor). Fail-safe
erhalten (nie false-pass). Direkt danach live erprobt (Release+Core-Race sauber
konsolidiert durch Abbrechen der überholten Deploys + einen gehärteten Deploy).

### Analyse-Pass (Agent) — neue offene Punkte
- **HOCH — Cross-Subscription-Kannibalisierung:** `handleWorkspaceSubscriptionUpdate`
  macht `free-fallback` bei `subscription.deleted` allein per `metadata.workspaceId`;
  der Stale-Guard wirkt nur pro `stripeSubscriptionId`. Existieren zwei Subs für
  EINEN Workspace, degradiert das Kündigen der alten den Workspace auf free,
  obwohl ein neueres Abo ihn hochgestuft hat. Der neue Doppelabo-Guard verhindert
  die Vorbedingung (kein Zweit-Checkout), heilt die Fulfillment-Logik aber NICHT.
  **Sauberer Fix (offen, braucht Migration):** `stripeSubscriptionId` auf der
  workspace-Row speichern; free-fallback nur, wenn die gekündigte Sub die aktuell
  hinterlegte ist. Nicht autonom gemacht (Prod-Schema-Migration).
- **MITTEL — Owner kann Betreiber-Abo nicht selbst verwalten:** Betreiber-Checkout
  bindet den Stripe-Customer an die Operator-userId; die Owner-Portal-Route sucht
  per Owner-userId → 404. Fix: Betreiber-Checkout sollte `ensureCustomer` für den
  Workspace-Owner machen. Offen.
- **MITTEL — kein Rollen-Check auf Owner-Checkout:** `requireWorkspaceMember`
  akzeptiert jedes Mitglied; heute entschärft (accept.post legt alle als `owner`
  an). Bei echten Mehrstufen-Rollen nachziehen.
- **LOW (gefixt) — malformed `requires`-JSON** in workspaceGrants: jetzt defensiv
  geparst (kaputte Row → [] + Log statt Webhook-500-Endlosschleife).
- **LOW (offen) — stille Truncation** bei >100 Sites/Grants (Query.limit(100) ohne
  Pagination im Plan-Sync). Heute unkritisch.
- **Saubere Bereiche (bestätigt):** alle 26 Server-Routen mit Auth-Guard, keine
  TODO/FIXME im Prod-Code, i18n de/en-Parität, Migrationen 409-idempotent,
  Fehler durchweg maskiert.

### Analyse-Pass 2 (Agent) — Core-Security: 0 kritisch, 0 hoch ✅
Auth/Session/RBAC/Realtime/GDPR/Secrets „außergewöhnlich sauber" (Defense-in-Depth).
Verifiziert sauber: Admin-/Session-Client-Trennung (kein Rechte-Eskalations-Missbrauch),
Session-Cookie httpOnly+strict+secure, OAuth-Redirects origin-gebunden (kein
Open-Redirect), RBAC-Guards + Rollenvergabe mit Eskalations-/Last-Admin-/Self-
Lockout-Schutz, Row-Permissions per-User, Realtime-Grenze = Row-Read-Permissions
(kein Fremd-Stream), Zod+Fehler-Maskierung überall, GDPR-Contributor vollständig,
keine Secret-Leaks/hardcodierten Keys. Restrisiken (alle infra-abhängig, bereits
im Code dokumentiert): In-Memory-Rate-Limit + X-Forwarded-For-Trust → **vor
horizontaler Skalierung** absichern (geteilter Rate-Limit-Store, Trust-Proxy
erzwingen); `sites.manage` global statt workspace-scoped → erst bei mehreren
Agentur-Operatoren (H2) relevant.

### NEUER wichtiger Fund: Rechts-Seiten fehlen (Impressum/AGB/Datenschutz)
studio hat KEINE Legal-Pages und `pukalani.auth.termsUrl` ist leer. Doppelt kritisch:
(1) für eine deutsche SaaS **gesetzliche Pflicht** (Impressum, AGB, DSGVO-
Datenschutzerklärung); (2) Stripe **verlangt** AGB-/Datenschutz-URLs für die
Live-Billing-Portal-Konfiguration → der „Plan-Wechsel via Portal"-Teil des
Doppelabo-Fixes ist darauf blockiert. Rechtstexte gehören zu David/Anwalt (nicht
KI-generiert). Portal-Config ist als fertiger Schritt vorbereitet (features:
subscription_update mit den 4 Preisen + proration, cancel, payment_method,
invoice_history), sobald die Legal-URLs existieren.

---

## 2026-07-21 — Stripe maximal vorbereiten (ohne Aktivierung)

David will Stripe so weit wie möglich fertig machen, aber Bank/Live-Aktivierung
erst später (er sucht noch eine Bank). Umgesetzt (test-mode-ready):

### Feature: Jahres-Abos für Workspace-Pläne
`ControlPlan` um optionales `lookupKeyYearly` erweitert (additiv, bricht nichts);
Katalog pro/business mit `workspace_{pro,business}_yearly`. Pure
`pickLookupKey(plan, interval)` wählt den Preis (yearly-ohne-Preis → Fallback
monthly). Beide Checkout-Routen (Kunde + Betreiber) akzeptieren `interval`,
Kunden-UI bekommt einen Monats/Jahres-Umschalter. **Wichtig/elegant:** der
Webhook bleibt unberührt — der Plan steht in `subscription.metadata`, nicht im
Preis, also ist das Intervall für den Lifecycle transparent. Commit `7864e7d`.

### Skript: `scripts/stripe/ensure-prices.mjs`
Legt alle 4 Products/Prices idempotent an (Vorschau ohne `--apply`), liest nur
`STRIPE_KEY` aus Davids Shell, erkennt Test/Live am Präfix. Beträge = Platzhalter.
Damit ist der Test-Mode-Katalog jetzt per Skript anlegbar — kein Handklicken,
keine Bank nötig. Details: [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md).

---

## 2026-07-21 — Deploy-Incident: studio-Build-Starvation + Push-Race (behoben)

Beim Ausrollen des Billing-Fixes (`532bb4e`) sind ZWEI Pipeline-Schwächen
aufgetreten. **Kein Outage** — dank ZDT (Stufe 2) lief studio durchgehend auf
dem alten Build weiter; behoben durch einen einzelnen studio-Deploy. Endstand:
alle 3 Sites auf `f8601c5`.

### Befund 1 (Auslöser): Push-Race — ploi baut *latest*, Verify erwartet Trigger-SHA
Fix- und Doku-Commit kurz hintereinander gepusht → als die Deploy-Kette portfolio
erreichte, baute ploi bereits den neueren Commit, während das Verify-Gate den
Trigger-SHA erwartete → Mismatch → Gate schlug (korrekt) an und **stoppte die
sequentielle Kette vor studio**. Das Gate hat richtig gehandelt; der Fehler war
das zu schnelle Doppel-Push.
- **Sofort-Mitigation:** Commits bündeln und in EINEM Push rausgeben; nach einem
  App-Push warten, bis der Deploy grün ist, bevor der nächste kommt.
- **Empfohlene Härtung (braucht Davids Review — NICHT autonom gemacht):** das
  Verify akzeptiert auch einen *Nachfahren* des EXPECTED_SHA
  (`git fetch origin $BUILD && git merge-base --is-ancestor $EXPECTED $BUILD`).
  Vorsicht: aktuell ist das Gate **fail-safe** (falscher Fehlalarm statt
  falscher Erfolg); die Härtung darf diese Eigenschaft nicht kippen.

### Befund 2 (der wichtigere): studio-Build verhungert als 3. Build in Folge
Ein sauberer `workflow_dispatch` (kein Race) baute comments ✓ + portfolio ✓, dann
**studio ✗** — Health oszillierte `n/a`↔`7dc1c8d`, nie `f8601c5`. Ursache: der
2-Core/3,7-GB-Server (≈3,4 GB je Nuxt-Build) verkraftet studio (größte App) nicht
als DRITTEN Build direkt nach comments+portfolio → OOM/Starvation. **Beweis:** ein
studio-Deploy ALLEIN bei idle-Server war in ~140 s grün. Die bestehende
Sequenzialisierung (keine PARALLELEN Builds) reicht also nicht — auch sequentiell
kann der letzte, größte Build verhungern.
- **Recovery (gemacht):** studio-ploi-Deploy einzeln gefeuert, Server idle → grün.
- **Empfohlene Fixes (Davids Entscheidung):** (a) Swap/RAM erhöhen; (b) je Build
  `NODE_OPTIONS=--max-old-space-size` kappen; (c) Build-Pause/Cooldown zwischen den
  Sites; (d) Verify-Timeout großzügiger. → als offener Punkt in OPEN-ITEMS.

---

## 2026-07-20 (später) — Money-Path-Review vor Stripe-Live

### Fix: `invoice.payment_failed`-Notify nur beim echten Statuswechsel
Beim Review des Billing-Money-Paths (vor dem Live-Gang) gefunden: der In-App-
Benachrichtigungs-Zweig bei `invoice.payment_failed` lief **unabhängig** vom
Stale-Guard. Weil `isStale` strikt `>` nutzt, gilt ein Stripe-Retry (gleicher
`event.created`) als „angewandt" → der Hinweis „Zahlung fehlgeschlagen" feuerte
mehrfach (Stripe liefert at-least-once + retryt auf 5xx). Fix: `upsertSubscription`
gibt jetzt `previousStatus` zurück; notify nur beim **Übergang** in
`past_due`/`unpaid` (pure `isNewPaymentFailure` + Unit-Tests). Commit `532bb4e`.

### Befund: der restliche Money-Path ist sauber
Geprüft und für gut befunden: Checkout (planId Zod-validiert gegen konfigurierte
Pläne → kein Preis-Tampering; userId via `client_reference_id` +
`subscription_data.metadata`), Webhook-Idempotenz (Upsert nach
`stripeSubscriptionId` + Unique-Race-Handling), Entitlements (fail-closed bei
DB-Fehler), Studio-Grant-Sync (deklarativer Replace + pure
`subscriptionUpdateToAction` → Webhook-Retry-sicher). Kein weiterer Fix nötig.

---

## 2026-07-20 — Wartungs- & Horizont-3-Block

### Entscheidung: Multi-Tenancy = Pool + Silo (zwei-stufig)
Die frühere M10-Weiche „A (Projekt-pro-Kunde) **vs.** B (shared-DB+tenantId)"
ist zu **„A und B"** aufgelöst: gepoolte Standard-Kunden (shared-DB + `tenantId`)
+ Silo (eigenes Projekt) für Spezial-/Enterprise-Kunden, mit *einer* mandanten-
agnostischen Datenzugriffs-Schicht. Idee von David: Spezialprojekte bauen →
Features in den Pool „fließen" lassen. Bewertung: trägt (Standardmuster „Pool +
Silo"). Blueprint + bestandener Isolations-Spike:
[HORIZONT-3-POOL-SILO-BLUEPRINT.md](referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md),
`spikes/s5-pool-silo` (15/15, inkl. Defense-in-Depth-Beweis).

### Korrektur: vue-tsc 3.3.7 deckt echten latenten Typfehler auf (nicht Flake)
Dependabot #12 (vue-tsc 3.3.5→3.3.7) schlug fehl, weil das strengere vue-tsc
Inline-Handler `@click="x = y"` auf **Nuxt-UI-Komponenten** ablehnt: der
Zuweisungs-Ausdruck gibt `boolean`/Wert zurück, nicht zuweisbar gegen den
Prop-Typ `(e) => void | Promise<void>` (die void-Widening-Sonderregel greift
nicht gegen einen **Union**-Rückgabetyp). Betraf 123 Handler in 41 Dateien.
**Migriert** (`() => { … }`, `$event`-Fälle als `($event) => { … }`) + zwei
Sonderfälle (StudioEditor `draft!`, TicketModal `splice`). Erkenntnis: der
Migrationswert lag nicht im Bump, sondern im Aufdecken einer latenten
Typ-Unsauberkeit. Commit `7dc1c8d`.

### Entscheidung: @types/node bleibt auf ^22.x (Dependabot #10 abgelehnt)
`@types/node` 22→26 würde die Typen ÜBER die Node-22-Runtime heben (typisiert
APIs, die es zur Laufzeit nicht gibt). Bei `^22.x` bleiben, bis die Runtime auf
Node 26 geht. PR #10 geschlossen.

### Befund: @tiptap/extensions-Peer-Drift ist ein Nicht-Problem
Die „unmet peer"-Warnung (extension-placeholder@3.27.1 will extensions@3.27.1,
bekam 3.28.0) erschien nur bei explizitem `pnpm update` (Re-Resolution). Der
committete Lockfile ist durchgehend konsistent bei 3.27.1, ein normales
`pnpm install` (CI-Pfad) driftet nicht. Kein Fix nötig; bei künftigem Wieder-
auftreten wäre ein `pnpm.overrides`-Pin auf 3.27.1 das Mittel.

### Änderung: deploy.yml überspringt jetzt auch `spikes/`
Der Doku-/CI-Skip-Filter (2026-07-19 eingeführt) ignoriert zusätzlich
`spikes/**` — Wegwerf-Spike-Code baut nie App-Output, ein Spike-Commit soll
keinen 3-Site-Build auslösen. Commit `495c238`.

### Doku: Stripe Go-Live Runbook erstellt
Der in BILLING-STRIPE.md Phase B-8 #29 vertagte Betriebs-Runbook existiert jetzt:
[STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md). Kernpunkt:
`lookup_key`s sind mode-stabil → Go-Live = Live-Preise mit gleichen Keys + Key-
Tausch in der .env + `pm2 reload`, **kein** Deploy. Live-Key-/Bankdaten-Schritte
bleiben bei David (Sicherheits-Grenze).

---

## 2026-07-19 — Go-Live-Nachlese & Auto-Deploy-Härtung

### Korrektur: UptimeRobot-„DOWN" war HEAD-404, nicht RAM-Druck
Der Monitor meldete portfolio/studio als DOWN. Erst-Diagnose (RAM-Druck während
Studio-Build) war **falsch**. Ursache: `health.get.ts` matcht nur GET, UptimeRobot
Free probt per **HEAD** → 404. Fix: Datei zu `health.ts` (ohne Methoden-Suffix)
umbenannt → beantwortet GET **und** HEAD. Merke: `.get.ts` ≠ HEAD.

### Korrektur: „S0-Multi-Projekt-Auflösung" ist nur ein Spike, nicht gebaut
In der Live-Diskussion fälschlich als „schon gebaut" bezeichnet. Tatsächlich:
`spikes/s0-multi-project` = bestandener Wegwerf-Spike; produktiv läuft reines
Single-Tenant-per-Deployment (statische Projekt-Bindung in `appwrite.ts`).
Festgehalten in [M10-HORIZONT-3-SKALIERUNG.md](archiv/M10-HORIZONT-3-SKALIERUNG.md).

### Änderung: deploy.yml überspringt Doku-/CI-/Meta-Pushes
Ein main-Push mit ausschließlich `docs/**`/`.github/**`/`*.md`-Änderungen baut
identischen App-Output → der changes-Step vergleicht den Prod-Commit gegen den
neuen Stand und überspringt den 3-Site-Build. Fail-safe: unbekannter Prod-SHA /
`workflow_dispatch` → deployt immer. Selbsttest bestanden. Commit `ea93f3b`.

### Entscheidung: Org-Konsolidierung + saubere Projekt-IDs
Kurzzeitig zwei Appwrite-Orgs (Nebeneffekt der Key-Blocker-Umgehung) → auf EINE
Org „Pukalani App" mit genau 3 Projekten (comments/portfolio/studio, freie IDs
ohne `-prod`) konsolidiert. Projekt-IDs sind unveränderlich → neu anlegen +
per `PATCH /projects/:id/team` (OHNE x-appwrite-mode-Header) transferieren.
Details im Memory `session-handover-2026-07-16`.

---

## Wie dieses Log zu pflegen ist

Neue Einträge **oben** unter einem Datum. Rein für Beschlüsse/Korrekturen/Ideen,
die sonst nirgends stehen — kein Ersatz für die `plans/*`-Detaildokumente oder
die Git-Historie. Format je Eintrag: **Kategorie: Titel** (Entscheidung /
Korrektur / Änderung / Befund / Doku / Idee) + 2–4 Sätze „warum", inkl.
verworfener Alternative, mit Verweis auf Commit/Doc.

## 2026-07-27 — Audit-Folgeentscheidungen (David, per Klick-Fragen)

1. **Header-Nav (S9):** Inline-Reihe mit Überlauf (ab ~5 Einträgen Mehr-Dropdown).
2. **Sprach-UI (S9):** DisplaySettingsMenu überall (marketing behält den
   schlanken Switcher — kein themes-Layer).
3. **Footer (S9):** Brand + legalLinks + optionaler Changelog-Link, aus Config.
4. **Mitglieder-Registrierung (S1):** pro Community schaltbar (USwitch „Offene
   Registrierung", Default AN); Invite-Code bleibt nur fürs GRÜNDEN.
   Übergang: ehrlicher Hinweis auf der Register-Seite.
5. **Rechtstexte je Community (S7):** der Kunde pflegt Impressum/Datenschutz
   als CMS-Seiten; Vorlagen beim Onboarding; Footer verlinkt sie. Demo
   Morgenlicht verlinkt auf das pukalani.app-Impressum.
6. **Demo-Seeds (S4):** ZWEISPRACHIG ausbauen (Davids Wahl, bewusst gegen die
   Empfehlung „so lassen") — EN-Besucher sollen englische Beispiele sehen.
7. **Wording (K10):** Kunden-Dashboard (admin-Layer) sagt „Produkte";
   Control Plane bleibt bei „Features".
8. **Pool-Reihenfolge:** Events zuerst durch die Datentür, dann Kurse.
9. **Alte Worktrees:** Docs-App wird JETZT reviewt (Ergebnis an David);
   Block-Editor bleibt geparkt (Feature-Stopp).

## 2026-07-28 — P10-Folgeentscheidungen (David: „leg los" auf die Empfehlungen)

10. **N6:** Default-Theme wird im Kunden-Picker umbenannt (Anzeige-Label, KEIN Key/Datenwert).
11. **N7:** /changelog wird auf Tenant-Hosts gegated (Betreiber-Changelog ist kein Kundeninhalt); Silo + Kontroll-Hosts unverändert.
12. **N9:** Site-Owner dürfen Theme/Variante ihrer Community selbst wählen — über die Service-Naht (tenants.theme/variant, Muster S1-Registrierungs-Switch), Capability branding.manage. Das Operator-Theme-Studio (Custom-Theme-EDITOR) bleibt system.manage.
13. **N4:** Die Demo bleibt bei Google indexierbar (Schaufenster).
14. **help.pukalani.app** bestätigt; Deploy-Kette wird gebaut (Prod-Port 3006).
15. **Nächstes Produkt:** Kurse durch die Datentür (letzter Silo-Gefangene der Produkt-Bilanz).

## 2026-07-29 — Theme-Entscheidungen (David)

16. **Entscheidung: Das Standard-Theme heißt „Aloha" (B3).** „Sunrise" (aus N6) stand im Picker direkt neben der Katalog-Farbwelt „Sunset" — zwei verwandt klingende Namen für Unverwandtes. Verworfen: die Id mit umbenennen — `default` steckt in `tenants.theme`, `data-theme`, CSS-Dateinamen und gespeicherten Kunden-Configs, ein Rename dort wäre eine Datenmigration ohne Nutzen. Geändert ist nur das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n: Theme-Namen sind Eigennamen).

17. **Entscheidung: Auf Community-Hosts gewinnen die Farben der Community (B5).** Bis dahin gewann immer das Theme-Cookie des Besuchers — wer sich irgendwann eins ausgesucht hatte, sah JEDE Community in seinen Farben, und zwei Besucher sahen dieselbe Community verschieden. Das bricht das Produktversprechen („unter deinem Namen und deinem Design"), für das der Kunde zahlt. Der Theme-Wähler VERSCHWINDET dort, statt als „nur für dich, nur hier" beschriftet zu werden (verworfene Alternative): die Wahl hätte nach der Umkehr auch für den Wählenden selbst keine Wirkung mehr, ein Wähler wäre also entweder wirkungslos oder falsch beschriftet. Hell/Dunkel bleibt ausdrücklich Besucher-Sache. Silo-Apps, Kontroll-Hosts und Playground unverändert.

## 2026-07-29/30 — Das Geschäftsmodell wird sortiert (David, in mehreren Runden)

18. **Entscheidung: Die COMMUNITY ist das zahlende Objekt, `workspaces` fällt weg
    (A6).** Befund davor: alle vier Checkout-Routen hingen an `workspaces`, das Wort
    `tenant` kam im Geldpfad nicht vor, und `tenants.plan` — das Quota und
    Produkt-Sichtbarkeit steuert — wurde nur vom Wizard, vom Testphasen-Sweep und
    vom Betreiber-Auswahlfeld geschrieben. Ein Pool-Kunde hätte also bezahlen und
    auf `basic` bleiben können. Verworfen: die fehlende Verbindung nachrüsten und
    `workspaces` behalten — das hätte zwei Plan-Felder, zwei Mitglieder-Tabellen und
    zwei Vokabulare dauerhaft festgeschrieben. Die Agentur-Idee (ein Kunde, mehrere
    Sites unter einem Vertrag) war Horizont 2 und ist heute niemandes Bedarf.
    Stripe-Kunde und Abo stehen künftig an der Community; eine **Besitz-Übergabe ist
    gesperrt**, solange ein Abo läuft und der neue Owner keine Zahlungsmethode hat —
    sonst reist die Karte des Vorbesitzers mit. Blockiert A2 (Stripe-Live).

19. **Entscheidung: Gekauft wird im Dashboard der Community.** Dort ist der Owner,
    wenn er an ein Limit stößt — Schranke und Ausweg an derselben Stelle.
    `my.pukalani.app` zeigt Rechnungen und Zahlungsmethode.

20. **Entscheidung: Bezahlte Communities (Owner nimmt Geld von seinen Mitgliedern)
    kommen NACH dem Go-Live** — in der Navigation bleibt der Platz („Payments"), das
    Produkt nicht. Das ist ein zweiter Geldfluss mit eigener Mechanik (Stripe
    Connect) und rechtlichen Folgen (wer ist Verkäufer, wer schuldet Umsatzsteuer,
    Auszahlungen, Widerruf). Erst muss Geldfluss 1 überhaupt ankommen.

21. **Entscheidung: Sichtbarkeit wird PRO COMMUNITY wählbar, Default öffentlich.**
    Heute sind Inhalte öffentlich (die posts-API antwortet Gästen mit 200), und die
    gesamte SEO-Arbeit pro Community-Host (canonical, hreflang, sitemap, robots,
    og:image) setzt das voraus. Verworfen: durchgehend geschlossen — das hätte die
    SEO-Arbeit gegenstandslos gemacht und dem Embed-Einsatz widersprochen.
    Der Preis der Wählbarkeit ist eine echte Grenze: bei „geschlossen" müssen
    Row-Permissions, SEO-Tags, sitemap UND og:image mitziehen, sonst steht der
    Inhalt in Googles Index und nicht auf der Seite.

22. **Entscheidung: Die zwei Betriebsmodelle heißen `Plattform` und `Studio`**
    (Kundensprache); `pool`/`silo` bleiben im Code. Folge: der Alias
    `studio.pukalani.app` musste weg, sobald „Studio" der Kundenname ist — er zeigte
    die Betreiber-Konsole. **Erledigt am 2026-07-30** (ploi → Domain aliases;
    antwortet jetzt 404). Und die Seite „Theme-Studio" heißt künftig nur
    „Themes", damit neben der Menügruppe „Studio" nichts Gleichnamiges steht.

23. **Entscheidung: Die Umbenennung geht auf `community`, nicht auf `site` (E8).**
    Zuerst hatte David „`site` gewinnt, vollständig" gewählt; seine eigene
    Dashboard-Navigation hat die Frage Stunden später besser beantwortet — dort
    heißen die Kunden-Objekte „Communities" und das Register „Websites". Damit heißt
    jede Sache im Code wie in der Oberfläche, und die Kollision (`sites` war schon
    belegt) entfällt, weil `sites` gar nicht mehr gebraucht wird.

24. **Entscheidung: EINE Dashboard-Struktur mit drei Ebenen (E9)** — Betreiber nur
    auf Kontroll-Hosts, Community auf ihrem Host für ihr Team, Konto überall.
    Verworfen: alles in control bauen und den Kunden später bedienen — das hätte die
    Community-Einstellungen ein zweites Mal entstehen lassen, mit zwei Wahrheiten,
    genau wie bei Workspaces/Tenants. Folge für David: die Einstellungen seiner
    eigenen Community sieht er auf ihrem Host, nicht in control.

25. **Entscheidung: `UTable` ist der Standard für alle Datenlisten (B6).** Heute 2
    von ~20; die übrigen 18 ziehen nach. Danach braucht keine neue Liste eine
    Gestaltungsentscheidung.

26. **Claudes Entscheidung (angekündigt, nicht widersprochen): die
    `entitlements`-Mechanik bleibt stehen und verschwindet nur aus dem Menü.** Es ist
    die Lizenz-Mechanik der Studio-Seite (eine signierte Datei sagt einer FREMDEN
    Installation, welche Produkte sie betreiben darf) und nicht Teil der Abrechnung —
    `workspaces` war nur ihr Rechnungs-Behälter. Heute unbenutzt und damit kostenlos;
    beim ersten Studio-Kunden wäre der Neubau ein Projekt.

27. **Entscheidung (David, 2026-07-31): die Marketing-Landingpage läuft VOLLSTÄNDIG
    auf Nuxt UI** — keine individuellen UI-Eigenbauten, wo eine Komponente existiert.
    Bewusst aufgegeben: die „kein JS / funktioniert vor Hydration"-Eigenschaften von
    Header-Dropdown, Mobil-`<details>` und FAQ-`<details>`; die Scroll-Inszenierung
    (`data-reveal`/Parallax) ist verzichtbar, wo sie der Struktur im Weg steht.
    Umgesetzt in fünf Paketen (P1 Theme-Brücke: eigene `puka`-Palette als `primary`
    statt der zweckentfremdeten Statusfarbe `warning` · P2 Karten/Badges/Grids ·
    P3 Heros/CTAs · P4 Pricing · P5 Header/Footer/FAQ/Tabs). Dokumentierte Ausnahmen
    ohne Äquivalent: Vergleichstabelle (Semantik), PukaMark, Glow, Produkt-Mock,
    `tone-*`-Hintergründe. SEO-Netz dabei: FAQ-Antworten und alle Produkt-Links
    bleiben per `unmount-on-hide=false` im SSR-HTML.

## 2026-08-04 — Silo-Strategie: comments bleibt, neue Produkte ohne eigene Site

**Entscheidung (David):** `comments.pukalani.app` bleibt als das EINE lebende
Silo bestehen — es verdient seine eigene Instanz durch drei Rollen, die kein
anderer Host übernehmen kann: E2E-Anker (gesamte Playwright-Suite + CI-Wegwerf-
Appwrite), Embed-Produkt für fremde Seiten, und der lebende Beweis, dass die
Layer-Architektur die Silo-Form des Studio-/Enterprise-Angebots trägt. Dazu
liefert es die Gegenform für Grenzbeweise (Silo `read("users")` vs. Pool-Labels
— Presence- und Handle-Beweise brauchten BEIDE Formen).

**Die Regel daraus:** Isolation im CODE und Isolation im DEPLOYMENT sind zwei
Entscheidungen. Neue Produkte bekommen IMMER einen eigenen Layer (billig,
erzwingt sauberen Schnitt) — aber standardmäßig KEINE eigene Site/Instanz
(teuer: Migrationen je Instanz, Env-Drift wie F44, TLS, Schema-Parity).
Entwickelt wird im Playground, gezeigt auf demo.pukalani.app; eine eigene Site
gibt es nur mit kundenförmigem Grund. `photos` lebt das Muster bereits
(App existiert, nie ausgerollt).

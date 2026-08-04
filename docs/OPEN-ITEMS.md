# Offene Punkte

**Stand: 2 offen · 3 geparkt/wartend · 9 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

Stand: **2026-08-03**. Hier steht **nur, was noch offen ist** — in der
Reihenfolge, in der es abgearbeitet wird. Alles Erledigte (mit Begründung,
Beweis und den gelernten Lektionen) steht final in
**[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)**.
**Pflege-Regel (David, 2026-07-30):** diese Datei kurz halten — pro Eintrag
höchstens drei Zeilen, Einzelheiten leben im verlinkten Plan, und Erledigtes
zieht **sofort** nach COMPLETE um.

Legende — **Prio:** Hoch / Mittel / Niedrig ·
**Aufwand:** S (Stunden) · M (ein Tag) · L (mehrere Tage) · XL (Woche+) ·
**Braucht David?** Nein = ich mache es allein.

## ✅ Jetzt dran — in dieser Reihenfolge

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| 3 · A1 | **Echte Rechtstexte** für Impressum, Datenschutz und AGB. Die Seiten stehen, die Texte sind Entwürfe mit sichtbarem Hinweis. Schaltet Schritt 4 frei. | Hoch | S — Adresse eintragen, Anwalt lesen lassen | Ja: nur David (ggf. Anwalt) | [Notizen](#notizen) |
| 4 · A2 | **Stripe auf echtes Geld umstellen.** Vorher die 6 Testmodus-Proben durchspielen (**Anleitung dabei mitschreiben — ab Schritt 2 veraltet, Workspace-Welt**) und prüfen, ob Stripe die 19 % im Preis rechnet (sonst widerspricht die Landing). Braucht 2 und 3. | Hoch | M — Runbook abarbeiten | Ja: Bank, Keys, Webhook — fast alles David | [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) · [Test-Walkthrough](runbooks/STRIPE-TEST-WALKTHROUGH.md) |

## ⏸️ Geparkt / wartet — in Arbeitsreihenfolge

Die Reihenfolge ist die, in der wir sie anfassen würden: erst was in Minuten
geht, dann was eine Entscheidung braucht, dann die großen Brocken. **Die
Aufwände sind ehrlich gemeint** — Zeilen 1–2 sind zusammen eine Viertelstunde,
ab Zeile 3 geht es um Tage bis Wochen. Wer die Liste als Ganzes für einen
Nachmittag hält, plant an F1/F3/F7 vorbei.

| # | Reihenfolge | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Wartet auf … |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | **Discussions — Stufe 1 GEBAUT und gemergt** (2026-08-03: Kategorien + Verwaltung, categoryId, öffentliche Seiten mit 301-Regel, Sortierung/Filter/Titel-Suche, Seitenleiste, Landing → „Kommentare"). Offen: Stufen 2–5 (Views/About/Guidelines · erweiterte Suche + Topic-Zustände · Badges · Trust Levels) und die SEO-Frage, ob die Landing-URL `/products/discussions` beim neuen Namen bleibt. | Mittel | Stufe 2: Tage | Ja: Priorisierung der Stufen | [DISCUSSIONS-KONZEPT.md](plans/DISCUSSIONS-KONZEPT.md) |
| F7 | 6 — Wochen | **Bezahlte Communities** — der Owner nimmt Geld von seinen Mitgliedern (Stripe Connect). Eigene Mechanik und eigene Rechtsfragen. **Schluckt D1** (Davids Entscheidung 2026-08-02): bezahlte Pool-Events/-Kurse ergeben erst mit Connect Sinn — sonst landete das Ticketgeld beim Betreiber und der Owner bräuchte je Preis einen lookup_key von David. Events-Hälfte technisch M (S7+A6 haben den alten Webhook-Wartegrund erledigt), Kurse-Hälfte L/XL (community-scoped Entitlements sind unentworfen). | Mittel | XL | Ja: Rechtsfragen | nach dem Go-Live; erst muss Geldfluss 1 (A6) ankommen |
| F3 | 7 — Wochen | **Silo → Pool:** `comments` und `portfolio` laufen als eigene Instanzen. Langfristig ist der Pool das Produkt, Silo bleibt das Enterprise-Angebot. | Niedrig | XL | Ja: strategisch | eine strategische Entscheidung |

---

<a id="notizen"></a>

## 📎 Anhang: Notizen

Hier steht, was zu einem offenen Punkt gehört, aber in kein Plan-Dokument
passt. Nichts davon ist eine zusätzliche Aufgabenliste — die eine Liste steht
oben.

### So arbeiten wir

Ein Durchgang, immer gleich — das ist die Arbeitsweise, die sich in den
Audit-Wochen bewährt hat:

1. **Griff wählen** — aus der Reihenfolge oben, nicht nach Lust. Ein Paket,
   nicht drei.
2. **Bauen** — bei mehreren unabhängigen Paketen je ein Agent in eigenem
   Worktree; sie committen dort, aber mergen NICHT.
3. **Prüfen, nicht glauben** — jeden Agenten-Befund am Code nachlesen, bevor
   er gemerged wird. Erfahrung: einzelne Meldungen halten der Prüfung nicht
   stand, und ein Agent hat schon Dinge „gefixt", die keine Fehler waren.
4. **Grün herstellen** — `pnpm lint`, `pnpm -r test`, `pnpm typecheck` der
   betroffenen Apps, `pnpm check:manifests`. **Und CI ansehen**
   (`gh run list --branch main --limit 8`), nicht nur die lokale Konsole: der
   E2E-Job war über einen Tag rot, ohne dass es jemand merkte.
5. **Deployen + live nachmessen** — Build-SHA je Host, der konkrete Beweis für
   das Gefixte, `node scripts/ops/verify-tls.mjs`.
6. **Nachtragen** — erledigte Punkte nach
   [OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md) (mit der Zeile
   **Gelernt:**, wenn etwas nicht auf Anhieb ging), bei
   Architektur-Entscheidungen eine Zeile in
   [DECISION-LOG.md](DECISION-LOG.md) und ggf. CLAUDE.md. Dann melden und auf
   David warten (paketweise, kein Dauerlauf).
7. **Entscheidungen als strukturierte Fragen** (Davids Regel, 2026-08-04):
   Braucht ein Punkt eine Entscheidung von David, wird sie NIE als
   Fließtext-Frage versteckt und NIE still defaultet — sondern als
   Auswahl-Frage gestellt: konkrete Optionen, je mit ehrlichem Trade-off,
   die Empfehlung als erste Option und als solche markiert. Mehrere offene
   Entscheidungen werden gesammelt und in einem Rutsch gefragt; die
   Antworten wandern SOFORT ins betroffene Plan-Dokument, ins
   [DECISION-LOG.md](DECISION-LOG.md) und in die Zeile hier. Bewährt bei den
   sieben Discussions-Entscheidungen (§ 3.8): Minuten statt Pendeln.

### Was gerade live ist

**7 Hosts:** **pukalani.app** (Landing, seit 2026-07-27 — Apex proxied über
Cloudflare, braucht am Ursprung KEIN Zertifikat mehr und kann das
Kunden-Wildcard damit nicht mehr überschreiben; TLS-Wächter alle 30 min),
**control** (Betreiber) + **my/start** (Kundenbereich + Wizard),
comments + portfolio, **platform** (Multi-Tenant, `*.pukalani.app`-Wildcard —
demo.pukalani.app als erster Pool-Tenant, neue Kundensite = ein Klick im
Control, kein Build), **help.pukalani.app** (Hilfe-Site, seit 2026-07-27) und
die interne Doku unter `control.pukalani.app/docs`. Auto-Deploy (6 Sites),
Zero-Downtime Stufe 2, Changelog-2B, Alerting, GDPR, pages-Layer
(/imprint,/terms,/privacy editierbar + Footer-Links). M1–M9 komplett,
Self-Service-Onboarding komplett, **alle sechs Kundenprodukte durch die
Datentür** (comments, posts, pages, moderation, events, courses).
Release **v3.0.0** (2026-07-28).
**Als Betriebssystem für eigene Sites: ~98 %. Als verkaufbares SaaS: ~85 %.**

### Einzelheiten zu den offenen Punkten

<a id="media-activity-prod"></a>

**F38 — Prod-Reihenfolge für `media` + `activity` im Pool.** Beide Layer sind
seit 2026-08-02 in `apps/platform` montiert (Begründung + Beweise:
[COMPLETE F38](OPEN-ITEMS-COMPLETE.md)). Lokal ist alles gefahren; für die
Produktion gilt genau diese Reihenfolge:

1. **Rechte am Pool-Projekt setzen (David, Console) — VOR allem anderen.**
   Migrations-Schlüssel: `buckets.read`, `buckets.write`, `files.read`,
   `files.write`. Laufzeit-Schlüssel: `files.read`, `files.write`. Ohne den
   ersten bricht `media-001` beim Anlegen des Buckets ab (401), ohne den
   zweiten scheitert danach jeder Upload, jedes Löschen und jedes Umschalten
   der Sichtbarkeit. Das ist der alte F36-Punkt — er war „heute folgenlos",
   bis media in den Pool zog.
2. **Migrieren:** `pnpm migrate --app platform`. Neu läuft dabei nur der
   media-Zweig (`media-001` … `media-005`, in dieser Reihenfolge, idempotent) —
   die Pool-Instanz hat den Layer nie gefahren, `media_items` und der Bucket
   `media` entstehen also frisch. `activity` bringt **nichts** mit: die Table
   `activities` gehört `system` und läuft auf jeder Instanz längst mit
   (system-014/017/021/025/026, alle gefahren).
3. **Dann erst deployen.** Kein Schema-Fenster in die andere Richtung: alter
   Code kennt `media_items` nicht, die Tabelle liegt also bis zum Deploy
   unbenutzt herum. Umgekehrt (Deploy vor Migration) antwortet
   `/dashboard/media` mit einem Fehler und der erste Upload sagt „Media bucket
   missing — run migrations".
4. **Nachmessen:** `packages/media/scripts/verify-pool-isolation.mjs` und
   `packages/activity/scripts/verify-pool-isolation.mjs` gegen die Pool-Env
   (beide räumen selbst auf); der activity-Beweis nennt am Ende die Zahl der
   Alt-Zeilen ohne `communityId` — die bleiben bewusst unsichtbar.

**C19 — `/de` war für englischsprachige Browser eine Endlosschleife.**
Code-Fix erledigt 2026-07-31, auf prod REPRODUZIERT und lokal behoben. Kein
Konfigurationsfehler, ein Modul-Bug: `@nuxtjs/i18n` 10.6.0 baut das
Redirect-Ziel per `joinURL('', '/', '/')` — ufo kollabiert lauter Schrägstriche
zu `''`, genau EIN Fall betroffen (Ziel = Wurzel UND keine Query; traf auch
Cookie-Kombinationen, nicht nur EN-Browser). 10.6.0 ist die einzige
existierende 10.6.x-Version — kein Upstream-Patch zum Nachziehen. Fix:
`packages/core/server/plugins/i18n-empty-redirect.ts` (`render:response`-Hook,
normalisiert JEDEN 3xx mit leerem Location auf die App-Wurzel + repariert den
meta-refresh-Body; bewusst sprachagnostisch — wird der Bug upstream behoben,
wird der Handler still wirkungslos). Die dokumentierten i18n-Entscheidungen
(kein fallbackLocale, redirectOn all) sind unangetastet; 10-Fälle-Matrix inkl.
Crawler-Fall grün, gegen marketing UND comments verifiziert. **Auf
pukalani.app seit 2026-07-31 DEPLOYED und live nachgemessen** (302 auf `/`
statt leerem Location). Offen nur noch: die übrigen Hosts (my/control/
comments/portfolio/help) erben den Fix über core mit ihrem jeweils nächsten
Release — keine Eile, der Bug traf praktisch nur die Landing (einzige Seite,
deren `/de`-Links öffentlich geteilt werden).

**A1 — Rechtstexte.** Entwürfe sind LIVE (2026-07-23): vollständige,
stack-spezifische Texte (Impressum § 5 DDG, DSGVO-Datenschutzerklärung mit
Hetzner/Resend/Stripe/Cookies/Betroffenenrechten, AGB mit Plänen/Kündigung/
UGC/Haftung) DE+EN auf /imprint, /terms, /privacy — jeweils mit sichtbarem
„Entwurf"-Hinweis und `noindex`. Rest bei David: Adresse und
USt-IdNr.-Platzhalter im Dashboard ausfüllen + Anwalt drüberschauen lassen.
Schaltet A2 frei.

<a id="a2a"></a>

**A2 — Stripe-Live scharfschalten.** Fünf Schritte laut
[Runbook](runbooks/STRIPE-GO-LIVE-RUNBOOK.md): 2.1 Bank-Aktivierung [David] ·
2.2 Live-Webhook [David] · 2.3 Keys in Server-.env [David] · 2.4 Live-Portal
konfigurieren (braucht A1) [Claude] · 2.5 Minimal-Verifikation [beide].
**Vorstufe A2a:** die 6 manuellen Testmodus-Schritte in
[STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) durchspielen
(ensure-prices, Monats-/Jahres-Checkout, Portal-Kündigung,
Test-Clock-Periodenende, `payment_failed`) — die Absicherung, bevor echtes Geld
fließt. **ACHTUNG, das Runbook ist ab Schritt 2 veraltet** (Warn-Kasten oben,
seit 2026-08-01): es beschreibt die mit A6 Schritt 5 gefallene Workspace-Welt
(`/dashboard/workspaces`, `/workspace`, Pläne free/pro/business, Preise
19/190 € bzw. 49/490 €). Heutiger Weg ist
`<community-host>/dashboard/settings/subscription` („Abo & Rechnung",
Capability `community.billing`, nur Owner —
`packages/onboarding/app/pages/dashboard/settings/subscription.vue`),
Checkout/Portal über `POST /api/community/billing/{checkout,portal}`,
Rückkehr-URLs baut `apps/control/server/utils/communityCheckout.ts` aus
`communities.host`. Unverändert richtig: Webhook-Endpunkt + Ereignis-Liste,
`scripts/stripe/ensure-prices.mjs`, die lookup_keys
`workspace_{personal,pro}_{monthly,yearly}` (gewachsene Stripe-Identitäten,
kein Hinweis auf Workspaces), Testkarten, Zahlungsfehler-Pfad. **Der Durchlauf
schreibt die Anleitung mit und entfernt danach den Warn-Kasten** — bewusst kein
Umschreiben am Schreibtisch: ein erfundener Klickpfad ist schlimmer als ein
markiert veralteter. **Dazu der Rest aus A3 (Brutto-Preise):** Stripe legt die Prices ohne
`tax_behavior` an und die Checkouts laufen mit `automatic_tax` — steht das
Konto-Default auf „exclusive", rechnet Stripe 19 % oben drauf und widerspricht
der Landing. Prüfung vor dem Live-Gang: Runbook §2.4. Der Klammer-Hinweis „zeigt
noch auf den `studio`-Alias" ist seit 2026-07-30 gegenstandslos: der
Test-Webhook zeigt auf `control`, der Alias ist entfernt.

**C18 — Sichtbarkeit pro Community. GEBAUT am 2026-07-30**, ein Rest ist offen.

Gebaut ist der ganze Umfang: der Schalter unter /dashboard/settings/community
(`team.manage`, weil es eine Zugangsregel ist und keine Optik), der
Bestands-Umzug der Row-Permissions in BEIDE Richtungen
(`core/server/utils/audienceRepermission.ts` — seitenweise, idempotent,
protokolliert; die Layer melden ihre Tabellen per Nitro-Plugin an), `noindex`
im zentralen Kopf-Aufruf, `Disallow: /` in der robots.txt, 404 auf
sitemap.xml und `/og/<key>.png`, und eine eigene Wache für die
permission-losen `pages`-Zeilen. Neue Communities entstehen ÖFFENTLICH — die
bewusste Kehrtwende zur G0-Entscheidung 7, protokolliert im DECISION-LOG.
Beweis: `packages/control/scripts/verify-audience-flip.mjs` (Gast ohne Key
gegen die echte Instanz, 19/19).

**OFFEN — und das ist ein Betriebs-, kein Bau-Punkt:** bis C18 hat die Spalte
NICHTS gesteuert. Jede Community von vor diesem Deploy trägt `audience = null`,
und `resolveTenantAudience` liest das fail-closed als „nur für Mitglieder".
Ihre Zeilen bleiben zwar lesbar (niemand fasst fremde Permissions ungefragt
an), aber robots, sitemap, Vorschaubild und die öffentliche Startseite gehen
zu — eine Community, die halb geschlossen ist, ohne dass jemand es entschieden
hat. Wer öffentlich bleiben soll, braucht einmal
`packages/control/scripts/stamp-audience.mjs --host <host> --audience public`
(ohne `--yes` ein Trockenlauf). `demo.pukalani.app` ist der klare Fall.
Bewusst KEIN Sammel-Backfill: „alle auf öffentlich" wäre genau die
stillschweigende Entscheidung über fremde Communities, die die
fail-closed-Regel verhindern soll.

**Kleine bekannte Kante:** ein GAST-Kommentar in einer geschlossenen Community
bekommt `read(label:…)` und ist damit für seinen eigenen Verfasser unsichtbar.
Das ist die ehrliche Folge (Gast-Kommentare und „nur für Mitglieder"
widersprechen sich) — wer es sauber will, schaltet
`pukalani.comments.embed.guests` ab. Ebenfalls unangetastet: `courses` tragen
`read("users")` statt `read("any")` und waren nie öffentlich; sie ziehen
deshalb nicht mit.

**B1 — Visual-Baselines.** Das Neubacken
(`pnpm --filter comments e2e -- --update-snapshots=all themes-visual`) ist am
2026-08-01 erledigt — offen ist nur noch das Sichten der neun Bilder. Der
Header-Umbau (S9) hatte sie erwartungsgemäß gebrochen. Die Theme-Entscheidungen
vom 2026-07-29 (B3/B5) kommen NICHT dazu: `themes-visual` läuft gegen
`apps/comments` (Silo, `pukalani.tenancy` aus ⇒ das Theme-Cookie der Specs
gewinnt dort weiter), und das Label „Aloha" steht nur im geschlossenen
Picker/Dropdown, nicht auf der `/visual`-Seite.

**C5 — Seitentitel.** Der ursprünglich gemeldete Teil war schon erledigt
(nachgemessen 2026-07-30): `register/index.vue`, `forgot-password.vue` und
`reset-password.vue` rufen alle drei `useBrandTitle(...)`. **Daneben liegt eine
größere, nie erfasste Lücke:** von allen Seiten in core/admin/blueprint setzen
nur **9** einen Titel — **17 Dashboard-Seiten** (`dashboard/index`,
`settings/*`, `users/*`, `admin/*`, `storage`, `system`) und das ÖFFENTLICHE
`core/app/pages/verify.vue` setzen gar keinen, und **kein Layout springt ein**.
In einer SPA heißt das nicht „kein Titel", sondern: der Titel der ZUVOR
besuchten Seite bleibt im Tab stehen. Fix ist mechanisch (`useBrandTitle` je
Seite, i18n-Schlüssel existieren größtenteils).

**C2 — UI-Plan-Gate für Kurse/Events** in der Nav (`pukalani.chrome.nav`,
blueprint) — heute per Direktlink erreichbar, läuft in den API-404.
Herkunft: Kurse-Bericht / Audit S4.

**C3 — Kompositionen Events + Kurse in den Bauplan.** `EventDetail` und
`LessonView` füllen ihren `#comments`-Slot bisher nur in `apps/comments`.
Herkunft: Produkt-Bilanz.

**C4 — Nav-Einträge events/courses** aus `apps/comments/app/app.config.ts` in
die Layer verschieben. Herkunft: S9-Bericht.

**C6 — Aufräum-Migration:** Legacy-Spalte `app_config.entitlements` droppen.
Gebaut am 2026-07-31 als `packages/system/scripts/migrations/027-drop-app-config-entitlements.ts`,
zusammen mit dem Code-Abbau des 2-Wege-Reads (`getLegacyEntitlementsDocument`/
`clearLegacyEntitlementsDocument` sind gefallen). **Offen ist nur noch das
Ausführen, und die Reihenfolge ist Pflicht:** erst den Code deployen, dann
migrieren — andersherum liest der Fallback gegen eine gelöschte Spalte.
Herkunft: Pool-Audit N2.

**B7 — Dark Mode für die Marketing-Landingpage?** Seit dem Audit-Bugfix
2026-07-31 ist color-mode dort bewusst auf `light` geklemmt (Preference +
Route-Meta, weil localStorage-Bestandswerte die Preference schlagen —
Begründung in `apps/marketing/nuxt.config.ts`). Durch die Nuxt-UI-Migration
(P1–P5, ebenfalls 2026-07-31) wäre echter Dark-Support jetzt machbar: die
Komponenten laufen über Theme-Tokens, nur die `tone-*`-Licht-Dramaturgie in
`marketing.css` bräuchte einen `.dark`-Zweig. Bleibt die Seite bewusst hell
(Licht-Dramaturgie als Markenzeichen), oder Dark nachrüsten?

**M13 — Reste des Self-Service-Onboardings:** Trial-Banner +
Ablauf-Erinnerung · Kundenbereich-Umzug `/workspace` → `my.*` ·
Abuse-/Suspend-Pfad · 301 von den Altnamen (bewusst später: Deploy-Verify und
Stripe-Webhook hingen an `studio.*`) · Statusseite bei UptimeRobot.
Details: [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md).

**E1 — tote Schlüsseldatei.** `apps/control/.env.production` zeigt noch auf das
gelöschte Projekt `studio` (Cutover-Altlast) — die Datei ist tot: die Keys darin
gehören einem Projekt, das es nicht mehr gibt. **Sie liegt NICHT im Repo**
(gitignored, kein Skript und kein Workflow verweist darauf; die frühere
Formulierung „die Datei im Repo" war falsch) — es ist eine lokale Altlast auf
Davids Rechner, und ein Aufruf `--env-file=apps/control/.env.production` würde
gegen ein nicht existierendes Projekt laufen. Der richtige Pfad ist
`~/.appwrite-secrets/migrations/control.env`. **Löschen ist Davids Klick**
(Datei mit Schlüsselmaterial). Die anderen drei `.env.production`
(platform → `pool`, comments, portfolio) sind korrekt.

**E3 — Hetzner-Rescale** prüfen (CX33 knapp bei sechs Apps + Builds). [David]

**E4-Rest — Cutover-Krümel:** Read-only-Key im Projekt `control` erzeugen
[David, Console]. Der ploi-Alias `studio.` ist entfernt (2026-07-30), und das
„Doppel-Zertifikat" ist bewusst KEIN Aufräum-Punkt — Einzelheiten in
[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md).

**B1 — die neun Referenzbilder:** am 2026-08-01 im Zuge von E7 neu aufgenommen
(gebündeltes Chromium) und am selben Tag ein zweites Mal — die Bilder sind
damit FINAL, es steht nur noch das Sichten aus. Der Vergleich
`git show HEAD:<pfad>` gegen die Arbeitskopie zeigt drei GEWOLLTE Änderungen:
den neuen Kopfbereich (Navigation links, ohne Symbole), dadurch 16 px weniger
Höhe — und den behobenen ECHTEN Fund: `app/pages/visual.vue` fragte
`home.products.<key>.text` und `home.ctaDemo`/`home.ctaDashboard` ab, die
Sprachdatei kennt aber `.desc` bzw. `tryDemo`/`toDashboard`. Auf der
/visual-Seite standen deshalb rohe Schlüssel im Bild (vorher genauso, damals
als `home.features.*.text`): deterministisch, also grün — aber falsch. Die
Seite fragt jetzt die vorhandenen Schlüssel (keine neuen erfunden, dieselben,
die `index.vue` benutzt), die Karten tragen echten Text und die beiden Knöpfe
heißen „Try the demo"/„Go to dashboard". Der Rest des Bildes ist unverändert.

**Nachtrag 2026-08-01 (drittes und letztes Backen — die Bilder sind JETZT
final):** in allen neun Baselines stand mitten im Bild das
**Nuxt-DevTools-Abzeichen** mit einer bei jedem Laden anderen ms-Zahl. Es fiel
nie auf, weil `maxDiffPixelRatio: 0.02` es verschluckte. Die DevTools sind für
den E2E-Kontext abgeschaltet (`PW_E2E`, s. COMPLETE-Eintrag), die Bilder ohne
Abzeichen neu gebacken und die Toleranz auf `0.0001` gesenkt — Läufe sind jetzt
pixelgleich. Beim Sichten also ein Unterschied mehr, und zwar der einzige:
das schwebende Abzeichen ist weg, sonst ändert sich nichts.

### Bewusst zurückgestellt (kein Aufgabenpunkt)

- **Flag-Registry statt `commentsEnabled`** — mittlerer Refactor der
  AppConfig-Typen, lohnt erst mit dem nächsten neuen Flag.
- **`useFormatCurrency`** bleibt als Baukasten-Vorhaltung (billing nutzt sie).
- **targetType-LOW-Residual** — kommt mit dem `comment_reports`-Modell.
- **Entwurfs-DATEIEN im Medien-Bucket** tragen nur den globalen Operator-Read:
  im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht
  vorschauen. Kein Leck; Richtung (server-seitige Vorschau-Route) steht in
  `media/server/utils/mediaPermissions.ts`.
- **Eigenes og:image hochladen** — bewusst nicht gebaut, die Karte wird
  generiert.
- **Glocke auf `my.pukalani.app`** — dort gibt es heute nichts zu zeigen;
  kommt Pool-Billing (D1), braucht das Onboarding-Layout eine.
- **Inline-Embed ohne iframe** (eigener Sanitizer + CORS-Allowlist) und eine
  dedizierte `apps/embed-comments` — bewusst später, supervised.

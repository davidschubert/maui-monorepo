# Offene Punkte

**Stand: 10 offen · 12 geparkt/wartend · 7 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

Stand: **2026-08-01**. Hier steht **nur, was noch offen ist** — in der
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
| 4 · A2 | **Stripe auf echtes Geld umstellen.** Vorher die 6 Testmodus-Proben durchspielen und prüfen, ob Stripe die 19 % im Preis rechnet (sonst widerspricht die Landing). Braucht 2 und 3. | Hoch | M — Runbook abarbeiten | Ja: Bank, Keys, Webhook — fast alles David | [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) · [Test-Walkthrough](runbooks/STRIPE-TEST-WALKTHROUGH.md) |
| 11 · B1 | **Neun visuelle Referenzbilder sichten** — sie sind jetzt FINAL: erst beim E7-Browserwechsel neu aufgenommen, dann am 2026-08-01 noch einmal, weil `/visual` drei rohe Übersetzungs-Schlüssel anzeigte (jetzt echter Text, Seite dadurch etwas kürzer). Zu prüfen bleibt nur der Inhalt: `git show HEAD:<pfad>` gegen die Arbeitskopie halten. | Mittel | S — ansehen | Ja: David sichtet | [Notizen](#notizen) |
| 35 · F11 | **Jede Seite auth-loser Apps feuert `/api/auth/realtime-token` → 401** (B7-Fund): `realtime-config.client.ts` abonniert `app_config` bedingungslos, sobald eine App eine Datenebene hat — auf der Marketing-Landing ein sinnloser Request + offener WebSocket pro Besucher. **B4 hat das NICHT behoben** (nachgemessen 2026-08-01, Details unten): es braucht ein Gast-Gate. | Niedrig | S | Nein | [Notizen](#notizen) |
| 25 · M13 | **Reste des Selbstbedienungs-Trichters:** Hinweis auf ablaufende Testphase, Umzug des Kundenbereichs von `/workspace` nach `my.*`, Sperr-/Missbrauchspfad, Statusseite bei UptimeRobot. | Mittel | M — vier kleine Stücke | Ja: bei Sperr-Regeln | [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md) |
| 27 · E1 | **Tote Schlüsseldatei löschen** (`apps/control/.env.production` zeigt auf ein gelöschtes Projekt). Liegt nur auf Davids Rechner, nicht im Repo. | Niedrig | S — eine Datei | Ja: enthält Schlüsselmaterial | [Notizen](#notizen) |
| 28 · E2 | **UptimeRobot nachziehen:** Monitor für `help.pukalani.app` anlegen, einen alten Monitor umbenennen. | Niedrig | S — zwei Klicks | Nein | [Notizen](#notizen) |
| 29 · E3 | **Server-Größe prüfen** — der CX33 wird mit sechs Apps plus Builds knapp. | Mittel | S — prüfen, ggf. Rescale | Ja: kostet Geld | [Notizen](#notizen) |
| 30 · E4 | **Nur-Lese-Schlüssel im Projekt `control`** erzeugen (letzter Cutover-Krümel). | Niedrig | S — ein Klick in der Console | Ja: David, Console | [CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md) |
| 32 · F8 | **Wie lange dürfen Abrechnungsdaten bleiben?** Löscht der letzte Owner sein Konto, bleiben `stripeCustomerId` und Zahlungsstatus der Community stehen (die Zeile wird nur entpersonalisiert). Aufbewahrungspflicht (§147 AO / §257 HGB) spricht dafür — oder es braucht eine Löschfrist. | Niedrig | S — Entscheidung, dann ggf. eine Frist | Ja: rechtliche Abwägung | [F3 in COMPLETE](OPEN-ITEMS-COMPLETE.md) |

## ⏸️ Geparkt / wartet

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Wartet auf … |
| --- | --- | --- | --- | --- | --- |
| F7 | **Bezahlte Communities** — der Owner nimmt Geld von seinen Mitgliedern (Stripe Connect). Eigene Mechanik und eigene Rechtsfragen. | Mittel | XL | Ja: Rechtsfragen | nach dem Go-Live; erst muss Geldfluss 1 (A6) ankommen |
| D1 | **Bezahlte Events und Kurse im Pool** sind absichtlich gesperrt — der Stripe-Webhook kennt den Community-Host nicht. Die Events-Hälfte ist schon gestempelt. | Mittel | M | Nein | dass die Abrechnung mandantenfähig wird |
| D5 | **Benachrichtigungs-Mails verlinken auf den falschen Host** (App-Adresse statt Community-Adresse). Die Glocke in der App ist bereits richtig. | Mittel | M | Nein | eine Auflösung „Community → Host" über Projektgrenzen |
| D6 | **Farbwechsel einer Community erreicht offene Fenster erst beim nächsten Seitenaufbau** (≤ 30 s). Eigene Themes morphen live, Community-Farben nicht. | Niedrig | M | Nein | dass jemand die Farbe oft ändert — oder ein Spiegel ohnehin gebaut wird |
| D4 | **Cloudflare-Ursprungszertifikat** für die Landing — erlaubt „Full (Strict)". Der private Schlüssel muss durchs Dashboard. | Niedrig | S | Ja: nur David | dass David es einmal macht |
| D2 | **Der Changelog antwortet auf Community-Hosts mit 404** — so gewollt (Betreiber-Inhalt). | — | — | Nein | nichts, bewusst so |
| D3 | **Die Demo-Community ist bei Google auffindbar** — Davids Entscheidung. | — | — | Nein | nichts, bewusst so |
| E5 | **Wellen-Migrationen mitdenken:** die Einzel-Instanzen `photos`/`portfolio` fahren die `system`-Migrationen mit. | — | S | Nein | die nächste system-Migration |
| F1 | **Discussions als eigenes Produkt** — Konzept fertig (Kategorien vom Admin, Threads von Mitgliedern). | Mittel | XL | Ja: Go | dass die Kundenselbstverwaltung rund läuft |
| F2 | **Block-Editor-Worktree** (`worktree-agent-a762b1bc42bba74d7`) — nie durchgesehen, Feature-Stopp. | Niedrig | M | Ja: Go | Ende des Feature-Stopps |
| F3 | **Silo → Pool:** `comments` und `portfolio` laufen als eigene Instanzen. Langfristig ist der Pool das Produkt, Silo bleibt das Enterprise-Angebot. | Niedrig | XL | Ja: strategisch | eine strategische Entscheidung |
| P12 · OPS | **Drei Cutover-Krümel wegklicken:** in der Appwrite-Console (Projekt control → Settings → Platforms) prüfen, ob `studio.pukalani.app` noch als Web-Platform hängt · `/home/ploi/releases/studio/` auf dem Server löschen · totes GitHub-Secret `PLOI_DEPLOY_WEBHOOK_STUDIO` entfernen. | Niedrig | S — drei Klicks | Ja: nur David (Console/Server/GitHub) | — |

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

**C20 — Gäste-401 auf jeder Marketing-Seite (Konsolen-Rauschen).** Jeder
Seitenaufruf der Landingpage feuert für Gäste ein
`GET /api/auth/realtime-token` → 401 (gefunden 2026-07-31 bei der
Glossar-Diagnose, auf prod verifiziert — DE und EN identisch). Ursache: das
Core-Realtime-Plugin holt sein JWT auch auf einer auth-losen App; die
Marketing-App hat nicht einmal eine Appwrite-Instanz (.env zeigt auf ein
nicht existierendes Projekt). Kein Schaden, aber ein sinnloser Request je
Besucher plus ein roter Eintrag in jeder Besucher-Konsole — unschön für eine
Seite, die Entwickler als Zielgruppe hat. Fix-Richtung: den JWT-Abruf an
eine Session-Anwesenheit oder ein `pukalani.*`-Gate klemmen (Core-Default
an, marketing schaltet ab — oder besser: automatisch aus, wenn kein
Appwrite-Endpoint konfiguriert ist). Betrifft nur das Realtime-JWT, NICHT
useRealtimeAccount (bleibt bewusst Cookie-nativ, CLAUDE.md).

**A1 — Rechtstexte.** Entwürfe sind LIVE (2026-07-23): vollständige,
stack-spezifische Texte (Impressum § 5 DDG, DSGVO-Datenschutzerklärung mit
Hetzner/Resend/Stripe/Cookies/Betroffenenrechten, AGB mit Plänen/Kündigung/
UGC/Haftung) DE+EN auf /imprint, /terms, /privacy — jeweils mit sichtbarem
„Entwurf"-Hinweis und `noindex`. Rest bei David: Adresse und
USt-IdNr.-Platzhalter im Dashboard ausfüllen + Anwalt drüberschauen lassen.
Schaltet A2 frei.

**A2 — Stripe-Live scharfschalten.** Fünf Schritte laut
[Runbook](runbooks/STRIPE-GO-LIVE-RUNBOOK.md): 2.1 Bank-Aktivierung [David] ·
2.2 Live-Webhook [David] · 2.3 Keys in Server-.env [David] · 2.4 Live-Portal
konfigurieren (braucht A1) [Claude] · 2.5 Minimal-Verifikation [beide].
**Vorstufe A2a:** die 6 manuellen Testmodus-Schritte in
[STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) durchspielen
(ensure-prices, Monats-/Jahres-Checkout, Portal-Kündigung,
Test-Clock-Periodenende, `payment_failed`) — die Absicherung, bevor echtes Geld
fließt. **Dazu der Rest aus A3 (Brutto-Preise):** Stripe legt die Prices ohne
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
(`pnpm --filter comments e2e -- --update-snapshots themes-visual`) ist am
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

**F11 — was B4 geändert hat und was nicht (gemessen 2026-08-01).** Das
Web-SDK liegt seit B4 hinter einem dynamischen Import, aber der Request
`/api/auth/realtime-token` hängt nicht am SDK, sondern am ABONNEMENT — und das
legt `packages/core/app/plugins/realtime-config.client.ts` weiter auf jeder
Seite an. Nachgemessen im Browser: `marketing` (Dev, Gast) lädt den
SDK-Chunk nachgelagert UND feuert weiterhin `GET /api/auth/realtime-token →
401`; `help` (keine Appwrite-Instanz ⇒ leere `appwriteDatabaseId`) lädt
weder SDK noch Token — das war aber schon vorher so (der Guard in
`useRealtimeRows` greift vor dem Import). **Der Rest-Fix bleibt also
unverändert F11:** ein Gast-Gate, das `ensureRealtimeJwt()` den Token-Abruf
für nicht angemeldete Besucher erspart (der WS selbst muss bleiben —
Live-Theme-Morphen für Gäste ist Feature, s. Beweis im B4-Eintrag in
COMPLETE). Das ist bewusst NICHT in B4 mitgemacht worden: es ist eine
Verhaltensänderung an der Auth-Naht, keine Bundle-Frage.

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

**E2 — UptimeRobot:** Monitor für `help.pukalani.app` ergänzen · Monitor
803548622 heißt noch „studio…" (Friendly-Name nachziehen).

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

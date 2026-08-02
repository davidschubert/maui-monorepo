# Offene Punkte

**Stand: 24 offen · 10 geparkt/wartend · 7 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

Stand: **2026-08-02**. Hier steht **nur, was noch offen ist** — in der
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
| 11 · B1 | **Neun visuelle Referenzbilder sichten** — jetzt WIRKLICH final: zuletzt am 2026-08-01 neu gebacken, nachdem das DevTools-Abzeichen (wechselnde ms-Zahl) aus allen neun Bildern verschwunden ist. Zu prüfen bleibt nur der Inhalt: `git show HEAD:<pfad>` gegen die Arbeitskopie halten. | Mittel | S — ansehen | Ja: David sichtet | [Notizen](#notizen) |
| 27 · E1 | **Tote Schlüsseldatei löschen** (`apps/control/.env.production` zeigt auf ein gelöschtes Projekt). Liegt nur auf Davids Rechner, nicht im Repo. | Niedrig | S — eine Datei | Ja: enthält Schlüsselmaterial | [Notizen](#notizen) |
| 29 · E3 | **Server-Größe: GEMESSEN, kein Rescale nötig** (2026-08-02). Die Maschine ist ein CX22 (2 vCPU/3,7 GB), nicht CX33 — und die CI baut auf dem Runner, nicht auf dem Server. Ist: 27 % RAM, Swap unberührt, Last 0, Platte 29 %, 0 OOM in 30 Tagen. Zu entscheiden bleibt nur der Fallback-Deploy: Heap 4096 auf 3,7 GB senken? | Niedrig | S — zwei Zeilen | Ja: nur Bestätigung | [Notizen](#notizen) |
| 30 · E4 | **Nur-Lese-Schlüssel im Projekt `control`** erzeugen (letzter Cutover-Krümel). | Niedrig | S — ein Klick in der Console | Ja: David, Console | [CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md) |
| 32 · F18 | **Gast-Kontaktdaten sind weiter unlesbar.** `guest_authors` verfällt jetzt nach 90 Tagen, aber die Moderation kommt an Name/E-Mail nirgends heran — die Daten werden also erhoben, ohne je zu nutzen. Entweder eine Lese-Stelle bauen oder das Erheben streichen. | Niedrig | S — Entscheidung, dann klein | Ja: erheben oder nicht? | [COMPLETE C1c](OPEN-ITEMS-COMPLETE.md) |
| 34 · F20 | **Bezahlarten im Stripe-Dashboard festlegen.** Der Code erfüllt seit G1 nur noch gegen `payment_status: 'paid'` — offen bleibt die Produkt-Frage, ob SEPA/Rechnung überhaupt angeboten werden sollen. Wenn ja: Käufer wartet Tage aufs Ticket. Wenn nein: im Dashboard abschalten (oder `payment_method_types: ['card']` setzen). | Niedrig | S — Entscheidung, dann ein Klick | Ja: anbieten oder nicht? | [COMPLETE G1](OPEN-ITEMS-COMPLETE.md) |
| 35 · F21 | **Einmal-Preise sind erst streng, wenn eine Liste existiert.** `pukalani.billing.oneTimeLookupKeys` ist ungesetzt, also gilt für Event-Tickets nur „kein Plan-Key + Stripe-Price muss `one_time` sein". Sobald echte Ticket-Preise angelegt sind, die Liste eintragen (bewusst offen gelassen, sonst hätte der Deploy jeden bestehenden Ticketverkauf mit 400 beantwortet). | Niedrig | S — eine Config-Zeile | Nein | [lookupKeys.ts](../packages/billing/shared/lookupKeys.ts) |
| 36 · F22 | **Eine Doku-Stelle zeigt auf Entferntes.** CLAUDE.md sagt „`community.delete` ist bewusst NICHT gebaut" — seit C16 (2026-07-31) ist es gebaut, als Stilllegen. (Die zweite Hälfte, der `requireEntitlement`-Verweis in `courseAccess.ts`, ist mit G3 erledigt.) | Niedrig | S — ein Absatz | Nein | [COMPLETE C16](OPEN-ITEMS-COMPLETE.md) · [COMPLETE G3](OPEN-ITEMS-COMPLETE.md) |
| 37 · F23 | **`users/stats.get.ts` cacht host-übergreifend.** Der Modul-Cache (60 s) ist nicht nach Mandant geschlüsselt; `total`/`active`/`new` sind ohnehin projektweit, aber `online` kommt aus `listOnlinePresences(event)` und IST gescopt. Ein Betreiber, der binnen 60 s zwei Community-Hosts besucht, sieht auf dem zweiten die Anwesenheitszahl des ersten. Nur Betreiber (`users.manage` trägt keine Site-Rolle), nur eine Zahl. | Niedrig | S — Cache-Schlüssel | Nein | [stats.get.ts](../packages/admin/server/api/admin/users/stats.get.ts) |
| 39 · F25 | **Sweeps in einer gesperrten Community: dürfen sie Inhalt anlegen?** Serien-Top-up und Publish-on-read laufen bewusst ohne `actor`, die M13-Sperre greift also nicht — eine Community mit offener Rechnung materialisiert weiter Termine und veröffentlicht geplante Beiträge. Verteidigbar (niemand hat gehandelt, der Owner hat es vorher eingestellt), aber es ist eine Produkt-Entscheidung, keine technische. | Mittel | S — eine Zeile je Sweep | Ja: nur David entscheidet | [COMPLETE G2](OPEN-ITEMS-COMPLETE.md) |
| 40 · F26 | **Darf man in einer gesperrten Community die ZUSAGE zurückziehen?** Heute nein: RSVP läuft komplett über `actor: 'member'` und ist zu. Beim ABSAGEN eines Termins gilt schon eine Ausnahme (schützt die Zusagenden) — dieselbe Logik spräche dafür, das Zurückziehen offen zu lassen. Dagegen spricht, dass jede weitere Ausnahme die Sperre aufweicht. | Mittel | S — eine Zeile | Ja: nur David entscheidet | [COMPLETE G2](OPEN-ITEMS-COMPLETE.md) · [[id].delete.ts](../packages/events/server/api/events/[id].delete.ts) |
| 41 · F27 | **Kontingent-Zahlen für Termine fehlen.** `assertPoolWriteQuota(kind: 'events')` hängt jetzt an beiden Anlegewegen (auch an der Serien-Expansion, die vorher vorbeilief) — der Plan-Katalog nennt aber keine events-Grenzen, die Drossel ist also ein No-Op. Erst mit Zahlen ist sie echt. | Niedrig | S — Katalog-Zeilen | Ja: welche Zahlen je Plan? | [COMPLETE G2](OPEN-ITEMS-COMPLETE.md) |
| 42 · F28 | **Entwurfs-Titelbilder sehen alle Mitglieder.** Seit events-009 folgt die Cover-Datei ihrer Row; ein Entwurf hat gar kein Leserecht, also fällt das Bild auf das Mitglieder-Publikum zurück — sonst zeigte die Dashboard-Vorschau ein kaputtes Bild (die Rolle `editor` trägt kein Moderations-Label). Deutlich enger als vorher (da: jeder im Internet), aber die saubere Lösung ist eine server-seitige Vorschau-Route. media hat dieselbe offene Stelle. | Niedrig | M — eine Route für beide Layer | Nein | [eventCovers.ts](../packages/events/server/utils/eventCovers.ts) · [mediaPermissions.ts](../packages/media/server/utils/mediaPermissions.ts) |
| 43 · F29 | **Zwei tote `tenantId`-Felder in Row-Typen** (`comments/shared/types/comment.ts`, `media/shared/types/media.ts`). Die Spalte gibt es auf keiner Instanz mehr; gelesen oder geschrieben werden sie nirgends. Kein Fehler — aber genau diese Drift hat im events-Layer den Geldpfad gebrochen. | Niedrig | S — zwei Zeilen | Nein | [COMPLETE G2](OPEN-ITEMS-COMPLETE.md) |
| 44 · F30 | **Die übrigen Live-Beweise laufen nur von Hand.** `verify-paid-ticket` hängt seit G2 in der CI-E2E (echte Wegwerf-Appwrite); die anderen `verify-*.mjs` (Pool-Isolation, Sichtbarkeits-Umzug, Sperr-Pfad, Presence-Grenze …) laufen nur, wenn jemand daran denkt. Sie sind die einzigen Beweise, die Schema- und Permission-Zusagen prüfen. | Niedrig | M — Schritte in e2e.yml, je Skript Env klären | Nein | [e2e.yml](../.github/workflows/e2e.yml) |
| 45 · F31 | **Die Theme-Config-Felder stehen an DREI Stellen, zusammengehalten sind zwei.** Seit G3 hängen `THEME_CONFIG_KEYS` und der JSON-Import am Typ (`shared/ramp.ts`). Die strikte Zod-Prüfung der Server-Routen (`packages/admin/server/api/admin/themes/{index.post,[id].patch}.ts`) führt dieselben 14 Felder ein drittes Mal — ein neues additives Feld muss dort weiter von Hand nachgezogen werden, sonst weist die Route es ab. Beim Audit nicht angefasst, weil `packages/admin` parallel bearbeitet wurde. | Niedrig | S — Schema aus THEME_CONFIG_KEYS ableiten oder Test | Nein | [COMPLETE G3](OPEN-ITEMS-COMPLETE.md) · [ramp.ts](../packages/themes/shared/ramp.ts) |
| 46 · F32 | **`sec-fetch-site: same-site` kommt durch — unter der Wildcard ist JEDER Mandant same-site.** Der CSRF-Guard (`03.csrf-origin.ts:27`) lässt alles außer `cross-site` passieren; im Selbstbedienungs-Pool heißt das: `boeser-kunde.pukalani.app` darf schreibende Requests an `verein.pukalani.app` schicken. Heute nur theoretisch (Gate ist AUS, es gibt kein SameSite=None-Cookie), scharf wird es mit den partitionierten Embed-Cookies. Kleinste Härtung: bei `same-site` zusätzlich den `origin`-Header gegen den Request-Host halten (der Zweig existiert schon, er wird nur übersprungen). | Mittel | S — zwei Zeilen + Test | Nein | [03.csrf-origin.ts](../packages/core/server/middleware/03.csrf-origin.ts) · [COMPLETE G4](OPEN-ITEMS-COMPLETE.md) |
| 47 · F33 | **`user-erase` glaubt dem Aufrufer sein Projekt.** `POST /api/control/community/members/user-erase` nimmt (Projekt, User, E-Mail) allein auf das Service-Secret hin und scopt hart darauf — wer das Secret hat, kann also Mitgliedschaften in JEDEM Runtime-Projekt löschen, nicht nur im eigenen. Das fehlende JWT ist begründet (das Konto ist beim Aufruf schon gesperrt). Die kleine Härtung wäre `runtimeProjectId === onboardingRuntimeProject(event)` — die Naht bedient ohnehin genau ein Pool-Projekt. | Niedrig | S — eine Zeile | Nein | [user-erase.post.ts](../packages/control/server/api/control/community/members/user-erase.post.ts) |
| 48 · F34 | **Die Glocke fällt bei JEDEM Abfragefehler ungescopt zurück.** `runScopedNotificationQuery` fängt alles und wiederholt ohne Mandanten-Filter — gedacht für „Spalte fehlt noch" (system-022), greift aber auch bei Timeout oder Appwrite-5xx. Dann sieht ein Nutzer für einen Moment Meldungen aus allen seinen Communities in einer Glocke. Der Rückfall war eine Deploy-Brücke; die Migration ist überall gelaufen. Entweder auf „unknown attribute" einengen oder ganz streichen. | Niedrig | S — Fehler prüfen statt schlucken | Nein | [notificationScope.ts](../packages/core/server/utils/notificationScope.ts) |
| 49 · F35 | **Die Attrappen-Phrase der OTP-Route stammt aus unserer Wortliste, nicht aus Appwrites.** Seit G4 antwortet `/api/auth/otp` bei geschlossener Registrierung auch für unbekannte Adressen 200 — mit einer selbst erzeugten Sicherheitsphrase. Wer beide Wortlisten kennt, könnte an einem Wort erkennen, dass keine Mail unterwegs ist. Deutlich schmaler als der vorherige 403/200-Unterschied; Appwrites Liste nachzubauen wäre eine Kopie, die still auseinanderläuft. | Niedrig | S — Entscheidung | Nein | [otp.post.ts](../packages/core/server/api/auth/otp.post.ts) · [COMPLETE G4](OPEN-ITEMS-COMPLETE.md) |
| 38 · F24 | **Gehört `/dashboard/settings/community` in den onboarding-Layer?** Die Seite liegt in `admin`, alle drei Routen, die sie ruft, liegen in `onboarding` (S9-Schnitt; Vorbild ist der F5-Umzug von `branding.vue`). Kein Schaden heute — ohne Mandant zeigt sie einen Hinweis statt der Schalter und der Reiter ist ausgeblendet. Es ist eine Aufräum-Entscheidung, kein Fehler. | Niedrig | S — Datei verschieben + Nav | Ja: Schnitt bestätigen | [COMPLETE G1](OPEN-ITEMS-COMPLETE.md) |

## ⏸️ Geparkt / wartet

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Wartet auf … |
| --- | --- | --- | --- | --- | --- |
| F7 | **Bezahlte Communities** — der Owner nimmt Geld von seinen Mitgliedern (Stripe Connect). Eigene Mechanik und eigene Rechtsfragen. **Schluckt D1** (Davids Entscheidung 2026-08-02): bezahlte Pool-Events/-Kurse ergeben erst mit Connect Sinn — sonst landete das Ticketgeld beim Betreiber und der Owner bräuchte je Preis einen lookup_key von David. Events-Hälfte technisch M (S7+A6 haben den alten Webhook-Wartegrund erledigt), Kurse-Hälfte L/XL (community-scoped Entitlements sind unentworfen). | Mittel | XL | Ja: Rechtsfragen | nach dem Go-Live; erst muss Geldfluss 1 (A6) ankommen |
| D4 | **Cloudflare-Ursprungszertifikat** für die Landing — erlaubt „Full (Strict)". Der private Schlüssel muss durchs Dashboard. | Niedrig | S | Ja: nur David | dass David es einmal macht |
| D2 | **Der Changelog antwortet auf Community-Hosts mit 404** — so gewollt (Betreiber-Inhalt). | — | — | Nein | nichts, bewusst so |
| D3 | **Die Demo-Community ist bei Google auffindbar** — Davids Entscheidung. | — | — | Nein | nichts, bewusst so |
| E5 | **Wellen-Migrationen mitdenken:** die Einzel-Instanzen `photos`/`portfolio` fahren die `system`-Migrationen mit. | — | S | Nein | die nächste system-Migration |
| F1 | **Discussions als eigenes Produkt** — Konzept fertig (Kategorien vom Admin, Threads von Mitgliedern). | Mittel | XL | Ja: Go | dass die Kundenselbstverwaltung rund läuft |
| F2 | **Block-Editor-Worktree** (`worktree-agent-a762b1bc42bba74d7`) — nie durchgesehen, Feature-Stopp. | Niedrig | M | Ja: Go | Ende des Feature-Stopps |
| F15 | **Events lassen sich nicht melden.** Der Knopf ist am 2026-08-01 entfernt worden, weil er ins Leere meldete (Moderations-Audit Befund 4). Eine echte Queue braucht einen Moderations-Zustand für Events (heute nur draft/published/cancelled), `events.moderate`, Route + Dashboard-Seite. | Niedrig | L | Ja: Go | Ende des Feature-Stopps |
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

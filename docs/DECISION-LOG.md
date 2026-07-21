# Decision Log

Laufendes Protokoll bewusster **Entscheidungen, Korrekturen und Ideen** — das,
was NICHT aus Code/Git-Historie hervorgeht (das „warum", verworfene Alternativen,
Kurskorrekturen). Neueste zuerst. Ergänzt die großen `docs/plans/*`-Dokumente um
die kleinen, verstreuten Beschlüsse.

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
Beide Workspace-Checkout-Routen (Kunde + Betreiber, apps/studio/server) blocken
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
studio hat KEINE Legal-Pages und `maui.auth.termsUrl` ist leer. Doppelt kritisch:
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
`StudioPlan` um optionales `lookupKeyYearly` erweitert (additiv, bricht nichts);
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
keine Bank nötig. Details: [STRIPE-GO-LIVE-RUNBOOK.md](plans/STRIPE-GO-LIVE-RUNBOOK.md).

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
[HORIZONT-3-POOL-SILO-BLUEPRINT.md](plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md),
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
[STRIPE-GO-LIVE-RUNBOOK.md](plans/STRIPE-GO-LIVE-RUNBOOK.md). Kernpunkt:
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
Festgehalten in [M10-HORIZONT-3-SKALIERUNG.md](plans/M10-HORIZONT-3-SKALIERUNG.md).

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

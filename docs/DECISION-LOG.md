# Decision Log

Laufendes Protokoll bewusster **Entscheidungen, Korrekturen und Ideen** — das,
was NICHT aus Code/Git-Historie hervorgeht (das „warum", verworfene Alternativen,
Kurskorrekturen). Neueste zuerst. Ergänzt die großen `docs/plans/*`-Dokumente um
die kleinen, verstreuten Beschlüsse.

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
  → Runbook für David in [PLATFORM-CONTROL-KEY-SWAP.md](plans/PLATFORM-CONTROL-KEY-SWAP.md);
  **zusätzlich: verwaisten Provisioner-Account/Session prüfen + löschen.**
- **Quota-Zahlen**: Plan-Staffelung übernommen — free 200/Tag + 5.000 gesamt ·
  pro 1.000/Tag + 50.000 · business 5.000/Tag + 250.000; Silo ohne Limit. Ich
  verdrahte Plan→Limit (die assertPoolWriteQuota-Mechanik steht seit H3-4.3).
- **Tenant-Homepage** (pro Tenant konfigurierbar, „pro Tenant"): MVP =
  CMS-Markdown (sicheres Subset, KEIN Roh-HTML) + optional EIN einbettbarer
  Kommentar-Block; EINE Sprache Pflicht (weitere optional); Tenant-Theme wird
  geerbt; Silo nutzt dasselbe pages-Muster. Konzept:
  [PLATFORM-TENANT-HOMEPAGE.md](plans/PLATFORM-TENANT-HOMEPAGE.md).
- **Embed E4**: alle drei bauen, Reihenfolge Presence → Gast → Web-Component.
  **Gast-Kommentare**: Name+E-Mail OHNE Verifikation (Disqus-Gastmodus,
  niedrigste Hürde), Spam über Auto-Hide + Rate-Limit + Honeypot.
- **Themes-Vollausbau E1–E7** (alle Plan-Empfehlungen bestätigt): E1 Default
  zählt NICHT (26 echte neue Farbwelten) · E2 11 = Basis+10 · E3 Neutral bleibt
  separate Achse · E4 Hue-Raster (26×~13,8°) als Startpunkt, dann kuratieren+
  benennen · E5 Themes rein farblich (Fonts/Radius = Backlog) · E6 committete
  `.gen.ts` + CI-„Output aktuell"-Check · E7 Grid-Modal-Picker (Dropdown mit
  26×11 unbedienbar). Umsetzung: [THEMES-VOLLAUSBAU.md](plans/THEMES-VOLLAUSBAU.md).
- **Aufräumer**: Hetzner-Rescale-Thema geschlossen (CI-Build-Deploy → CX23
  reicht, Server baut nichts). Themes-Vollausbau rückt nach vorn.

## 2026-07-22 (3) — apps/platform: der Multi-Tenant-Beweis end-to-end

Die erste echte Multi-Tenant-App (aus apps/_template, Features themes/admin/
comments/moderation): `maui.tenancy` AN, Resolver = createTenantsTableResolver
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
  Config-Gate `maui.tenancy.enabled` (Core-Default AUS → No-Op, heutiger
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
  Migration studio-009 gibt `workspaces.stripeSubscriptionId`; der Handler
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

# Decision Log

Laufendes Protokoll bewusster **Entscheidungen, Korrekturen und Ideen** — das,
was NICHT aus Code/Git-Historie hervorgeht (das „warum", verworfene Alternativen,
Kurskorrekturen). Neueste zuerst. Ergänzt die großen `docs/plans/*`-Dokumente um
die kleinen, verstreuten Beschlüsse.

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

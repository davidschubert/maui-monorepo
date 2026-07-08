# Plan: `packages/billing` — Stripe Feature-Layer

> Stand: 2026-07-02 · Status: **Plan (kein Code)** · Referenzen: [CONCEPT.md](../CONCEPT.md)
> (bes. A14 Layer-Grenzen), [RBAC-CONCEPT.md](../RBAC-CONCEPT.md), [OPEN-ITEMS.md](../OPEN-ITEMS.md),
> `packages/comments` als Referenz-Feature-Layer, `core/server/utils/notify.ts` als
> Cross-Layer-Vertrag-Muster.

## 1. Ziel

Ein wiederverwendbarer Feature-Layer `packages/billing`, der jeder App im Monorepo per
einer Zeile `extends` Abo-Billing mit Stripe gibt:

- **Checkout**: Stripe-hosted Checkout Sessions (`mode: 'subscription'`) — kein eigenes
  Payment-Formular, keine PCI-Fläche, kein Publishable Key im Client nötig.
- **Self-Service**: Stripe Customer Portal (Plan wechseln, Zahlungsmethode, Kündigung,
  Rechnungshistorie).
- **Webhooks**: Nuxt Server Route mit Signatur-Verifikation — hält die lokale Projektion
  (`billing_subscriptions`) synchron. **Stripe ist Source of Truth**, die Tables sind
  eine Read-Projektion.
- **Eigenes Datenmodell** (Regel 3 aus CONCEPT: eigene Tables → niemals Core):
  `billing_customers` (userId ↔ stripeCustomerId) + `billing_subscriptions`.
- **Deklarative Pläne** über Config-Gate `maui.billing` (Pläne, Features, Trial) —
  Core-Default `enabled: false`, App aktiviert explizit.
- **RBAC-Anbindung**: neue Capability `billing.manage` in der Core-Matrix; Admin-Modul
  registriert sich via `maui.admin.modules` (expliziter Vertrag, A14).
- **i18n de+en**, Zod-Factories, idempotente Migrations, keine Fehler-Leaks.

Nicht-Ziele (v1): Stripe Connect/Marktplatz, Usage-based Billing, Multi-Currency-UI,
E-Mail-Rechnungsversand jenseits dessen, was Stripe selbst verschickt.

---

## 2. Architektur-Entscheidungen

### B1 — Webhooks als Nuxt Server Route, NICHT als Appwrite Function

CONCEPT.md sagt bisher „Webhooks laufen als Appwrite Function" (Zeile 112, Konzept v2 von
2026-06). Nach zehn Phasen Realität wird das **revidiert** (gleiches Muster wie die
A4-Realtime-Korrektur — Konzept an Empirie anpassen):

**Entscheidung: `POST /api/stripe/webhook` als Nitro Server Route im Billing-Layer.**

Begründung:

1. **Gleiche Codebasis, gleiche Verträge.** Der Webhook-Handler braucht genau das, was
   der Layer schon hat: `createAdminClient(event)` (Auto-Import aus core), die
   `shared/types/billing.ts`, die Plan-Auflösung aus `maui.billing`, `toH3Error`-Hygiene.
   Eine Appwrite Function wäre ein zweites Deployment-Artefakt mit eigenem Env-Satz,
   eigenem Stripe-SDK-Bundle, ohne Auto-Imports, ohne die Layer-Typen — exakt das
   String-/Copy-Coupling, das A14 verbietet.
2. **Layer-Komposition bleibt eine Zeile.** Der Baukasten-Anspruch ist: App extended
   `billing` → fertig. Eine Function bräuchte pro App einen separaten
   `appwrite.config.json`-Eintrag + Deploy-Schritt + Key-Verdrahtung — der Layer wäre nicht
   mehr self-contained.
3. **Raw Body ist in h3 trivial.** Signatur-Verifikation braucht den unveränderten
   Request-Body: `readRawBody(event)` + `stripe.webhooks.constructEvent(raw, sig, secret)`.
   Kein Grund, dafür die Plattform zu wechseln.
4. **Verfügbarkeit ist kein Argument.** Stripe retryt fehlgeschlagene Webhooks bis zu
   3 Tage mit Backoff. Kurze App-Downtime (Deploy) ist unkritisch, solange der Handler
   **idempotent** ist (siehe B4) — das brauchen wir sowieso.
5. **Wann eine Function doch richtig wäre:** wenn mehrere Apps EINEN Stripe-Account
   teilen würden oder Billing unabhängig vom App-Lifecycle laufen müsste. Beides ist
   per Architektur ausgeschlossen (jede App = eigene Appwrite-Instanz = eigener
   Stripe-Account, analog A1). Das vorhandene `functions/changelog-draft` bleibt das
   Muster für App-unabhängige Event-Verarbeitung — Billing ist das Gegenteil davon.

→ Todo: CONCEPT.md Zeile 112 im Zuge von Phase B-1 anpassen.

### B2 — Stripe-API-Oberfläche: Checkout Sessions + Billing Portal (hosted)

- **Checkout Sessions** (`mode: 'subscription'`) als einzige Zahlungs-Oberfläche —
  Stripe-hosted Redirect. Kein Payment Element, kein Card Element, keine Charges/Sources
  (deprecated). Vorteile: SAQ-A-PCI-Scope, SCA/3DS von Stripe gehandhabt, Stripe Tax
  und dynamische Zahlungsmethoden (Dashboard-Setting statt `payment_method_types`
  hardcoden) out of the box.
- **Customer Portal** für alles nach dem Kauf (Upgrade/Downgrade, Kündigung,
  Zahlungsmethode, Rechnungen). Wir bauen KEINE eigene Kündigungs-/Änderungs-UI in v1 —
  nur einen „Abo verwalten"-Button, der eine Portal-Session erzeugt.
- **Products/Prices leben im Stripe-Dashboard.** Der Layer referenziert sie über
  **`lookup_key`** (stabil über Test-/Live-Mode hinweg, im Gegensatz zu `price_…`-IDs).
  Der Server löst `lookup_key → Price` per `prices.list({ lookup_keys })` auf
  (in-memory gecacht, TTL ~5 min).
- **Stripe SDK**: `stripe` (Node, server-only) via pnpm Catalog; API-Version = aktuelle
  SDK-Default-Version, im Client gepinnt. Kein Stripe-JS im Browser nötig (Redirect-Flow).

### B3 — Datenmodell: Projektion mit Row-Security, Writes nur server-seitig

Stripe ist die Quelle; die Tables existieren für (a) schnelle SSR-Entitlement-Checks
ohne Stripe-API-Call pro Request, (b) Realtime-Fähigkeit („dein Abo ist aktiv" live
nach Checkout via `useRealtimeRows`), (c) Admin-Übersicht.

- **Alle Writes über den Admin-Client** (Server Routes + Webhook — der Webhook hat
  keine User-Session). Table-Permissions: KEIN create/update/delete für `users`.
- **Row-Security**: `read(user:<userId>)` pro Row — jeder sieht nur sein eigenes Abo
  (Lehre aus dem `comment_votes`-Finding: keine breite Table-Read-Permission).
- Runtime-Key braucht dafür nichts Neues (`rows.read/write` hat er bereits, A2).

### B4 — Webhook-Idempotenz & -Ordnung

- **Upsert nach natürlichem Schlüssel** (`stripeSubscriptionId` bzw.
  `stripeCustomerId`), nie „create-only" — Stripe liefert at-least-once und
  potenziell out-of-order.
- **Stale-Event-Guard**: `event.created` (Unix-Timestamp) als `lastStripeEventAt` in
  der Row mitschreiben; ältere Events als der gespeicherte Stand werden verworfen
  (kein separater `processed_events`-Store nötig — bewusst einfach, v1).
- **Event-Allowlist** statt catch-all: `checkout.session.completed`,
  `customer.subscription.created|updated|deleted`, `invoice.paid`,
  `invoice.payment_failed`. Unbekannte Events → `200` + no-op (sonst retryt Stripe
  sinnlos).
- Antwortdisziplin: Signatur ungültig → `400` generisch; Verarbeitungsfehler → `500`
  ohne Details (Stripe retryt); niemals Stripe-/Appwrite-Fehlerdetails im Response
  (Projekt-Regel „keine Fehler-Leaks", `toH3Error`-Muster).
- **Rate-Limit-Middleware**: `POST /api/stripe/webhook` vom Core-Rate-Limit ausnehmen
  (Stripe-Retries dürfen nicht in den 429-Bucket laufen); Schutz ist die Signatur.

### B5 — Preis-Tampering ausgeschlossen: Client sendet `planId`, nie `priceId`

Der Checkout-Endpoint akzeptiert nur eine `planId` aus `maui.billing.plans` (Zod-Enum
gegen die konfigurierten Pläne). Der Server mappt `planId → lookup_key → Stripe Price`.
Ein manipulierter Request kann keinen fremden/rabattierten Preis buchen.
`client_reference_id = userId` + `metadata.userId` auf der Checkout Session, damit der
Webhook die Zuordnung auch ohne Customer-Lookup verifizieren kann.

### B6 — Entitlements vs. RBAC: zwei getrennte Achsen

- **RBAC (Rollen/Capabilities, core)** = *wer darf administrieren*. Neue Capability
  **`billing.manage`** in `core/shared/types/authz.ts` + `ALL_CAPABILITIES`
  (admin bekommt sie via Wildcard automatisch; moderator nicht). Gated die
  Admin-Routen/Seiten des Layers via `requirePermission(event, 'billing.manage')`.
  Reiner additiver Core-Change → eigener Commit (A6).
- **Entitlements (Plan-Features, billing)** = *was darf der zahlende User*. Deklarativ
  in `maui.billing.plans[].features` (z. B. `'comments.unlimited'`, `'export'`).
  Der Layer stellt bereit:
  - Server: `getActiveSubscription(event)` (eine indizierte Query nach `userId`,
    Admin-Client, per-Request-memoized am `event.context`) und
    `requireEntitlement(event, feature)` → 402/403 mit generischem `statusText`.
  - Client: `useBilling()` (aktueller Plan, Status, `hasFeature(feature)`), SSR-hydriert
    über `GET /api/billing/subscription`.
- **Kein Label-/Prefs-Mirroring** des Plans am Appwrite-User (Drift-Risiko zwischen
  Stripe-Wahrheit und Label; die eine indizierte Query ist billig).
- **A14-Grenze**: andere Feature-Layer importieren NICHTS aus billing (Feature↔Feature
  verboten). Feature-Gating anderer Layer passiert in der **App** (die darf beide
  komponieren) oder später über einen Core-Vertrag (`maui.flags`-Registry ist in
  OPEN-ITEMS ohnehin angedacht) — bewusst v2, nicht jetzt.

### B7 — Config-Gate `maui.billing` (deklarativ, deep-merged)

```ts
// packages/billing/app/app.config.ts — Defaults (Layer ist tot bis App aktiviert)
maui: {
  billing: {
    enabled: false,
    currency: 'eur',
    trialDays: 0,                    // 0 = kein Trial
    plans: [
      // Form entspricht MauiBillingPlan (billing/shared) — analog MauiAdminModule
      // { id: 'free', lookupKey: null,        labelKey: 'billing.plans.free', features: [] },
      // { id: 'pro',  lookupKey: 'maui_pro_monthly', labelKey: 'billing.plans.pro',
      //   features: ['export'], highlight: true },
    ],
  },
  admin: {
    modules: [{
      id: 'billing',
      labelKey: 'admin.nav.billing',
      icon: 'i-ph-credit-card',
      to: '/dashboard/billing',
      requiredCapability: 'billing.manage',
    }],
  },
}
```

- `free`-Plan = `lookupKey: null` → existiert nur lokal, kein Stripe-Objekt (kein
  0-€-Abo; „kein aktives Abo" ⇒ free). Offene Alternative: siehe §6.
- `enabled: false` ⇒ Routen antworten 404, Komponenten rendern nichts, Admin-Modul
  wird zwar registriert, die Seite zeigt aber den „nicht aktiviert"-Zustand
  (gleiches Muster wie analytics/consent-Gates).
- Typ `MauiBillingConfig` in `billing/shared/types/billing.ts`; die Registry-Erweiterung
  von `maui.admin.modules` folgt exakt dem comments-Muster (expliziter Vertrag, kein
  Import in admin).

### B8 — Env-Handling (A11-konform)

```bash
# apps/<app>/.env.example — Ergänzung
NUXT_STRIPE_SECRET_KEY=          # server-only! sk_test_… / sk_live_…, NIE public
NUXT_STRIPE_WEBHOOK_SECRET=      # server-only! whsec_… (pro Endpoint/CLI-Session)
```

- `runtimeConfig`-Skeleton im Billing-`nuxt.config.ts`: `stripeSecretKey: ''`,
  `stripeWebhookSecret: ''` (Leer-Defaults für Typ-Inferenz + Env-Mapping —
  Stolperfalle „Env-Var ohne Skeleton-Key mappt ins Leere").
- **Kein** `NUXT_PUBLIC_STRIPE_*` nötig (Redirect-Flow, kein Stripe-JS). Sollte später
  Embedded Checkout kommen, käme `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` dazu.
- Fehlender Key bei `enabled: true` → beim ersten Zugriff sauberer 500 mit generischem
  Text + Server-Log (kein Boot-Crash; Apps ohne Billing bleiben unberührt).
- Stripe-Client als lazy Singleton in `billing/server/utils/stripe.ts`
  (`useStripe(event)`), Auto-Import via `server/utils` (gleiches Muster wie
  core `server/utils/appwrite.ts`).

### B9 — Struktur des Layers (Spiegel von `packages/comments`)

```
packages/billing/
├── app/
│   ├── app.config.ts                    # B7: maui.billing-Defaults + Admin-Modul
│   ├── components/
│   │   ├── BillingPricingTable.vue      # Pläne aus Config, CTA → Checkout
│   │   ├── BillingSubscriptionCard.vue  # Status, Periodenende, Portal-Button
│   │   └── BillingPlanBadge.vue
│   ├── composables/useBilling.ts        # Plan/Status/hasFeature, SSR-hydriert
│   └── pages/
│       ├── pricing.vue                  # out-of-the-box, überschreibbar (wie core/login)
│       ├── account/billing.vue          # auth-Middleware, eigene Abo-Verwaltung
│       └── dashboard/billing.vue        # Admin: Subscriptions-Liste (billing.manage)
├── server/
│   ├── api/
│   │   ├── billing/
│   │   │   ├── checkout.post.ts         # planId → Checkout Session URL
│   │   │   ├── portal.post.ts           # → Customer Portal URL
│   │   │   ├── subscription.get.ts      # eigenes Abo (SSR-Hydration)
│   │   │   └── admin/subscriptions.get.ts  # requirePermission('billing.manage')
│   │   └── stripe/webhook.post.ts       # B1/B4
│   └── utils/
│       ├── stripe.ts                    # useStripe(event), Price-Cache
│       ├── billingCustomer.ts           # ensureCustomer(event, user) — Mapping
│       └── entitlements.ts              # getActiveSubscription, requireEntitlement
├── shared/types/billing.ts              # Rows, MauiBillingConfig, Status-Union
├── schemas/billing.ts                   # createCheckoutSchema(t) etc. (Factories)
├── i18n/locales/{de,en}.json
├── scripts/migrations/001-billing-tables.ts
├── tests/                               # Vitest: pure Logik
├── nuxt.config.ts                       # runtimeConfig-Skeleton, i18n-Locales, imports.dirs
└── package.json                         # deps via catalog: (stripe neu im Catalog)
```

Konventionen, die durchgängig gelten: relative Pfade im Layer, `app.config.ts` in
`app/`, Domain-Types in `shared/types/`, `createError` mit `status`/`statusText`,
i18n-Keys statt hartcodierter Strings, `Query.limit()` explizit, `stripe` zusätzlich
in der `package.json` jeder nutzenden App (shamefully-hoist=false).

---

## 3. Datenmodell

### Table `billing_customers` — Mapping userId ↔ stripeCustomerId

| Column | Typ | Constraints |
|---|---|---|
| `userId` | string(36), required | Unique-Index `uq_user` |
| `stripeCustomerId` | string(64), required | Unique-Index `uq_stripe_customer` |
| `email` | string(320), optional | Snapshot bei Anlage (Debug/Admin-Anzeige) |

- Angelegt **lazy** beim ersten Checkout (`ensureCustomer`): erst Row-Lookup nach
  `userId`; fehlt sie → `stripe.customers.create({ email, metadata: { userId } })` →
  Row anlegen. Race-Schutz: Unique-Index auf `userId`; 409 beim Create → Row des
  Gewinners nachlesen (und den doppelt erzeugten Stripe-Customer wieder löschen).
- Permissions: Table ohne User-Schreibrechte; Row `read(user:<userId>)`.

### Table `billing_subscriptions` — Projektion des Stripe-Abos

| Column | Typ | Constraints |
|---|---|---|
| `userId` | string(36), required | Index `idx_user` (Entitlement-Lookup) |
| `stripeCustomerId` | string(64), required | Index |
| `stripeSubscriptionId` | string(64), required | Unique-Index `uq_stripe_sub` |
| `status` | string(20), required | `active` `trialing` `past_due` `canceled` `incomplete` `incomplete_expired` `unpaid` `paused` (Stripe-Statusraum 1:1) |
| `planId` | string(50), required | interner Plan-Key aus `maui.billing.plans` |
| `priceId` | string(64), required | konkreter Stripe-Price (Audit/Debug) |
| `currentPeriodEnd` | datetime, required | für „verlängert sich am / läuft aus am" |
| `cancelAtPeriodEnd` | boolean, required, default false | Kündigungs-Anzeige |
| `trialEnd` | datetime, optional | |
| `lastStripeEventAt` | integer, required, default 0 | B4 Stale-Guard (`event.created`) |

- Permissions: wie oben — Writes nur Admin-Client, Row `read(user:<userId>)`.
- „Aktives Entitlement" = Row mit `status ∈ {active, trialing}` (Policy für
  `past_due` → offene Entscheidung §6, Default v1: past_due behält Zugriff bis
  `canceled`/`unpaid` — Stripe-Dunning arbeitet).
- Realtime: `useRealtimeRows` auf die eigene Row (Row-Security filtert server-seitig) —
  die Billing-Seite springt nach dem Checkout-Redirect live auf „aktiv", sobald der
  Webhook geschrieben hat (kein Polling der success-URL nötig).

### Migration `001-billing-tables.ts`

Nach dem comments-Muster (002): idempotent (409 → skip, `existingColumnKeys`-Vorprüfung
wegen des MariaDB-`column_limit_exceeded`-Verhaltens), nach Column-Anlage auf
`status === 'available'` pollen, DANN Indizes. Aufruf env-parametrisiert
(`node --experimental-strip-types --env-file=apps/<app>/.env …`) — **nicht** auf eine
App gepinnt (bekanntes OPEN-ITEMS-Finding bei comments nicht wiederholen). Läuft mit
dem Migrations-Key (A2).

---

## 4. Abläufe (Text-Diagramme)

### 4.1 Checkout (Neuabschluss)

```
Browser                Nuxt Server (billing)                 Stripe                Appwrite
  │  klick „Pro wählen"        │                                │                      │
  ├─ POST /api/billing/checkout {planId:'pro'} ─▶               │                      │
  │                            │ 401 ohne event.context.user    │                      │
  │                            │ 404 wenn maui.billing.enabled=false                   │
  │                            │ Zod: planId ∈ konfigurierte Pläne (B5)                │
  │                            ├─ ensureCustomer(user) ────────────────────────────────▶ Row-Lookup userId
  │                            │      (fehlt) ──▶ customers.create{metadata.userId} ─▶ │
  │                            │      ◀────────── cus_… ──────── │   createRow(admin) ─▶
  │                            ├─ lookup_key → Price (Cache) ──▶ │                      │
  │                            ├─ checkout.sessions.create ────▶ │                      │
  │                            │    mode:subscription, customer, │                      │
  │                            │    client_reference_id:userId,  │                      │
  │                            │    success_url: appUrl+localePath('/account/billing')+'?checkout=success',
  │                            │    cancel_url:  appUrl+localePath('/pricing')          │
  │  ◀── { url } ──────────────┤                                │                      │
  ├─ window.location = url ───────────────────────────────────▶ │  (Stripe-hosted UI,  │
  │                                                             │   Karte/SEPA/3DS)    │
  │  ◀── Redirect success_url ─────────────────────────────────┤                      │
  │  Billing-Seite zeigt „wird bestätigt…" bis Realtime-Update der eigenen Row (4.2)   │
```

Fehlerpfade: Stripe-API-Fehler → `createError({ status: 502, statusText:
'Payment provider unavailable' })` (generisch, Details nur ins Server-Log).
Bereits aktives Abo → 409 („Abo verwalten" via Portal statt Zweit-Checkout).

### 4.2 Webhook (Sync der Projektion)

```
Stripe                        Nuxt Server (/api/stripe/webhook)            Appwrite
  ├─ POST signiert (raw body) ─▶ readRawBody(event)
  │                             stripe.webhooks.constructEvent(raw, sig, whsec)
  │   ◀── 400 (generisch) ───── ✗ Signatur ungültig
  │                             ✓ event.type in Allowlist? nein → 200 no-op
  │                             switch event.type:
  │                              checkout.session.completed
  │                                → subscriptions.retrieve(session.subscription)
  │                                → upsert nach stripeSubscriptionId ───────▶ Row (admin,
  │                              customer.subscription.created|updated          read(user:userId))
  │                                → userId via metadata/customer-Row auflösen
  │                                → Stale-Guard: event.created > lastStripeEventAt?
  │                                → status/planId/currentPeriodEnd/cancelAtPeriodEnd upserten
  │                              customer.subscription.deleted
  │                                → status:'canceled' (Row bleibt — Historie/Resubscribe)
  │                              invoice.payment_failed → status:'past_due'
  │                                → optional notify(event, {…}) (Core-Vertrag, best-effort)
  │                              invoice.paid → status:'active' (Recovery)
  │   ◀── 200 ────────────────── Erfolg (schnell antworten, <10 s)
  │   ◀── 500 (generisch) ────── Verarbeitungsfehler → Stripe retryt (idempotent, B4)
```

### 4.3 Kündigung / Verwaltung (Customer Portal)

```
Browser                Nuxt Server                         Stripe
  │  „Abo verwalten"        │                                 │
  ├─ POST /api/billing/portal ─▶ 401/404-Gates wie oben       │
  │                         ├─ customer-Row nach userId (404 wenn kein Customer)
  │                         ├─ billingPortal.sessions.create({customer, return_url}) ─▶
  │  ◀── { url } ───────────┤                                 │
  ├─ Redirect ─────────────────────────────────────────────▶  │ User kündigt
  │                                                           │ (cancel_at_period_end)
  │        Stripe ─▶ webhook: customer.subscription.updated { cancelAtPeriodEnd: true }
  │        …Periodenende… ─▶ webhook: customer.subscription.deleted → status 'canceled'
  │  ◀── Redirect return_url ─ Billing-Seite: „endet am <currentPeriodEnd>" (live via Realtime)
```

Kein eigener Cancel-Endpoint in v1 — das Portal ist die einzige Mutations-UI
(weniger Fläche, Stripe-UX inkl. Retention-Flows konfigurierbar).

---

## 5. Todo-Liste (Phasen, Aufwand je Schritt: S ≈ <½ Tag, M ≈ ½–1 Tag, L ≈ >1 Tag)

### Phase B-0 — Fundament & Entscheidungen
1. (S) Offene Entscheidungen aus §6 fixieren (mind. Pricing-Modell + Tax-Ansatz) und in diesem Dokument nachtragen.
2. (S) Stripe-Account: Test-Mode, Products/Prices mit `lookup_key`s anlegen (`maui_pro_monthly`, …), Customer Portal konfigurieren (erlaubte Aktionen, Kündigungsverhalten), Dashboard-Setting „dynamische Zahlungsmethoden" prüfen.
3. (S) `stripe` in den pnpm Catalog aufnehmen (`pnpm-workspace.yaml`), CONCEPT.md Z. 112 auf Server-Route-Entscheidung (B1) aktualisieren, Status-Tabelle `packages/billing` → „in Arbeit".

### Phase B-1 — Layer-Gerüst & Config-Gate
4. (M) `packages/billing` scaffolden nach comments-Vorbild: `package.json` (catalog:-Deps inkl. `stripe`), `nuxt.config.ts` (runtimeConfig-Skeleton B8, i18n-Locales, ggf. `imports.dirs`), leere Struktur aus B9, ESLint-Scope in `eslint.config.mjs` (Feature-Layer-Regeln: kein Import anderer Feature-Layer).
5. (S) `shared/types/billing.ts`: `BillingCustomerRow`/`BillingSubscriptionRow` (extends `Models.Row`), `SubscriptionStatus`-Union, `MauiBillingPlan`/`MauiBillingConfig`.
6. (S) `app/app.config.ts`: `maui.billing`-Defaults (`enabled: false`) + Admin-Modul-Registrierung (B7).
7. (S) `.env.example` der Pilot-App um `NUXT_STRIPE_SECRET_KEY` + `NUXT_STRIPE_WEBHOOK_SECRET` ergänzen; `apps/<pilot>/nuxt.config.ts` extends um billing erweitern; App bootet unverändert (Gate aus) → lint/typecheck grün.

### Phase B-2 — Datenmodell & Migration
8. (M) `scripts/migrations/001-billing-tables.ts`: beide Tables + Columns + Unique-Indizes nach §3, idempotent (409 → skip, Column-Vorprüfung), `available`-Polling vor Indizes, env-parametrisiert (NICHT app-gepinnt).
9. (S) Migration gegen die lokale Instanz laufen lassen (2×, Idempotenz beweisen), `verify-schema`-Script analog comments.

### Phase B-3 — Stripe-Server-Fundament
10. (M) `server/utils/stripe.ts`: lazy `useStripe(event)` (Key-Check → generischer 500 + Log), Price-Resolver `lookup_key → Price` mit TTL-Cache, `toStripeSafeError`-Helper (Mapping auf generische h3-Fehler, keine Leaks).
11. (M) `server/utils/billingCustomer.ts`: `ensureCustomer(event, user)` mit Unique-Index-Race-Behandlung (409 → Gewinner-Row lesen, Doppel-Customer bei Stripe löschen).
12. (S) `schemas/billing.ts`: `createCheckoutSchema(t)`-Factory (planId validiert gegen `maui.billing.plans`-IDs zur Laufzeit), i18n-Fehlerkeys.

### Phase B-4 — Checkout & Portal (Ablauf 4.1/4.3)
13. (M) `POST /api/billing/checkout`: Gates (401/404/409-bereits-aktiv), Zod, ensureCustomer, Session-Create mit `client_reference_id`/`metadata.userId`, locale-aware success/cancel-URLs (`config.public.appUrl` + Locale-Prefix — Redirects über localePath-Logik, CLAUDE.md-Regel).
14. (S) `POST /api/billing/portal`: Portal-Session, return_url auf die Billing-Seite.
15. (S) `GET /api/billing/subscription`: eigene Subscription-Row (+ aufgelöster Plan aus Config) für SSR-Hydration.

### Phase B-5 — Webhook (Ablauf 4.2)
16. (L) `POST /api/stripe/webhook`: `readRawBody`, `constructEvent`, Allowlist, Upsert-Handler pro Event-Typ als **pure Funktionen** (Event-Payload → Row-Patch; testbar ohne Stripe), Stale-Guard `lastStripeEventAt`, userId-Auflösung via metadata → Fallback customer-Row, Row-Permissions `read(user:<userId>)`.
17. (S) Core-Rate-Limit-Middleware: Webhook-Pfad ausnehmen (Kommentar warum).
18. (S) `invoice.payment_failed` → `notify(event, …)`-Aufruf (Core-Vertrag, best-effort) mit i18n-neutralem Inhalt (Titel/Body als Keys? — notify speichert Strings: Entscheidung wie bei comments-Reply-Notification übernehmen).
19. (M) End-to-end lokal: `stripe listen --forward-to localhost:<port>/api/stripe/webhook`, Test-Checkout mit `4242…` → Row entsteht, Portal-Kündigung → `cancelAtPeriodEnd`, Ablauf simulieren.

### Phase B-6 — Entitlements & RBAC
20. (S) **Core-Commit (additiv, eigener Commit per A6):** Capability `billing.manage` in `shared/types/authz.ts` + `ALL_CAPABILITIES` (+ RBAC-CONCEPT.md-Tabellen ergänzen). Admin erbt via Wildcard.
21. (M) `server/utils/entitlements.ts`: `getActiveSubscription(event)` (memoized am event.context), `requireEntitlement(event, feature)` (402/403, generisch); `GET /api/billing/admin/subscriptions` mit `requirePermission(event, 'billing.manage')`, Pagination + explizites `Query.limit()`.
22. (S) `useBilling()`-Composable: SSR-hydriert aus `GET /api/billing/subscription`, `hasFeature()`, Realtime-Refresh der eigenen Row via `useRealtimeRows`.

### Phase B-7 — UI & i18n
23. (M) `BillingPricingTable.vue` (Pläne aus Config, aktueller Plan markiert, CTA → checkout/portal je Zustand), `BillingSubscriptionCard.vue` (Status-Badge, Periodenende, `cancelAtPeriodEnd`-Hinweis, Portal-Button), `BillingPlanBadge.vue` — Nuxt UI-Komponenten, alle Strings als i18n-Keys.
24. (M) Pages: `pricing.vue` (öffentlich), `account/billing.vue` (auth-Middleware, „wird bestätigt…"-Zustand nach Checkout-Redirect bis Realtime-Update), `dashboard/billing.vue` (Admin-Liste; Seite trägt `requiredCapability: 'billing.manage'` fürs Sidebar-/Middleware-Gating).
25. (S) `i18n/locales/de.json` + `en.json` (Pläne, Status, Fehlermeldungen, Admin-Nav; `@` in Messages als `{'@'}` escapen).

### Phase B-8 — Tests, Härtung, Doku
26. (M) Vitest: Webhook-Mapping-Pures (jeder Event-Typ + Stale/Out-of-order-Fälle), Plan-Auflösung, Checkout-Schema (planId-Tampering), Entitlement-Ableitung aus Statusraum.
27. (M) Manuelle Testmatrix mit Stripe CLI + Test-Cards (§7): Erfolg, 3DS, Decline, past_due-Recovery (`stripe trigger invoice.payment_failed`), Test Clock für Verlängerung; Least-Privilege-Check: User ohne Label sieht nur eigene Rows, `/dashboard/billing` → 403 (Memory-Regel: RBAC mit labellosem User testen).
28. (S) Security-Pass: kein Key in `public`, Webhook-Fehler generisch, Row-Security verifiziert (fremde Subscription per Web-SDK nicht lesbar), Checkout-409/404-Pfade.
29. (S) Doku: README-Status-Tabelle, CONCEPT.md-Status `packages/billing` ✅, OPEN-ITEMS-Backlog-Eintrag auflösen, dieses Dokument auf „umgesetzt" datieren; Betriebs-Runbook (Webhook-Endpoint im Stripe-Dashboard für Prod, whsec-Rotation, Go-Live-Checklist von Stripe durchgehen).

---

## 5b. Andockpunkt Events-Tickets (seit Phase 27, 2026-07-08)

Paid-Einzelevents (EVENTS-V2 §5) sind events-seitig FERTIG vorbereitet —
Billing muss nur noch verbinden:

- **Guard steht schon**: `apps/reddit-comments/server/plugins/event-tickets.ts`
  registriert `hasEventTicket` als `registerEventTicketGuard` — daran ändert
  Phase 23 NICHTS.
- **Checkout (neuer Mode `payment` statt `subscription`)**: CTA „Ticket
  kaufen" auf der Event-Seite → Checkout-Session mit dem `priceLookupKey`
  des Events (`events.priceLookupKey`, Anzeige-Betrag `events.priceAmount`)
  + `metadata: { eventId }`.
- **Webhook**: bei `checkout.session.completed` mit `metadata.eventId` →
  `grantEventTicket(event, { eventId, userId, stripeSessionId, amount })`
  (exportierte, typisierte Schnittstelle aus
  `packages/events/server/utils/eventTickets.ts`; idempotent gegen Retries
  über den Unique-Index eventId+userId). Kein events-Schema-Wissen nötig.
- **UI**: den disabled-CTA „Bald verfügbar" (EventDetail, `event-buy-ticket`)
  durch den echten Checkout-Redirect ersetzen; Refunds v1 im
  Stripe-Dashboard (Status `refunded` in `event_tickets` manuell/Webhook v2).

## 6. Offene Entscheidungen (vor Phase B-0 zu treffen)

1. **Pricing-Modell** — v1-Annahme: flat pro User, monatlich + jährlich (2 Prices pro
   Plan, Checkout mit Intervall-Wahl oder zwei CTAs?). Offen: Seats (`quantity`),
   Usage-based (metered) — beides bewusst NICHT in v1; Datenmodell hält `priceId`
   bereits fest, sodass Erweiterung additiv geht.
2. **Free-Plan-Modellierung** — Empfehlung: kein Stripe-Objekt (kein Abo = free,
   B7). Alternative (0-€-Price in Stripe) nur, wenn Reporting/MRR-Ansicht in Stripe
   alle User zeigen soll.
3. **Steuern / Stripe Tax** — `automatic_tax: { enabled: true }` in der Checkout
   Session + Tax-Registrierungen im Dashboard? Kostet pro Transaktion, spart
   OSS-Handarbeit. Entscheidung hängt am erwarteten EU-Umsatz (OSS-Schwelle 10 k€)
   und daran, ob B2C, B2B oder beides. B2B → `tax_id_collection` (USt-ID,
   Reverse-Charge) im Checkout aktivieren.
4. **EU-Rechnungen** — reichen Stripe-Rechnungen (Invoice-PDFs, Nummernkreis in
   Stripe konfigurierbar, Portal-Historie) oder braucht es GoBD-konforme eigene
   Rechnungsstellung? v1-Empfehlung: Stripe-Invoicing genügt; `customer_update:
   { address: 'auto', name: 'auto' }` + Pflicht-Rechnungsadresse im Checkout.
5. **`past_due`-Policy** — Zugriff behalten während Stripe-Dunning (Default-Vorschlag)
   oder sofort sperren? Betrifft `getActiveSubscription`-Statusmenge.
6. **Trial** — `trialDays` global per Config (B7) vs. pro Plan vs. gar nicht;
   Trial ohne Zahlungsmethode (`trial_settings.end_behavior`) ja/nein.
7. **Zahlungsmethoden** — nur dynamische Methoden per Dashboard (Empfehlung) —
   relevant: SEPA-Lastschrift hat asynchrone Bestätigung (Webhook-Status
   `incomplete` → `active` Tage später); UI-Zustand „Zahlung wird verarbeitet" nötig?
8. **Admin-Umfang v1** — reine Liste (Plan/Status/Periodenende) oder auch Aktionen
   (Refund, Abo im Namen des Users kündigen)? Empfehlung v1: read-only + Deep-Link
   zum Stripe-Dashboard-Customer (Aktionen dort, weniger sicherheitskritische Fläche).
9. **notify()-Inhalte** — Zahlungsfehlschlag-Benachrichtigung: nur In-App (vorhandener
   Vertrag) oder zusätzlich E-Mail (hängt am offenen E-Mail-Notifications-Backlog)?

---

## 7. Test-Strategie (Referenz)

- **Stripe CLI**: `stripe login` → `stripe listen --forward-to
  localhost:3001/api/stripe/webhook` (druckt das `whsec_…` für die lokale `.env`);
  gezielte Events via `stripe trigger checkout.session.completed`,
  `stripe trigger invoice.payment_failed` etc.
- **Test-Cards** (Test-Mode, beliebiges Datum/CVC): `4242 4242 4242 4242` (Erfolg),
  `4000 0025 0000 3155` (3DS-Pflicht), `4000 0000 0000 0002` (Decline),
  `4000 0000 0000 0341` (Attach ok, Payment scheitert → past_due-Pfad),
  SEPA-Testkonten für den asynchronen Pfad (falls Entscheidung §6.7 = ja).
- **Test Clocks** (Stripe Dashboard/API): Verlängerung + Periodenende-Kündigung
  simulieren, ohne einen Monat zu warten.
- **Vitest** (Layer-`tests/`): nur pure Logik — Webhook-Event→Row-Mapping,
  Stale-Guard, Plan-/Entitlement-Auflösung, Zod-Schemas (Tampering-Fälle).
- **Idempotenz-Beweis**: Migration 2× laufen lassen; denselben Webhook-Event 2×
  senden (`stripe events resend evt_…`) → identischer Endzustand.
- **RBAC/Row-Security**: mit labellosem Test-User (Memory-Regel) — fremde
  Subscription-Row per Web-SDK nicht lesbar, Admin-Route 403, `/dashboard/billing`
  ohne `billing.manage` → 403.
- **E2E (manuell, Checkliste)**: Voll-Flow 4.1 → 4.2 → 4.3 gegen lokale Appwrite +
  Stripe Test-Mode; Realtime-Update der Billing-Seite nach Checkout beobachten.

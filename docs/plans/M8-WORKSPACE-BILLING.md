# M8 — Workspace-Billing (Stripe) + F3 voll

Status: **BESCHLOSSEN — in Umsetzung** (Check-in 2026-07-19, David):
Plan-Schnitt **free/pro/business** · Workspace-Verwaltung v1 **nur
Studio-Dashboard** (Self-Service = M9) · **gleicher Stripe-Account,
eigene Produkte** (Price-IDs via Env, Start im Test-Mode). Baut auf der
M8-Vorbereitung auf (signierte Entitlement-Zustellung ist FERTIG:
`entitlementDocument.ts`, Studio-Aussteller, Site-Pull, featureGates =
Registry ∧ Laufzeit ∧ Entitlement). M8 verbindet nur noch: **wer zahlt
wofür — und wie wird daraus ein Entitlement-Grant.**

## Leitentscheidung: billing-Layer wiederverwenden (Empfehlung)

`packages/billing` ist foundation-tier und besitzt bereits alles Gefährliche:
Stripe-Transport, hosted Checkout/Portal, Webhook mit Signatur/Allowlist/
Stale-Guard, Idempotenz. Der bewiesene Erweiterungsvertrag ist
`registerCheckoutFulfillment` (Events-Tickets nutzen ihn seit Phase 23).

**M8 = Studio extends billing** und verdrahtet einen Fulfillment-Handler —
KEINE zweite Stripe-Integration. Das folgt A14 (expliziter Vertrag statt
Kopplung) und „Ideen als Leitplanke": wir bauen nichts nach, was schon da ist.

Alternative (abzulehnen): eigener Stripe-Client im studio-Layer — doppelte
Webhook-Security, doppelte Idempotenz, zwei Stellen für Key-Rotation.

## Datenmodell (studio-Layer, additiv)

1. **`workspaces`** (Migration studio-005): `name`, `ownerEmail`,
   `stripeCustomerId` (nullable), `plan` (Key aus dem Katalog, Default
   `free`), `status` (`active`/`past_due`/`canceled`), Timestamps.
   Ein Workspace = ein zahlender Kunde (Horizont 2: Agentur-Kunde;
   heute: David selbst).
2. **`sites.workspaceId`** (Migration studio-006, nullable): jede Site hängt
   an genau einem Workspace. Bestands-Sites bleiben `null` = „Betreiber-
   Workspace" (implizit alles erlaubt — verhält sich wie heute).

## Plan-Katalog (Code, kein Table)

`maui.studio.plans` in der Studio-`app.config.ts` — bewusst Code statt
Datenbank (Katalog ändert sich mit Releases, gehört unter Versionskontrolle,
gleiche Logik wie `theme.catalog.ts`):

```ts
plans: {
  free:     { lookupKey: null,                         features: ['comments'] },
  pro:      { lookupKey: 'workspace_pro_monthly',      features: ['comments','posts','events','activity','feedback'] },
  business: { lookupKey: 'workspace_business_monthly', features: [/* alle optional-tier Features */] },
}
```

**Abweichung vom Entwurf (umgesetzt 2026-07-19):** statt Price-IDs aus Envs
nutzen die Pläne Stripe-**lookup_keys** — exakt das bewiesene Muster des
billing-Layers (`resolvePriceByLookupKey`): Test-/Live-Mode wechselbar ohne
Codeänderung UND ohne Env-Pflege, die Keys sind nicht geheim. In Stripe je
Mode einen Preis mit diesem lookup_key anlegen, fertig.

## Fluss

1. Studio-Dashboard: Workspace-Detail bekommt „Plan ändern" → hosted
   Checkout des billing-Layers mit `metadata: { workspaceId, plan }`.
2. Webhook (billing verifiziert Signatur) → `registerCheckoutFulfillment`-
   Handler im studio-Layer:
   - Subscription aktiv → `workspace.plan = plan`, `status = active`
   - **Grant-Sync:** für JEDE Site des Workspace das Entitlement-Set auf
     `plans[plan].features` setzen (bestehende PUT-Logik wiederverwenden,
     Katalog-validiert inkl. requires-Schluss)
   - Kündigung/Zahlungsausfall → `status`-Wechsel; Entitlements NICHT sofort
     löschen, sondern über die vorhandenen F3-Felder auslaufen lassen:
     `validUntil = Periodenende`, `graceUntil = +7 Tage` — die Sites machen
     den Rest selbst (featureGates evaluiert das Dokument bereits).
3. Zustellung: unverändert der 15-min-Pull der signierten Dokumente.

## Umsetzungsstand T3 (2026-07-19, nachts autonom)

- **billing-Layer**: neuer Abo-Lifecycle-Vertrag `registerSubscriptionFulfillment`
  (Spiegel des Checkout-Vertrags): der Webhook reicht nach Signatur-Check +
  nicht-stalem Upsert ein `VerifiedSubscriptionUpdate` (Status, Metadata,
  Periodenende) an App-Handler weiter. Dazu `createSubscriptionCheckoutSession`
  (mode subscription, Metadata auch auf `subscription_data` — nur so tragen
  spätere subscription.*-Events die workspaceId) BEWUSST ohne den
  409-„bereits aktiv"-Check (Operator hält mehrere Workspace-Abos).
- **studio-Layer**: `replaceSiteGrants` (gemeinsame Ersetzen-Logik mit
  entitlements.put), `applyWorkspacePlan` (Katalog laden → requires-Schluss →
  alle Workspace-Sites syncen → Workspace-Row patchen),
  `handleWorkspaceSubscriptionUpdate` (Policy pure:
  `subscriptionUpdateToAction`, 13 Unit-Tests).
- **apps/studio**: extends billing (Manifest/Deps/checks grün),
  `maui.billing.enabled` an (plans leer — kein Site-Abo-Verkauf),
  Fulfillment-Plugin (A14 wie apps/comments↔events), Checkout-Route
  `POST /api/studio/workspaces/:id/checkout`, billing-Migration gegen
  studio-1xsl gelaufen. UI: „Plan ändern"-Modal (Radio pro/business →
  Stripe-hosted Checkout; Downgrade-Hinweis).
- **Kündigungs-Design-ÄNDERUNG gegenüber dem Entwurf**: keine eigenen
  validUntil/graceUntil-Spalten — STRIPE ist der Timer.
  `cancel_at_period_end` hält den Status bis zum Periodenende auf active;
  erst `customer.subscription.deleted` liefert canceled → der Handler setzt
  den Workspace aufs **free-Set** zurück (NIE null Features — Gekündigte sind
  nie schlechter gestellt als Nie-Zahler). past_due/unpaid = Status-Marker,
  Grants bleiben (Stripe-Dunning ist die Grace-Periode).
- **Stripe (Test-Mode/Sandbox, acct Hawaii Studio)**: Produkte angelegt und
  per Dashboard-Suche verifiziert — „Workspace Pro" 29 €/Monat
  (`workspace_pro_monthly`) + „Workspace Business" 79 €/Monat
  (`workspace_business_monthly`). Preise sind PLATZHALTER — Davids
  Entscheidung, im Test-Mode beliebig änderbar.
- **Was fürs Test-Mode-E2E noch fehlt (David, ~5 min):**
  1. Test-Secret-Key (sk_test_…) aus dem Stripe-Dashboard →
     `apps/studio/.env` als `NUXT_STRIPE_SECRET_KEY` (Zwischenablage/nano,
     nie durch den Chat).
  2. Für Webhooks lokal: `stripe listen --forward-to
     localhost:3004/api/stripe/webhook` (Stripe CLI, einmal `stripe login`) —
     das ausgegebene whsec_… als `NUXT_STRIPE_WEBHOOK_SECRET` in dieselbe .env.
  3. Studio-Dev neu starten → Workspaces → „Plan ändern" → Testkarte
     4242 4242 4242 4242 → Grants aller Workspace-Sites springen um.

## Reine Funktionen zuerst (Unit-testbar ohne Stripe)

- `planToGrants(planKey, catalog, sites) → Grant-Operationen` (pure)
- `subscriptionEventToWorkspacePatch(event) → {plan?, status?, validUntil?}`
  (pure; Input = schon-verifiziertes billing-Event, nie rohes Stripe-JSON)

Stripe selbst wird in Tests NICHT gemockt-nachgebaut — die Webhook-Security
ist im billing-Layer bereits bewiesen; M8-Tests decken nur die Mapping-
Logik und den Handler mit gefaktem Event ab.

## Abnahme (Ende M8)

- [x] Checkout im Test-Mode ✅ **BEWIESEN 2026-07-19**: „Agentur Demo"
      free→business über die Stripe-hosted Seite (Testkarte 4242) →
      Webhook via `stripe listen` → Workspace plan=business,
      stripeCustomerId gesetzt, photos-Grants = requires-geschlossenes
      business-Set (activity, comments, courses, events, feedback, media,
      moderation, posts, tickets). Bewusst business statt pro fürs
      Dogfooding: pro hätte photos das media-Feature entzogen (korrekte
      Enforcement-Semantik — Foundation admin/themes sind entitlement-frei
      immer an, evaluateEntitlement).
- [x] Kündigung ✅ **BEWIESEN 2026-07-19**: Abo im Stripe-Dashboard sofort
      beendet → subscription.deleted → free-Fallback: plan=free,
      status=active, photos-Grants = [comments, moderation] — nie leer.
      (Demo-Zustand danach zurückgesetzt: photos wieder Betreiber-Workspace
      mit admin/media/themes.)
- [x] requires-Schluss: Plan mit `posts` granted automatisch `moderation`
      (Unit-Tests + applyWorkspacePlan über den Katalog-Table)
- [x] Bestands-Sites ohne Workspace unverändert (workspaceId '' wird vom
      Sync nie angefasst — Query filtert auf die Workspace-Id)
- [x] GDPR: bewusste v1-Entscheidung STATT Contributor — Workspace-Owner
      sind (noch) keine Studio-User, der Core-GDPR-Vertrag ist userId-
      keyed und greift hier nicht. ownerEmail-Löschung = manueller
      Betreiber-Vorgang (Row löschen), dokumentiert am WorkspaceRow-Typ.
      Der Contributor kommt mit M9/Self-Service, wenn Owner echte User werden.

## Beantwortete Check-in-Fragen (David, 2026-07-19)

1. Plan-Schnitt: **free/pro/business** wie vorgeschlagen.
2. Workspace-Verwaltung v1: **nur Studio-Dashboard** (Anlegen/Zuordnen durch
   den Betreiber; Checkout/Kündigung über Stripe-hosted Pages). Self-Service
   bleibt M9.
3. Stripe: **gleicher Account, eigene Produkte** für Workspace-Pläne
   (Lookup-Keys/Price-IDs via server-only Envs); Aufbau im Test-Mode.

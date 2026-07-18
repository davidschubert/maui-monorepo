# M8 — Workspace-Billing (Stripe) + F3 voll

Status: **ENTWURF zum Check-in** (2026-07-18, Claude). Baut auf der
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
  free:     { stripePriceId: null,            features: ['comments'] },
  pro:      { stripePriceId: 'price_…(env)',  features: ['comments','events','posts','activity'] },
  business: { stripePriceId: 'price_…(env)',  features: [/* alles aus feature_catalog außer Experimental */] },
}
```

Price-IDs kommen aus `NUXT_STUDIO_STRIPE_PRICE_*`-Envs (server-only), damit
Test-/Live-Mode ohne Codeänderung wechselbar ist.

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

## Reine Funktionen zuerst (Unit-testbar ohne Stripe)

- `planToGrants(planKey, catalog, sites) → Grant-Operationen` (pure)
- `subscriptionEventToWorkspacePatch(event) → {plan?, status?, validUntil?}`
  (pure; Input = schon-verifiziertes billing-Event, nie rohes Stripe-JSON)

Stripe selbst wird in Tests NICHT gemockt-nachgebaut — die Webhook-Security
ist im billing-Layer bereits bewiesen; M8-Tests decken nur die Mapping-
Logik und den Handler mit gefaktem Event ab.

## Abnahme (Ende M8)

- [ ] Checkout im Test-Mode: Workspace free→pro → Grants aller Workspace-
      Sites springen auf das pro-Set → Site-Pull → Feature an (Browser)
- [ ] Kündigung → validUntil/graceUntil gesetzt → nach Ablauf Feature aus
      (Zeitreise per Testable-Clock, nicht Warten)
- [ ] requires-Schluss: Plan mit `posts` granted automatisch `moderation`
- [ ] Bestands-Sites ohne Workspace unverändert (Regression)
- [ ] GDPR: workspaces-Contributor (ownerEmail!)

## Offene Fragen an David (Check-in)

1. Plan-Schnitt ok (free/pro/business) oder andere Namen/Sets?
2. Workspace-Verwaltung v1: reicht Anlegen/Zuordnen im Studio-Dashboard
   (kein Self-Service — das ist M9)?
3. Stripe-Account: eigener Account/Test-Mode für die Plattform, getrennt vom
   Site-Billing (empfohlen: gleicher Account, eigene Produkte)?

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

## Beantwortete Check-in-Fragen (David, 2026-07-19)

1. Plan-Schnitt: **free/pro/business** wie vorgeschlagen.
2. Workspace-Verwaltung v1: **nur Studio-Dashboard** (Anlegen/Zuordnen durch
   den Betreiber; Checkout/Kündigung über Stripe-hosted Pages). Self-Service
   bleibt M9.
3. Stripe: **gleicher Account, eigene Produkte** für Workspace-Pläne
   (Lookup-Keys/Price-IDs via server-only Envs); Aufbau im Test-Mode.

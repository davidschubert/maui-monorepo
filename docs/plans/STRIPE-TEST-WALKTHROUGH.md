# Stripe Test-Mode — Durchspiel-Anleitung (turnkey)

Stand: 2026-07-21. Ziel: den **kompletten Bezahl-Flow im Test-Modus beweisen** —
ohne Bank, ohne Live-Aktivierung. Danach weißt du sicher, dass Checkout (monatlich
+ jährlich), Feature-Sync, Portal/Kündigung und Zahlungsfehler funktionieren.

**Zeit: ~15 Min.** Die Schritte mit 🔑 brauchen deinen Stripe-**Test**-Key bzw.
deinen Login — die machst du; alles andere ist vorbereitet.

## Vorab: Infra ist verifiziert (2026-07-21) ✅

Von außen geprüft, alles bereit auf `studio.pukalani.app`:
- Webhook `POST /api/stripe/webhook` prüft Signaturen (unsigniert → 400) → das
  `whsec_`-Test-Secret ist gesetzt.
- Billing ist aktiv, Checkout- + Portal-Routen leben (401 ohne Login, kein 404).
- Jahres-Intervall ist im Code verdrahtet (Checkout akzeptiert `interval`).

Du brauchst nur noch: **(a)** die 4 Test-Preise anlegen, **(b)** dich einloggen,
**(c)** durchklicken.

---

## Schritt 1 🔑 — Die 4 Test-Preise anlegen

Zuerst die Beträge in `scripts/stripe/ensure-prices.mjs` auf deine Wunschpreise
setzen (aktuell Platzhalter: Pro 19/190 €, Business 49/490 €). Dann:

```bash
# Test-Key aus dem Stripe-Dashboard (Test-Modus) → Developers → API keys
STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs          # Vorschau (ändert nichts)
STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs --apply  # legt an
```
Erwartung: 4 lookup_keys `workspace_{pro,business}_{monthly,yearly}` existieren
(monatliche evtl. schon aus M8 → werden übersprungen, die jährlichen neu).

**Stripe-Test-Webhook prüfen** (Dashboard → Developers → Webhooks, Test-Modus):
Endpoint `https://studio.pukalani.app/api/stripe/webhook` mit genau diesen Events:
`checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
`invoice.paid`, `invoice.payment_failed`. (Aus M8 vorhanden — nur gegenchecken.)

## Schritt 2 🔑 — Als Workspace-Owner einloggen

`https://studio.pukalani.app` → „Code per Mail" (OTP). Du brauchst einen
Workspace, dem du als Owner zugeordnet bist — im Betreiber-Dashboard unter
`/dashboard/workspaces` anlegen/zuordnen, falls noch keiner da ist. Der
Kundenbereich ist dann unter `/workspace`.

## Schritt 3 🔑 — Monats-Abo buchen (der Kern-Flow)

`/workspace` → beim Workspace „Plan ändern" → **Pro** wählen, Intervall
**Monatlich** → „Zum Checkout". Auf der Stripe-Seite:
- Testkarte **`4242 4242 4242 4242`**, beliebiges Zukunftsdatum, beliebige CVC
- Rechnungsadresse ausfüllen (Pflicht, wegen Stripe Tax)

**Soll-Ergebnis:**
- Redirect zurück auf `/workspace?checkout=success`
- Der Workspace springt **live** (ohne Reload) auf Plan „pro" — der Webhook hat
  geschrieben, Realtime aktualisiert die Seite
- Die Features aller zugeordneten Sites sind auf das Pro-Set synchronisiert
- Im Stripe-Test-Dashboard: die Subscription ist `active`

## Schritt 4 🔑 — Jahres-Abo buchen

Wie Schritt 3, aber Intervall **Jährlich** (an einem anderen Workspace, oder
nachdem der erste gekündigt ist). Auf der Stripe-Seite steht der **Jahrespreis**
(z. B. „190 €/Jahr") → so weißt du, dass der `_yearly`-lookup_key gegriffen hat.

## Schritt 5 🔑 — Portal & Kündigung

`/workspace` → „Abo verwalten" → Stripe-Test-Portal → **Kündigen** (zum
Periodenende). Soll: zurück auf `/workspace`, Anzeige „endet am …";
`cancelAtPeriodEnd` ist gesetzt. (Optional: im Stripe-Dashboard per **Test Clock**
das Periodenende vorspulen → Webhook `customer.subscription.deleted` →
der Workspace fällt aufs **free**-Set zurück, nie auf null Features.)

## Schritt 6 🔑 — Zahlungsfehler (der heute gefixte Pfad)

Am einfachsten mit der Stripe CLI (`stripe login` einmalig):
```bash
stripe trigger invoice.payment_failed
```
Oder mit der Fehler-Testkarte `4000 0000 0000 0341` (Attach ok, spätere Zahlung
scheitert). **Soll-Ergebnis:**
- Workspace-Status → `past_due`, **Zugriff bleibt** (Stripe-Dunning ist die Grace)
- Der Nutzer bekommt **genau EINE** In-App-Benachrichtigung „Zahlung
  fehlgeschlagen" — auch bei Stripe-Retries nur einmal (das war der Bugfix von
  heute, Commit `532bb4e`).

---

## Abnahme-Checkliste

- [ ] `ensure-prices --apply` → 4 lookup_keys existieren
- [ ] Monats-Checkout (4242) → Subscription `active`, Features synchronisiert, Live-Sprung
- [ ] Jahres-Checkout → Stripe zeigt Jahrespreis
- [ ] Portal-Kündigung → „endet am …" / `cancelAtPeriodEnd`
- [ ] Test-Clock-Periodenende → free-Fallback (Features bleiben, nicht null)
- [ ] `invoice.payment_failed` → `past_due`, Zugriff bleibt, **genau eine** Notify

Wenn alle Haken sitzen, ist Stripe **test-seitig vollständig bewiesen** — für
Live fehlen dann nur noch Bank + `sk_live_`/`whsec_`-Tausch (siehe
[STRIPE-GO-LIVE-RUNBOOK.md](STRIPE-GO-LIVE-RUNBOOK.md)).

## Troubleshooting

- **Nach Checkout tut sich nichts / Plan springt nicht:** Stripe-Test-Webhook-Log
  (Dashboard) prüfen — kommen die Events mit 200 an? Falscher Endpoint/Events →
  Schritt 1. Server-Log: `[billing] Webhook…`.
- **Webhook 400 „Invalid webhook":** `whsec_` in der studio-Server-.env passt
  nicht zum Test-Endpoint-Secret → aus dem Dashboard-Endpoint kopieren, `pm2
  reload`.
- **„Plan has no checkout (free)":** free hat bewusst keinen Preis — nur pro/
  business sind buchbar.
- **Checkout 502:** `sk_test_` fehlt/falsch in der Server-.env.

# Stripe Test-Mode — Durchspiel-Anleitung (Community-Abo)

Stand: **2026-08-02**, neu geschrieben nach A6 (die Community zahlt, nicht mehr
der Workspace). Ziel: den **kompletten Bezahl-Weg im Test-Modus beweisen** —
ohne Bank, ohne Live-Aktivierung. Danach weißt du sicher, dass Kauf (monatlich
+ jährlich), Plan-Wirkung, Portal/Kündigung und Zahlungsverzug funktionieren.

> **Woher diese Anleitung kommt.** Sie ist aus dem CODE hergeleitet, nicht aus
> der Erinnerung: hinter jedem Schritt steht die Datei, die ihn implementiert.
> Sie ist aber **noch nicht durchgeklickt** — dafür braucht es einen
> Stripe-Test-Key, und der gehört David. **Was beim Durchlauf anders aussieht
> als hier beschrieben, wird hier korrigiert** (nicht im Kopf behalten).
> Die Vorgänger-Fassung beschrieb `/workspace` und die Pläne free/pro/business;
> was daran falsch war, steht am Ende unter „Was sich gegenüber der alten
> Anleitung geändert hat".

> **Wer klickt.** Alle sechs Proben laufen über **Davids Stripe-Konto** und
> seinen Login. Claude kann sie **nicht** ausführen: kein Stripe-Key, kein
> Owner-Konto, keine Testkarte. Claude kann vorbereiten, gegenlesen und
> hinterher die Tabellen-Zustände prüfen.

**Zeit: ~20 Min.**

---

## Die Landkarte: drei Hosts, zwei Appwrite-Projekte, ein Stripe-Konto

Das ist der Teil, der sich mit A6 geändert hat — wer ihn überspringt, sucht
später an der falschen Stelle.

| Wo | Was passiert dort | Appwrite-Projekt |
|---|---|---|
| `https://<community-host>/dashboard/settings/subscription` | Der **Owner klickt**: Plan wählen, Portal öffnen. App `platform`. | `pool` |
| `https://control.pukalani.app` | **Stripe lebt hier**: Schlüssel, Checkout-Session, Portal-Session, Webhook. App `control`. | `control` |
| Stripe-Dashboard (Test-Modus) | Preise, Webhook-Endpunkt, Test-Clock. | — |

Wichtig und leicht zu übersehen: **die Platform-App hat kein Stripe**.
`apps/platform/nuxt.config.ts` listet `packages/billing` nicht in `extends` —
dort gibt es weder Schlüssel noch Webhook. Der Kauf-Knopf ruft über die
Service-Naht das Control Plane:

```
Browser des Owners
  → POST /api/community/billing/checkout        (platform, packages/onboarding/server/api/community/billing/checkout.post.ts)
      · requireCommunityTeamGate prüft `community.billing` (nur Owner) und prägt ein kurzlebiges JWT
  → POST /api/control/billing/community/checkout (control, apps/control/server/api/control/billing/community/checkout.post.ts)
      · Service-Secret sagt WELCHES Deployment fragt, das JWT WER handelt
      · createCommunityCheckoutUrl                (apps/control/server/utils/communityCheckout.ts)
  → Stripe Checkout
  → Stripe Webhook an https://control.pukalani.app/api/stripe/webhook
                                                 (packages/billing/server/api/stripe/webhook.post.ts)
      · apps/control/server/plugins/billing-fulfillment.ts
      · handleCommunitySubscriptionUpdate         (packages/control/server/utils/communityBilling.ts)
      → schreibt die `communities`-Row im Projekt `control`
```

`communityId` kommt **nie** aus dem Body (`requireCommunityTeamGate` in
`packages/onboarding/server/utils/communityTeamGate.ts`) — sonst kaufte jemand
ein Abo auf Kosten einer fremden Community.

---

## Probe 1 🔑 — Preise anlegen und den Webhook gegenchecken

**Preise.** `scripts/stripe/ensure-prices.mjs` legt die vier Prices idempotent
an. Die Beträge stehen schon richtig im Skript (Davids Pricing 2026-07-26):

| Plan | lookup_key | Betrag |
|---|---|---|
| Personal | `workspace_personal_monthly` | 29,00 € / Monat |
| Personal | `workspace_personal_yearly` | 261,00 € / Jahr (−25 %) |
| Pro | `workspace_pro_monthly` | 149,00 € / Monat |
| Pro | `workspace_pro_yearly` | 1341,00 € / Jahr (−25 %) |

```bash
# Test-Key aus dem Stripe-Dashboard (Test-Modus) → Developers → API keys
STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs          # Vorschau, ändert nichts
STRIPE_KEY=sk_test_…  node scripts/stripe/ensure-prices.mjs --apply  # legt an
```

> **Die Schlüssel heißen `workspace_*` und das bleibt so.** Sie sind
> IDENTITÄTEN bei Stripe, kein Wort — umbenennen hieße, die angelegten Preise
> nicht mehr zu finden. Der Behälter „Workspace" ist gefallen, die Schlüssel
> nicht. Steht so auch in `packages/control/app/app.config.ts`, wo der
> Plan-Katalog lebt (`pukalani.control.plans`).

**Webhook.** Stripe-Dashboard (Test-Modus) → Developers → Webhooks. Endpunkt:

```
https://control.pukalani.app/api/stripe/webhook
```

Die Ereignis-Liste ist seit 2026-08-02 **neun** Einträge lang, nicht mehr sechs
(`WEBHOOK_ALLOWLIST` in `packages/billing/server/utils/webhookMapping.ts` —
alles andere beantwortet die Route mit 200 und tut nichts):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded` ← neu
- `checkout.session.async_payment_failed` ← neu
- `checkout.session.expired` ← neu
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

**Gegenprobe ohne Klick:** ein unsignierter POST auf den Endpunkt muss **400**
antworten (Signatur greift). Kommt **404**, ist `NUXT_STRIPE_WEBHOOK_SECRET` auf
`control` nicht gesetzt — die Route sagt dann bewusst „gibt es hier nicht"
statt 500 (`packages/billing/server/api/stripe/webhook.post.ts`).

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://control.pukalani.app/api/stripe/webhook -d '{}'
```

## Probe 2 🔑 — Als **Community-Owner** einloggen

Nicht mehr auf `control.pukalani.app`, sondern auf dem **Host der Community**:

```
https://<community-host>/dashboard/settings/subscription
```

Der Menüpunkt heißt „Abo & Rechnung". Er verlangt die Capability
`community.billing`, und die trägt **nur der Owner** (Davids Entscheidung 2 vom
2026-07-30, `packages/core/shared/communityAuthz.ts`). Ein Admin oder Moderator
derselben Community sieht die Seite nicht.

Wenn du keine Test-Community hast: über den Trichter
`https://start.pukalani.app` eine anlegen — du bist dann automatisch ihr Owner
(`packages/control/server/utils/onboardingProvision.ts`).

**Soll-Bild:** drei Karten — „Aktueller Plan", „Plan wählen", „Rechnungen &
Zahlungsmethode" (`packages/onboarding/app/pages/dashboard/settings/subscription.vue`).
Bei **Basic** gibt es bewusst keinen Knopf: das ist der kostenlose
Ausgangszustand, `lookupKey: null`.

## Probe 3 🔑 — Monats-Abo kaufen (der Kern-Weg)

„Plan wählen" → **Personal**, Intervall **Monatlich** → Knopf. Auf der
Stripe-Seite:

- Testkarte **`4242 4242 4242 4242`**, beliebiges Zukunftsdatum, beliebige CVC
- **Rechnungsadresse ist Pflicht** (`billing_address_collection: 'required'`,
  weil `automatic_tax` an ist)

**Soll-Ergebnis:**

1. Rücksprung auf `https://<community-host>/dashboard/settings/subscription?checkout=success`.
   Diese URL baut der **Server** aus `communities.host` — nie aus dem Body
   (`apps/control/server/utils/communityCheckout.ts`).
2. **Die Seite springt NICHT von selbst auf den neuen Plan.** Der Erfolgs-Toast
   sagt „in Kürze". Das ist Absicht und kein Fehler: `communities` liegt im
   Projekt `control`, in dem dieser Browser weder Sitzung noch Leserecht hat —
   es gibt für Branding und Plan keine Live-Propagation (CLAUDE.md/D6). Nach
   dem nächsten Seitenaufbau (Resolver-Cache ≤ 30 s) steht der neue Plan da.
3. **Im Projekt `control`, Tabelle `communities`, Zeile dieser Community:**

   | Spalte | Soll |
   |---|---|
   | `plan` | `personal` |
   | `billingStatus` | `active` |
   | `stripeCustomerId` | `cus_…` |
   | `stripeSubscriptionId` | `sub_…` |
   | `trialEndsAt` | leer — ein bezahltes Abo löst die Testphase ab |
   | `pastDueSince` | leer |
   | `suspension` | leer (eine `billing`-Sperre fiele hier automatisch; eine `abuse`-Sperre bliebe) |

4. **Im Projekt `control`, Tabelle `billing_subscriptions`:** eine Spiegel-Zeile
   mit diesem `stripeSubscriptionId` und `status: active`.
5. Im Stripe-Test-Dashboard: Subscription `active`, und auf ihr die Metadata
   `communityId` / `plan` / `userId`. **Ohne `communityId` in der Metadata
   passiert bei uns gar nichts** — genau daran erkennt der Fulfillment-Handler
   das Abo (`subscriptionUpdateToCommunityAction` in
   `packages/control/shared/communityBilling.ts`, Zweig `no-community-metadata`).

> `billing_customers` bleibt bei diesem Weg **leer**. Der Community-Customer
> wird direkt auf der `communities`-Row verankert (`ensureCommunityCustomer`),
> nicht über die Nutzer-Customer-Tabelle des billing-Layers. Nicht suchen.

**Zweiter Kauf ist gesperrt:** noch einmal „Plan wählen" bei laufendem Abo →
**409** mit `reason: 'already_subscribed'`. Herauf und herunter geht ab jetzt
über das Portal (Proration rechnet Stripe). Das ist der Doppelabo-Schutz in
`apps/control/server/api/control/billing/community/checkout.post.ts`.

## Probe 4 🔑 — Jahres-Abo

Wie Probe 3, aber Schalter auf **Jährlich** und Plan **Pro** — an einer
**zweiten** Test-Community, oder nachdem die erste gekündigt und der
Periodenwechsel durchgelaufen ist (sonst greift der 409 aus Probe 3).

**Soll:** die Stripe-Seite zeigt **1341,00 € / Jahr**. Damit ist bewiesen, dass
`workspace_pro_yearly` gegriffen hat (`pickLookupKey` in
`packages/control/shared/communityBilling.ts`). Danach `plan: pro` in
`communities`.

> Wenn ein Jahres-Price fehlt, fällt `pickLookupKey` **bewusst auf den
> Monatspreis zurück** statt zu brechen. Dann steht auf der Stripe-Seite ein
> Monatsbetrag — das ist die Diagnose, nicht ein Anzeigefehler.

## Probe 5 🔑 — Portal, Wechsel und Kündigung

„Rechnungen & Zahlungsmethode" → das Stripe-Test-Portal öffnet
(`createCommunityPortalUrl`, Rückkehr auf denselben Community-Pfad).

- **Kündigen** (zum Periodenende): Stripe setzt `cancel_at_period_end`. Bei uns
  ändert sich **noch nichts** — das Abo lebt bis zum Periodenende weiter, und
  genau so ist es gedacht.
- **Periodenende vorspulen** mit einer **Test Clock** im Stripe-Dashboard →
  `customer.subscription.deleted` → in `communities`:
  `plan: basic`, `billingStatus: canceled`, `stripeSubscriptionId` leer,
  `pastDueSince` leer. **Nie auf „nichts"** — ein gekündigter Kunde ist nie
  schlechter gestellt als einer, der nie gezahlt hat.
- **Ohne Customer kein Portal:** hat die Community nie gekauft, antwortet die
  Route **409** („No billing account yet"). Die Oberfläche macht daraus einen
  Satz, keinen Fehler.

Wer **kein** Portal will, hat hier nichts zu suchen: es gibt bewusst keine
eigenen Routen für „herunterstufen" oder „kündigen". Zwei Wege zum selben
Vertrag wären zwei Wahrheiten (`packages/onboarding/server/api/community/billing/portal.post.ts`).

## Probe 6 🔑 — Zahlungsverzug und die 14-Tage-Frist

Am einfachsten mit der Stripe CLI (`stripe login` einmalig):

```bash
stripe trigger invoice.payment_failed
```

Oder echt mit der Fehler-Testkarte `4000 0000 0000 0341` (Karte hängt sich an,
die spätere Belastung scheitert).

**Soll-Ergebnis — und hier ist die wichtigste Änderung gegenüber früher:**

1. `communities.billingStatus` → `past_due`. **Der Plan bleibt**, die Produkte
   bleiben, die Community arbeitet weiter. Stripes eigenes Dunning ist die
   Gnadenfrist.
2. `communities.pastDueSince` bekommt **einmal** einen Zeitstempel. Stripe
   schickt während des Dunnings mehrere `past_due`-Ereignisse — jedes weitere
   lässt den Stempel stehen, sonst liefe die Frist nie ab.
3. **Erst 14 Tage später** wird die Community nur-lesend (`suspension: 'billing'`),
   und zwar durch den stündlichen Sweep, nicht durch den Webhook
   (`shouldSuspendForPastDue`, `PAST_DUE_GRACE_DAYS` in
   `packages/control/shared/communityBilling.ts`). Mit einer **Test Clock** lässt
   sich das vorspulen.
4. Zahlt der Kunde nach, fällt die Sperre **im selben Schreibvorgang** wie das
   `active` (`shouldLiftBillingSuspension` ist nur das Netz darunter, falls ein
   Webhook einmal ausbleibt). Eine `abuse`-Sperre fällt dabei **nicht** — die
   endet nur durch eine Betreiber-Entscheidung.

**Und eine Frage, die diese Probe beantworten soll (offen, bitte hinsehen):**
der Webhook legt zusätzlich eine In-App-Benachrichtigung „Zahlung
fehlgeschlagen" an — im Projekt `control`, adressiert an
`billing_subscriptions.userId`. Dieser Wert stammt aus der Checkout-Metadata und
ist die **Nutzer-Id aus dem Pool-Projekt** (`identity.userId` in
`packages/control/server/utils/communityTeam.ts`), nicht die eines
control-Kontos. **Erwartung daher unklar: die Glocke auf `control.pukalani.app`
könnte leer bleiben.** Wenn ja: notieren, es ist ein echter Befund und keine
Fehlbedienung. Der Zustand in `communities` (Punkt 1–3) ist davon unberührt.

---

## Zusatzprobe (optional) — verzögerte Zahlung, wenn SEPA aktiviert wird

Nur nötig, wenn im Stripe-Dashboard eine **verzögerte** Zahlungsmethode
aktiviert wird (SEPA-Lastschrift, Kauf auf Rechnung). Dann gilt seit
2026-08-02: **erfüllt wird erst gegen Geld.**

- Bei einem **Einmalkauf** (`mode: 'payment'` — heute nur die Event-Tickets in
  `apps/comments`) erfüllt der Webhook **nur** bei
  `payment_status: 'paid'` oder `'no_payment_required'`
  (`FULFILLABLE_PAYMENT_STATUSES`). Sonst wird nichts ausgeliefert und eine
  Zeile geschrieben: `billing.checkout_not_fulfilled` mit `outcome`
  `await_payment` (warn) · `payment_failed` (**error**, da muss jemand
  hinsehen) · `expired` (warn).
- Bei einem **Abo** hängt die Wirkung **nicht** am `payment_status` der Session,
  sondern am **Status des Abos**: eine unbezahlte Erstbelastung lässt es
  `incomplete`, und das führt zu `kind: 'ignore'` — kein Plan, kein
  Freischalten. Der Nachzügler `checkout.session.async_payment_succeeded` (bzw.
  `customer.subscription.updated`) holt es später nach.

Testkarte für den verzögerten Erfolg: SEPA-Testkonto `DE89370400440532013000`.

---

## Abnahme-Checkliste

- [ ] Probe 1 — `ensure-prices --apply`: vier lookup_keys existieren; Webhook
      trägt **alle neun** Ereignisse; unsignierter POST → 400
- [ ] Probe 2 — „Abo & Rechnung" ist auf dem **Community-Host** erreichbar, und
      zwar nur als **Owner**
- [ ] Probe 3 — Monats-Checkout (4242) → `communities.plan = personal`,
      `billingStatus = active`, `stripeSubscriptionId` gesetzt; zweiter Kauf → 409
- [ ] Probe 4 — Jahres-Checkout zeigt 1341 € → `plan = pro`
- [ ] Probe 5 — Portal öffnet; Kündigung + Test-Clock → `plan = basic`,
      `billingStatus = canceled` (nie „nichts")
- [ ] Probe 6 — `invoice.payment_failed` → `past_due`, Plan **bleibt**,
      `pastDueSince` einmal gestempelt; Test-Clock +14 Tage → `suspension = billing`
- [ ] Notiert, ob die Glocke auf `control.pukalani.app` die Zahlungswarnung zeigt

Wenn alle Haken sitzen, ist der Geldweg **test-seitig bewiesen** — für Live
fehlen dann nur noch Bank und der Schlüssel-Tausch:
[STRIPE-GO-LIVE-RUNBOOK.md](STRIPE-GO-LIVE-RUNBOOK.md).

## Troubleshooting

- **Nach dem Kauf springt der Plan nicht** — erst prüfen, ob er nach einem
  Reload da ist (bis zu 30 s Resolver-Cache; es gibt keine Live-Propagation).
  Erst danach ins Stripe-Webhook-Log sehen: kommen die Ereignisse mit 200 an?
  Server-Log auf `control`: `[control] Community … → Plan …`.
- **Webhook 400 „Invalid webhook"** — `NUXT_STRIPE_WEBHOOK_SECRET` auf `control`
  passt nicht zum Endpunkt-Secret. Kopieren, `pm2 reload`.
- **Webhook 404** — dasselbe Secret fehlt ganz. Die Route sagt dann bewusst
  „gibt es hier nicht".
- **Checkout antwortet 400 „Plan has no checkout"** — `basic` hat keinen Price.
  Nur `personal` und `pro` sind buchbar (Zod lässt im Platform-Layer auch nur
  diese zwei zu).
- **Checkout antwortet 500 „Payment provider not configured"** — es gibt keinen
  aktiven Stripe-Price mit diesem `lookup_key`. Das ist der Fall, wenn Probe 1
  übersprungen oder ein Key im Katalog vertippt wurde. Achtung: beim
  **Community**-Checkout ist das ein 500, kein 400 — der Katalog ist
  Server-Wissen, kein Nutzer-Eingabefehler.
- **Checkout antwortet 502** — `NUXT_STRIPE_SECRET_KEY` fehlt oder ist falsch.
- **409 `already_subscribed`** — kein Fehler, sondern die Aussage „nimm das
  Portal".
- **Nichts kommt an, obwohl Stripe 200 meldet** — sitzt `communityId` in der
  Subscription-Metadata? Ohne sie ignoriert der Handler das Abo bewusst.

## Was sich gegenüber der alten Anleitung geändert hat

Die Fassung vom 2026-07-21 beschrieb die Workspace-Welt. Falsch waren:

1. **Der Ort.** `control.pukalani.app` → `/dashboard/workspaces` bzw.
   `/workspace`. Heute: `<community-host>/dashboard/settings/subscription`.
2. **Das zahlende Objekt.** Der Workspace ist mit A6 Schritt 5 gefallen; die
   **Community** zahlt (`communities.plan` / `.stripeCustomerId`).
3. **Die Pläne.** free/pro/business → **basic/personal/pro**.
4. **Die Preise.** 19/190 € und 49/490 € waren Platzhalter → **29/261 €** und
   **149/1341 €**.
5. **Die Wirkung.** „Die Features aller zugeordneten Sites werden
   synchronisiert" — es gibt keine zugeordneten Sites mehr; es wirkt genau eine
   `communities`-Zeile, und die steuert Kontingent und Produkt-Sichtbarkeit.
6. **Der Live-Sprung.** „springt live ohne Reload" war für den Workspace richtig
   und ist es für die Community **nicht** (anderes Appwrite-Projekt).
7. **Die Ereignis-Liste.** Sechs → neun.
8. **Der Zahlungsverzug.** „Zugriff bleibt" war nur die halbe Wahrheit: er
   bleibt **14 Tage**, dann wird nur-lesend gesperrt (M13).
9. **Die Zahl der Preise.** „4 lookup_keys `workspace_{pro,business}_*`" →
   `workspace_{personal,pro}_*`.

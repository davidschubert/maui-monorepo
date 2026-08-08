# Stripe Test-Mode — Durchspiel-Anleitung (Community-Abo)

Stand: **2026-08-08 — VOLLSTÄNDIG DURCHGESPIELT** (A2a), gegen die
Produktions-Deployments im Stripe-Testmodus. Ziel: den **kompletten Bezahl-Weg
im Test-Modus beweisen** — ohne Bank, ohne Live-Aktivierung. Kauf (monatlich +
jährlich), Plan-Wirkung, Portal/Kündigung (seit F49: nur-lesend) und
Zahlungsverzug sind damit belegt; was beim Durchlauf anders war als in der
Fassung vom 2026-08-02, ist HIER korrigiert und zusätzlich unten unter
„Befunde des Durchlaufs 2026-08-08" gesammelt.

> **Wer klickt.** Anders als die alte Fassung behauptete, ist fast alles ohne
> Handarbeit reproduzierbar: `packages/control/scripts/a2a-checkout-driver.mjs`
> legt über die ECHTE Service-Naht Konto + Einladungs-Code + Community an
> (Secrets aus `~/.appwrite-secrets`), liefert Checkout-/Portal-URLs als Owner
> und liest die `communities`-Row. Nur die Stripe-Checkout-Seite selbst ist
> Browserarbeit (Testkarte 4242).

**Zeit: ~30 Min (plus bis zu 1 h Warten auf den stündlichen Sweep in Probe 6).**

---

## Die Landkarte: drei Hosts, zwei Appwrite-Projekte, ein Stripe-Konto

Das ist der Teil, der sich mit A6 geändert hat — wer ihn überspringt, sucht
später an der falschen Stelle.

| Wo | Was passiert dort | Appwrite-Projekt |
|---|---|---|
| `https://<community-host>/dashboard/community/plan` | Der **Owner klickt**: Plan wählen, Portal öffnen. App `platform`. | `pool` |
| `https://control.pukalani.app` | **Stripe lebt hier**: Schlüssel, Checkout-Session, Portal-Session, Webhook. App `control`. | `control` |
| Stripe-Dashboard (Test-Modus) | Preise, Webhook-Endpunkt, Test-Clock. | — |

> **Seit F51 (2026-08-07)** heißt die Abo-Seite `/dashboard/community/plan` —
> Reiter „Plan" im Community-Settings-Hub. Der alte Pfad
> `/dashboard/settings/subscription` leitet 301 weiter; Checkout-Rücksprünge
> und das Stripe-Portal zeigen auf den neuen.

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

> **Der Aufruf scheitert im pnpm-Workspace mit `Cannot find package 'stripe'`**
> (Durchlauf 2026-08-08): das Skript liegt in `scripts/stripe/`, und dort
> hinauf gibt es kein `node_modules` mit `stripe` — das Paket gehört nur
> `packages/billing`, und ESM ignoriert `NODE_PATH`. Abhilfe bis zum sauberen
> Fix (Root-devDependency — bewusst zurückgestellt, weil der Lockfile dabei um
> ~1000 Zeilen umsortiert; eigener Punkt):
>
> ```bash
> ln -sfn "$(pwd)/node_modules/.pnpm/node_modules/stripe" node_modules/stripe
> ```

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
https://<community-host>/dashboard/community/plan
```

Der Menüpunkt heißt „Abo & Rechnung". Er verlangt die Capability
`community.billing`, und die trägt **nur der Owner** (Davids Entscheidung 2 vom
2026-07-30, `packages/core/shared/communityAuthz.ts`). Ein Admin oder Moderator
derselben Community sieht die Seite nicht.

Wenn du keine Test-Community hast: über den Trichter
`https://start.pukalani.app` eine anlegen — du bist dann automatisch ihr Owner
(`packages/control/server/utils/onboardingProvision.ts`).

**Soll-Bild:** drei Karten — „Aktueller Plan", „Plan wählen", „Rechnungen &
Zahlungsmethode" (`packages/onboarding/app/pages/dashboard/community/plan.vue`).
Bei **Basic** gibt es bewusst keinen Knopf — seit F49 (2026-08-07) ist Basic
kein Angebot mehr, sondern der Zustand ohne Abo (nur-lesend nach der
Testphase); die Karte beschreibt genau das, `lookupKey: null`.

**Durchlauf 2026-08-08:** als Owner antwortet
`GET /api/community/billing/trial` 200, ohne Session 401 — die
Capability-Grenze greift.

## Probe 3 🔑 — Monats-Abo kaufen (der Kern-Weg)

„Plan wählen" → **Personal**, Intervall **Monatlich** → Knopf. Auf der
Stripe-Seite:

- Testkarte **`4242 4242 4242 4242`**, beliebiges Zukunftsdatum, beliebige CVC
- **Rechnungsadresse ist Pflicht** (`billing_address_collection: 'required'`,
  weil `automatic_tax` an ist)

**Soll-Ergebnis:**

1. Rücksprung auf `https://<community-host>/dashboard/community/plan?checkout=success`.
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
(`createCommunityPortalUrl`, Rückkehr auf denselben Community-Pfad). Die
Kündigung im Portal hat seit dem Durchlauf 2026-08-08 einen Zwischenschritt:
erst ein Grund-Dropdown („Können Sie uns sagen, warum Sie gehen?"), dann
„Weiter zur Kündigung", dann die Bestätigung.

- **Kündigen** (zum Periodenende): Stripe setzt `cancel_at_period_end`. Bei uns
  ändert sich **noch nichts** — das Abo lebt bis zum Periodenende weiter, und
  genau so ist es gedacht. **Nachgemessen:** `cancel_at_period_end: true` bei
  Stripe, unsere Row unverändert `active`.
- **„Periodenende vorspulen mit einer Test Clock" GEHT HIER NICHT** — die alte
  Anleitung war an dieser Stelle falsch (Durchlauf 2026-08-08): eine Test Clock
  muss VOR dem Customer existieren, und der Checkout-Customer hat keine. Man
  kann eine Clock nicht nachträglich anhängen. Zwei ehrliche Wege:
  (a) die Kündigung **sofort** per API auslösen
  (`curl -X DELETE https://api.stripe.com/v1/subscriptions/<sub_…>`) — dasselbe
  Ereignis `customer.subscription.deleted`, nur ohne Warten; oder
  (b) für Zeitreisen ein API-Abo auf einer Clock anlegen (s. Probe 6).
- **Soll nach der Kündigung (F49, Davids Entscheidung 2026-08-07 — ersetzt das
  alte Soll „funktionsfähiges Basic"):** `plan: basic` (Quota-Anker),
  `billingStatus: canceled`, `stripeSubscriptionId` leer, `pastDueSince` leer,
  **`suspension: 'billing'`** mit dem Grund „Das Abo ist beendet. Mit einem
  neuen Abo öffnet sich die Community sofort wieder …". Gekündigt ist exakt
  gleichgestellt mit nie-gezahlt: nur-lesend, nichts gelöscht. **Nachgemessen:**
  die Row stand ~5 s nach der Kündigung genau so da.
- **Wiedereinstieg:** auf der gesperrten Community ist „Plan wählen" wieder
  möglich (kein 409 — das gekündigte Abo zählt nicht als lebend). Ein neuer
  Kauf setzt `plan`/`billingStatus: active` und **räumt die Sperre im selben
  Schreibvorgang**. **Nachgemessen:** kompletter Zyklus Kauf → Kündigung →
  nur-lesend → Neukauf → offen, jeweils binnen Sekunden.
- **Ohne Customer kein Portal:** hat die Community nie gekauft, antwortet die
  Route **409** („No billing account yet"). **Nachgemessen.** Die Oberfläche
  macht daraus einen Satz, keinen Fehler.

Wer **kein** Portal will, hat hier nichts zu suchen: es gibt bewusst keine
eigenen Routen für „herunterstufen" oder „kündigen". Zwei Wege zum selben
Vertrag wären zwei Wahrheiten (`packages/onboarding/server/api/community/billing/portal.post.ts`).

## Probe 6 🔑 — Zahlungsverzug und die 14-Tage-Frist

**NICHT mit `stripe trigger invoice.payment_failed`** — die alte Empfehlung
war eine Attrappe (Durchlauf 2026-08-08): das Fixture erzeugt ein fremdes Abo
OHNE unsere `communityId`-Metadata, der Fulfillment-Handler ignoriert es
bewusst, und geprüft wäre nur die Signatur. Der ECHTE Weg läuft über eine
**Test Clock** (so wurde es 2026-08-08 bewiesen):

1. Clock anlegen (`POST /v1/test_helpers/test_clocks`, `frozen_time` = jetzt),
   Customer AUF der Clock anlegen, `tok_visa`-PaymentMethod anhängen.
2. Abo per API anlegen: Price `workspace_personal_monthly`, **Metadata
   `communityId` / `plan` / `userId`** — der Webhook wendet es ganz normal an
   (die Community wird `personal`/`active`; woher das Abo kommt, ist ihm egal).
3. Default-PaymentMethod auf die Fehlkarte tauschen
   (`tok_chargeCustomerFail` = 4000 0000 0000 0341).
4. Clock über das Periodenende vorspulen (`…/advance`, +32 Tage; Status geht
   `advancing` → `ready`, ~20 s) — die Verlängerungsrechnung scheitert.

**Soll-Ergebnis — und hier ist die wichtigste Änderung gegenüber früher:**

1. `communities.billingStatus` → `past_due`. **Der Plan bleibt**, die Produkte
   bleiben, die Community arbeitet weiter. Stripes eigenes Dunning ist die
   Gnadenfrist. **Nachgemessen** (~5 s nach dem Clock-Advance).
2. `communities.pastDueSince` bekommt **einmal** einen Zeitstempel. Stripe
   schickt während des Dunnings mehrere `past_due`-Ereignisse — jedes weitere
   lässt den Stempel stehen, sonst liefe die Frist nie ab. **Nachgemessen:**
   nach einer weiteren Retry-Welle (+4 Tage Clock) stand derselbe Stempel
   millisekundengenau unverändert.
3. **Erst 14 Tage später** wird die Community nur-lesend (`suspension: 'billing'`),
   und zwar durch den stündlichen Sweep, nicht durch den Webhook
   (`shouldSuspendForPastDue`, `PAST_DUE_GRACE_DAYS` in
   `packages/control/shared/communityBilling.ts`). **Die Clock hilft hier
   NICHT** — der Sweep rechnet mit ECHTER Zeit. Prüfweg des Durchlaufs:
   `pastDueSince` von Hand 15 Tage zurückdatieren (Betreiber-Handgriff auf der
   Row) und den nächsten Stundenlauf abwarten.
4. Zahlt der Kunde nach, fällt die Sperre **im selben Schreibvorgang** wie das
   `active` (`shouldLiftBillingSuspension` ist das Netz darunter — seit F49
   hebt es NUR bei `billingStatus 'active'` auf, sonst würde es auch die
   Trial-Ende- und Kündigungs-Sperren aufheben). Eine `abuse`-Sperre fällt
   dabei **nicht** — die endet nur durch eine Betreiber-Entscheidung.

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

## Abnahme-Checkliste (Durchlauf 2026-08-08)

- [x] Probe 1 — vier lookup_keys existieren (idempotenter Skip); Webhook trägt
      **alle neun** Ereignisse (BEFUND: es waren nur sechs — die drei
      `checkout.session.*`-Nachzügler fehlten und wurden ergänzt);
      unsignierter POST → 400
- [x] Probe 2 — „Abo & Rechnung"-API auf dem **Community-Host**: Owner 200,
      ohne Session 401
- [x] Probe 3 — Monats-Checkout (4242, 29 € brutto) → `plan = personal`,
      `billingStatus = active`, `stripeSubscriptionId` gesetzt, `trialEndsAt`
      geräumt; Metadata `communityId`/`plan`/`userId` auf der Sub;
      Spiegel-Zeile `billing_subscriptions` status `active`; zweiter Kauf →
      409 `already_subscribed`
- [x] Probe 4 — Jahres-Checkout zeigt **1.341,00 € / Jahr** → `plan = pro`
- [x] Probe 5 — Portal öffnet (Grund-Dropdown vor der Bestätigung);
      `cancel_at_period_end` ändert bei uns nichts; sofortige Kündigung →
      `plan = basic`, `billingStatus = canceled`, **`suspension = billing`**
      (F49); Neukauf hebt die Sperre im selben Schreibvorgang; Portal ohne
      Customer → 409
- [x] Probe 6 — Test-Clock-Abo: Verlängerung scheitert → `past_due`, Plan
      **bleibt**, `pastDueSince` einmal gestempelt und retry-fest
- [x] Probe 6b — `pastDueSince` −15 Tage rückdatiert → der nächste Stundenlauf
      sperrte: `suspension = billing`, Grund „Offene Zahlung seit mehr als 14
      Tagen. Sobald die Zahlung ankommt, wird die Community automatisch wieder
      freigeschaltet." Plan blieb `personal`, `pastDueSince` unangetastet.
- [x] Glocke — beide Hälften nachgemessen: das `control`-Projekt hat KEINE
      `notifications`-Zeile für den Pool-User (der Webhook-Zweig adressiert
      eine Pool-Id, 404 im Log — die offene Frage der alten Fassung ist damit
      beantwortet, kein Schaden). Die ECHTE Warnung entstand im POOL durch den
      stündlichen Platform-Lauf: genau EINE Zeile, rowId
      `pastdue-<hash>` (Idempotenz-Schlüssel), `type: billing`,
      `communityId` = `t-…` (die tenantId, wie dokumentiert), Link
      `/dashboard/community/plan`.

Wenn alle Haken sitzen, ist der Geldweg **test-seitig bewiesen** — für Live
fehlen dann nur noch Bank und der Schlüssel-Tausch:
[STRIPE-GO-LIVE-RUNBOOK.md](STRIPE-GO-LIVE-RUNBOOK.md).

## Befunde des Durchlaufs 2026-08-08

1. **Webhook-Ereignisliste war unvollständig** (6 statt 9) — die drei
   `checkout.session.*`-Ereignisse vom 2026-08-02 waren nie im
   Stripe-Dashboard nachgezogen worden. Ergänzt per API. **Vor dem Live-Gang
   am Live-Endpunkt dieselbe Liste prüfen.**
2. **`ensure-prices` war im Workspace nicht aufrufbar** (`stripe` nicht
   auflösbar) — Symlink-Abhilfe oben; sauberer Fix (Root-devDependency) als
   eigener Punkt, weil der Lockfile dabei stark umsortiert.
3. **Einladungs-Code per Row anlegen:** `expiresAt` MUSS `null` sein — die
   Datetime-Spalte macht aus `''` einen Jetzt-Stempel, und der Code ist sofort
   „abgelaufen" (kostete einen Provisionierungslauf).
4. **Stripe-Checkout, Adress-Autocomplete:** das Google-Vorschläge-Dropdown
   („No results found" bei Test-Adressen) fängt den Kaufen-Klick ab — erst
   schließen (Escape), dann absenden. Betrifft auch handklickende Menschen mit
   ungewöhnlichen Adressen.
5. **`billing_subscriptions.planId` steht auf `unknown`** bei
   Community-Abos — der billing-Layer kennt die Community-Plan-Keys nicht.
   Kosmetik (die Wahrheit liegt in `communities.plan`), aber wer die
   Spiegel-Tabelle liest, soll das wissen.
6. **Test Clocks nur für API-Kunden** — ein Checkout-Customer kann nie
   vorgespult werden. Für Zeit-Proben immer den Probe-6-Weg nehmen.

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
   `/workspace`. Heute: `<community-host>/dashboard/community/plan`.
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

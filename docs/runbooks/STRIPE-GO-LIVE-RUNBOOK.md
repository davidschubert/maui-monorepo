# Stripe Go-Live Runbook (Test → Live)

Stand: **2026-08-02**, neu geschrieben nach A6 (die **Community** ist das
zahlende Objekt, nicht mehr der Workspace). Vorher: 2026-07-20 — was daran
falsch war, steht am Ende.

Aktuell läuft alles im **Stripe-Test-Modus**. Dieser Runbook macht den Umstieg
auf **Live** reproduzierbar. **Die Vorstufe ist ERLEDIGT:** der komplette
Testdurchlauf [STRIPE-TEST-WALKTHROUGH.md](STRIPE-TEST-WALKTHROUGH.md) ist am
**2026-08-08 mit allen sechs Proben grün** durchgespielt (inkl. F49:
Kündigung ⇒ nur-lesend, Sweep, Pool-Glocke). Ein Befund daraus gehört in den
Live-Gang: **der Live-Webhook-Endpunkt braucht alle NEUN Ereignisse** — im
Testmodus fehlten die drei `checkout.session.*`-Nachzügler unbemerkt.

> ## Wer was macht — die Grenze ist scharf
>
> **[David] — Claude kann das NICHT, auch nicht „vorbereitet":**
> Stripe-Account aktivieren (Bank, Identität, Geschäftsdaten) · jeder Umgang mit
> `sk_live_…`, `sk_test_…`, `whsec_…` · Live-Prices anlegen (braucht den Key) ·
> Webhook-Endpunkt im Dashboard · Konto-Steuereinstellung · Customer-Portal
> konfigurieren · Secrets auf den Server schreiben · echter Kauf mit echter
> Karte.
>
> **[Claude] — kann ausgeführt oder gegengelesen werden:**
> `ensure-prices.mjs` **starten, sobald der Key in Davids Shell steht** (das
> Skript liest nur `STRIPE_KEY`, es speichert ihn nirgends) · `pm2 reload` ·
> die Antwort-Codes der öffentlichen Endpunkte prüfen · die Zeilen in
> `communities` und `billing_subscriptions` nach einem Kauf verifizieren · diesen
> Runbook nachziehen.
>
> Claude gibt **niemals** Schlüssel, Kontonummern oder Karten ein und fordert
> sie auch nicht an.

## 0. Der entscheidende Vorteil: `lookup_key` ist mode-stabil

Der Code referenziert Preise über **`lookup_key`**, nie über `price_…`-IDs.
`lookup_key`s sind in Test- **und** Live-Modus identisch. Heißt: **der Code
ändert sich beim Go-Live nicht** — es werden nur Live-Prices mit denselben Keys
angelegt und die Secrets getauscht. Kein Deploy, kein Rebuild: die Stripe-Keys
sind Runtime-Config, `pm2 reload` genügt.

Die Keys heißen `workspace_personal_*` / `workspace_pro_*`. Der Behälter
„Workspace" ist mit A6 gefallen, die Schlüssel bleiben: sie sind **Identitäten
bei Stripe**, kein Wort. Umbenennen hieße, die angelegten Preise nicht mehr zu
finden.

## 1. Wo Stripe überhaupt lebt

**Nur in der App `control`.** Das ist die wichtigste Korrektur gegenüber der
alten Fassung dieses Runbooks — die Community-Hosts haben kein Stripe:

| App / Host | Rolle im Geldweg | Braucht Stripe-Secrets? |
|---|---|---|
| **control** — `control.pukalani.app` | Checkout-Session, Portal-Session, **Webhook**, Fulfillment. Appwrite-Projekt `control`. | **Ja** |
| **platform** — `*.pukalani.app` (jeder Community-Host) | Der Owner **klickt** hier; die Route reicht über die Service-Naht an `control` weiter. Appwrite-Projekt `pool`. | **Nein** — `apps/platform/nuxt.config.ts` extended `packages/billing` gar nicht |
| **comments** — `comments.pukalani.app` | Silo-App mit **Einmalkäufen** (Event-Tickets). Eigenes Appwrite-Projekt, eigener Webhook. | Ja, wenn dort verkauft werden soll |

Webhook-URLs (Live wie Test):

```
https://control.pukalani.app/api/stripe/webhook      # Community-Abos  ← der Geldweg
https://comments.pukalani.app/api/stripe/webhook     # Event-Tickets (nur falls genutzt)
```

Env-Variablen, server-only, **nie** `NUXT_PUBLIC_*`:

```bash
NUXT_STRIPE_SECRET_KEY=sk_live_…      # [David] Stripe → Developers → API keys (Live)
NUXT_STRIPE_WEBHOOK_SECRET=whsec_…    # [David] aus dem Live-Endpunkt (Schritt 4)
```

Fehlt `NUXT_STRIPE_WEBHOOK_SECRET`, antwortet die Route **404** („gibt es hier
nicht") statt 500 — eine bewusst nicht eingerichtete Route ist kein Ausfall.

## 2. Vorbereitung im Stripe-Dashboard (Live-Modus) — alles [David]

- **2.1 Account aktivieren** — „Activate payments": Geschäftsdaten,
  Bankverbindung, Identität. Ohne Aktivierung keine echte Belastung.
- **2.2 Products + Prices** mit exakt diesen `lookup_key`s. Am einfachsten
  **nicht** von Hand, sondern über das Skript in Schritt 3:

  | Plan | lookup_key | Betrag | Intervall |
  |---|---|---|---|
  | Personal | `workspace_personal_monthly` | 29,00 € | monatlich |
  | Personal | `workspace_personal_yearly` | 261,00 € | jährlich (−25 %) |
  | Pro | `workspace_pro_monthly` | 149,00 € | monatlich |
  | Pro | `workspace_pro_yearly` | 1341,00 € | jährlich (−25 %) |

  `basic` hat bewusst **keinen** Price (kostenloser Ausgangszustand), Enterprise
  ist das Studio-Angebot ohne Self-Service-Checkout. Der Katalog steht in
  `packages/control/app/app.config.ts` (`pukalani.control.plans`) — das Skript
  muss ihn spiegeln.
- **2.2b Ticket-Preise heißen `event_ticket_…`** (F21, seit 2026-08-03). Für
  Event-Tickets legt der Betreiber die Einmal-Preise von Hand an — das Skript
  kennt nur Pläne. Der `lookup_key` MUSS mit `event_ticket_` beginnen, sonst
  weist der Checkout ihn mit `not_purchasable` ab. Das ist Absicht: der
  Ticket-Schlüssel ist ein Freitextfeld im Dashboard, ohne diese Klammer könnte
  eine Community damit auf JEDEN Einmal-Preis des Kontos zeigen. Die Liste steht
  in `apps/comments/app/app.config.ts` (`pukalani.billing.oneTimeLookupKeys`),
  und das Muster erscheint im Dashboard direkt am Eingabefeld.
- **2.3 Customer Portal (Live) konfigurieren** — Plan-Wechsel erlauben,
  Kündigung als `cancel_at_period_end`, Rechnungshistorie. Die
  Test-Konfiguration wird **nicht** automatisch nach Live kopiert. Das Portal ist
  der **einzige** Weg für Herunterstufen, Intervall-Wechsel und Kündigung — es
  gibt dafür bewusst keine eigenen Routen.
- **2.4 Stripe Tax (Live) + die Brutto-Prüfung** — `automatic_tax` ist im Code
  an; im Live-Dashboard die Steuer-Registrierung(en) hinterlegen (OSS-Schwelle
  10 k€).
  **PFLICHT (OPEN-ITEMS A3):** Landing und Hilfe weisen 29 € / 149 € als
  **Endpreise inkl. 19 % MwSt.** aus. Die Prices werden ohne `tax_behavior`
  angelegt → Stripe nimmt das **Konto-Default**. Steht das auf „exclusive",
  rechnet der Checkout 19 % oben drauf (29 € → 34,51 €) und widerspricht der
  Landing. Also **vor dem ersten Live-Price** entweder das Konto-Default auf
  **inclusive** stellen (Stripe → Settings → Tax → *Default tax behavior*) oder
  `tax_behavior: 'inclusive'` in `scripts/stripe/ensure-prices.mjs` ergänzen.
  `tax_behavior` ist an einem Price **unveränderlich** — ein falsch angelegter
  Price muss ersetzt werden.
- **2.5 Zahlungsmethoden** — **nichts zu tun** (F20, Davids Entscheidung
  2026-08-03: nur Karte). Der Code gibt die Liste seit dem selbst mit
  (`payment_method_types`, `packages/billing/shared/paymentMethods.ts`), sie
  gewinnt gegen die Dashboard-Voreinstellung. Wer im Dashboard trotzdem SEPA
  oder Kauf auf Rechnung anschaltet, sieht davon im Checkout also nichts —
  scharf würde der verzögerte Zahlungspfad erst, wenn jemand die Liste im
  Code erweitert (dann gilt Schritt 6.5, gebaut 2026-08-02, ungetestet).

## 3. Preise per Skript anlegen [Claude, sobald der Key in Davids Shell steht]

`scripts/stripe/ensure-prices.mjs` legt Products und Prices **idempotent** an.
Der Key bleibt in der Shell, das Skript liest nur `STRIPE_KEY`:

```bash
STRIPE_KEY=sk_live_… node scripts/stripe/ensure-prices.mjs           # Vorschau, ändert nichts
STRIPE_KEY=sk_live_… node scripts/stripe/ensure-prices.mjs --apply   # legt an
```

Das Skript erkennt Live vs. Test am Key-Präfix und meldet den Modus. Bei
**Betragsdrift** legt es einen neuen Price an, zieht den `lookup_key` per
`transfer_lookup_key` um und deaktiviert den alten — Bestandsabos behalten ihren
Price. Bei einer reinen **Steuer**-Umstellung greift das nicht (`tax_behavior`
ist unveränderlich): dann Price von Hand ersetzen.

## 4. Live-Webhook-Endpunkt einrichten [David]

Stripe-Dashboard (Live) → Developers → Webhooks → „Add endpoint":

- **URL**: `https://control.pukalani.app/api/stripe/webhook`
- **Ereignisse — exakt diese neun** (die Allowlist in
  `packages/billing/server/utils/webhookMapping.ts`; alles andere beantwortet die
  Route mit 200 und tut nichts, alles Fehlende kommt nie an):
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Danach das **Signing secret** (`whsec_…`) kopieren → das ist
  `NUXT_STRIPE_WEBHOOK_SECRET` für `control`.

Die drei `checkout.session.*`-Ereignisse außer `completed` kamen am 2026-08-02
dazu. Ohne sie endet eine verzögerte Zahlung im Nichts.

## 5. Secrets auf den Server + Reload

[David] setzt die Werte in den von pm2 geparsten Env-Satz (vgl.
`ops/ecosystem-control.config.cjs`):

```bash
NUXT_STRIPE_SECRET_KEY=sk_live_…
NUXT_STRIPE_WEBHOOK_SECRET=whsec_…
```

[Claude] lädt neu — **ohne Rebuild**, Stripe-Keys sind Runtime-Config:

```bash
pm2 reload ecosystem-control.config.cjs --update-env
```

Danach prüfen, dass der Prozess die neuen Keys sieht (**gesetzt/nicht gesetzt**
prüfen, den Wert nie loggen):

```bash
pm2 env <id> | grep -c STRIPE
```

## 6. Verifikation (Live, minimal-invasiv)

**6.1 Signatur greift** [Claude] — unsignierter POST auf den Live-Webhook →
**400**. Kommt **404**, fehlt das Secret; kommt **200**, ist etwas grundfalsch.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://control.pukalani.app/api/stripe/webhook -d '{}'
```

**6.2 Echter Mini-Kauf** [David] — als **Owner** einer echten Community auf
`https://<community-host>/dashboard/community/plan` (seit F51 der Reiter „Plan"
im Community-Settings-Hub; der alte Pfad `/dashboard/settings/subscription`
leitet 301 weiter) den Plan **Personal
monatlich** buchen, mit echter Karte. Danach **im Stripe-Dashboard refunden und
das Abo kündigen** — ein Test in Live kostet echtes Geld, der Refund macht es
neutral.

**6.3 Was danach in welcher Tabelle steht** [Claude kann das prüfen] — Projekt
`control`:

| Tabelle | Soll |
|---|---|
| `communities` (Zeile der Community) | `plan: personal` · `billingStatus: active` · `stripeCustomerId: cus_…` · `stripeSubscriptionId: sub_…` · `trialEndsAt` leer · `pastDueSince` leer |
| `billing_subscriptions` | eine Spiegel-Zeile mit derselben `stripeSubscriptionId`, `status: active` |

`billing_customers` bleibt bei diesem Weg **leer** — der Community-Customer wird
direkt auf der `communities`-Zeile verankert. Nicht suchen.

Der Plan erscheint im Browser **erst nach einem Seitenaufbau** (bis 30 s
Resolver-Cache). Das ist kein Fehler: `communities` liegt im Projekt `control`,
für das der Browser kein Leserecht hat — es gibt für diese Werte bewusst keine
Live-Propagation.

**6.4 Portal** [David] — „Rechnungen & Zahlungsmethode" → Live-Portal öffnet,
Kündigung setzt `cancel_at_period_end`. Zum Periodenende fällt die Community auf
`plan: basic` / `billingStatus: canceled` zurück, **nie auf „nichts"**.

**6.5 Verzögerte Zahlung — nur relevant, wenn 2.5 SEPA/Rechnung aktiviert**
[David]. Seit 2026-08-02 gilt: **erfüllt wird gegen Geld, nicht gegen ein
Ereignis.**
- **Einmalkäufe** (`mode: 'payment'`, heute nur Event-Tickets in `apps/comments`)
  werden **nur** bei `payment_status: 'paid'` oder `'no_payment_required'`
  ausgeliefert. Alles andere wird nicht erfüllt und protokolliert:
  `billing.checkout_not_fulfilled` mit `outcome` `await_payment` (warn),
  `payment_failed` (**error** — hier muss jemand hinsehen, ob eine ältere
  Installation schon geliefert hat) oder `expired` (warn).
- **Abos** hängen **nicht** am `payment_status` der Session, sondern am **Status
  des Abos**: eine unbezahlte Erstbelastung lässt es `incomplete` → nichts wird
  freigeschaltet. Der Nachzügler holt es später nach.

**6.6 Dunning** [David, optional] — `invoice.payment_failed` → `billingStatus:
past_due`, **Plan bleibt**, `pastDueSince` wird **einmal** gestempelt. Erst
**14 Tage** später sperrt der stündliche Sweep die Community auf nur-lesend
(`PAST_DUE_GRACE_DAYS` in `packages/control/shared/communityBilling.ts`). Zahlt
der Kunde nach, fällt die Sperre im selben Schreibvorgang wie das `active`.

**6.7 Ereignis-Zustellung** [David] — im Live-Webhook-Log alle Zustellungen 200,
keine Retries.

## 7. Preis-Allowlist: was diese Installation verkaufen darf

Seit dem Audit vom 2026-08-02 prüft der billing-Layer selbst, welcher
`lookup_key` durch einen Checkout darf (`packages/billing/shared/lookupKeys.ts`):

- **Abos: harte Allowlist.** Ein Abo-Checkout des billing-Layers akzeptiert nur
  Keys, die ein Plan in `pukalani.billing.plans` nennt — sonst 400
  `unknown_plan`.
  **Der Community-Checkout läuft nicht darüber**, und das ist Absicht: auf
  `control` ist `pukalani.billing.plans` leer, die Pläne leben in
  `pukalani.control.plans`. Der Key kommt dort aus dem **Server-Katalog**, nie
  aus dem Body — ein Vertipper im Katalog erzeugt deshalb einen **500**
  („Payment provider not configured"), keinen 400.
- **Einmalkäufe: zwei Regeln.** Nie ein Plan-Key (400
  `plan_key_in_one_time_checkout`), und der Stripe-Price **muss** vom Typ
  `one_time` sein (400 `not_a_one_time_price`).
- **`pukalani.billing.oneTimeLookupKeys` ist bewusst UNGESETZT** (OPEN-ITEMS
  F21). Eine gesetzte Liste wäre streng — genau diese Keys, oder ein Muster mit
  EINEM `*` am Ende. Leer gelassen wurde sie, weil Event-Tickets ihren
  `lookup_key` als **Freitext** im Dashboard tragen: eine erschöpfende Liste
  wäre gelogen, und ein Deploy mit fail-closed hätte jeden bestehenden
  Ticketverkauf mit 400 beantwortet.
  **Sobald echte Ticket-Preise angelegt sind: eintragen** (eine Zeile in
  `apps/comments/app/app.config.ts`). Für den Community-Abo-Weg ist das
  irrelevant — dort gibt es keine Einmalkäufe.

## 8. Rollback

Reiner Env-Rückschritt, kein Deploy:

```bash
# Server-Env zurück auf sk_test_… und das Test-whsec_…
pm2 reload ecosystem-control.config.cjs --update-env
```

Der Live-Endpunkt kann im Dashboard deaktiviert bleiben. Achtung: **Live-Abos
laufen weiter**, auch wenn die Installation wieder auf Test zeigt — sie kommen
nur nicht mehr an. Wer wirklich zurück will, kündigt die Live-Abos im
Dashboard und refundet.

## 9. Was nicht vergessen werden darf

- **Zwei getrennte Welten.** Live-Customers und -Subscriptions sind vollständig
  getrennt von Test. Test-Abos migrieren nicht — sie waren nie echt. Die
  `stripeCustomerId` / `stripeSubscriptionId` auf den `communities`-Zeilen
  stammen aus dem Testmodus und werden im Live-Betrieb **ungültig**: vor dem
  Umstieg auf Live bei den Test-Communities leeren, sonst hält sie der
  Doppelabo-Schutz für zahlende Kunden (409 `already_subscribed`) und das Portal
  läuft in einen Stripe-Fehler.
- **whsec-Rotation.** Bei Leak-Verdacht den Live-Endpunkt rotieren → Env →
  `pm2 reload`.
- **Preisänderungen** laufen über `ensure-prices.mjs --apply`: neuer Price,
  `lookup_key` zieht um, alter Price wird deaktiviert. Bestandsabos behalten
  ihren Preis bis zum Wechsel.
- **Nach dem Go-Live** diesen Runbook auf „ausgeführt" datieren und den
  OPEN-ITEMS-Eintrag A2 nach `docs/OPEN-ITEMS-COMPLETE.md` ziehen.

---

## Davids Minimal-Pfad

1. Stripe-Account aktivieren (2.1).
2. Konto-Steuerverhalten auf **inclusive** stellen (2.4) — **vor** dem ersten
   Price, sonst widerspricht der Checkout der Landing.
3. Live-Prices anlegen: Key in die Shell, dann Schritt 3 (Claude kann starten).
4. Live-Webhook mit den **neun** Ereignissen anlegen, `whsec_` kopieren (4).
5. `sk_live_` + `whsec_` in die control-Env, `pm2 reload` (5).
6. Portal in Live konfigurieren (2.3).
7. Mini-Kauf mit echter Karte + Refund als Beweis (6.2–6.4).

## Was gegenüber der Fassung vom 2026-07-20 falsch war

1. **Die Plan-Quelle.** „`pukalani.control.plans` … `workspace_pro_monthly`,
   `workspace_business_monthly`" — es gibt kein `business` mehr; die Pläne heißen
   **basic/personal/pro** und die Keys `workspace_{personal,pro}_{monthly,yearly}`.
2. **Die Beträge.** 19/190 € und 49/490 € waren Platzhalter → **29/261 €** und
   **149/1341 €**.
3. **Das zahlende Objekt.** „Workspace-Pläne", „studio ist die primäre
   SaaS-Abrechnung" — der Workspace ist mit A6 Schritt 5 gefallen; es zahlt die
   **Community** (`communities.plan`).
4. **Die Ereignis-Liste.** Sechs → **neun** (die drei `checkout.session.*` für
   verzögerte Zahlungen fehlten).
5. **Die Verifikation.** „`billing_subscriptions`-Row wird `active` (live via
   Realtime auf der Billing-Seite)" — die Billing-Seite des Workspaces gibt es
   nicht mehr, und für `communities` gibt es **keine** Live-Propagation. Der
   Beweis ist die Zeile in `communities`, nach einem Reload.
6. **Der Ort des Kaufs.** Nicht mehr auf `control.pukalani.app`, sondern auf
   `<community-host>/dashboard/community/plan` (nur Owner).
7. **Wo Stripe lebt.** Der alte Runbook nannte control und comments als
   gleichrangig; er sagte nirgends, dass die **platform**-App — auf der der
   Kunde klickt — überhaupt kein Stripe hat und alles über die Service-Naht
   läuft.
8. **Dunning.** „Status `past_due`, Zugriff bleibt (§6.5)" — er bleibt nur
   **14 Tage**, dann sperrt der Sweep auf nur-lesend (M13).
9. **`studio`.** Der Alias ist seit 2026-07-30 entfernt; alle Verweise gehen auf
   `control`.

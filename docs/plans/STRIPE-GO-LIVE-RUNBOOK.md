# Stripe Go-Live Runbook (Test → Live)

Stand: 2026-07-20. Löst den in [BILLING-STRIPE.md](BILLING-STRIPE.md) Phase B-8 #29
vertagten „Betriebs-Runbook / Go-Live-Checklist" ein. Aktuell läuft alles im
**Stripe-Sandbox/Test-Mode** (M8/M9 test-mode-verifiziert). Dieser Runbook macht
den Umstieg auf **Live** reproduzierbar.

> **Sicherheits-Grenze:** Alle Schritte, die einen **Live-Key, Bankdaten oder das
> Aktivieren des Stripe-Accounts** betreffen, macht **David** selbst — Claude
> gibt niemals `sk_live_…`, Kontonummern o. Ä. ein. Claude kann alles *drumherum*
> vorbereiten (Doku, .env-Skeleton, Verifikations-Skripte, pm2-Reload). Schritte
> sind unten mit **[David]** bzw. **[automatisierbar]** markiert.

## 0. Der entscheidende Vorteil: `lookup_key` ist mode-stabil

Der billing-Layer referenziert Preise über **`lookup_key`**, nicht über
`price_…`-IDs (BILLING-STRIPE.md B2). `lookup_key`s sind über Test- **und**
Live-Mode identisch. Heißt: **der Code ändert sich NICHT** beim Go-Live — es
werden nur Live-Mode-Preise mit denselben `lookup_key`s angelegt und die Keys/
Secrets in der Server-`.env` getauscht. Kein Deploy, kein Rebuild (die
Stripe-Keys sind Runtime-Config → `pm2 reload` genügt, analog appwriteProjectId).

## 1. Betroffene Apps & Verträge

| App | Webhook-Endpoint (Live) | Plan-Quelle | lookup_keys |
|---|---|---|---|
| **studio** | `https://studio.pukalani.app/api/stripe/webhook` | `maui.studio.plans` | `workspace_pro_monthly`, `workspace_business_monthly` (free = `null`, kein Stripe-Objekt) |
| **comments** | `https://comments.pukalani.app/api/stripe/webhook` | `maui.billing.plans` | (siehe `apps/comments/app/app.config.ts` — analog anlegen, falls Live-Billing gewünscht) |

Jede App = eigene Appwrite-Instanz **und eigener Stripe-Account** (A1/B1). Der
Runbook gilt **pro App**; studio ist die primäre SaaS-Abrechnung (Workspace-Pläne).

Env-Variablen pro App (Server-`.env`, server-only, NIE `NUXT_PUBLIC_*`):
```bash
NUXT_STRIPE_SECRET_KEY=sk_live_…      # [David] aus Stripe → Developers → API keys (Live)
NUXT_STRIPE_WEBHOOK_SECRET=whsec_…    # [David] aus dem Live-Webhook-Endpoint (Schritt 4)
```

## 2. Vorbereitung im Stripe-Dashboard (Live-Mode)

- **2.1 [David] Account aktivieren** — „Activate payments": Geschäftsdaten,
  Bankverbindung, Identität. Ohne Aktivierung kein Live-Charge.
- **2.2 [David] Products + Prices anlegen — mit exakt diesen `lookup_key`s**
  (Monats- UND Jahres-Intervall sind seit 2026-07-21 im Code verdrahtet):
  | Plan | lookup_key | Betrag (Platzhalter, David legt fest) | Intervall |
  |---|---|---|---|
  | Workspace Pro | `workspace_pro_monthly` | z. B. 19 €/Monat | monatlich |
  | Workspace Pro | `workspace_pro_yearly` | z. B. 190 €/Jahr | jährlich |
  | Workspace Business | `workspace_business_monthly` | z. B. 49 €/Monat | monatlich |
  | Workspace Business | `workspace_business_yearly` | z. B. 490 €/Jahr | jährlich |

  Am einfachsten NICHT von Hand klicken, sondern das Skript (Schritt 3) nehmen —
  es setzt die `lookup_key`s korrekt. Wichtig: der `lookup_key` ist mode-stabil
  (Test ↔ Live identisch), daher funktioniert derselbe Katalog in beiden Modi.
- **2.3 [David] Customer Portal (Live) konfigurieren** — dieselben Einstellungen
  wie Sandbox (Plan-Wechsel erlaubt, Kündigung `cancel_at_period_end`,
  Rechnungshistorie). Sandbox-Config wird **nicht** automatisch nach Live kopiert.
- **2.4 [David] Stripe Tax (Live) aktivieren** — `automatic_tax` ist im Code an
  (B2C, §6.3); im Live-Dashboard die Steuer-Registrierung(en) hinterlegen (OSS-
  Schwelle 10 k€ beachten).
- **2.5 [David] Dynamische Zahlungsmethoden** im Live-Dashboard prüfen (Karten
  aktiv; SEPA nur, wenn der asynchrone „Zahlung wird verarbeitet"-Pfad gewünscht).

## 3. Preise per Skript anlegen ([automatisierbar], Skript existiert)

`scripts/stripe/ensure-prices.mjs` legt alle 4 Products/Prices **idempotent** an
(bestehende `lookup_key`s werden übersprungen). Läuft mit Davids Key — der Key
bleibt in Davids Shell, das Skript liest nur `STRIPE_KEY`:
```bash
# Erst Vorschau (ändert nichts):
STRIPE_KEY=sk_test_… node scripts/stripe/ensure-prices.mjs
# Dann anlegen (Test-Mode zum Vorbereiten, später sk_live_… für echt):
STRIPE_KEY=sk_test_… node scripts/stripe/ensure-prices.mjs --apply
```
**Vor dem Lauf:** die Beträge im Skript (aktuell Platzhalter: Pro 19/190 €,
Business 49/490 €) auf die echten Preise setzen. Das Skript erkennt Live vs.
Test am Key-Präfix und meldet es. Damit kannst du **jetzt schon** den kompletten
Test-Mode-Katalog anlegen und Checkouts durchspielen — ganz ohne Bank/Aktivierung.

## 4. Live-Webhook-Endpoint einrichten [David]

Pro App im Stripe-Dashboard (Live) → Developers → Webhooks → „Add endpoint":
- **URL**: `https://studio.pukalani.app/api/stripe/webhook` (bzw. comments)
- **Events** (exakt die Allowlist aus `webhook.post.ts`, sonst retryt Stripe sinnlos):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Nach dem Anlegen das **Signing secret** (`whsec_…`) kopieren → das ist
  `NUXT_STRIPE_WEBHOOK_SECRET` für diese App.

## 5. Secrets in die Server-.env + Reload [David setzt Keys, automatisierbar der Reload]

Auf dem Prod-Server, pro App (`/home/…/<app>/.env` bzw. der von pm2 geparste
Env-Satz — vgl. `ops/ecosystem-<app>.config.cjs`):
```bash
NUXT_STRIPE_SECRET_KEY=sk_live_…
NUXT_STRIPE_WEBHOOK_SECRET=whsec_…    # das Live-Secret aus Schritt 4
```
Dann **ohne Rebuild** neu laden (Stripe-Keys sind Runtime-Config):
```bash
pm2 reload ecosystem-studio.config.cjs --update-env
```
Verifizieren, dass der Prozess die neuen Keys sieht (kein sk_test mehr):
`pm2 env <id> | grep STRIPE` (zeigt gesetzt/nicht den Wert loggen).

## 6. Verifikation (Live, minimal-invasiv)

1. **Signatur greift**: unsignierter POST auf den Live-Webhook → **400**
   (`curl -X POST https://studio.pukalani.app/api/stripe/webhook -d '{}'`).
2. **Echter Mini-Kauf**: mit echter Karte den günstigsten Plan buchen →
   Checkout-Redirect → `billing_subscriptions`-Row wird `active` (live via
   Realtime auf der Billing-Seite) → **danach im Stripe-Dashboard refunden +
   Abo kündigen** (Test in Live kostet echtes Geld; Refund macht es neutral).
3. **Portal**: „Abo verwalten" → Live-Portal öffnet, Kündigung setzt
   `cancelAtPeriodEnd`.
4. **Event-Zustellung**: im Live-Webhook-Log (Stripe-Dashboard) alle 6 Events
   grün (200), keine Retries.
5. **Dunning** (optional): `invoice.payment_failed` → Status `past_due`, Zugriff
   bleibt (§6.5), notify() warnt.

## 7. Rollback

Reiner Env-Rückschritt, kein Deploy:
```bash
# Server-.env zurück auf sk_test_… / das Test-whsec_…
pm2 reload ecosystem-studio.config.cjs --update-env
```
Der Live-Webhook-Endpoint kann im Dashboard deaktiviert bleiben; Test-Mode läuft
über den Stripe-CLI-`listen`- bzw. den bestehenden Test-Endpoint weiter.

## 8. Was NICHT vergessen werden darf

- **Zwei getrennte Welten**: Live-Customers/-Subscriptions sind komplett getrennt
  von Test. Bestehende Test-Abos migrieren NICHT — sie waren nie echt.
- **whsec-Rotation**: bei Verdacht auf Leak den Live-Webhook rotieren (neues
  Secret → .env → `pm2 reload`).
- **Preis-Änderungen**: neue Beträge = **neuer Price** in Stripe (Prices sind
  immutable) mit gleichem `lookup_key`? Nein — ein `lookup_key` kann nur an
  *einem* aktiven Price hängen. Preis ändern = neuen Price anlegen, `lookup_key`
  vom alten lösen und an den neuen hängen (Stripe erlaubt Umhängen). Bestandsabos
  behalten ihren alten Price bis zum Wechsel.
- **CONCEPT/OPEN-ITEMS**: nach Go-Live diesen Runbook auf „ausgeführt" datieren.

---

**Zusammengefasst — Davids Minimal-Pfad zum Live-Gang (studio):**
1. Stripe-Account aktivieren (2.1).
2. 2 Live-Prices mit `workspace_pro_monthly` / `workspace_business_monthly` (2.2).
3. Portal + Tax in Live spiegeln (2.3/2.4).
4. Live-Webhook mit den 6 Events anlegen, `whsec_` kopieren (4).
5. `sk_live_` + `whsec_` in die studio-Server-.env, `pm2 reload` (5).
6. Mini-Kauf + Refund als Beweis (6).

Claude kann 3 (Preis-Skript) und den Reload/Verifikations-Teil übernehmen,
sobald David die Keys gesetzt hat.

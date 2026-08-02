# F7 — Bezahlte Communities: Entscheidungsvorlage (Geldfluss 2)

**Status:** NICHT gebaut, nichts entschieden außer der Richtung · **Sorte:**
Entscheidungsvorlage, kein Umsetzungsplan · **Erstellt:** 2026-08-01

> Diese Datei liegt in `docs/plans/`, weil noch nichts davon existiert. Sie
> enthält BEWUSST keine Häkchen-Liste: zuerst muss David fünf Fragen
> beantworten (Abschnitt 5), danach entsteht der Umsetzungsplan.
> Offene Punkte gehören weiter ausschließlich in `docs/OPEN-ITEMS.md` (Zeile
> F7) — nicht hierher.

## Worum es geht

Geldfluss 1 ist gebaut (A6): die **Community zahlt an Pukalani**. Geldfluss 2
ist F7: der **Owner nimmt Geld von seinen Mitgliedern** — Eintritt zu einem
Event, ein bezahlter Kurs, später eine kostenpflichtige Mitgliedschaft.

D1 ist am 2026-08-02 hier eingerückt worden (Davids Entscheidung: **kein
Betreiber-als-Verkäufer**). Damit steht die Grundfrage schon fest — offen ist
das WIE. Davids Richtungsaussage: *Stripe Connect je Owner, oder eine andere
aktivierbare Zahlungsform*; dazu die Frage, *wie andere Plattformen das machen*.

**Die drei wichtigsten Aussagen dieses Dokuments:**

1. Die Empfehlung lautet **Stripe Connect Express + direct charges +
   application fee**. Der Owner ist Verkäufer (Merchant of Record), Pukalani
   nimmt eine Provision. Alles andere macht Pukalani zum Händler — und damit zu
   dem, was David gerade abgelehnt hat.
2. Die Provision ist ein **Plan-Hebel**, kein Ertragsmodell: je höher der Plan,
   desto niedriger die Provision. Zahlen als Vorschlag in Abschnitt 5.1 —
   Davids Pricing-Entscheid steht aus.
3. Das eigentlich Neue ist **keine Stripe-Integration**, sondern eine
   **Fulfillment-Naht control → Runtime**: Stripe liegt nur auf `control`, die
   Ticket-/Zugriffs-Zeilen liegen im Runtime-Projekt. Genau das ist der Grund,
   warum die Events-Hälfte M ist und nicht S.

---

## 1. Marktbild — wie machen es andere?

### 1.1 Die drei Stripe-Connect-Modelle

Stripe kennt drei Wege, Geld zwischen Käufer, Verkäufer und Plattform zu
bewegen. Sie unterscheiden sich nicht in der Technik, sondern darin, **auf
wessen Konto die Zahlung entsteht** — und daran hängt alles Weitere.

| | **Direct charges** | **Destination charges** | **Separate charges & transfers** |
|---|---|---|---|
| Zahlung entsteht auf | Konto des Verkäufers | Plattform-Konto | Plattform-Konto |
| Plattform nimmt | `application_fee_amount` | `application_fee_amount` | Differenz beim Transfer |
| Käufer sieht im Checkout / auf der Abrechnung | den Verkäufer | die Plattform | die Plattform |
| Chargeback/Negativsaldo trägt zunächst | der Verkäufer | die **Plattform** | die **Plattform** |
| Empfänger muss beim Kauf feststehen | ja | ja | **nein** (Transfer später) |
| Aufteilung auf mehrere Empfänger | nein | nein | ja |
| Merchant of Record ist faktisch | der Verkäufer | die Plattform (streitbar) | die Plattform (streitbar) |

Stripe selbst formuliert die Grenze so: bei destination charges und separate
charges *„occur on the platform"* — Streitfälle und Negativsalden werden dem
Plattform-Konto belastet. Bei separate charges kommt hinzu, dass Stripe einen
bereits ausgeführten Transfer bei einer später fehlgeschlagenen Zahlung **nicht
automatisch zurückdreht**; die Plattform muss das selbst tun.

**Was das für uns heißt:** die beiden Plattform-Modelle sind bequemer
(Splitting, verzögerte Auszahlung, ein einheitlicher Beleg) und verschieben
genau die Lasten auf uns, die David nicht will — Umsatzsteuerpflicht,
Widerrufsabwicklung, Chargeback-Risiko, Impressum als Verkäufer.

### 1.2 Wer macht was — mit Konditionen

> **Quellenlage ehrlich:** die folgenden Zahlen stammen aus einer Recherche am
> 2026-08-01 über Sekundärquellen (Vergleichsseiten, Hilfe-Center). Bei Skool
> widersprechen sich die Quellen im Detail. Vor jeder Preisentscheidung an der
> Primärquelle prüfen — die Preisseiten ändern sich mehrmals im Jahr.

**Direct charges + application fee — der Standard bei Community-Software:**

- **Circle** — Provision **2 % (Professional) / 1 % (Business) / 0,5 % (Circle
  Plus)**, jeweils *zusätzlich* zu Stripes Bearbeitungsgebühr (2,9 % + 0,30 $).
  Effektiv also ca. 4,9 / 3,9 / 3,4 %. Der Owner braucht einen eigenen
  Stripe-Account. **Das ist exakt das hier empfohlene Modell**, inklusive
  Plan-Staffelung.
- **Skool** — **10 % (Hobby, 9 $/Monat) vs. 2,9 % (Pro, 99 $/Monat)** laut
  mehreren Vergleichsseiten; eine Quelle behauptet für Pro *gar keine*
  Skool-Provision bis 899 $ Umsatz und dass Skool dort sogar Stripes
  Auslands-/Abo-Zuschläge übernimmt. **Widersprüchlich → prüfen.** Unabhängig
  vom genauen Wert ist die Struktur eindeutig: die Provision ist der
  Upgrade-Hebel, nicht die Einnahmequelle.
- **Patreon** — **Lite 5 % / Pro 8 % / Premium 12 %**, Bearbeitungsgebühren
  obendrauf. Seit August 2025 gilt für neue Creator eine geänderte
  Standard-Plattformgebühr (Details prüfen). Patreon tritt gegenüber
  EU-Käufern jedoch als **Marketplace/MoR** auf und führt die Umsatzsteuer
  selbst ab — also *nicht* das reine direct-charges-Bild.

**Merchant-of-Record-Modelle — die Plattform ist der Verkäufer:**

- **Substack** — **10 % + Stripe** (2,9 % + 0,30 $). Substack rechnet die
  Umsatzsteuer für den Autor ab.
- **Gumroad** — seit Januar 2025 **Seller of Record auf jeder Transaktion**;
  berechnet, erhebt und führt USt/GST in über 100 Ländern ab. Preis laut
  Sekundärquelle **10 % + 0,50 $**. Der eine Satz, der die ganze Kategorie
  erklärt: *ein Teil dieser 10 % ist ausgelagerte Compliance, nicht Miete.*
- **Podia** — **Stand unbekannt, prüfen.** Nicht recherchiert; wird in
  Vergleichen mal als 0-%-Plattform (bei teurem Abo), mal mit gestaffelter
  Provision geführt.

**Die Lehre aus dem Vergleich:** Wer 10 % nimmt, verkauft nicht Software,
sondern **Steuer- und Rechtsentlastung**. Wer 0,5–3 % nimmt, verkauft
Software und lässt den Verkäufer Verkäufer sein. Ein Mittelweg ohne die
MoR-Leistung („8 %, aber du machst deine Steuer selbst") ist am Markt nicht
verteidigbar.

### 1.3 EU-Brille — was hier anders ist als in den US-Vergleichen

Alle obigen Zahlen stammen aus US-zentrierten Quellen. Drei europäische Themen
kommen dort gar nicht vor, und alle drei entscheiden über die Machbarkeit.

**(a) Umsatzsteuer & OSS.** Verkauft der Owner selbst (direct charges), schuldet
**er** die Umsatzsteuer. Bei elektronisch erbrachten Leistungen an
EU-Verbraucher gilt das Bestimmungslandprinzip; oberhalb der EU-Schwelle
braucht er eine **OSS-Registrierung** und Rechnungen mit dem korrekten
ausländischen Steuersatz. Für einen Hobby-Owner mit drei Kurs-Verkäufen im
Monat ist das eine echte Hürde — und der Grund, warum MoR-Plattformen
existieren.

**(b) Kleinunternehmer-Owner (§ 19 UStG).** Der wahrscheinlichste erste
Pukalani-Verkäufer ist Kleinunternehmer: er weist **keine** Umsatzsteuer aus.
Das Produkt darf ihn also nicht zwingen, einen Steuersatz zu setzen, und
Stripe Tax darf auf seinem Connected Account nicht ungefragt USt aufschlagen.
Die 2025 in Kraft getretene EU-weite Kleinunternehmerregelung ändert das Bild
zusätzlich — **vom Steuerberater bestätigen lassen, nicht raten.**

**(c) Die entscheidende Falle: „deemed supplier".** Auch bei direct charges
kann eine Plattform umsatzsteuerlich als Leistender gelten, wenn sie Abrechnung,
Bedingungen und Lieferung kontrolliert (Art. 9a MwSt-DVO, § 3 Abs. 11a UStG).
Der Stripe-Schalter allein entscheidet das **nicht**. Konsequenz fürs Produkt:
Wir müssen sichtbar machen, dass der Owner verkauft — sein Name im Checkout,
seine AGB, sein Impressum, sein Widerrufsrecht. Direct charges liefern das
frei Haus (Stripe zeigt den Connected Account), die anderen zwei Modelle
nicht. **Das ist das stärkste technische Argument für direct charges.**

**(d) ZAG/PSD2 — warum wir Geld nicht selbst durchleiten dürfen.** Wer
gewerbsmäßig Geldbeträge entgegennimmt und an Dritte weiterleitet, betreibt
ein **Finanztransfergeschäft** und braucht eine BaFin-Erlaubnis (§ 10 ZAG); die
Aufsicht weist ausdrücklich darauf hin, dass das schon Plattformbetreiber
außerhalb der Finanzbranche trifft. Ein selbstgebauter „wir sammeln ein und
zahlen monatlich aus"-Weg ist damit **ausgeschlossen** — unabhängig davon, wie
klein er anfängt. Mit Connect berührt das Geld nie unser Konto; der regulierte
Akteur ist Stripe. (Ob zusätzlich die Handelsvertreter-Ausnahme greift, ist
eine Anwaltsfrage — Abschnitt 6.)

**(e) Auszahlungstakt.** Stripe zahlt Connected Accounts nach eigenem Zeitplan
aus; für neue Konten gelten längere Fristen als für etablierte. **Konkrete Tage:
Stand unbekannt, prüfen** — und danach richtet sich, was wir dem Owner
versprechen dürfen (Abschnitt 5.3).

---

## 2. Empfehlung

**Stripe Connect, Kontotyp Express, direct charges, `application_fee_amount`
als Plan-Hebel. Start Stripe-only, EUR-only, Owner-aktiviert.**

### 2.1 Warum Express (und nicht Standard oder Custom)

- **Standard** (der Owner bringt seinen eigenen vollwertigen Stripe-Account
  mit) verlagert die gesamte Einrichtung zu ihm — und damit den Abbruch. Wer
  gerade eine Community gestartet hat, legt nicht nebenbei ein Stripe-Konto an.
- **Custom** heißt: wir bauen Onboarding, KYC-Nachforderungen, Auszahlungs-UI
  und Streitfall-Ansicht selbst. Das ist ein eigenes Produkt.
- **Express** ist der Mittelweg: Stripe hostet Identitätsprüfung, Bankverbindung
  und ein schlankes Auszahlungs-Dashboard; wir verlinken nur hinein. Das passt
  zum Selbstbedienungs-Trichter aus dem Onboarding-Layer — ein Klick in
  *Settings → Payments*, zurück mit `charges_enabled: true`.

### 2.2 Warum direct charges

- **Der Owner ist Verkäufer.** Das ist Davids Entscheidung, nicht unsere
  Optimierung — und direct charges sind die einzige Variante, in der das
  auch nach außen stimmt (Käuferbeleg, Streitfall, Steuerschuld).
- **Es passt zur Positionierung.** Pukalani wirbt mit DSGVO-Nähe und damit,
  dass die Community dem Owner gehört. Eine Plattform, die sich zwischen
  Owner und Mitglied als Händler schiebt, widerspricht genau dem — und würde
  uns nebenbei zur umsatzsteuerlichen Leistenden in 27 Ländern machen.
- **Es hält das Risiko klein.** Chargebacks landen zuerst beim Verkäufer.
  (Achtung, das ist keine Vollkasko: Stripe hält die Plattform vertraglich für
  Negativsalden ihrer Connected Accounts mit in der Pflicht — Abschnitt 6.)

### 2.3 Warum die Provision der Plan-Hebel ist

Pukalani verdient an Abos (Personal 29 €, Pro 149 €), nicht an fremden
Transaktionen. Eine Provision, die ein Owner durch ein Upgrade auf null bringen
kann, ist deshalb ein besseres Geschäft als eine, die Umsatz macht: sie zieht
genau die Owner ins Abo, die wirklich verkaufen.

**Vorschlag (Zahlen sind ein VORSCHLAG, Davids Pricing-Entscheid steht aus):**

| Plan | Verkaufen erlaubt? | Provision (Vorschlag) | Gedanke dahinter |
|---|---|---|---|
| Basic | **nein** | — | Der Verkauf ist der Anlass zu upgraden. Kostenlos verkaufen lassen heißt: Support-Last und Missbrauchsrisiko ohne Gegenwert. |
| Personal | ja | **2 %** | Auf Circle-Niveau, spürbar aber nicht abschreckend. |
| Pro | ja | **0 %** | Das Verkaufsargument für 149 €: ab hier gehört dir dein Umsatz ganz. |

Stripes eigene Gebühr (Kartenentgelt) kommt in jedem Fall obendrauf und ist
nicht unsere — das muss die Oberfläche sagen, sonst hält der Owner unsere 2 %
für die Gesamtkosten.

---

## 3. Architektur-Skizze

### 3.1 Was schon steht und wiederverwendet wird

| Baustein | Wo | Wofür in F7 |
|---|---|---|
| `registerCheckoutFulfillment` | `packages/billing/server/utils/fulfillment.ts` | Einmalkäufe (Ticket, Kurs) — der Vertrag existiert und ist A14-sauber: billing kennt kein Produkt-Layer, die App verdrahtet. |
| `registerSubscriptionFulfillment` + `VerifiedSubscriptionUpdate` | ebenda | Vorbild für die **normalisierte** Ereignis-Übergabe (nie rohes Stripe-JSON an Produkt-Layer). Später auch für bezahlte Mitgliedschaften. |
| `grantEventTicket` | `packages/events/server/utils/eventTickets.ts` | Der einzige Schreibweg in `event_tickets`, idempotent über den Unique-Index, stempelt seit S7 den Mandanten aus der Event-Row. **Fertig für den Pool.** |
| `registerEventTicketGuard` / `hasEventTicket` | ebenda | Lesetür. Ohne Guard fail-closed — der heutige, korrekte Zustand im Pool. |
| `registerCourseAccessGuard` | `packages/courses/server/utils/courseAccess.ts` | Andockpunkt für die Kurs-Hälfte; heute im Pool bewusst unregistriert (403). |
| Service-Naht + JWT-Prüfung | `POST /api/control/onboarding/site`, `packages/onboarding` | Das **Muster** für den Aufruf Runtime → control (Service-Secret + Appwrite-JWT). |
| Community-Checkout | `apps/control/server/utils/communityCheckout.ts` | Vorbild für Session-Anlage ohne Browser-Session, Erfolgs-URLs aus `tenants.host` statt aus dem Body. |

### 3.2 Was neu ist — und warum es M und nicht S ist

Die Verdrahtung im **Silo** (`apps/comments`) wäre klein: dort liegen billing,
events und der Webhook im selben Projekt, Tickets werden heute schon
geschrieben. Im **Pool** liegt die Sache auseinander:

```
Käufer  ──►  Stripe (Connected Account des Owners)
                 │  Connect-Webhook
                 ▼
           apps/control            ← der EINZIGE Stripe-Schlüssel-Halter
           (tenants-Row, connectAccountId, Provision)
                 │  NEUE NAHT: Service-Secret, idempotent, retry-fest
                 ▼
           apps/platform            ← hier liegen events/event_tickets/courses
           grantEventTicket(...)
```

`apps/platform` bindet `@pukalani/billing` bewusst **nicht** ein. Diese
Trennung soll bleiben (ein Stripe-Schlüssel, ein Ort). Die Folge ist eine
**Fulfillment-Naht in der Gegenrichtung der Onboarding-Naht**: control empfängt
den Webhook, die Runtime schreibt die Zeile. Zwei Eigenschaften sind
nicht verhandelbar:

- **Idempotent** — Stripe wiederholt Webhooks; `grantEventTicket` ist schon so
  gebaut (409 → bestehende Zeile).
- **Fehler werfen, nie still zurückkehren** — ist die Runtime nicht erreichbar,
  muss control 500 antworten, damit Stripe erneut zustellt. (Die Webhook-Regel
  aus dem Money-Path-Review gilt hier unverändert.)

### 3.3 Datenmodell (additiv, `communities` im Control Plane)

- `connectAccountId: string` — `''` = nicht eingerichtet.
- `connectStatus: string` — `''` | `pending` | `enabled` | `restricted`;
  Spiegel von `charges_enabled`/`payouts_enabled`/`requirements`, gepflegt über
  `account.updated`. Verkaufen darf nur `enabled`.

**Ausdrücklich KEINE `feePercent`-Spalte am Anfang.** Ein gespeicherter
Prozentsatz überlebt still jede Preisänderung; die Provision gehört an den
**Plan** und damit in die Konfiguration (`pukalani.control.connect.feeBpsByPlan`,
in **Basispunkten** als Ganzzahl — keine Fließkommazahl im Geldpfad). Wenn
David später Einzelabsprachen will, kommt eine Spalte `feeBpsOverride`
hinzu — dann bewusst, mit Anzeige im Betreiber-Dashboard.

Der Kommentar an `TenantRow.billingStatus` hat das übrigens vorweggenommen:
*„Bewusst billingStatus, nicht paymentStatus — Geldfluss 2 (F7) kommt später
DANEBEN, nie hinein."* Die Spalten von Geldfluss 1 und 2 bleiben getrennt.

### 3.4 Wo der Owner es aktiviert

**Settings → Payments** — der Platz ist in `docs/plans/DASHBOARD-IA.md` schon
reserviert (`Payments · Taxes · Payment logs`) und existiert als Seite noch
nicht. Inhalt der ersten Ausbaustufe:

1. Statuskarte: nicht eingerichtet / in Prüfung / bereit / eingeschränkt.
2. Ein Knopf „Auszahlungskonto einrichten" → Stripe-Express-Onboarding, zurück
   auf dieselbe Seite.
3. Link ins Stripe-Express-Dashboard (Auszahlungen, Bankverbindung) — nicht
   nachbauen.
4. Klartext über die Kosten: unsere Provision **und** dass Stripes Gebühr
   zusätzlich anfällt.
5. **Sperre:** kein Verkauf, solange Impressum/AGB/Widerrufsbelehrung der
   Community nicht hinterlegt sind (der `pages`-Layer kann das schon) —
   siehe Abschnitt 6.

Sichtbarkeit über das bestehende Muster: `pukalani.tenancy.products` +
`requirePlanProduct()` an den API-Einstiegen, `planAllows()` in der UI.
Der Produkt-Key wäre z. B. `payments`.

### 3.5 Etappen — ehrlich getrennt

| # | Etappe | Größe | Warum |
|---|---|---|---|
| 1 | **Fundament**: Express-Onboarding, `connectAccountId`/`connectStatus`, Settings-→-Payments-Seite, `account.updated`-Verarbeitung, Provisions-Konfiguration | **M** | Ohne das verkauft niemand. Enthält noch keinen einzigen Kauf. |
| 2 | **Events (Einmalkauf)** — die erste echte Ausbaustufe | **M** | Objekt, Preisfeld (`priceAmount`/`priceLookupKey`), `event_tickets`, Guard und Fulfillment existieren; neu sind nur der Connect-Checkout und die Naht aus 3.2. **Vorbedingung: F13** (das Pool-Formular bietet heute „paid" an, obwohl der Kauf-CTA „Bald verfügbar" zeigt). Nebenbei fällt `priceLookupKey` weg: ein Owner darf keine von David angelegten Stripe-Preise brauchen — Preise entstehen ad hoc auf seinem Connected Account. |
| 3 | **Kurse (Einmalkauf)** — community-scoped Entitlements | **L/XL** | **Unentworfen.** Die vorhandene `entitlements`-Mechanik ist die *Lizenz* der Studio-Seite („welche Produkte darf diese INSTALLATION betreiben") und beantwortet eine andere Frage; sie zu biegen wäre der Fehler. Gebraucht wird ein neues, mandanten- und nutzerbezogenes Objekt („dieser Nutzer hat in dieser Community diesen Kurs gekauft") samt Rückgabe/Ablauf/Widerruf. Das ist eine eigene Etappe und wird hier nicht versteckt. |
| 4 | **Bezahlte Mitgliedschaft (wiederkehrend)** | **XL** | Das ist die wörtliche Lesart von „bezahlte Communities". Es greift in A5 ein: Mitgliedschaft ist heute ein Ereignis (`registration`/`contribution`), das Site-Label ist das Lese-Publikum. Ein Abo, das bei Nichtzahlung **Zugang entzieht**, macht aus `revokeCommunityLabel` einen Geldpfad-Vorgang samt Mahnlauf, Kulanzfrist und Wiederanschluss. Erst nach Etappe 3 diskutieren. |

Etappe 2 ist deshalb der richtige Anfang: sie ist die kleinste Strecke, die
end-to-end echtes Geld bewegt, und sie beweist die Naht aus 3.2.

---

## 4. Die Naht für andere Zahlungsdienste

Damit Mollie, PayPal oder ein späterer europäischer Anbieter andocken können,
ohne dass ein Produkt-Layer davon erfährt, braucht es **einen** Vertrag — nach
demselben Muster wie `registerUserDataContributor` und
`VerifiedSubscriptionUpdate`: der Anbieter wird am Rand normalisiert, die
Produkt-Layer bleiben anbieter-blind.

```ts
// Skizze, nicht gebaut — gehört in einen eigenen Vertrag (shared/), nicht in billing
export interface SellerPaymentProvider {
  key: 'stripe' | 'mollie' | string
  /** Verkäufer-Onboarding starten (gehosteter Ablauf) → URL */
  createSellerOnboardingLink(input: { communityId: string, returnUrl: string }): Promise<string>
  /** Kann dieser Verkäufer heute kassieren? (Spiegel für connectStatus) */
  sellerStatus(sellerRef: string): Promise<'pending' | 'enabled' | 'restricted'>
  /** Kauf starten — Provision in Basispunkten, nie als Fließkommazahl */
  createCheckout(input: {
    sellerRef: string
    item: { title: string, amount: number, currency: 'EUR' }
    feeBps: number
    metadata: Record<string, string>
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string }>
  /** Signatur prüfen und auf EIN neutrales Ereignis abbilden */
  verifyWebhook(raw: string, headers: Record<string, string>): Promise<NormalizedPaymentEvent>
  refund(input: { paymentRef: string, amount?: number, refundFee: boolean }): Promise<void>
}

export type NormalizedPaymentEvent =
  | { kind: 'purchase.completed', sellerRef: string, buyerRef: string, itemRef: string, amount: number, currency: string, paymentRef: string, occurredAt: string }
  | { kind: 'purchase.refunded', paymentRef: string, occurredAt: string }
  | { kind: 'seller.status_changed', sellerRef: string, status: 'pending' | 'enabled' | 'restricted' }
```

**Warum der Start trotzdem Stripe-only ist:**

- Connect Express liefert KYC, Bankanbindung, Auszahlungs-Dashboard und
  Streitfall-Abwicklung **pro Verkäufer** als gehosteten Ablauf. Mollie Connect
  existiert, hat aber ein anderes Onboarding- und Gebührenmodell; PayPal hat
  kein Äquivalent in dieser Form. **Beides: Stand unbekannt, vor einer
  Multi-PSP-Zusage prüfen.**
- Wir haben heute **null** zahlende Owner in Geldfluss 2. Einen zweiten
  Anbieter vor dem ersten Verkauf zu bauen ist Spekulation, und die Verträge
  eines Anbieters, den man nie angebunden hat, sind erfahrungsgemäß falsch
  geschnitten.
- **Und die Naht ist keine Vollkasko:** sie hält die Produkt-Layer sauber, aber
  Auszahlungsrhythmus, Rückerstattungs- und Streitfall-Semantik unterscheiden
  sich zwischen Anbietern real. Ein Wechsel bleibt ein Projekt — die Naht macht
  ihn möglich, nicht billig. Das gehört so gesagt, statt „pluggable" zu
  versprechen.

Der Preis der Naht ist heute **eine Datei**. Den zahlen wir.

---

## 5. Offene Entscheidungen — für David

Ohne diese fünf Antworten entsteht kein Umsetzungsplan.

### 5.1 Provision je Plan

✅ **ENTSCHIEDEN (David, 2026-08-02): Basic verkauft gar nicht · Personal 2 % ·
Pro 0 %. Aktivieren dürfen Owner ab Personal.** Damit ist auch die Gegenprobe
beantwortet: Basic verkauft nicht — kein Skool-Modell mit hohem Satz für
Nullabo-Konten (Support- und Missbrauchsrisiko ohne Vertragsbindung).

### 5.2 Rückerstattungen

Wer darf erstatten (Owner allein? Betreiber im Streitfall?), aus welchem
Guthaben, in welcher Frist — und **wird unsere Provision mit erstattet?**
Stripe lässt beides zu. Vorschlag: Owner erstattet selbst im Stripe-Dashboard,
Provision wird **mit** erstattet (alles andere erklärt sich nicht: wir haben
an einem rückabgewickelten Kauf nichts verdient).

### 5.3 Was wir über Auszahlungen versprechen

Vorschlag: **gar nichts Eigenes.** Die Seite sagt „Stripe zahlt auf dein
Bankkonto aus; den Rhythmus siehst du in deinem Stripe-Dashboard" und
verlinkt dorthin. Eine eigene Zahl („nach 7 Tagen") wäre ein Versprechen über
fremdes Verhalten, das sich für neue Konten anders verhält (Abschnitt 1.3e).

### 5.4 Mindestbetrag und Währung

Vorschlag: **Mindestbetrag 5 €**, **EUR-only** am Anfang. Unter 5 € frisst die
feste Stripe-Gebühr einen zweistelligen Prozentsatz, und ein 1-€-Ticket erzeugt
Support-Aufwand ohne Gegenwert. Mehrwährung ist ein eigenes Thema (Preisanzeige,
Umrechnung, Steuersatz).

### 5.5 Wer darf aktivieren

Vorschlag: **nur der Owner**, ab Plan Personal, und **erst wenn Impressum, AGB
und Widerrufsbelehrung der Community hinterlegt sind**. Zusatzfrage: Soll der
Betreiber die Freischaltung gegenzeichnen müssen? Argument dafür: unser Name
steht auf der Plattform, auf der verkauft wird. Argument dagegen: das bricht
die Selbstbedienung. **Empfehlung: keine Gegenzeichnung, aber eine
Betreiber-Ansicht aller aktiven Verkäufer und ein Not-Aus.**

### 5.6 Zwei Folgefragen (kleiner, aber unbeantwortet)

- Was passiert mit gekauften Zugängen, wenn eine Community stillgelegt wird
  (C16) oder der Besitz wechselt? Käufer haben bezahlt — an wen richtet sich
  ihre Forderung?
- Zeigt die Oberfläche Preise inklusive Umsatzsteuer? Die Antwort hängt daran,
  ob der Owner Kleinunternehmer ist — das Produkt muss beide Fälle können.

---

## 6. Rechts-Checkliste (für den Anwalt / Steuerberater)

Nichts hiervon ist eine Rechtsauskunft; das ist die Fragenliste, mit der man
in den Termin geht.

**Umsatzsteuer**

1. **Deemed supplier**: Werden wir bei direct charges trotzdem als Leistende
   behandelt (Art. 9a MwSt-DVO / § 3 Abs. 11a UStG), weil wir Checkout,
   Bedingungen und Zugangsfreischaltung steuern? Was müssen wir sichtbar
   anders machen, damit die Antwort „nein" lautet?
2. **Kleinunternehmer-Owner**: Wie muss der Verkauf konfiguriert sein, damit
   ein § 19-Owner korrekt *ohne* USt verkauft — und ab wann kippt das (EU-weite
   Kleinunternehmerregelung seit 2025)?
3. **Unsere Provision** ist eine B2B-Leistung an den Owner: Rechnungsstellung,
   Reverse Charge bei Ownern im EU-Ausland, USt-ID-Prüfung. Stripe erstellt
   diese Rechnung nicht automatisch.
4. Wer stellt dem **Käufer** die Rechnung, und mit welchen Pflichtangaben?

**Aufsichtsrecht**

5. **ZAG/PSD2**: Bestätigen, dass wir mit Connect kein Finanztransfergeschäft
   betreiben (das Geld berührt unser Konto nie). Greift zusätzlich die
   Handelsvertreter-Ausnahme? Wo genau verliefe die Grenze, falls wir je
   Auszahlungen verzögern oder bündeln wollten?
6. **DSA**: Werden wir durch den Verkauf zu einer Plattform, die
   Fernabsatzverträge ermöglicht — mit Rückverfolgbarkeit der Unternehmer
   („Know Your Business Customer", Art. 30 DSA) und den daran hängenden
   Prüf- und Anzeigepflichten?

**Verträge & AGB**

7. **Verkäufer-Bedingungen** als eigener Abschnitt der Plattform-AGB: der Owner
   ist Verkäufer, wir sind nur Werkzeug; Freistellung durch den Owner;
   Untersagung verbotener Geschäfte (Stripes Restricted-Business-Liste
   spiegeln); unser Recht, die Freischaltung bei Verdacht auszusetzen; Folgen
   bei Kündigung des Abos oder Stilllegung der Community.
8. **Käufer-Sicht**: Wo steht im Kaufweg unmissverständlich, mit wem der
   Vertrag zustande kommt? (Direct charges zeigen den Connected Account —
   reicht das, oder braucht es einen eigenen Hinweis vor dem Kauf?)
9. **Stripe Connected Account Agreement**: Der Owner muss es annehmen; die
   Express-Strecke holt das ein — wir müssen es in unseren AGB referenzieren.
10. **Negativsalden**: Prüfen, wie weit uns Stripes Plattform-Vertrag für
    Ausfälle unserer Connected Accounts in Haftung nimmt — auch bei direct
    charges. Das ist ein reales Betreiberrisiko und gehört in die Kalkulation
    der Provisionshöhe.

**Datenschutz**

11. **Rollenabgrenzung**: Für Community-Inhalte sind wir Auftragsverarbeiter des
    Owners. Für Verkäufer-Daten (Umsätze, Auszahlungsstatus, Provisionen) sind
    wir vermutlich **eigener Verantwortlicher** — das muss in den AV-Vertrag
    und in die Datenschutzerklärung, sonst stimmt unsere DSGVO-Erzählung an
    genau der Stelle nicht, an der wir mit ihr werben.
12. Stripe als eigener Verantwortlicher für Zahlungsdaten: Verweis und
    Drittlandsbetrachtung in der Datenschutzerklärung nachziehen.

**Verbraucherrecht**

13. **Impressumspflicht des Owners**: Mit dem ersten Verkauf handelt er
    geschäftsmäßig — § 5 DDG-Impressum, Verbraucherinformationen und
    Widerrufsbelehrung. **Produktfolge:** Verkauf erst freischalten, wenn diese
    Seiten hinterlegt sind (der `pages`-Layer kann sie); und der Owner braucht
    dafür eine verständliche Anleitung, keine leere Textbox.
14. **Widerrufsrecht, zwei verschiedene Fälle**:
    - *Kurse/digitale Inhalte*: 14 Tage, erlöschen nur bei ausdrücklicher
      Zustimmung + Bestätigung (§ 356 Abs. 5 BGB) — die Checkbox muss im
      Kaufweg existieren, sonst gibt es sie faktisch nicht.
    - *Events mit festem Termin*: fallen vermutlich unter die Ausnahme für
      Freizeitveranstaltungen (§ 312g Abs. 2 Nr. 9 BGB) — **bestätigen
      lassen**, denn davon hängt ab, ob Etappe 2 überhaupt eine
      Widerrufsstrecke braucht.
15. **Streitbeilegung**: Welcher Hinweis ist heute noch Pflicht (die
    EU-ODR-Plattform wurde 2025 eingestellt)? **Stand unbekannt, prüfen.**

---

## 7. Was hier bewusst nicht steht

- **Kein Umsetzungsplan, keine Häkchen.** Der entsteht, wenn Abschnitt 5
  beantwortet ist.
- **Keine erfundenen Konditionen.** Wo die Recherche unsicher war, steht
  „Stand unbekannt, prüfen" — bei Podia, beim Auszahlungstakt, bei den
  Mollie-/PayPal-Äquivalenten, beim ODR-Hinweis und bei den widersprüchlichen
  Skool-Zahlen.
- **Keine Silo-Betrachtung.** Für `apps/comments` wäre F7 deutlich kleiner
  (alles in einem Projekt). Der Pool ist der Fall, der die Architektur
  entscheidet — und der Silo erbt sie danach, nicht umgekehrt (ein Konzept pro
  Produkt).

## Quellen der Marktrecherche (2026-08-01, Sekundärquellen)

- [Stripe Docs — Understand how charges work in a Connect integration](https://docs.stripe.com/connect/charges)
- [Stripe Docs — Recommended Connect integrations and charge types](https://docs.stripe.com/connect/integration-recommendations)
- [Stripe Docs — Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Stripe — Understanding the tax obligations of marketplaces in the EU](https://stripe.com/guides/understanding-the-tax-obligations-of-marketplaces-in-the-eu)
- [Circle Knowledge Base — Paywall transaction fees](https://help.circle.so/p/payments/paywall-setup/paywall-transaction-fees)
- [Tools4Skool — Skool transaction fee](https://tools4skool.com/skool/skool-transaction-fee)
- [Patreon Support — A standard platform fee for new creators (ab 04.08.2025)](https://support.patreon.com/hc/en-us/articles/36426991446797-A-standard-platform-fee-for-new-creators-effective-after-August-4-2025)
- [Gumroad Help — Dealing with VAT](https://gumroad.com/help/article/10-dealing-with-vat)
- [hellotax — Who handles EU VAT on digital platforms?](https://hellotax.com/blog/vat-on-digital-platforms/)
- [BaFin — Merkblatt Hinweise zum Zahlungsdiensteaufsichtsgesetz (ZAG)](https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Merkblatt/mb_111222_zag.html)
- [BaFin — Zulassungspflichtige Zahlungsdienste](https://www.bafin.de/DE/Aufsicht/ZahlungsdienstePSD2/ZulassungspflichtigeZahlungsdienste/ZulassungspflichtigeZahlungsdienste_node.html)

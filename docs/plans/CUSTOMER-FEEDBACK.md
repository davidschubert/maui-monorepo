# Customer Feedback — zentrale Rückmeldung aus allen Communities

> **Status:** Konzept, noch nicht gebaut. Davids Auftrag vom 2026-07-30.
> **Bestand:** `packages/feedback` (Tabelle `feedback` + Volltext) und
> `packages/tickets` (Board mit Watchers/Dateien/Erinnerungen) existieren —
> aber sie hängen **nur in `apps/comments`**. `apps/control` extendet keinen
> von beiden. Genau das ist der Befund.

## Die Idee in einem Satz

Auf **jeder** Community- und Website-Seite sitzt unten links ein
Feedback-Knopf. Was dort eingeht, landet **zentral im Feedback-Bereich von
`control.pukalani.app`** — aus allen Communities, an einer Stelle. Aus einem
Feedback-Post kann ein **Feature Request** werden, der im Board unter „Under
Review" auftaucht und von dort über „Planned" und „In Progress" nach
„Complete" wandert.

Der Zweck ist nicht Sammeln, sondern **Erkennen**: was fordern Nutzer
wirklich, was wollen sie anders, was gefixt — und mit welchem Gewicht.

## Warum das heute falsch liegt

„Management → Feedback / Board" steht in `apps/comments`, also in einer
**Kunden-Silo-App**. Damit sammelt es Rückmeldungen genau einer Installation,
und der Betreiber sieht sie nur, wenn er sich dort anmeldet. Der Bereich
gehört dorthin, wo der Betreiber ohnehin arbeitet: **control**.

## Was festgehalten werden muss

### Herkunft — anonym oder namentlich

Zu jedem Feedback gehört, **ob es anonym oder von einem registrierten Nutzer
einer Community/Website** kam. Zwei Gründe, beide gleich wichtig:

- Der Betreiber kann bei Rückfragen **den Nutzer kontaktieren**.
- Der Nutzer kann **nachverfolgen, was mit seinem Feedback passiert**.

Dazu gehört auch, **aus welcher Community bzw. von welcher Website** es kam.

### Kategorien

Feedback wird einsortiert, damit es sortierbar bleibt — z. B.
**Core product**, ein **konkretes Produkt**, **Billing/Payment**. Die
endgültige Liste legt David fest; die Achse ist „woran arbeitet das?".

### Board-Zustände

`Under Review` → `Planned` → `In Progress` → `Complete`.
Verschieben ist Betreiber-Sache.

### Sortieren und Filtern

- **Sortieren:** Trending · Top · New
- **Filtern:** Under Review · Planned · In Progress · Complete

### Mitreden

Der Feedback-Bereich ist **Bestandteil aller Dashboards**, nicht nur des
Betreiber-Dashboards: dort können Nutzer Feedback **kommentieren** und
**hoch- oder runterwählen**. Das Gewicht entsteht also bei den Nutzern, nicht
in der Betreiber-Ansicht.

## Navigation (Davids Entwurf)

```
Management
└── Customer Feedback
    ├── Feedback
    ├── Roadmap        (heute „Board")
    └── Changelog      (Menüeintrag zieht hierher um)
```

Der Changelog schließt den Kreis: was in „Complete" landet, ist genau das,
was dort verkündet wird. **Achtung N7:** der öffentliche Changelog antwortet
auf Mandanten-Hosts bewusst 404 (Betreiber-Inhalt) — der Menü-Umzug betrifft
die Betreiber-Navigation, nicht diese Sperre.

## Die harten Fragen (VOR dem Bauen zu entscheiden)

Das sind keine Details, sondern die Stellen, an denen dieses Vorhaben
architektonisch teuer wird. Sie sind bewusst offen gelassen.

1. **Cross-Projekt-Schreiben.** Feedback entsteht auf Mandanten-Hosts
   (platform → Projekt `pool`) und auf Silo-Sites (comments, portfolio → je
   eigenes Projekt), soll aber im **control**-Projekt liegen. Es gibt bereits
   genau eine erprobte Naht dieser Art: die Onboarding-Service-Naht
   (Service-Secret + Appwrite-JWT, das das Control Plane selbst prüft,
   `packages/control/server/utils/onboardingService.ts`). Dieselbe Bauart
   drängt sich auf — dann braucht der Feedback-Endpunkt einen Eintrag in
   `maui.tenancy.controlApiPrefixes`.

2. **Cross-Projekt-LESEN ist das schwerere Problem.** „Der Feedback-Bereich
   ist Bestandteil aller Dashboards" heißt: ein Nutzer auf
   `a.pukalani.app` soll Zeilen sehen, kommentieren und bewerten, die im
   control-Projekt liegen — wo sein Browser **weder Session noch Leserecht**
   hat. Dieselbe Wand steht schon bei D6 (Branding propagiert nicht live) und
   war der Kern von C17 (die Glocke hängt dort, wo die Meldungen liegen).
   Drei Wege, alle mit Preis: (a) alles über server-seitige Proxy-Routen der
   jeweiligen App, (b) eine `read(any)`-Spiegelzeile im Runtime-Projekt →
   zweite Wahrheit, (c) Feedback liegt pro Projekt und das Control Plane
   aggregiert lesend → dann ist es nicht mehr „zentral an einer Stelle".
   **Diese Wahl bestimmt das ganze Vorhaben.**

3. **Personenbezug über Projektgrenzen.** „Ich kann den Nutzer kontaktieren"
   heißt: eine Adresse aus Projekt A liegt in Projekt B. Für unauthentifizierte
   Beiträge gibt es dafür bereits ein Muster im Haus — `guest_authors`
   (operator-read, nie auf einer `read(any)`-Zeile), aus der E4-Runde. Für
   anonymes Feedback gilt dieselbe Regel; für namentliches kommt die Frage
   dazu, was in der DSGVO-Auskunft und -Löschung passiert
   (`registerUserDataContributor` — ein neuer Layer mit Nutzerdaten **muss**
   einen Contributor registrieren).

4. **Wem gehört die Stimme?** Wenn Mitglieder verschiedener Communities
   dasselbe Feedback hoch wählen: zählt eine Stimme pro Person oder pro
   Community? Das entscheidet, ob „Top" die lauteste Community abbildet oder
   die breiteste Zustimmung.

5. **Missbrauch.** Ein öffentlicher Knopf auf jeder Kundenseite ist ein
   offener Schreibpfad ins Betreiber-System. Rate-Limit, Moderation und ein
   Weg, eine Community stummzuschalten, gehören in die erste Fassung, nicht
   in die zweite.

6. **Was passiert mit dem Bestand?** `feedback` und `tickets` tragen in
   `apps/comments` bereits Daten. Umziehen, spiegeln oder stehen lassen —
   und wenn umziehen, dann mit derselben Row-Id-Disziplin wie bei
   control-022/023.

## Reihenfolge (Vorschlag)

Dieses Vorhaben fasst dieselben Tabellen und dasselbe Menü an wie **A6**
(Zahlung an die Community), **E8-Etappe 3** (`tenants` → `communities`) und
**E9** (Dashboard-Umbau). Es sollte **nach E9** kommen — sonst wird die
Navigation zweimal gebaut und der Menüpunkt „Customer Feedback" um Objekte
herum entworfen, die gerade umbenannt werden.

Ausnahme, die sofort ginge: der **Umzug der Layer** `feedback` + `tickets`
von `apps/comments` nach `apps/control` samt Migrationen — das ist der
Befund, der heute schon falsch ist, und er ist unabhängig vom Rest.

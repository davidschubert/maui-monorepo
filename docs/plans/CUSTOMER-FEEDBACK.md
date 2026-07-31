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

## Entschieden (David, 2026-07-30)

Acht Fragen, die das Vorhaben teuer machen konnten, sind VOR dem Bauen
geklärt. Sieben davon folgen der Empfehlung; bei einer hat David bewusst
anders entschieden — das ist unten so vermerkt.

### 1. Lesepfad: Server-Proxy je App

Cross-Projekt-**Schreiben** war ohnehin klar: dieselbe erprobte Naht wie beim
Onboarding (Service-Secret + Appwrite-JWT, das das Control Plane selbst prüft,
`packages/control/server/utils/onboardingService.ts`) — der Feedback-Endpunkt
braucht dafür einen Eintrag in `pukalani.tenancy.controlApiPrefixes`.

Cross-Projekt-**Lesen** war die eigentliche Wand: ein Nutzer auf
`a.pukalani.app` soll Zeilen sehen und bewerten, die im control-Projekt
liegen — wo sein Browser weder Session noch Leserecht hat (dieselbe Wand wie
D6 und C17). **Entscheidung: jedes Dashboard fragt seinen EIGENEN Server, der
über dieselbe Service-Naht bei control nachfragt.**

Damit gibt es **eine Wahrheit**, keine Spiegelzeile, keine zweite Datenhaltung.
Bewusst in Kauf genommen:
- eine Proxy-Route je Operation (lesen, kommentieren, wählen),
- etwas Latenz,
- **control wird zur Abhängigkeit aller Dashboards** ⇒ der Feedback-Bereich
  MUSS sauber degradieren, wenn control nicht antwortet (nicht das Dashboard
  mitreißen),
- **kein Live-Morphen über Realtime** — Votes und Kommentare erscheinen beim
  nächsten Laden, nicht sofort bei allen.

### 2. Sichtbarkeit: Text für alle, Herkunft nur für den Betreiber

Jeder sieht jeden Feedback-Text und kann darüber abstimmen — das ist der Sinn
des Wählens. **WER** es geschrieben hat und aus **WELCHER** Community bleibt
dem Betreiber vorbehalten. Damit funktioniert die Priorisierung plattformweit,
ohne dass Kunde A sieht, woran Kunde B arbeitet („Firma X wünscht sich
Funktion Y" ist eine Geschäftsinformation). Der Verfasser sieht sein eigenes
Feedback selbstverständlich mit Status.

### 3. Stimmen: eine pro Person

Einfach und überall so erwartet. Gegen die Schlagseite großer Communities
hilft eine **zweite Zahl statt einer anderen Rechnung**: am Eintrag steht
zusätzlich „aus N Communities". Breite und Lautstärke stehen damit
nebeneinander, ohne die Stimmenlogik zu verbiegen.

### 4. Anonymität: ohne Login heißt wirklich anonym

Wer nicht eingeloggt ist, schreibt ohne Adresse, ohne Nachverfolgung, ohne
Kontaktmöglichkeit — und weiß das vorher. Eingeloggte Nutzer sind zuordenbar
und können ihr Feedback verfolgen; nur bei ihnen greift „ich kann den Nutzer
kontaktieren".

Folge: **keine Gast-PII über Projektgrenzen**, das `guest_authors`-Muster aus
E4 wird hier nicht gebraucht. Für die zuordenbaren Zeilen gilt weiterhin: ein
Layer mit Nutzerdaten **muss** einen `registerUserDataContributor` für
DSGVO-Auskunft und -Löschung mitbringen.

### 5. Kategorien: zwei Felder statt einer Liste

- **Bereich:** Kernprodukt · Ein Produkt · Abrechnung/Zahlung · Sonstiges
- **Welches Produkt** (nur bei „Ein Produkt"): aus dem **bestehenden**
  Feature-Katalog (`feature.manifest.ts` der Layer).

Damit gibt es keine zweite Liste, die getrennt veraltet: ein neuer Layer steht
automatisch zur Wahl. Passt zu „Ein Konzept pro Produkt".

### 6. Bestand in `apps/comments`: stehen lassen, neu anfangen

Die alten Zeilen sind Rückmeldungen zu EINER Silo-Installation, nicht
Produkt-Feedback zur Plattform. Vermischt verfälschen sie genau die Zahl, um
die es geht („Top", „Trending"). Also **nicht migrieren, nicht löschen**.

> **Auflösung eines Widerspruchs:** Diese Antwort und Entscheidung 7 (sofortiger
> Umzug) beißen sich — verschwindet die Ansicht aus `apps/comments`, ist der
> Bestand nicht mehr erreichbar, „bis er abgearbeitet ist" geht dann nicht.
> Deshalb: **vor dem Entfernen der Ansicht werden die vorhandenen Zeilen als
> JSON gesichert** (Zeilen vorher zählen). Nichts geht verloren, nichts wird
> migriert.

### 7. Reihenfolge: echter Umzug sofort — *abweichend von der Empfehlung*

`apps/control` bekommt `feedback` + `tickets` samt Migrationen, **und
`apps/comments` verliert sie im selben Zug**. Danach gibt es die Ansicht genau
einmal, ohne Zwischenzustand.

Empfohlen war der additive Weg (control rein, comments vorerst behalten), weil
`apps/comments` eine LIVE-Seite ist und ihren Feedback-Bereich damit verliert,
bevor der Ersatz seine endgültige Form hat. David hat das abgewogen und sich
für den sofortigen Umzug entschieden — hier festgehalten, damit die Folge
später nicht als Versehen gelesen wird.

### 8. Missbrauch: volle Notbremse in Fassung 1

- **Rate-Limit** pro IP und Konto (der geteilte Redis-Store existiert bereits),
- **Moderations-Zustand** für Feedback: verstecken statt löschen, wie bei
  Kommentaren,
- **Schalter, um eine einzelne Community stummzuschalten.**

Ein öffentlicher Schreibpfad ins Betreiber-System ohne Notbremse ist eine
Einladung — und Nachrüsten unter Beschuss ist der schlechteste Zeitpunkt.

## Reihenfolge

Der **Layer-Umzug** (Entscheidung 7) läuft vorgezogen und unabhängig.

Alles Übrige fasst dieselben Tabellen und dasselbe Menü an wie **A6** (Zahlung
an die Community), **E8-Etappe 3** (`tenants` → `communities`) und **E9**
(Dashboard-Umbau) und kommt deshalb **nach E9** — sonst wird die Navigation
zweimal gebaut und „Customer Feedback" um Objekte herum entworfen, die gerade
umbenannt werden.

## Offen geblieben (bewusst, kleiner Zuschnitt)

- Erzeugt „Complete" automatisch einen Changelog-Entwurf? Der Kreis ist da
  (siehe Navigation), die Automatik ist eine eigene Entscheidung.
- Sieht ein Community-Owner die Wünsche SEINER Mitglieder gesondert?
  Entscheidung 2 sagt heute nein (Herkunft nur Betreiber) — falls doch, ist
  das eine eigene Ansicht mit eigener Rechtefrage.

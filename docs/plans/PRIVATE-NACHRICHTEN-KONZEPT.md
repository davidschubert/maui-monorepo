# Private Nachrichten — Produkt-Konzept

Entwurf vom 2026-08-04. **Noch nicht gebaut, noch nicht entschieden.**

Herkunft: Davids Rahmensetzung in `DISCUSSIONS-KONZEPT.md` Teil 4, wörtlich —
„eigenes Produkt mit eigener Missbrauchsfläche (Belästigung, Spam) und eigener
Moderation. Bekommt ein EIGENES Konzept vor dem Bau … ein Nachrichtenweg ohne
Meldeweg und Sperre ist ein Missbrauchskanal, den man hinterher nicht mehr
zumacht." Es ist die letzte offene F1-Position und das einzige Stück des
Discourse-Katalogs, das ausdrücklich VOR dem Bau eine eigene Begründung braucht.

Dieses Dokument ist nach derselben Regel gebaut wie das Discussions-Konzept:
gemessen statt behauptet. Jede Aussage über den Bestand nennt die Datei, an der
sie geprüft wurde. Offene Aufgaben stehen NICHT hier, sondern in
`docs/OPEN-ITEMS.md` — hier stehen Produktbild, Mechanik und die Entscheidungen,
die vor dem ersten Commit fallen müssen.

---

## 1 — Produktbild

### Was es ist

Ein **1:1-Nachrichtenweg zwischen zwei Mitgliedern derselben Community**. Eine
Konversation, darin eine flache Liste von Nachrichten, gelesen/ungelesen,
live nachlaufend. Mehr nicht.

Der Katalog aus `DISCUSSIONS-KONZEPT.md` § 3.6 nennt private Nachrichten als
**TL1-Grundrecht** („Basic: private Nachrichten, Melden, Wiki, mehrere
Bilder/Links je Beitrag"). Das ist keine Randnotiz: `packages/core/shared/
trustLevel.ts` trägt heute in `TRUST_LEVEL_CAPABILITIES` bei Stufe 1 und 2 leere
Listen, und der Kommentar darüber nennt den Grund beim Namen — „ihre
Katalog-Rechte (private Nachrichten, Einladungen durch Mitglieder, mehr
Tages-Likes) hängen an Funktionen, die es hier noch gar nicht gibt. … Kommen die
Funktionen, kommen ihre Zeilen hierher." Dieses Konzept füllt genau diese eine
Zeile.

### Was es NICHT ist

- **Kein Gruppen-Chat.** Gruppen-PN ist im Katalog ein **TL2**-Recht und bleibt
  Ausbaustufe (§ 7). Begründung in § 8, Entscheidung 6.
- **Kein Messenger.** Keine Anhänge, keine Sprachnachrichten, keine
  Lesebestätigung („gesehen um 14:03"), keine Nachrichten-Bearbeitung. Anhänge
  sind ausdrücklich ausgesetzt, bis es dafür ein eigenes Sicherheitskonzept gibt
  — dieselbe Begründung, mit der David Onebox abgelehnt hat (SSRF, Teil 4).
- **Kein Kanal über Community-Grenzen hinweg.** Warum, steht in § 3.
- **Kein E-Mail-Ersatz.** Es gibt Versand, aber keinen Mail-EINGANG — die
  Katalog-Zeile „First Reply By Email" bleibt so unerfüllt wie bisher.
- **Kein zweiter Melde-Weg.** Gemeldet wird über `moderation`, wie überall sonst.

### Einstieg und Ort

Gemessen am Bestand:

- **Die Glocke** hängt an `pukalani.chrome.utilities`
  (`packages/core/shared/types/chrome.ts`), gerendert vom blueprint-Layout;
  `pukalani.chrome.accountBell` (Core-Default aus) hängt sie zusätzlich in die
  Dashboard-Shell. Sie ist die richtige Stelle für „du hast eine neue
  Nachricht" — und die falsche für den Posteingang selbst: eine Glocke ist eine
  Liste von Ereignissen, keine Ablage.
- **Die Dashboard-Nav** ist eine Registry (`pukalani.admin.modules`,
  Beispiel: `packages/posts/app/app.config.ts` — drei Einträge auf dasselbe
  Produkt, je eine `requiredCapability`). Dort gehört der Posteingang hin:
  `/dashboard/messages`, Gruppe wie die übrigen Produkte, sichtbar ab TL1.
- **Der Einstieg in ein Gespräch** ist das **Profil bzw. der Autorenname** —
  „Nachricht schreiben" neben dem Namen, nicht als eigener Menüpunkt. Davids
  Regel aus dem Discussions-Einstieg gilt unverändert: geteilt wird der
  MECHANISMUS, nie der Einstieg. Die Kernhandlung („dieser Person schreiben")
  beginnt dort, wo die Person steht.
- **Zwei Einstiege, ein Ziel.** Aus der Glocke springt man in dieselbe
  Posteingangs-Seite mit vorgewählter Konversation; einen zweiten Lese-Ort gibt
  es nicht.

Die Oberfläche selbst steht in § 5.

---

## 2 — Die Missbrauchsfläche zuerst

Dieser Abschnitt ist der Grund, warum es das Dokument gibt. Er steht vor dem
Datenmodell, weil die Schutzmechanik das Datenmodell mitbestimmt und nicht
umgekehrt.

### 2.1 Melden — über den bestehenden Vertrag, nicht daneben

Der Melde-Weg existiert und ist domänen-agnostisch gebaut:

- `packages/moderation/shared/types/report.ts` — eine `reports`-Row ist
  `reporterId` + `targetType` + `targetId` + `reason`/`note` + `status`
  + `communityId`. Der Kommentar sagt ausdrücklich: „Die Konsequenz (Hide/Block)
  gehört NICHT hierher (Layer-Grenze A14)."
- `packages/moderation/server/utils/reportTargets.ts` — `registerReportTarget`
  ist eine Registry mit fail-closed-Verhalten: ein nicht registrierter
  `targetType` ergibt **400 `unknown_target`**. Der Kopf der Datei benennt genau
  die Falle, die wir hier vermeiden müssen: „ein `targetType`, den niemand
  moderiert, ist ein VERSPRECHEN INS LEERE."
- `packages/moderation/app/components/ReportButton.vue` — die Melde-UI ist
  bereits generisch und wird wiederverwendet.

**Also:** der messages-Layer registriert `targetType: 'message'` mit einer
Prüfung, die über die Datentür fragt, ob es diese Nachricht im aktuellen
Mandanten gibt — und baut die zugehörige Warteschlange. Beides oder keins.

### 2.2 Die Privatsphäre-Grenze — wie eine Nachricht lesbar wird

**Der Grundsatz: niemand vom Stab liest proaktiv private Nachrichten.** Es gibt
keine Moderations-Ansicht „alle Konversationen dieser Community". Lesbar wird
GENAU die Nachricht, die der Empfänger meldet.

Das ist nicht durch Row-Permissions allein herstellbar, und das gehört
ausgesprochen: die Moderations-Ansichten lesen über die Operator-Klinke der
Datentür (`as: 'operator'`, `packages/core/server/utils/tenantDb.ts`), und die
benutzt den Admin-Client, der Row-Permissions **absichtlich** umgeht — der Kopf
der Datei nennt das so: „hier ist die Prüfung dieser Tür die EINZIGE Grenze,
deshalb ist sie nicht optional." Eine Permission, die den Moderator aussperrt,
wäre für den Admin-Client also gar keine.

Zwei ehrliche Wege, wie die Einsicht entsteht:

**(A) Route-Grenze + eingefrorener Beleg (Empfehlung).**
Die Meldung friert die gemeldete Nachricht ein: der messages-Layer registriert
einen `registerReportEscalationHandler('message', …)` — der Vertrag existiert
(`packages/moderation/server/utils/reportEscalation.ts`) und wird nach JEDER
neuen Meldung mit der aktuellen Zahl offener Meldungen gerufen. Bei der ersten
Meldung schreibt der Handler `reportedBody` (Kopie des Textes) + `reportedAt`
auf die Nachrichten-Zeile. Es gibt genau EINE Moderations-Route, die eine
Nachricht ausliefert, und die liefert nur, was `openReportsForTarget(event,
'message', id)` als offen gemeldet bestätigt.

- *Dafür:* Der Beleg ist unveränderlich — löscht oder ändert der Absender
  danach, bleibt die Meldung belegbar. Die Kopie liegt im messages-Layer, wo
  der GDPR-Contributor sie ohnehin erreicht (§ 6). `reports` bleibt unverändert
  domänen-agnostisch, keine Migration im moderation-Layer.
- *Dagegen:* Der Text steht zweimal in derselben Tabelle. Und die Grenze ist
  eine ROUTE, kein Permission-Wall — wer künftig eine zweite Lese-Route baut,
  kann sie aufweichen, ohne dass etwas rot wird. Netz dagegen: ein
  Beweis-Skript, das gegen die laufende Instanz prüft, dass keine ungemeldete
  Nachricht über eine Moderations-Route herauskommt (Muster:
  `packages/core/scripts/verify-presence-boundary.mjs`).

**(B) Reiner Meldungs-Snapshot in `reports`.**
Der Text reist als Teil der Meldung (neue Spalte im moderation-Layer), die
Nachrichten-Tabelle wird für die Moderation NIE gelesen.

- *Dafür:* die härteste Grenze — es gibt keinen Pfad vom Moderations-Code in die
  Nachrichten-Tabelle, also auch keinen, den man versehentlich öffnet.
- *Dagegen:* `moderation` speichert damit Inhalte fremder Domänen und ist nicht
  mehr domänen-agnostisch (A14). Der Text bekommt eine zweite Löschstelle
  außerhalb des messages-Contributors — genau die Bauart, an der `guest_authors`
  gescheitert ist (nachzulesen im Kopf von
  `packages/comments/server/utils/userDataContributor.ts`: eine Kontaktspur, die
  der GDPR-Vertrag „NICHT erreichen" konnte).

**Empfehlung: (A).** Sie hält die Layer-Grenze, hält den Beleg fest und lässt die
Löschung an einer Stelle.

**Umfang der Einsicht:** in v1 ausschließlich die gemeldete Nachricht, ihr
Zeitstempel und die beiden Beteiligten. **Kein Verlauf, kein Kontext** — auch
nicht „die drei davor". Ein Moderator, der Kontext braucht, fragt den Melder;
was der Melder freiwillig zusätzlich beilegt, gehört in das vorhandene
`note`-Feld der Meldung. Die Alternative („der Melder wählt beim Melden aus,
welche Nachrichten er übergibt") ist ein sinnvoller Ausbau und Entscheidung 2
in § 8.

### 2.3 Blockieren — beidseitig, ohne Auskunft

Eine Sperre wirkt **in beide Richtungen**: hat A B blockiert, kann weder A an B
noch B an A schreiben. Einseitig wäre eine Falle — der Blockierende bekäme sonst
weiter Nachrichten, die niemand liest, und der Blockierte hätte einen Kanal, den
er für Fortsetzungen nutzt.

**Der Blockierte erfährt es nicht.** Der Versuch wird angenommen und läuft ins
Leere? Nein — das wäre eine Lüge gegenüber dem Absender und würde ihn zu
Ersatzkanälen treiben. Er bekommt eine sachliche Ablehnung („Diese Person nimmt
derzeit keine Nachrichten von dir an") ohne Angabe, ob das an einer Sperre, an
einer Einstellung oder an der Vertrauensstufe liegt. Das ist dieselbe Haltung
wie bei M13: die TATSACHE erfährt der Abgewiesene, den GRUND nicht (CLAUDE.md,
`reason: community_suspended`).

Technisch reist der Grund trotzdem als `data: { code: … }` und kommt über den
zentralen Fehler-Handler als `reason` beim Client an
(`packages/core/server/error.ts`) — aber mit EINEM Schlüssel für alle drei
Fälle. Reichweite der Sperre: Entscheidung 3.

### 2.4 Das TL-Gate — wer überhaupt schreiben darf

**Schreiben ab Vertrauensstufe 1.** Das ist Davids Katalog-Zuordnung, und sie ist
der stärkste Spam-Schutz, den es gibt, weil sie nichts erkennen muss: TL1
verlangt laut `packages/posts/shared/trustLevels.ts` (Davids Schwellen
„Mittel", DECISION-LOG 2026-08-04) **2 Tage dabei + 1 eigener Inhalt + 1
vergebenes Upvote**. Ein frisch angelegtes Wegwerf-Konto kann also gar nicht
senden, und ein Spammer muss zwei Tage warten und sichtbar mitmachen —
sichtbar heißt: moderierbar, bevor er den privaten Kanal überhaupt erreicht.

Drei Folgen, die man mitdenken muss:

1. **EMPFANGEN geht ab Stufe 0.** Sonst könnte man niemandem antworten, der
   einen zuerst angeschrieben hat. Antworten in einer bestehenden Konversation
   ebenfalls ab Stufe 0 — wer angeschrieben wurde, darf zurückschreiben.
   Gesperrt ist nur das ERÖFFNEN.
2. **Die Stufe ist community-gebunden.** Sie wird aus `member_counters` gerechnet
   (posts-013/016), und diese Tabelle trägt `communityId`. Wer in Community X
   Stufe 2 hat, ist in Y wieder bei 0. Das ist richtig so und ein weiteres
   Argument für § 3.
3. **Die Capability gehört in `TRUST_LEVEL_CAPABILITIES`, nicht in eine
   `if (trustLevel >= 1)`-Zeile.** Der Kopf von `packages/core/shared/
   trustLevel.ts` verbietet das ausdrücklich. Also: neue Capability
   `messages.write` in `packages/core/shared/types/authz.ts`, Zeile bei Stufe 1
   — und geprüft wird über `requireCommunityPermission` wie jedes andere Recht.
   `trustLevelGrantsCapability` sorgt dafür, dass die Erweiterung an allen
   übrigen Routen nichts kostet.

### 2.5 Rate-Begrenzung

Der Store existiert: `packages/core/server/utils/rateLimitStore.ts` — Redis
(Fixed-Window, `rl:<projekt>:<key>`) mit In-Memory-Rückfall, fail-open. Drei
Budgets, alle je Community:

| Was | Vorschlag | Warum |
|---|---|---|
| Neue Konversationen / Tag | 10 (TL1), 30 (ab TL2) | Der eigentliche Spam-Hebel ist das ERÖFFNEN, nicht das Schreiben. |
| Nachrichten / Minute | 20 | Gegen Flooding in einer bestehenden Konversation. |
| Offene, unbeantwortete Konversationen | 5 | Die schärfste und billigste Bremse: wer fünf Leute angeschrieben hat und von keinem eine Antwort bekam, kann keine sechste eröffnen. Ein Massenversand endet damit nach fünf Empfängern. |

Die dritte Regel braucht keinen neuen Zähler — sie ist eine Abfrage auf die
Konversations-Tabelle (§ 4).

### 2.6 Der Owner-Schalter

Eine Community kann private Nachrichten **abschalten**, und zwar ganz. Das ist
kein Komfort-Schalter, sondern die Antwort auf Davids Satz: ein Owner, der
seiner Community keinen privaten Kanal geben will, muss ihn zumachen können,
ohne das Produkt zu verlassen.

Gemessene Schwierigkeit: **es gibt heute keine Tabelle für Einstellungen JE
COMMUNITY im Laufzeit-Projekt.** `app_config` ist EINE Row pro Projekt
(system-Layer), `communities.*` liegt im Control Plane. Der Schalter braucht
deshalb eine eigene, sehr kleine Zeile im messages-Layer (§ 4) — und der Umgang
mit ihrem Fehlen ist bereits vorgedacht: **Rückfall zur Laufzeit statt
Backfill**, das Muster aus `packages/pages/shared/guidelinesFallback.ts` (keine
Zeile ⇒ Vorgabewert; das erste Speichern legt sie an). Default: Entscheidung 4.

### 2.7 Was die Sperre der Community mit PN macht (M13)

Eine Nachricht ist **Inhalt**. Damit gilt M13 ohne Ausnahme und ohne
Zusatzarbeit: schreibt der messages-Layer durch die Datentür mit
`actor: 'member'`, greift `actorFacesContentLock` und eine wegen Zahlungsverzug
stillgelegte Community kann keine neuen Nachrichten schicken — LESEN bleibt
offen. Das ist Davids Grenze („zu ist jeder INHALT, offen bleiben
Owner-Einstellungen und Moderation") und braucht in diesem Konzept keine eigene
Regel, sondern nur die richtige Klinke.

### 2.8 Abgrenzung nach oben: der Betreiber

`packages/control/shared/abuseReports.ts` zieht die Linie schon: `reports`
(moderation) ist „die Meldung EINES BEITRAGS an die Moderatoren DERSELBEN
Community — von innen nach innen", `abuse_reports` (Control Plane) ist eine
Meldung über eine ganze Community an den Betreiber. PN-Belästigung ist der
Normalfall der ersten Sorte. Wiederholte Belästigung ÜBER Communities hinweg ist
die zweite und braucht hier nichts Neues — das öffentliche Formular existiert.

---

## 3 — Wo die Daten leben

Die Architektur-Kernfrage. Zwei Wege, gemessen an den bestehenden Invarianten.

### (a) Je Community — Nachrichten sind Inhalt eines Mandanten

Konversation und Nachricht tragen `communityId`, laufen durch `tenantDb`, sind
Gegenstand der Moderation DIESER Community.

| Invariante | Verhalten |
|---|---|
| **Datentür** | Passt ohne Ausnahme. `list/find/count` scopen, `create` stempelt, `get/update/remove` belegen die Zugehörigkeit. Der ESLint-Backstop (`no-restricted-syntax` auf rohes `.tablesDB` in `server/api/**` gepoolter Layer) greift, sobald der neue Layer in der Liste steht. |
| **A5** | Kein Sonderfall — siehe unten. |
| **C15** | `notify(..., { scope: 'tenant' })` mit der communityId. Die Meldung erscheint in der Glocke DER Community, in der das Gespräch läuft. |
| **C18** | Berührt nichts: die Zeilen sind weder `members` noch `public`, sondern haben ein Publikum von genau zwei Personen (§ 4). |
| **M13** | Greift automatisch (§ 2.7). |
| **TL-Gate** | Funktioniert, weil `member_counters` community-gebunden ist. |
| **D5 (Mail-Links)** | Funktioniert, weil der Ablage-Wert den Host bestimmt. |

Preis: wer in drei Communities Mitglied ist, hat drei Posteingänge. Dieselbe
Person ist dort dreimal erreichbar, und eine Sperre in der einen gilt in der
anderen nicht (Entscheidung 3).

### (b) Kontoweit — ein Posteingang über Communities hinweg

Klingt nach dem besseren Produkt und ist an vier Stellen nachweislich unbaubar,
ohne bestehende Regeln aufzuweichen:

1. **Es gäbe keinen Mandanten.** Die Datentür kann „mandantenlos" nicht
   ausdrücken; jede Zeile bekäme `communityId: ''`. Genau dieser Wert ist bei
   `notifications` als **fail-open** dokumentiert (C15) und dort eine bewusste
   Übergangs-Ausnahme, kein Muster.
2. **Es gäbe keine zuständige Moderation.** Wessen Moderatoren bearbeiten eine
   Meldung in einem Gespräch, das zu keiner Community gehört? Der Betreiber —
   und damit wäre jede zwischenmenschliche Reibung im Pool ein Ticket bei
   David.
3. **Das TL-Gate verlöre seinen Sinn.** Stufen sind community-gebunden; ohne
   Community gäbe es keine Schwelle und damit keinen Spam-Schutz.
4. **Es gäbe keinen Ort.** Kontobezogene Meldungen leben laut C17 dort, wo die
   Glocke hängt — heute ausschließlich `apps/control` (`chrome.accountBell`).
   `my.pukalani.app` ist Kontroll-Host der Platform-App, und dort lässt
   `01.control-center.ts` nur die Präfixe aus `pukalani.tenancy.controlApiPrefixes`
   durch; alles andere ist 404. Ein kontoweiter Posteingang bräuchte also eine
   neue Zulassung auf einem Host, auf dem per Definition nichts gescopt ist.

**Empfehlung: (a).** Deutlich. (b) ist kein größerer Bau, sondern ein anderes
Produkt — es müsste im Control Plane leben, mit Betreiber-Moderation und ohne
Vertrauensstufen.

### Ist eine PN ein „Beitritt durch Mitschreiben"? — Nein.

A5 kennt zwei Auslöser: `registration` (Kontoanlage auf dem Mandanten-Host) und
`contribution` (der erste eigene Schreibvorgang, abgefangen in `tenantDb().create`,
Türklinke `member`). Eine PN darf **kein** dritter sein, und zwar aus einem
Sicherheitsgrund, nicht aus Geschmack:

> Ein Label ist ein LESE-PUBLIKUM. Würde eine private Nachricht den Beitritt
> auslösen, könnte sich ein Fremder durch das Anschreiben eines einzigen
> Mitglieds selbst das `Role.label(<communityId>)` verschaffen — und damit den
> Lesezugriff auf ALLE mitglieder-internen Inhalte einer geschlossenen
> Community. Eine private Nachricht wäre der Schlüssel zur Haustür.

Sauber wird das über `actor`, ohne neue Begriffe:

- Die PN-Route schreibt mit `as: 'operator'` (die Tabelle trägt bewusst keine
  User-Schreibrechte — dasselbe Muster wie `poll_votes`, `event_rsvps`,
  `enrollments`) und **`actor: 'member'`**.
- `actorJoinsByWriting('member')` ist `true`, der Beitritts-Auslöser feuert also
  — und ist **strukturell ein No-op**, weil `messages.write` an TL1 hängt und
  TL1 laut `trustLevels.ts` bereits 2 Tage Mitgliedschaft und einen eigenen
  Inhalt voraussetzt. Wer senden darf, IST längst Mitglied.
- Damit das eine Tatsache bleibt und keine Hoffnung: ein Test nagelt fest, dass
  `messages.write` niemals bei Stufe 0 steht. Sollte David PN je ab Stufe 0
  öffnen (Entscheidung 4 könnte das nahelegen), ist die A5-Frage neu zu
  entscheiden — dann braucht es einen vierten `actor`-Wert oder eine Ausnahme
  an der Tür, und beides ist eine eigene Entscheidung.

`actor: 'guest'` wäre der falsche Ausweg: der Wert heißt „hat kein Konto"
(`tenantDb.ts`), und ein PN-Absender hat eines. Die Klinke soll nicht lügen.

---

## 4 — Datenmodell-Skizze

### Der Layer

Ein eigener Produkt-Layer `packages/messages` mit `product.manifest.ts` in der
Form von `packages/posts/product.manifest.ts`:

- `key: 'messages'`, `tier: 'optional'`
- `requires: ['moderation', 'posts']` — `moderation` wegen des Melde-Wegs,
  `posts` weil dort `member_counters` und die Vertrauensstufe leben (posts-013,
  posts-016). Ohne posts gibt es keine Stufe, ohne Stufe kein TL1, ohne TL1
  keinen Absender. Das ist eine echte Abhängigkeit, keine Höflichkeit.
- `hasMigrations: true`, `apiPrefixes: ['/api/messages']`
- Eintragung in `pnpm check:manifests`, in `scripts/migrate.mjs` (LAYER_ORDER)
  und in die ESLint-Liste der gepoolten Layer.
- Der Layer besitzt **kein** `blueprint`-Wissen; die Komposition (Menüpunkt,
  „Nachricht schreiben" am Autorennamen) gehört nach A14 in `blueprint`.

### Die Tabellen

**`conversations`** — eine Zeile je Personenpaar je Community.

- `communityId` (Datentür), `participantA`, `participantB` (sortiert, damit das
  Paar eindeutig ist), `lastMessageAt`, `lastMessagePreview`,
  `unreadA`/`unreadB`, `closedBy` (wer den Verlauf für sich entfernt hat).
- Unique-Index `(communityId, participantA, participantB)` — Pool-Regel: der
  Schlüssel ist tenant-RELATIV, also gehört `communityId` hinein (Muster
  `comments-015 uq_tenant_host`, `pages-004`).
- Die Zähler `unreadA/unreadB` werden **mitgeschrieben**, nicht beim Hinsehen
  gerechnet — dieselbe Umstellung, die F1 Teilpaket 1 für die Beitrags- und
  Kommentarzähler gebracht hat. Ein Posteingang, der beim Öffnen zählt, ist ein
  N+1 über alle Konversationen.

**`messages`** — eine Zeile je Nachricht.

- `communityId`, `conversationId`, `authorId`, `body`, `readAt`,
  plus die Beleg-Felder aus § 2.2 (`reportedBody`, `reportedAt`).
- Index `(communityId, conversationId, $createdAt)`.
- `body` als MEDIUMTEXT über `createMediumtextColumn` — Varchar hat ein
  16.381-Zeichen-Limit und ein Zeilenbudget, an dem der pages-Layer schon
  einmal hängengeblieben ist.

**`message_blocks`** — eine Zeile je Sperre.
`communityId`, `blockerId`, `blockedId`, Unique-Index über alle drei. Die
Prüfung fragt beide Richtungen in EINER Abfrage.

**`message_settings`** — eine Zeile je Community, nur der Owner-Schalter (§ 2.6)
und später weitere Community-Vorgaben. Fehlt die Zeile, gilt der Vorgabewert
(Rückfall-Muster `guidelinesFallback.ts`).

Alle vier Tabellen tragen `communityId` und werden ausschließlich über
`tenantDb(event)` angefasst. `communityId` steht **nicht** im TypeScript-Typ —
dieselbe bewusste Auslassung wie in `packages/posts/shared/types/post.ts`
(„gehört der Datentür").

### Row-Permissions: nur die zwei Beteiligten

`packages/core/server/utils/tenantRowPermissions.ts` kennt drei Publikums-Werte
(`members`, `public`, `moderators`) — **keiner passt.** Ein Mitglieder-Read wäre
hier das Gegenteil des Produkts. Genutzt wird deshalb der ausdrücklich
vorgesehene Sonderweg `TenantCreateOptions.permissions` („Vollständig eigene
Permissions … NUR für Sonderfälle"):

```
read(user:A) · read(user:B)      — mehr nicht
```

Kein `update`, kein `delete` für die Nutzer (Bearbeiten gibt es nicht, Löschen
läuft über die Route). **Kein Moderations-Label** — das ist die
Permission-Seite von § 2.2: die Moderation kommt nicht über die Zeile an den
Inhalt, sondern über genau eine Route, die eine offene Meldung verlangt.

### Realtime

`useRealtimeRows` auf `messages`, gefiltert auf die geöffnete
`conversationId` — derselbe geteilte, JWT-authentifizierte Socket wie überall
(`useRealtimeClient.ts`). Die Row-Permissions sind hier die Sicherung: der
Socket liefert nur, was der Benutzer lesen darf; der `where`-Filter bleibt
Netz. Das Gate `pukalani.realtime.enabled` (`core/shared/realtimeGate.ts`) gilt
unverändert — in `marketing`/`help` gibt es weder Realtime noch PN.

### Tippt gerade — und ein Leck, das man nicht übersehen darf

Die Presence-Bausteine sind da: EINE Presence je Nutzer, `metadata` trägt
`scope`, `typing`, `replyingTo`, `near`; `useThreadPresence` (comments) ist das
Vorbild, `usePresenceState` bleibt die einzige Heartbeat-Autorität.

**Aber:** Presence-Zeilen sind seit A4/2026-07-29 mit
`read("label:<communityId>")` versehen (`core/shared/presencePermissions.ts`) —
**jedes Mitglied der Community kann jede Presence lesen.** Setzt man den Scope
naiv auf `dm:<conversationId>`, sehen zwei gleichzeitig gesetzte, identische
Scope-Werte für Dritte so aus: „A und B reden gerade miteinander." Das ist eine
Metadaten-Preisgabe, die das Produkt an anderer Stelle sorgfältig vermeidet.

Milderung, billig und ehrlich benannt: der Scope trägt zusätzlich den
EMPFÄNGER (`dm:<conversationId>:<empfängerId>`). Damit sind die Werte der beiden
Seiten verschieden, und wer korrelieren will, muss Konversations-Id UND
Gegenüber schon kennen. Das ist eine Hürde, keine Wand — wem das nicht reicht,
lässt „tippt gerade" in v1 weg. Ich empfehle die Milderung und halte die
Einschränkung im Kopf der Datei fest.

### Benachrichtigung

Neuer Typ `message.received` über `notify()`:

- `scope: 'tenant'` — die Ablage ist die Community (C15). Ein `_account`-Stempel
  wäre falsch: die Nachricht betrifft nicht den Vertrag.
- `senderId` gesetzt, damit die GDPR-Löschung sie findet (system-Contributor
  löscht per `senderId`).
- **Zusammenfassen statt fluten:** je Konversation eine Benachrichtigung,
  solange die vorige ungelesen ist. Der Idempotenz-Schlüssel `rowId` kann das
  (409 ⇒ keine Zeile UND keine Mail) — Schlüssel aus `conversationId` +
  `recipientId` + einer Zählmarke, die beim Lesen weiterrückt.
- **Ein Zweig in `messageKey()` + de/en-Texte ist Pflicht**, sonst fällt die
  Glocke still auf 'replied' zurück; das Netz dafür ist
  `packages/core/tests/notificationBellTexts.test.ts`.
- Mail-Links über `core/shared/notificationLinks.ts` — der Community-Host, nicht
  `public.appUrl` (D5).

**Die Mail trägt den Nachrichtentext NICHT.** Sie sagt, wer geschrieben hat, und
verlinkt. Begründung: das Postfach ist ein dritter Ort, an dem der Inhalt landet,
und dieser Ort ist nicht der, den der Absender gewählt hat. Wer den Text will,
klickt. (David kann das überstimmen; ich halte es für die falsche Bequemlichkeit.)

---

## 5 — Die Oberfläche

Davids Vorgabe: die PN-Oberfläche baut auf dem **Inbox-Muster des offiziellen
Nuxt-UI-Dashboard-Templates** auf (Demo `dashboard-template.nuxt.dev/inbox`,
Code `github.com/nuxt-ui-templates/dashboard`, MIT).

### Was das Template konkret komponiert (nachgesehen, nicht behauptet)

- **`app/pages/inbox.vue`** — ein `UDashboardPanel` (`id="inbox-1"`,
  `:default-size="25"`, `:min-size="20"`, `:max-size="30"`, `resizable`) als
  Listen-Spalte, darin eine `UDashboardNavbar` mit
  `UDashboardSidebarCollapse` (`#leading`), einem `UBadge` mit der Anzahl
  (`#trailing`) und `UTabs` „All/Unread" (`#right`). Darunter `<InboxList
  v-model="selectedMail">`. Rechts daneben `<InboxMail>`, sonst ein
  Platzhalter-`UIcon`. Für Schmalgeräte wird derselbe `InboxMail` in einem
  `USlideover` gerendert, umschaltet über `useBreakpoints(breakpointsTailwind)
  .smaller('lg')`, gekapselt in `ClientOnly`.
- **`app/components/inbox/InboxList.vue`** — scrollende Liste
  (`overflow-y-auto divide-y`), Zeile = Absender + Zeit + Betreff + einzeilige
  Vorschau, `UChip` als Ungelesen-Punkt, ausgewählter Eintrag über eine farbige
  linke Kante. Tastatur über `defineShortcuts` (`arrowup`/`arrowdown`) plus
  `scrollIntoView`.
- **`app/components/inbox/InboxMail.vue`** — ein ZWEITES `UDashboardPanel`
  (`id="inbox-2"`) mit eigener `UDashboardNavbar` (Schließen, Archivieren,
  Antworten, `UDropdownMenu`), einer Kopfzeile mit `UAvatar` + Name + Adresse
  + Datum, dem Fließtext und unten einer `UCard` mit `UTextarea` und
  Senden-Knopf.

Das passt in unsere Welt, weil unsere Dashboard-Shell dieselbe ist: 
`packages/admin/app/layouts/dashboard.vue` ist ausweislich seines eigenen
Kommentars „nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates"
(`UDashboardGroup`, Seiten rendern als `UDashboardPanel` im `<slot/>`), und
39 Dateien in `packages/*/app` und `apps/*/app` benutzen `UDashboardPanel`
bereits (nachgezählt am 2026-08-04).
Die Zwei-Panel-Anordnung ist also kein Fremdkörper, sondern die vorhandene
Bauart.

**Eine Abweichung ist gesetzt:** die Schreibfläche ist NICHT die `UTextarea` des
Templates, sondern unser Muster aus `packages/posts/app/components/
PostBodyField.vue` — `UTextarea` bis zum ersten Fokus, danach nachgeladener
`UEditor` (`LazyPostBodyEditor`). Das ist Davids Editor-Vorgabe (CLAUDE.md:
UEditor-Bausteine sind gesetzt, nichts selbst bauen) und spart in einer Liste
mit vielen Konversationen genau das, wofür das Lazy-Muster gebaut wurde.

### Was das Template NICHT mitbringt

Damit die Schätzung in § 9 nicht durch „die Oberfläche ist ja fertig" verzerrt
wird — das Template ist eine **Attrappe mit Beispieldaten**:

- **Kein Backend.** `useFetch<Mail[]>('/api/mails')` liefert Beispieldaten; das
  Antwort-Formular ist ein `setTimeout` mit Toast. Kein Senden, kein Speichern,
  keine Fehlerbehandlung.
- **Kein Zustand.** `mail.unread` ist ein Feld in den Beispieldaten. Gelesen/
  ungelesen, Zähler, Zusammenfassen, Paginierung: alles unsere Arbeit.
- **Kein Melden, kein Blockieren, kein TL-Gate** — die drei Dinge, wegen derer
  dieses Konzept existiert. Der Kopf des Lesebereichs bekommt bei uns zwei
  weitere Einträge im `UDropdownMenu`, und beide hängen an echten Routen.
- **Kein Realtime, keine Presence.** Die Liste aktualisiert sich nicht.
- **Kein Mandanten-Scoping, keine Berechtigungen, keine i18n.** Alle Texte sind
  englische Literale; bei uns geht jeder davon durch de+en (und **ohne spitze
  Klammern** in den Locale-Messages — die Falle vom 2026-08-04).
- **Anhang-Knopf ohne Funktion.** Er sieht aus wie ein Versprechen. Er wird beim
  Bau entfernt, solange Anhänge nicht gebaut sind (§ 1).
- **Archivieren/Markieren** sind Dekoration ohne Ziel.

Ehrliche Bilanz: das Template spart die **Anordnung** und den Feinschliff der
Liste (Tastatur, Slideover, Größenverhältnisse) — schätzungsweise ein bis zwei
Tage. Es spart nichts an Server, Rechten, Moderation, Realtime und Tests, und
das ist der weit größere Teil.

---

## 6 — DSGVO: eine Nachricht gehört zwei Menschen

Der Vertrag existiert: `registerUserDataContributor` (`packages/core/server/
utils/userData.ts`), Produkt-Layer melden Export UND Löschung ihrer Daten an,
core orchestriert (`deleteUserCompletely`: Snapshot → Sperren → Contributors →
`users.delete` nur bei Voll-Erfolg). Der messages-Layer **muss** einen
registrieren; CLAUDE.md sagt das für jeden neuen Layer mit User-Daten.

### Export — was bekommt wer

Zwei Wege:

- **(A) Nur die eigenen Nachrichten.** Sauber zuordenbar, aber unlesbar: ein
  halber Dialog ohne die Fragen, auf die er antwortet.
- **(B) Der vollständige Verlauf aller Konversationen, an denen die Person
  beteiligt ist**, mit dem Gegenüber reduziert auf Anzeigename und User-Id
  (Empfehlung).

**Empfehlung: (B)**, mit einer Leitplanke, die die Abwägung trägt: *exportiert
wird, was die Person im Produkt ohnehin sehen kann.* Ein eingehender Text ist
auch ihr Datum — er ist an sie gerichtet — und ein Export, der ihn weglässt,
erfüllt Art. 15 eher formal als tatsächlich. Nicht exportiert werden Daten des
Gegenübers, die im Produkt nicht sichtbar sind (E-Mail-Adresse, Vertrauensstufe,
Zähler). Das ist dieselbe Linie, die bei der redigierten Team-Liste der
About-Seite gezogen wurde (Name + Avatar, E-Mail leer).

### Konto-Löschung — Urheber-Tilgung vs. Gesprächserhalt

Der Bestand kennt beide Haltungen und begründet sie: `comments` macht aus einem
Kommentar einen **Tombstone** (Inhalt geleert, `status: 'deleted'`), weil ein
Hard-Delete „Threads zerreißen" würde und „die Antworten ANDERER User deren
Daten sind"; Votes werden **hart gelöscht**
(`packages/comments/server/utils/userDataContributor.ts`).

Für PN gilt das erste Argument **nicht**: eine Konversation ist eine flache
Liste, keine Baumstruktur. Es gibt nichts, was zerreißt.

- **(A) Tombstone wie bei Kommentaren.** Der Verlauf bleibt vollständig, die
  Beiträge der gelöschten Person werden zu „[gelöscht]". *Dagegen:* der Verlauf
  wird zur Reihe von Löchern und der Löschende hinterlässt eine dauerhafte
  Spur seiner Gesprächsführung.
- **(B) Eigene Nachrichten hart löschen, Nachrichten des Gegenübers bleiben;
  die Konversation trägt sichtbar „Dieses Konto wurde gelöscht" und verschwindet,
  sobald keine Nachricht mehr darin steht** (Empfehlung).
- **(C) Ganze Konversationen löschen.** Abgelehnt: das löscht die Texte des
  Gegenübers — dessen Daten, dessen Erinnerung, ohne dessen Zutun.

**Empfehlung: (B).** Das Löschrecht der einen Person wiegt hier schwerer als die
Vollständigkeit eines privaten Verlaufs, und anders als im öffentlichen Thread
verliert niemand Drittes Kontext.

**Zwei Ausnahmen, die stehen bleiben müssen:**

1. **Ein eingefrorener Beleg zu einer OFFENEN Meldung** (§ 2.2) überlebt die
   Löschung befristet. Begründung analog zu Davids Entscheidung vom 2026-08-02
   (`abuse_reports.reporterEmail`): der Beleg ist die Grundlage einer womöglich
   verhängten Sperre, und Art. 17 Abs. 3 nimmt die Geltendmachung von
   Rechtsansprüchen vom Löschrecht aus. **90 Tage ab der Meldung**, gleicher
   Anker und gleiche Bauart wie `packages/control/server/utils/
   abuseReportPrune.ts` (Mitfahrer in einem bestehenden Sweep, kein eigener
   Dienst).
2. **Der Contributor muss idempotent sein** — der Vertrag verlangt es
   ausdrücklich: ein Re-Run nach Teilfehler findet Restdaten oder nichts.

---

## 7 — Stufenplan

Jede Stufe für sich lauffähig. **Melden, Blockieren und das TL-Gate sind in
Stufe 1** — nicht, weil sie klein sind, sondern weil sie sich nicht nachrüsten
lassen: ein Kanal, der drei Wochen ohne Melde-Weg lief, hat drei Wochen
Vorgänge, für die es keinen gibt.

**Stufe 1 — der Kanal, vollständig geschützt**
Layer + Manifest · vier Tabellen + Migrationen (Index-Anlage NUR über
`createIndexSteps`) · Konversation eröffnen/lesen/antworten · gelesen/ungelesen
mitgeschrieben · Row-Permissions auf zwei Personen · Realtime ·
`messages.write` an TL1 · Melden über `registerReportTarget('message', …)` +
Beleg über den Eskalations-Handler + Moderations-Route + Warteschlange ·
Blockieren beidseitig · drei Rate-Budgets · Owner-Schalter mit Laufzeit-Rückfall ·
`notify()`-Typ + Glocken-Texte de/en · GDPR-Contributor · Posteingang nach dem
Inbox-Muster · Produkt-Gate.

**Stufe 2 — Betrieb**
„Tippt gerade" über die Presence (mit der Milderung aus § 4) · Suche im
Posteingang · Konversation für sich entfernen · Aufbewahrungs-Sweep, falls
Entscheidung 5 eine Frist ergibt · Digest-Integration.

**Stufe 3 — Gruppen (TL2)**
Erst nach Entscheidung 6. Was daran NEU ist und nicht bloß „ein Teilnehmer
mehr": Permissions je Zeile wachsen mit der Teilnehmerzahl, Hinzufügen und
Verlassen mitten im Verlauf, „wer darf wen hinzufügen", und eine Meldung in
einer Gruppe hat mehrere Unbeteiligte, deren Texte trotzdem im Verlauf stehen —
die Einsicht-Regel aus § 2.2 muss dafür neu gedacht werden.

**Dauerhaft draußen, bis es ein eigenes Konzept gibt**
Anhänge (Datei-Upload in einen privaten Kanal ist eine eigene
Sicherheitsfläche: Typprüfung, Magic Bytes, Speicherquote, Schadsoftware,
Weiterverbreitung) · Mail-EINGANG · Lesebestätigung.

---

## 8 — Die Entscheidungen, die David treffen muss — ALLE GEFALLEN (2026-08-04)

**David hat alle sieben Empfehlungen angenommen** (strukturierte Fragen,
gleicher Tag; auch im DECISION-LOG): 1. je Community · 2. nur die gemeldete
Nachricht (Snapshot) · 3. Sperre je Community + Häkchen „überall" ·
4. Owner-Schalter Default AUS · 5. unbegrenzt + selbst entfernbar ·
6. Datenmodell n:m-fähig, Bau v1 nur 1:1 · 7. ab Personal, wie posts.
Das Konzept ist damit **entscheidungskomplett**; offen ist nur das Bau-Go.
Die Begründungen und Preise stehen unverändert darunter.

Sieben. Empfehlung jeweils zuerst, dann der ehrliche Preis.

**1 — Wo leben die Daten?**
*Empfehlung: (a) je Community.* Passt lückenlos zu Datentür, A5, C15, C18, M13
und zum community-gebundenen TL-Gate. — *(b) kontoweit* wäre das schönere
Produkt, hat aber keinen Mandanten (fail-open-Stempel), keine zuständige
Moderation (jede Reibung landet beim Betreiber), kein wirksames TL-Gate und
keinen Host, auf dem es leben könnte (§ 3). Preis von (a): mehrere Posteingänge
für Mehrfach-Mitglieder.

**2 — Was macht eine Meldung sichtbar?**
*Empfehlung: nur die gemeldete Nachricht, eingefroren im Moment der Meldung.*
Kleinstmögliche Preisgabe, belegsicher, eine Löschstelle. — *Alternative:* der
Melder wählt beim Melden bis zu N weitere Nachrichten als Kontext aus. Das ist
menschlich besser (eine einzelne Zeile aus einem Belästigungsverlauf wirkt oft
harmlos) und kostet eine Auswahl-Oberfläche plus eine zweite Beleg-Form. —
*Abgelehnt:* der ganze Verlauf. Das wäre die Moderations-Einsicht in ein
Privatgespräch, die dieses Konzept ausschließt.

**3 — Wie weit reicht eine Sperre?**
*Empfehlung: je Community* (folgt dem Daten-Scope, indizierbar, moderations-nah)
— **mit einem Häkchen im Sperr-Dialog „auch in meinen anderen Communities
sperren", das dort mehrere Zeilen schreibt.** — *Alternative:* kontoweit in den
Appwrite-Account-`prefs`; für den Menschen überraschungsfrei, aber außerhalb der
Datentür, ohne Index und ohne Nachvollziehbarkeit. Das ist meine schwächste
Empfehlung: das Argument „ich habe diesen Menschen doch blockiert" ist stark.

**4 — Ist der Owner-Schalter ab Werk an oder aus?**
*Empfehlung: aus.* Der Owner öffnet den privaten Kanal bewusst — das ist die
Umsetzung von Davids eigener Warnung, und es entspricht der Projektregel
„Core-Default ist IMMER aus" (die eine dokumentierte Ausnahme, `realtime`, war
bestehendes Verhalten, hier ist nichts bestehend). — *Preis:* Communities
entdecken das Produkt nicht von selbst; es braucht einen sichtbaren Hinweis im
Dashboard. — *Alternative „an":* sofort nutzbar, aber jede bestehende Community
bekommt beim Deploy einen neuen Kanal, ohne dass jemand zugestimmt hat.

**5 — Wie lange bleiben Nachrichten liegen?**
*Empfehlung: unbegrenzt, dafür selbst entfernbar* (jede Seite kann ihre
Konversation für sich schließen; gelöscht wird sie, wenn beide es getan haben).
Ein Gespräch, das nach 90 Tagen verschwindet, ist für den Menschen ein
Datenverlust, nicht ein Datenschutzgewinn — und Belegpflichten gibt es hier
keine. — *Alternative:* Betreiber-Frist (z. B. 24 Monate) über einen Sweep;
begrenzt das Datenwachstum und die Menge, die bei einem Einbruch offenläge.
Beides ist billig zu bauen, aber nur eines ist rückholbar.

**6 — Wann kommen Gruppen-Nachrichten?**
*Empfehlung: nicht in v1.* Der Katalog gibt sie TL2, und TL2 bleibt damit
weiterhin „sichtbarer Status" — genau wie heute. Gruppen sind kein Aufsatz,
sondern ein eigenes Moderations-Problem (§ 7). — *Alternative:* zusammen mit
Stufe 1 bauen, dann ist das Datenmodell von Anfang an n:m (Teilnehmer-Tabelle
statt zweier Spalten) und man spart eine spätere Migration. Wer das will,
entscheidet es JETZT, weil es das Modell aus § 4 ändert.

**7 — Welcher Tarif?**
*Empfehlung: derselbe wie `posts`, also ab **Personal*** (`pukalani.tenancy.
products` + `requirePlanProduct` an `/api/messages`, 404 wie eine Datentür).
Begründung ist keine Preisstrategie, sondern Abhängigkeit: ohne den
posts-Layer gibt es keine `member_counters`, ohne Zähler keine Vertrauensstufe,
ohne Stufe keinen Absender. Ein PN-Produkt in einem Basic-Tarif ohne posts wäre
ein Menüpunkt, den niemand benutzen kann. — *Alternative:* eigener Produkt-Key
ab Pro, wenn PN als Verkaufsargument gedacht ist; dann muss die Abhängigkeit im
Manifest trotzdem stehen.

---

## 9 — Ehrliche Aufwandsschätzung

Gerechnet in Arbeitstagen bei ununterbrochener Arbeit an genau dieser Sache,
inklusive Tests, Beweis-Skript und de/en-Texten — die Erfahrung aus den
Discussions-Stufen sagt, dass diese drei zusammen etwa ein Drittel ausmachen.

| Stufe | Aufwand | Wovon der Löwenanteil |
|---|---|---|
| **1 — Kanal + voller Schutz** | **6–9 Tage** | Server (Routen, Datentür, Permissions, Rate-Budgets, Blockieren): 2–3 · Melden inkl. Beleg, Moderations-Route und Warteschlange: 1,5–2 · Oberfläche nach Inbox-Muster inkl. Editor-Fläche: 1,5–2 · Migrationen + Manifest + Gates: 0,5 · Benachrichtigung + Texte + GDPR-Contributor: 1 · Tests/Beweis: 1 |
| **2 — Betrieb** | **2–3 Tage** | Presence-Tippen mit Milderung, Suche, Konversation entfernen, ggf. Sweep |
| **3 — Gruppen** | **5+ Tage** | n:m-Modell, Teilnehmerwechsel, neue Einsicht-Regel für Meldungen in Gruppen |
| **Anhänge** | nicht geschätzt | braucht zuerst ein eigenes Sicherheitskonzept |

Zwei Posten, die erfahrungsgemäß unterschätzt werden und deshalb hier stehen:
die **Migrationen** (vier Tabellen, Indizes nur über die Fabrik aus
`scripts/migrations-lib/indexRetry.mts`, und der `system`-Layer-Lauf auf jeder
Instanz mit anschließendem `pnpm ops:schema-parity`) und der **Beweis, dass
keine ungemeldete Nachricht über eine Moderations-Route herauskommt** — das ist
die eine Zusage dieses Konzepts, die man nicht durch Lesen des Codes belegen
kann, sondern nur durch einen Lauf gegen eine echte Instanz.

# Dashboard-Audit 2026-07-28

Vollständiger Audit des **Kunden-Dashboards** (`/dashboard/**`) in zwei
Durchgängen — Funktion/Sicherheit und UI/UX. Umfang: 38 Dashboard-Seiten,
26 Nav-Einträge, ~150 zugehörige `server/api`-Routen in 13 Layern.
`packages/control` (Betreiber-Oberfläche) war bewusst außen vor.

**Wie zu lesen:** Jeder Befund hat einen Prüfvermerk. **[verifiziert]** = ich
habe die zitierten Zeilen selbst gelesen und die Kette nachvollzogen.
**[gemeldet]** = plausibel, aber von mir nicht einzeln nachgeprüft.
Erfahrung aus den letzten Audits: Agenten melden gelegentlich Befunde, die
bei genauem Hinsehen keine sind — der Vermerk sagt, worauf du dich stützen
kannst.

---

## Teil 1 — Sicherheit und Funktion

### 🔴 B1 — Presence gibt im Pool die Online-Identitäten ALLER Mandanten heraus [verifiziert]

Im Pool teilen sich alle Kunden-Communities ein Appwrite-Projekt. Presences
tragen kein Mandanten-Merkmal:

- `packages/core/server/api/presence/heartbeat.post.ts:26-36` schreibt
  `userName/avatarUrl/scope/action/typing/page/…` — **kein tenantId**
- `packages/core/server/utils/presence.ts` listet projektweit, kein Prädikat
- `packages/core/server/api/presence/count.get.ts` hat **gar keinen Guard**,
  und bei `scope=global` entfällt auch der scope-Filter

`GET /api/presence/count?scope=global` auf `kunde-a.pukalani.app` liefert
einem eingeloggten Mitglied `userId` + `userName` + `avatarUrl` jedes gerade
online befindlichen Users **jeder anderen Community**; ohne Session immerhin
die pool-weite Anzahl. Genau dieser Aufruf steht im Dashboard
(`packages/admin/app/pages/dashboard/index.vue:48`).

Derselbe Fehler im Client-Leser `usePresence.ts`. Dort meist harmlos, weil
die Prädikate Row-Ids sind (global eindeutig) — **außer** `useViewingPresence`,
das über `metadata.page` filtert: `/dashboard/pages` ist auf jedem Mandanten
derselbe String, also zeigt „N sehen diese Seite" heute fremde Namen.

**Restrisiko, das Code allein nicht schließt:** Presence-Rows tragen
`read("users")`. Jeder eingeloggte Pool-User kann `presences.list()` direkt
gegen Appwrite aufrufen und sieht dann alles — unabhängig davon, was unsere
App filtert. Vollständiger Verschluss braucht eine Entscheidung, siehe A4 in
[OFFENE-TASKS.md](../OFFENE-TASKS.md).

**Wie groß ist der Schaden heute?** Klein: der Pool hat bisher im
Wesentlichen `demo` als Mandanten. Das ist ein Fehler, den man **vor** den
Kunden schließt, kein laufender Vorfall.

### 🔴 B2 — Drei Dashboard-Lesungen greifen an der Datentür vorbei [verifiziert]

| Stelle | Was |
| --- | --- |
| `packages/comments/server/plugins/dashboard-stats.ts:16` | `commentsTotal` ist der **pool-weite** Kommentarstand |
| `packages/admin/server/api/admin/analytics.get.ts:76` | dieselbe Tabelle ungescopt für die Zeitreihe |
| `packages/admin/server/api/admin/search.get.ts:27` | `Query.search('content')` über alle Mandanten — die Command-Palette zeigt **Kommentar-Volltexte** |

Dazu zählt `stats.get.ts:16` per `admin.users.list()` alle User des
Pool-Projekts als „Nutzer dieser Site".

**Reichweite heute:** Alle drei stehen hinter `requirePermission` — das ist
label-only, also erreicht sie nur ein Operator, kein Kunde. **Aber:** genau
diese Routen sollen als nächstes für Site-Owner geöffnet werden (Task C1,
„Owner-Overview zeigt Nullwerte"). Wer C1 baut, ohne das hier zu fixen,
öffnet damit ein Cross-Tenant-Leck. Deshalb zuerst scopen, dann öffnen.

Der ESLint-Backstop greift nicht: er deckt `server/api/**` von sechs Layern
ab — `server/plugins/**` ist die Lücke, durch die Befund 1 gerutscht ist.

### 🔴 B3 — Unveröffentlichte Medien sind welt-lesbar [verifiziert]

`packages/media/scripts/migrations/001-media-table.ts:59-64` legt
`media_items` mit `read(Role.any())` und `rowSecurity:false` an, `:96-99`
denselben Fehler am Bucket. Der einzige Schutz für Entwürfe ist ein
`published`-Filter **in der Route** — die Appwrite-REST-API des Projekts
umgeht ihn. Jeder Anonyme bekommt alle unveröffentlichten Einträge samt
`fileId` und das Bild dazu.

Betrifft `apps/photos` und `apps/comments` (Silo-Instanzen). **Nicht** den
Pool — `media` steht nicht in `apps/platform/nuxt.config.ts`. Der
events-Layer löst dasselbe Problem richtig (Row-`read(any)` erst beim
Veröffentlichen); das ist die Vorlage.

### 🟠 Störend

| # | Befund | Vermerk |
| --- | --- | --- |
| S1 | **posts-Moderation nutzt die falsche Guard-Familie.** `posts.moderate` ist eine Site-Capability, die Seite verlangt sie, die vier Routen prüfen label-only. Folge: Site-Owner erreicht die Seite, jeder Klick 403t — und greift ein Operator zu, entfällt das `site.operator_access`-Protokoll. Fail-closed, kein Leck. | [verifiziert] |
| S2 | **Overview ohne `requiredCapability`.** Eintrittsbarriere ist nur `dashboard.access`, das alle fünf Site-Rollen tragen. Ein `viewer` sieht die Hide/Restore-Buttons der Schnellmoderation und alle Kacheln auf 0. | [gemeldet] |
| S3 | **media und activity wiederholen S1** (latent — beide Layer laufen nicht im Pool). | [verifiziert] |
| S4 | **Die Nav kennt das Plan-Gating nicht.** Ein Owner auf `basic` sieht „Events" und „Kurse"; die Routen antworten 404. Deckt sich mit Task C2. | [gemeldet] |
| S5 | **„Autor sperren" im Kommentar-Dashboard ist ungegated** (`comments.vue:340` → operator-only Route). | [gemeldet] |
| S6 | **`notifications` trägt kein tenantId.** Row-Security verhindert Fremdlesen korrekt — aber wer in zwei Communities Mitglied ist, sieht auf beiden eine gemischte Liste. | [gemeldet] |
| S7 | **`grantEventTicket` schreibt ohne tenantId-Stempel** in eine tenantId-Tabelle. Heute fail-closed (bekannt als D1), wird zum Datenintegritätsbug, sobald bezahlte Events in den Pool gehen. | [gemeldet] |
| S8 | **Appwrite-Fehlertexte im Body** bei fehlgeschlagener Nutzerlöschung (`users/[id]/index.delete.ts:42`). Publikum `users.manage`, aber die einzige Stelle, die die Regel bricht. | [gemeldet] |
| S9 | **Tote Capabilities:** kein Dashboard-Einstieg für `branding.manage`, `posts.write`, `team.manage` (nur der Registrierungs-Schalter), `site.transfer`, `site.delete`. Ein **Editor** sieht auf platform faktisch nur Overview, Events, Seiten. | [gemeldet] |
| S10 | Kleinteile: `requirePlanProduct('posts')` fehlt auf vier posts-Routen (nach Downgrade bleibt Bearbeiten offen) · `maintenanceMode` fehlt auf zwei · tickets-Triage-Guard sitzt im Util statt in der Route · Dashboard rendert auf den Kontroll-Hosts als tote Shell. | [gemeldet] |

### ✅ Geprüft und sauber

Das ist die andere Hälfte des Audits — was **nicht** kaputt ist:

- **`requireSitePermission` ohne `await`: null Treffer.** Alle 27 Call-Sites
  zweifach geprüft. Der Fail-open-Fall existiert nicht.
- **`await requirePermission(`: null Treffer** repo-weit.
- **`createError({statusCode/statusMessage})`: null Verstöße** in `server/**`.
- **Capability-Tippfehler: keine.** Jeder verwendete String steht in
  `ALL_CAPABILITIES`.
- **`tenantDb` ist dicht.** `get/update/remove` belegen die Zugehörigkeit vor
  der Aktion, `list/find/count` scopen immer, `create` stempelt,
  `stripTenantKey` verhindert Body-Injection.
- **Der ESLint-Backstop deckt genau die sechs Layer mit tenantId ab** — keiner
  fehlt (die Lücke ist der *Pfad* `server/plugins/**`, nicht die Layer-Liste).
- **`decideSiteAccess` und `resolveTenantRole` sind in jedem Zweig
  fail-closed**; jeder Operator-Break-Glass wird protokolliert.
- **Alle 38 Dashboard-Seiten tragen `middleware: ['auth','admin']`.** Keine
  ungeschützte Seite, keine verwaiste Fläche, kein Filter, der eine Seite
  für jeden sichtbar macht.
- **Die N1-Client-Spiegelung ist unbedenklich** — nur der Rollen-String
  reist, kein Server-Pfad liest ihn.

---

## Teil 2 — UI/UX

Maßstab war nicht „Best Practice", sondern **deine** Prinzipien: Einfachheit
als Leitlinie, ein Produkt = ein Konzept überall gleich, Nuxt UI statt
Handgebautem, „Produkte" statt „Features".

### Die drei größten Hebel

**1. Ein einziger Leerzustands-Baustein.** ~20 Listen zeigen als Leerzustand
eine graue Textzeile. `UEmpty` gibt es in Nuxt UI 4.10 und wird **0×**
benutzt; `USkeleton` **0×** im Dashboard. Ein neuer Kunde sieht auf *jeder*
Seite genau das — das ist sein erster Eindruck, und aktuell wirkt das Produkt
dabei kaputt statt neu. Die Texte sind größtenteils schon gut („Noch keine
Kurse — leg den ersten an."), es fehlt nur der Rahmen und der Knopf daneben.
Schlimmster Fall: `dashboard/index.vue:234` rendert als Leerzustand ein
literales **„—"**.

**2. Ein Vertrag für destruktive Aktionen.** Vier verschiedene Verhalten:
`UModal` (8×), natives `window.confirm()` (`media.vue:69`), gar keine
Rückfrage (6 Stellen), und `events.vue` macht beides in **derselben Datei**
(`stopSeries` mit Modal `:525`, `cancelEvent` ohne `:363`). Ohne Rückfrage
löschen heute: Einbetter-Domain, Lektion, Seite, Feedback, Event absagen,
Kommentar verstecken. Das ist der einzige UI-Befund, der einen zahlenden
Kunden Daten kosten kann.

**3. Ein Listen- und Ladezustands-Muster.** `UTable` in 2 von ~20 Listen, 18
handgebaute `<ul><li v-for>`. Zwölf Seiten Spinner, acht ohne jede
Ladeanzeige. Das ist die sichtbarste Verletzung von „ein Konzept überall" —
der Kunde merkt beim Wechsel von Kommentaren zu Kursen zu Medien, dass er
drei verschiedene Programme bedient. **Braucht deine Entscheidung:** `UTable`
für alle Datenlisten, oder bewusst Karten-Listen und `UTable` nur dort, wo
sortiert/gefiltert wird?

### Weitere Befunde

- **Doppelklick-Löcher** (kein `:loading`/`:disabled`): Löschen in
  `embed.vue:127`, Speichern `media.vue:137`, Liste anlegen `tickets.vue:114`,
  Download `gdpr-exports.vue:77`, „Unpublish" `events.vue:348` — bei letzterem
  hat der Schwester-Button es, dieser nicht.
- **`storage.vue:146` paginiert nicht** — die komplette Bucket-Dateiliste wird
  gerendert, unbegrenzt wachsend.
- **Keine Leerzustände** in `users/index.vue:307` (Suche ohne Treffer =
  leere Tabelle) und `admin/features.vue:43`.
- **Interne IDs im Kundenblick:** rohe `userId`/`planId` (`billing.vue:61,68`),
  rohe Rollen-Keys (`users/index.vue:465` — die Schwesterseite übersetzt sie
  korrekt), rohe Appwrite-Event-Namen (`session.create`), `targetType/targetId`.
- **Jargon in Feldern:** „Slug" (`pages.vue:193`), „Bucket" (`storage.vue:121`),
  Platzhalter `paidCourses` und `event_sommerfest` — interne Keys als
  Ausfüllhilfe.
- **Handgebaut, wo Nuxt UI etwas hat:** segmentierte Button-Paare statt
  `URadioGroup` (4 Stellen), Rollen-Picker statt `USelectMenu multiple`,
  Online-Punkt als `<span>` (die Schwesterseite nutzt `UChip`), Aufklapp-Karte
  statt `UCollapsible`, Emoji **✅** als Status-Badge (`tickets.vue:263`).
- **Fehlermeldungen sagen nie, was zu tun ist:** 238 `toast.add`, nur 20 mit
  `description`. Positive Ausnahmen: die Schriften-Upload-Meldung („nur WOFF2
  bis 3 MB") und `admin.users.actionFailed`.
- **Stumme Erfolge:** Lektion veröffentlichen/löschen, Feedback erledigt,
  Liste angelegt, Reihenfolge geändert — nur der Fehlerfall meldet sich.
- **A11y:** Icon-Buttons ohne Label an 8 Stellen (4 davon in
  `courses/[id].vue`). `media.vue` und `themes/fonts.vue` machen es richtig.
- **Ein hartcodierter Prosa-String** im ganzen Dashboard:
  `themes/fonts.vue:249` `placeholder="Meine Hausschrift"`.
- **Mobil:** `events.vue:309` Zeile mit 6 Elementen ohne `flex-wrap`
  (comments/media machen es dort richtig), `users/index.vue:307` 10-spaltige
  Tabelle ohne Scroll-Gefäß.

### ✅ Was sauber ist

- **i18n-Parität ist makellos** — 16 Layer, de vs. en: **0** Abweichungen in
  beide Richtungen. Und praktisch keine hartcodierten Strings (einer).
- **Die „Produkte"-Umstellung ist durchgezogen** — in kundensichtbaren
  Strings kein „Feature" mehr, nur noch im Code-Vokabular. Genau wie gewollt.
- **Der Seitenkopf ist überall gleich** — 26 von 26 Seiten, kein Ausreißer.
- **An/Aus ist konsequent `USwitch`**, kein Checkbox-Missbrauch.
- **`admin/features.vue` ist die Referenzseite:** UPageCard, USwitch,
  `pending`-Sperre pro Zeile, beide Toasts, UBadge, beruhigender Hinweis
  („Deine Daten bleiben erhalten."). Daran sollten die anderen gemessen werden.
- `storage.vue:169` macht Bestätigung vorbildlich (kontextabhängiger Hinweis
  im Modal), `settings/community.vue:132` erklärt, *warum* Schalter hier ohne
  Wirkung sind, statt sie stumm zu deaktivieren.

---

## Stand der Behebung

| Befund | Status |
| --- | --- |
| B1 Presence | ✅ gefixt + gemergt (Restrisiko A4 offen) |
| B2 Kennzahlen + ESLint-Lücke | ✅ gefixt + gemergt |
| B3 Medien-Rechte | ✅ gefixt + gemergt — **Migration media-002 muss noch auf prod** (C0) |
| S1 posts-Guards | ✅ gefixt + gemergt (+ Test) |
| S3 media/activity-Guards | ✅ Gate gefixt — **Datentür fehlt weiter** (C1b) |
| S2, S4–S10 | offen — brauchen teils deine Entscheidung |
| UI-Hebel 1 (Leerzustände) | offen — Baustein-Entwurf zuerst, dann Rollout |
| UI-Hebel 2 (Löschen-Vertrag) | offen |
| UI-Hebel 3 (Listen-Muster) | **braucht deine Entscheidung** |

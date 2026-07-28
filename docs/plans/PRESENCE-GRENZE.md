# Presence-Grenze: wie machen wir sie zu?

Entscheidungsvorlage zu OPEN-ITEMS **A4**. Stand 2026-07-28.
Alle Aussagen sind am Code belegt — Quelle steht jeweils dabei. Was ich *nicht*
belegen konnte, steht gesammelt am Ende (Abschnitt 7).

Geprüfte Versionen: Appwrite **1.9.6** (laufende lokale Instanz,
`GET /v1/health/version`), `node-appwrite` **26.2.0**, Web-SDK `appwrite`
**26.1.0**.

---

## 1. Der Befund in fünf Sätzen

Jeder eingeloggte Nutzer schreibt beim Seitenaufruf eine Appwrite-„Presence" —
eine flüchtige Zeile mit seiner userId, seinem Namen, seinem Avatar und dem,
was er gerade tut (tippt, liest Thread X, prüft Meldung Y).
Diese Zeile trägt heute die Leseberechtigung `read("users")`, und weil sich im
Pool **alle** Communities ein einziges Appwrite-Projekt teilen, heißt das:
jeder eingeloggte Nutzer irgendeiner Community darf sie lesen
(`packages/core/server/api/presence/heartbeat.post.ts:70`).
Dass in der Oberfläche trotzdem niemand fremde Anwesende sieht, liegt an einem
Filter, den unser eigener Code zieht (`packages/core/server/utils/presenceFilter.ts:42`,
`packages/core/app/composables/usePresence.ts:61`) — das ist Anwendungslogik,
keine Zugriffskontrolle.
Wer die Browser-Konsole öffnet und die Appwrite-Bibliothek direkt anspricht,
umgeht diesen Filter vollständig und bekommt Namen, Avatare und Aktivität aller
gerade online befindlichen Nutzer **aller** Kunden.
Der Schaden ist begrenzt (Namen und Avatare sind unter Kommentaren ohnehin
sichtbar, es fließen keine E-Mail-Adressen), aber die Aussage „Kunden sind
voneinander getrennt" stimmt an dieser Stelle nicht.

---

## 2. Vorab: drei Fakten, die alle Wege betreffen

Diese drei habe ich im Appwrite-Quelltext des laufenden 1.9.6-Containers
nachgelesen. Sie entscheiden, was überhaupt möglich ist.

**Fakt A — Presences akzeptieren beliebige Rollen, auch `team:` und `label:`.**
Der Upsert-Endpunkt validiert nur die *Art* der Berechtigung (read/update/
delete/write), nicht die Rolle:

```
->param('permissions', null, new Permissions(APP_LIMIT_ARRAY_PARAMS_SIZE,
    [PERMISSION_READ, PERMISSION_UPDATE, PERMISSION_DELETE, PERMISSION_WRITE]), …)
```
`src/Appwrite/Platform/Modules/Presences/HTTP/Upsert.php`

`Utopia\Database\Validator\Permissions` erbt von `Roles`, und dessen
Standard-Rollenliste ist `[any, guests, users, user, team, member, label]`
(`vendor/utopia-php/database/src/Database/Validator/Roles.php`).
Beides — `read("team:…")` und `read("label:…")` — geht also. Auch die SDKs
lassen es durch: `node-appwrite/dist/services/presences.d.ts:87-94`
(`permissions?: string[]`) und `appwrite/types/services/realtime.d.ts:60-65`
(`RealtimePresenceCreate.permissions?: string[]`).

**Fakt B — Realtime liefert Presence-Ereignisse exakt nach den Leserechten aus.**

```php
case 'presences':
    $channels[] = 'presences';
    $roles = $payload->getRead();
```
`src/Appwrite/Messaging/Adapter/Realtime.php` (Zweig `presences` in `fromPayload`)

Und die Rollen einer Verbindung enthalten sowohl Team- als auch Label-Rollen:
`src/Appwrite/Utopia/Database/Documents/User.php:62-77` (Teams, bestätigte
Mitgliedschaft) und `:79-81` (`$roles[] = 'label:' . $label`).

Daraus folgt hart: **Team- oder Label-Rechte behalten Realtime. Owner-only-Rechte
schalten es für alle anderen ab** — nicht als Nebenwirkung, sondern per Definition.

**Fakt C — wer die Presence schreibt, entscheidet, welche Rechte er setzen darf.**
`src/Appwrite/Presences/State.php` (`checkPermissions`): ein Aufrufer mit
Session/JWT darf nur Rechte setzen, deren Rolle er selbst trägt. Ein API-Key
(unser Server-Heartbeat, `heartbeat.post.ts:45`) ist davon ausgenommen.
Praktische Folge: unser Server kann jederzeit jedes Recht stempeln; der
zusätzliche WS-Upsert im Browser (`usePresence.ts:137`) — der einzige Weg, der
das Realtime-Ereignis auslöst — funktioniert nur, wenn der Nutzer die Rolle
wirklich hat.

---

## 3. Wer liest heute Presences? (vollständige Liste)

Das ist die Grundlage dafür, was Weg (b) kostet.

**Der eine Schreiber**
`packages/core/app/plugins/presence-heartbeat.client.ts:12` startet
`usePresenceState()` global auf jeder Seite. Zwei Wege parallel: HTTP-Heartbeat
über unsere Route (zuverlässig, löst *kein* Ereignis aus) und WS-Upsert (löst das
Ereignis aus) — `usePresence.ts:114` bzw. `:118`.

**Die Leser — direkt aus Appwrite (client-seitig, betroffen)**

| Verwendung | Composable | Konsument |
|---|---|---|
| Tipp-/Antwort-/Lese-Anzeige im Kommentar-Thread | `packages/comments/app/composables/useThreadPresence.ts:44` | `packages/comments/app/components/CommentSection.vue:72` |
| Claim-Lock der Moderations-Queue | `packages/admin/app/composables/useModerationPresence.ts:12` | `packages/comments/app/pages/dashboard/comments.vue:133` |
| „X bearbeitet dieses Formular ebenfalls" | `packages/core/app/composables/useEditAwareness.ts:12` | `packages/admin/app/pages/dashboard/admin/config.vue:22`, `packages/admin/app/pages/dashboard/admin/changelog.vue:17`, `packages/courses/app/pages/dashboard/courses/[id].vue:26` |
| „N sehen diese Seite" | `packages/core/app/composables/useViewingPresence.ts:17` | `packages/admin/app/components/DashboardViewers.vue:8`, `packages/events/app/components/EventDetail.vue:92` |
| „wer ist gerade online" im Dashboard | `usePresence()` direkt | `packages/admin/app/pages/dashboard/index.vue:60`, `packages/admin/app/pages/dashboard/users/index.vue:66`, `packages/admin/app/pages/dashboard/users/[id].vue:22` |

**Der Leser über den Server (nicht betroffen — nutzt den Admin-Schlüssel)**
`packages/core/server/utils/presence.ts:17` (`listOnlinePresences`) hinter
`packages/core/server/api/presence/count.get.ts`. Diese Route liefert schon heute
den SSR-Erststand des Kommentar-Threads und ist der einzige Weg für **Gäste**
(nicht eingeloggte Besucher haben kein Leserecht auf `read("users")`).
Wichtig: hier existiert bereits das Muster „Identität server-seitig nachschlagen"
— `resolveAvatars()` gibt Namen und Avatare nur an eingeloggte Aufrufer heraus.

**Die gemessenen Zahlen — nachgeprüft, Stand heute:**
`HEARTBEAT_MS = 20_000`, `POLL_MS = 20_000`, `FRESH_MS = 180_000`
(`packages/core/app/composables/usePresence.ts:26,32,40`),
serverseitige Ablaufzeit `PRESENCE_TTL_MS = 240_000` (`heartbeat.post.ts:16`).
Der Poll-Abstand von **20 s** stimmt also weiterhin. Die **~280 ms** habe ich
*nicht* neu gemessen — dazu Abschnitt 7.

---

## 4. Die entscheidende Vorfrage: „Mitglied" gibt es bei uns nicht als Daten

Die Wege (a) und (c) wollen beide sagen: „nur Mitglieder dieser Community dürfen
lesen." Dafür braucht es eine Liste, wer Mitglied ist. **Die haben wir nicht.**

- `site_members` liegt im **Control-Plane-Projekt**, nicht im Pool
  (Migration `packages/control/scripts/migrations/015-site-members.ts`; die
  Platform-App liest sie über einen separaten, **nur-lesenden** Schlüssel:
  `apps/platform/server/plugins/tenant-resolver.ts:20-29`).
- In `site_members` steht im Produktivbetrieb **nur der Gründer**. Es gibt genau
  eine schreibende Stelle im gesamten Produktivcode:
  `packages/control/server/utils/onboardingProvision.ts:240-252` (Owner-Zeile bei
  der Anlage). Kein Einladen, kein Rollenwechsel, kein Austritt.
- Ein normaler Nutzer registriert sich auf dem Mandanten-Host
  (`tenants.openRegistration`, Standard **an**), ist eingeloggt, kann
  kommentieren — und bekommt **nie** eine `site_members`-Zeile. Presence prüft
  nur „eingeloggt" (`heartbeat.post.ts:19-20`).
  Genau so dokumentiert in `packages/courses/server/utils/courseAccess.ts:12`.

**Was daraus folgt:** Die eigentliche Arbeit bei (a) und (c) steckt nicht in der
Appwrite-Technik, sondern in der Frage *„was macht jemanden zum Mitglied?"*.
Bei offener Registrierung ist die einzige ehrliche Antwort, die den heutigen
Produktstand abbildet: **wer sich auf diesem Host angemeldet hat und ihn
benutzt.** Wer das ist, weiß der Server bei jedem Request ohnehin.

---

## 5. Die Wege im Einzelnen

### Weg (a) — ein Appwrite-Team pro Mandant, `read("team:<tenantId>")`

**Geht es?** Ja, technisch belegt (Fakt A + B). Teams werden im Projekt heute
**nirgends** benutzt — die einzigen Treffer auf `teams.*` sind Schlüssel-Scopes
in `scripts/create-site.mjs:219` und `scripts/ci/appwrite-setup.mjs:97`. Es wäre
ein komplett neues Subsystem im Pool-Projekt.

**Kette Beitritt/Austritt.** Sie existiert nicht und müsste gebaut werden:
1. Team anlegen, wenn eine Community entsteht — im **Pool**-Projekt, aber
   ausgelöst vom **Control Plane**, das die Community anlegt
   (`onboardingProvision.ts:157`). Das Control Plane hat für den Pool nur einen
   *nur-lesenden* Schlüssel; es bräuchte einen zusätzlichen Schreib-Schlüssel
   oder eine neue Rückruf-Route in der Platform-App. Neue Naht, neues Geheimnis.
2. Mitgliedschaft anlegen bei jedem Beitritt. Es gibt **keinen Beitritt** als
   Ereignis (Abschnitt 4) — der Auslöser müsste erfunden werden.
3. Austritt/Entzug: neue Route, im Produktivcode heute nicht vorhanden.
4. Appwrite-Mitgliedschaften brauchen eine Bestätigung
   (`User.php:63`, `if (!isset($node['confirm']) || !$node['confirm']) continue;`)
   — server-seitig gesetzte Mitgliedschaften müssen also ausdrücklich als
   bestätigt angelegt werden, sonst greift die Rolle nie.

**Bestandsnutzer.** Backfill über alle Pool-Nutzer: für jeden herausfinden, zu
welchen Communities er gehört — was mangels Mitgliederregister nur heuristisch
geht (z. B. „hat dort kommentiert"). Bis zum Backfill sieht ein Bestandsnutzer
keine Anwesenden mehr.

**Rückbau.** Sauber: `permissions` im Heartbeat zurück auf `read("users")`,
Teams stehen ungenutzt herum, ein Löschlauf räumt sie ab. Kein Datenverlust.

**Laufende Kosten.** Ein Team-Objekt je Community (belanglos) + eine
Mitgliedschaftszeile je Nutzer je Community + ein Pflegepfad, der bei jeder
Änderung mitgezogen werden muss. Der wirkliche Preis ist der Pflegepfad, nicht
der Speicher.

**Was der Kunde merkt.** Nichts — Realtime bleibt vollständig erhalten.

**Was schiefgehen kann.** Eine fehlende oder unbestätigte Mitgliedschaft macht
den Nutzer für die Anwesenheit unsichtbar, und zwar **still** (der Heartbeat
schluckt Fehler, `heartbeat.post.ts:79-81`). Zwei Register für dasselbe
(`site_members` im Control Plane, Teams im Pool) laufen erfahrungsgemäß
auseinander.

**Ein echter Vorteil gegenüber (c):** Team-Mitgliedschaftsänderungen weisen
Appwrite an, die Rollen **offener** Realtime-Verbindungen sofort neu zu berechnen
(`Realtime.php`, `$permissionsChanged = $parts[4]` im `teams`-Zweig →
`app/realtime.php:655 ff.` baut die Subscriptions neu auf). Label-Änderungen tun
das **nicht** — der `users`-Zweig setzt das Flag nicht.

---

### Weg (b) — Presences server-only, alle Leser über Server-Routen

**Geht es?** Ja, und es ist die einzige Variante, die *garantiert* dicht ist:
Rechte nur für den Besitzer, niemand sonst kann die Zeile lesen — auch nicht mit
der Konsole.

**Aufwand.** Am kleinsten von allen: eine Zeile im Heartbeat
(`heartbeat.post.ts:70-74`), plus die Client-Leser von `presences.list()` auf
eine Server-Route umstellen. Die Route existiert im Kern schon
(`count.get.ts` + `listOnlinePresences`), sie müsste nur um die Felder
`action`, `page`, `replyingTo`, `near`, `away` erweitert werden — heute mappt
`toOnlinePresences` nur `scope`/`action`/`typing`
(`presenceFilter.ts:56-66`). Realistisch ein bis zwei Tage.

**Was genau verloren geht.** Nach Fakt B liefert Appwrite Presence-Ereignisse
nur an Verbindungen, deren Rollen in den **Leserechten** stehen. Owner-only
heißt: kein anderer Client bekommt je ein Ereignis. `Channel.presences()` bleibt
stumm; es bleibt nur der Poll aus `usePresence.ts:264` — **20 Sekunden**.

Konkret je Anwendungsfall:

| Anwendungsfall | heute | danach | Urteil |
|---|---|---|---|
| Tipp-Indikator im Thread | erscheint fast sofort, verschwindet nach 3 s (`useThreadPresence.ts`, `TYPING_RESET_MS = 3_000`) | Poll alle 20 s | **kaputt.** Das Tipp-Signal lebt 3 s und wird alle 20 s abgefragt — es wird meistens verpasst. Der Indikator müsste ersatzlos raus. |
| „X antwortet auf diesen Kommentar" / Lese-Position (`replyingTo`, `near`) | nahezu sofort | 20 s | größtenteils entwertet — beides ändert sich schneller, als gepollt wird |
| Claim-Lock der Moderation | Sperre sichtbar, bevor der zweite Moderator klickt | bis zu 20 s blind | **riskant.** Genau das Doppelarbeits-Problem, das der Lock lösen soll, kommt zurück |
| „X bearbeitet dieses Formular ebenfalls" | nahezu sofort | bis zu 20 s | vertretbar — Formulare sind minutenlang offen |
| „N sehen diese Seite" / Event / Online-Liste | nahezu sofort | 20 s | **unproblematisch** |
| Gäste im Kommentar-Thread | schon heute über die Server-Route | unverändert | unproblematisch |

Man könnte das Poll-Intervall senken, aber das ist ein schlechter Tausch: bei
5 s Poll und N gleichzeitigen Nutzern erzeugt jeder Leser 12 Anfragen/Minute
gegen den Admin-Client — und die Route liest jedes Mal die **komplette**
pool-weite Presence-Liste (`presence.ts:27`, Seiten à 200 bis 1000). Die Last
wächst mit dem Quadrat der Nutzer über alle Kunden hinweg.

**Laufende Kosten.** Keine Pflege, aber dauerhaft mehr Serverlast als heute.

**Was der Kunde merkt.** Der Tipp-Indikator verschwindet; Live-Anzeigen wirken
träge. Das ist die einzige Option mit spürbarem Produktrückschritt.

**Was schiefgehen kann.** Wenig — das ist ihr Vorzug. Der Ausfall ist gutartig:
schlimmstenfalls veraltete Anwesenheit.

**Mittelweg mit eigener, gescopter Zeile — ehrliche Bewertung: nein.**
Die Idee: der Server spiegelt die Anwesenheit in eine TablesDB-Zeile, auf die
Clients per Realtime lauschen. Das löst nichts, sondern verschiebt: die
Spiegelzeile braucht **dieselbe** mandantengenaue Leseberechtigung wie die
Presence — also wieder ein Team oder ein Label, also wieder ein
Mitgliederregister. Zusätzlich bekäme man eine Schreibverstärkung (jeder
Heartbeat schreibt jetzt zweimal), einen Konsistenzpfad zwischen zwei Quellen
und eine dauerhafte Zeile für etwas ausdrücklich Flüchtiges. Eine eigene
SSE-Route wäre technisch sauber, hieße aber, in Nitro einen Verbindungs-Fanout
selbst zu bauen, den Appwrite bereits betreibt. Der Komplexitätsaufwand ist
nicht gerechtfertigt.

---

### Weg (c) — Site-Label pro Mandant, `read("label:<siteId>")` **← übersehen, und schon halb gebaut**

Strukturell wie (a) — die Grenze zieht Appwrite, Realtime bleibt (Fakt B) — aber
mit dem Mechanismus, den dieses Projekt für **genau diesen Zweck** bereits
besitzt und getestet hat.

**Was schon da ist:**
- `packages/core/server/utils/tenantRowPermissions.ts:48` — `tenantReadRolesFor()`
  gibt im Pool `Permission.read(Role.label(tenant.siteId))` zurück. Der
  Kopfkommentar (`:6-21`) beschreibt exakt unser Problem: „Row-Permissions als
  HARTE zweite Verteidigungslinie im Pool … ein vergessener Filter würde ohne
  diese Schicht Zeilen von Kunde A an Kunde B leaken." Unit-getestet in
  `packages/core/tests/tenantRowPermissions.test.ts`. **Produktiv aufgerufen wird
  es bisher nirgends** — es wartet auf seinen ersten Nutzer.
- `packages/onboarding/server/utils/siteLabel.ts` — `grantSiteLabel()` vergibt das
  Label additiv über den Runtime-Admin-Schlüssel, mit Zeichensatz-Prüfung und
  Fehlerprotokoll. Einziger Aufrufer heute: `packages/onboarding/server/api/onboarding/site.post.ts:38`,
  also **nur der Gründer**.
- Der Label-Schlüssel ist die `siteId` (= `tenants.$id`), garantiert
  alphanumerisch ≤ 36 Zeichen — Appwrite erlaubt genau das
  (`app/controllers/api/users.php:1273`) und bis zu **1000** Labels je Nutzer
  (`APP_LIMIT_ARRAY_LABELS_SIZE`, `app/init/constants.php:38`).

**Kette Beitritt/Austritt.** Kein neues Register, kein neuer Schlüssel, keine
neue Naht ins Control Plane:
- *Beitritt* = der Server vergibt das Label, wenn ein eingeloggter Nutzer den
  Mandanten-Host benutzt. Der natürliche Ort ist der Presence-Heartbeat selbst
  (`heartbeat.post.ts`) oder die Auth-Middleware — beide kennen `useTenant(event)`
  und haben den Admin-Client bereits in der Hand.
  `grantSiteLabel()` müsste dafür aus dem `onboarding`-Layer nach `core` wandern
  (es benutzt nur die Users-API und den Tenant-Kontext — für einen
  Fundament-Layer zulässig).
- *Austritt* = ein Eintrag weniger im Array, ein `users.updateLabels`-Aufruf.

**Ist das eine echte Grenze?** Sie ist genau so scharf wie der heutige
Produktstand es zulässt, und das ist der Punkt: bei offener Registrierung *ist*
„hat sich hier angemeldet und benutzt den Host" die Mitgliedschaft — so jemand
darf die Inhalte und die Kommentierenden ohnehin sehen. Der Befund lautet nicht
„Fremde sehen zu viel", sondern „**Kunde A sieht Kunde B**". Genau das schließt
das Label vollständig und auf Datenbankebene: der Nutzer von A trägt das Label
von B nicht, also gibt Appwrite ihm die Zeilen von B nicht heraus — auch nicht
über die Konsole. Wird später ein richtiger Beitritt eingeführt (geschlossene
Communities), hängt man den Label-Aufruf einfach dort ein; der Rest bleibt.

**Bestandsnutzer.** Kein Backfill nötig — und das ist der schönste Teil. Wer den
Host das nächste Mal aufruft, bekommt das Label im selben Request, noch vor dem
Heartbeat. Bis dahin sieht er keine Anwesenden, statt falsche — fail-closed,
genau wie unser Filter heute.

**Rückbau.** `permissions` zurück auf `read("users")`, Label-Vergabe abschalten.
Zurückgebliebene Labels sind harmlos (sie gewähren nur, was sie gewähren sollen)
und mit einem Durchlauf über `users.updateLabels` entfernbar.

**Laufende Kosten.** Ein zusätzliches Feld im Nutzerdokument, ein
`users.updateLabels`-Aufruf beim erstmaligen Kontakt mit einem Host (danach ein
`includes()`-Vergleich, `siteLabel.ts:37`). Praktisch null.

**Was der Kunde merkt.** Nichts. Realtime und die ~280 ms bleiben.

**Was schiefgehen kann:**
1. **Stale Rollen auf offenen Verbindungen.** Anders als bei Teams löst eine
   Label-Änderung keine Neuberechnung der Rollen einer bereits offenen
   WS-Verbindung aus (belegt oben unter Weg (a)). Ein Nutzer, der beim
   Label-Erhalt schon verbunden ist, sieht Ereignisse erst nach einem Reconnect.
   In der Praxis schmal: das Label kommt beim ersten SSR-Aufruf, die WS
   verbindet sich erst nach der Hydration.
2. **Der WS-Upsert braucht das Label selbst** (Fakt C): ohne Label wirft
   `checkPermissions`, der Browser-Upsert schlägt fehl und es gibt kein
   Ereignis. Der HTTP-Heartbeat mit Admin-Schlüssel trägt die Presence weiter —
   der Nutzer ist also sichtbar, nur ohne Sofortmeldung. Gutartiger Ausfall,
   aber er muss protokolliert werden, sonst sucht man ihn lange
   (`usePresence.ts:144` schluckt heute stumm).
3. **Das Label-Array ist öffentlich für den Nutzer selbst** — er kann in seinem
   eigenen Account-Objekt sehen, welchen Communities er zugeordnet ist. Über
   sich selbst weiß er das ohnehin.
4. **1000-Label-Grenze** — bei einem Nutzer in >1000 Communities würde die
   Vergabe fehlschlagen. Kein realistisches Szenario, aber der Fehlerpfad sollte
   protokolliert werden (tut `siteLabel.ts:39-45` schon).

---

### Weg (d) — Presence-Metadaten verkleinern (ergänzend, kein Ersatz)

Die Idee: wenn im Leck nichts Interessantes steht, ist es belanglos.
Heute stehen in der metadata `userName` und `avatarUrl`
(`heartbeat.post.ts:27,35`).

**Was ginge:** Beide streichen und die Identität stattdessen server-seitig
auflösen. Der Weg dafür ist gebaut — `count.get.ts` macht mit `resolveAvatars()`
genau das und gibt Namen/Avatare nur an eingeloggte Aufrufer. Realtime bliebe
vollständig erhalten, weil das schnelle Signal (wer/tippt/Thread/Aktion) in der
Presence bleibt; nur der Name käme aus einer selten aufgerufenen, gut
zwischenspeicherbaren Server-Route.

**Was nicht ginge:** Ein Leck bliebe. Es blieben `userId` (strukturell, von der
API verlangt) und — entscheidend — **`metadata.tenantId`**, das wir dort selbst
hineinschreiben (`heartbeat.post.ts:34`). Damit ist weiterhin ablesbar, *welcher
Nutzer zu welcher Community gehört und wann er online ist*, dazu `scope`
(`post:<id>`) und `action` (`reviewing:report:42`). Wer eine userId hat, kann
den Namen über die eigene Community wieder anreichern.

**Urteil:** eine gute, billige Härtung (weniger PII an einem Ort, an dem sie
nicht sein muss), aber **keine Grenze**. Nicht als Lösung verkaufen. Sinnvoll
zusätzlich zu (c) — dann liegt selbst hinter der Berechtigungsgrenze weniger.

---

## 6. Empfehlung

**Weg (c) bauen: `read("label:<siteId>")` statt `read("users")`, Label-Vergabe
beim ersten authentifizierten Kontakt mit dem Mandanten-Host. Weg (d) als
Kleinigkeit mitnehmen (`avatarUrl` und `userName` aus der metadata streichen).
Weg (a) und Weg (b) ablehnen.**

Begründung, in der Reihenfolge ihres Gewichts:

1. **(c) ist das Einzige, das beides behält: eine echte Datenbankgrenze und
   Realtime.** Belegt, nicht vermutet — Appwrite prüft Label-Rollen bei
   `presences.list()` genauso wie beim Ereignis-Fanout (Fakt B,
   `User.php:79-81`).
2. **(c) benutzt, was schon da ist.** `tenantRowPermissions.ts` wurde für exakt
   diesen Zweck geschrieben, unit-getestet und wartet seit Horizont 3 auf seinen
   ersten produktiven Aufrufer. `grantSiteLabel()` existiert ebenfalls. Der
   Aufwand ist im Wesentlichen: Label auch an gewöhnliche Nutzer vergeben, den
   Helfer nach `core` verschieben, zwei Berechtigungs-Arrays ändern
   (`heartbeat.post.ts:70`, `usePresence.ts:140`). Ein Tag, nicht eine Woche.
3. **(a) kostet dasselbe Ergebnis erheblich teurer.** Teams brächten gegenüber
   Labels genau einen echten Vorteil (Rollen-Neuberechnung auf offenen
   Verbindungen) und dafür ein komplettes neues Subsystem, eine zweite
   Mitgliedschaftsquelle neben `site_members`, einen Schreib-Schlüssel vom
   Control Plane in den Pool und einen Backfill. Der Vorteil greift in unserem
   Ablauf fast nie (das Label kommt vor dem WS-Verbindungsaufbau).
4. **(b) ist die einzige Option, die den Kunden etwas kostet.** Sie tauscht
   einen Befund, der Namen und Avatare betrifft — Daten, die unter jedem
   Kommentar stehen — gegen den Tipp-Indikator und den Claim-Lock der
   Moderation. Bei einem 20-Sekunden-Poll gegen ein 3-Sekunden-Tippsignal ist
   das kein Qualitätsverlust, sondern eine Abschaffung. Funktionen zurückbauen,
   um ein Leck zu schließen, für das es eine gleich sichere Lösung ohne
   Rückbau gibt, ist der falsche Tausch.
5. **Die Migration von (c) ist gutartig**, (a) und (b) sind es nicht. (c)
   braucht keinen Backfill und degradiert fail-closed; (a) macht Bestandsnutzer
   bis zum Backfill unsichtbar; (b) entfernt Funktionen unwiderruflich.

**Was ich mit dieser Empfehlung ausdrücklich nicht behaupte:** dass „hat den Host
benutzt" die endgültige Definition von Mitgliedschaft ist. Sie ist die, die zum
heutigen Produkt passt (offene Registrierung, kein Beitritt als Ereignis). Kommen
geschlossene Communities, wandert der `grantSiteLabel()`-Aufruf an die
Beitrittsstelle — der Rest der Lösung bleibt unverändert. Das ist der Grund,
warum sie sich lohnt: sie legt die Leitung, bevor es den Schalter gibt.

**Falls David (b) trotzdem vorzieht** (Argument: „am wenigsten beweglich, kein
Mitgliedschaftsbegriff nötig"), dann bitte mit der Konsequenz: Tipp-Indikator
und Claim-Lock werden **entfernt**, nicht auf 20 s verlangsamt. Eine Sperre, die
20 s zu spät kommt, ist schlechter als keine, weil man sich auf sie verlässt.

---

## 7. Was ich NICHT belegen konnte

1. **Die ~280 ms habe ich nicht neu gemessen.** Sie stammen aus einer Messung
   vom 2026-07-01 (`docs/OPEN-ITEMS.md:335`) und stehen unverändert im Code
   (`usePresence.ts:27,68`). Belegt habe ich nur die *Struktur* — dass der
   schnelle Pfad ein WS-Ereignis ist und der Poll bei **20 s** steht
   (`usePresence.ts:32`, heute nachgelesen). Ob es 280 ms oder 500 ms sind,
   ändert an keiner Schlussfolgerung etwas; der Unterschied zu 20 s ist zwei
   Größenordnungen.
2. **Ich habe keinen Angriff ausgeführt.** Ich habe nicht mit einem echten
   Session-Cookie `presences.list()` gegen die Pool-Instanz gerufen und die
   fremden Zeilen gesehen. Der Befund ist aus dem Quelltext hergeleitet
   (`read("users")` gesetzt + `User::getRoles()` gibt jedem eingeloggten Nutzer
   `users` + `presences.read` steht im `member`-Rollenumfang,
   `app/config/roles.php:15`). Für einen Beweis in beide Richtungen — Leck heute
   vorhanden, nach dem Label-Wechsel geschlossen — braucht es ein Prüfskript mit
   zwei Konten in zwei Mandanten. **Das sollte Teil der Umsetzung sein**, im
   Muster der vorhandenen `verify-*.mjs`-Skripte.
3. **`documentSecurity` der internen Sammlung `presenceLogs` habe ich nicht
   gefunden.** Die Definition in `app/config/collections/common.php` (ab der
   `presenceLogs`-Zeile) nennt kein solches Feld, und ich habe nicht
   nachverfolgt, wie Utopia für interne Sammlungen entscheidet, ob Zeilenrechte
   beim `find()` erzwungen werden. Dass sie erzwungen werden, halte ich für
   sicher (sonst hätte `read("users")` keine Wirkung und Gäste sähen alles), aber
   *belegt* habe ich es nur für den Realtime-Pfad
   (`Realtime.php`, `$roles = $payload->getRead()`), nicht für `GET /v1/presences`.
   **Das ist die eine Annahme, auf der alles ruht — sie gehört als Erstes in das
   Prüfskript aus Punkt 2.**
4. **Ich habe nicht geprüft, ob Appwrite Labels irgendwo an andere Nutzer
   ausliefert.** Wenn ein Nutzerobjekt mit `labels` in einer für Dritte lesbaren
   Antwort auftaucht, wäre die Zugehörigkeit zu Communities darüber ablesbar —
   ein kleineres, aber gleichartiges Problem. Der Admin-Client liefert Labels
   (`siteLabel.ts:36` liest `user.labels`); ob der Session-Client sie für
   *fremde* Nutzer je zeigt, habe ich nicht verifiziert.
5. **Kosten von Weg (a) in Appwrite-Ressourcen** (Grenzen für Teams je Projekt,
   Mitgliedschaften je Team, Auswirkung vieler Team-Rollen auf die Größe des
   JWT/der Rollenliste) habe ich nicht nachgeschlagen. Für die Empfehlung
   unerheblich, für eine Umsetzung von (a) wäre es zu klären.
6. **Ob `useRealtimeAccount`** (der bewusst cookie-native WS, CLAUDE.md) **von
   einer Berechtigungsänderung an Presences berührt wird**, habe ich nicht
   geprüft. Nach Aktenlage nicht — er hört auf `account`-Kanäle, nicht auf
   `presences`.

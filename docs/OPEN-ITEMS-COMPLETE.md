# Erledigte Punkte (Archiv)

Das ist das **finale Archiv der erledigten offenen Punkte** — jeder Eintrag
steht hier vollständig, mit Begründung, Beweis und Datum, damit später
nachlesbar bleibt, warum etwas so gebaut wurde. **Es ist KEINE Arbeitsliste:**
was noch aussteht, steht ausschließlich in [OPEN-ITEMS.md](OPEN-ITEMS.md)
(Regel von David, 2026-07-30 — Erledigtes zieht sofort hierher um).

Diese Datei darf ausführlich sein: sie ist unser **Lern-Gedächtnis**. Wo etwas
nicht auf Anhieb funktionierte, steht am Ende des Eintrags eine Zeile
**Gelernt:** — was schiefging, warum, und welche Regel daraus wurde. Wer eine
ähnliche Aufgabe anfängt, liest zuerst diese Zeilen.

> **Zu den `F`-Nummern — sie sind ZWEIMAL vergeben worden** (festgestellt beim
> Gegenlesen am 2026-08-02, nicht rückwirkend umnummeriert):
>
> - **`F1`–`F19` hier im Archiv** sind Befund-Nummern aus den Audits ab dem
>   2026-07-31 (`F1` = leere Fehler-Beschreibungen, `F2` = doppelter
>   i18n-Schlüssel, `F3` = Kontolöschung im Control Plane …).
> - **`F1`, `F2`, `F3`, `F7`, `F15` in OPEN-ITEMS.md** sind etwas ganz anderes:
>   geparkte Produkt-Punkte, die beim Aufräumen der Liste am 2026-07-31 (Commit
>   `e7602015`) neu durchnummeriert wurden — `F1` heißt dort „Discussions als
>   eigenes Produkt".
>
> Umnummeriert wird **nicht**: beide Nummernkreise stehen in Commit-Meldungen
> und in Querverweisen, ein nachträglicher Umbau machte die unlesbar. Wer eine
> `F`-Nummer nachschlägt, prüft also zuerst, aus WELCHER Liste sie stammt.
> Ab `F20` ist die Nummerierung wieder eindeutig.

---

### F43 — Die Zahlungswarnung eines Community-Abos landet in der Community-Glocke ✅ 2026-08-03

**Das Problem.** Ein Community-Owner wurde über KEINEN Kanal gewarnt, wenn
seine Zahlung ausblieb — 14 Tage später schaltete der M13-Sweep die Community
auf nur-lesend, ohne dass je ein Hinweis angekommen war. Ursache: der
Stripe-Webhook läuft auf `control`, `metadata.userId` eines Community-Checkouts
ist aber eine **Pool**-Nutzer-Id. Im control-Projekt gibt es sie nicht
(nachgemessen: `users.get` → 404 `user_not_found`). Die Glocken-Zeile bekam
`read(user:<pool-id>)` und war für niemanden lesbar, und `maybeSendInstantEmail`
scheiterte an derselben Nachschlage.

**Davids Entscheidung.** Die Warnung gehört dorthin, wo der Owner eingeloggt
ist: in die **Community-Glocke** seines Mandanten-Hosts, mit Link auf
`/dashboard/settings/subscription`. Das schärft C15, hebt es nicht auf — bei
einem KONTO-Abo (Silo, Einzelvertrag) bleibt die Warnung `scope: 'account'`,
weil dort ein Konto der Vertragspartner ist. Dass kein anderes Mitglied sie
sieht, war nie Sache des Ablage-Stempels, sondern der Row-Permissions
(`read(user:<owner>)`) — und das bleibt so.

**Der gewählte Weg: der Pool merkt es selbst.** Der Webhook stempelt weiter nur
`communities.billingStatus` + `pastDueSince`; ein stündlicher Lauf der
Platform-App liest die überfälligen Communities über den bereits vorhandenen
read-only-Cross-Projekt-Key, sucht ihren Owner in `community_members` und
schreibt die Meldung im Pool. Dieselbe Arbeitsteilung wie bei M13 (Webhook
stempelt, Sweep entscheidet).

**Warum NICHT die naheliegende Service-Naht control→platform.** Sie wäre
sofort, aber sie kostet: ein zweites Secret, einen Dienst-Endpunkt auf einem
öffentlichen Mehr-Mandanten-Host — und einen Geldpfad, der von der
Erreichbarkeit der Platform-App abhängt. Der Webhook muss transiente Fehler
WERFEN (Stripe-Regel), ein Platform-Neustart löste also Stripe-Retrys auf den
ganzen Geldpfad aus. Gekauft hätte man damit Sofortigkeit — neben einer
14-Tage-Frist wertlos. Das Control Plane KANN die Zeile ohnehin nicht selbst
anlegen: es hat keinen Schlüssel für das Pool-Projekt (dieselbe Grenze, wegen
der die Runtime `revokeCommunityLabel` zieht, A5).

**„Genau einmal" ohne Raten.** `notify()` hat einen Idempotenz-Schlüssel
bekommen (`rowId`): derselbe Schlüssel schreibt genau eine Zeile, der zweite
Versuch läuft in Appwrites 409 und ist ein No-op — ohne Glocken-Zeile UND ohne
Mail (`created: false`). Kein „erst nachsehen, dann schreiben": zwischen
Nachsehen und Schreiben passt ein zweiter Lauf. Der Schlüssel ist
`sha256(communityId | pastDueSince | recipientId)` — `pastDueSince` trennt die
Verzugs-EPISODEN (wer bezahlt und später wieder offen ist, wird erneut
gewarnt), `recipientId` trennt die Owner (sonst gewänne der erste das Rennen).
`notify()` ist dafür jetzt auch ohne `H3Event` aufrufbar und nimmt den
Ablage-Wert per `communityId` explizit entgegen — ein Sweep hat keinen
Mandanten-Kontext.

**Beweis.** Neu: `packages/onboarding/scripts/verify-past-due-notice.mjs`
(**28/28**) — Glocke, Mail (Mailpit), fremdes Mitglied sieht nichts,
Row-Permissions direkt an der Zeile nachgemessen, zweiter Lauf meldet nichts,
neue Episode meldet wieder, bezahlte und fremdprojektige Communities werden
übersprungen, Fremde können den Lauf nicht auslösen. Unverändert grün:
`verify-community-suspension` **117/117**, `verify-site-authz` **118/118**.
Dazu Unit-Tests für die pure Auswahlregel, den Schlüssel und die
Webhook-Weiche (`paymentFailureAudience`).

**Gelernt:** Der Mail-Zweig war lokal still, weil `apps/platform/.env` kein
`NUXT_SMTP_*` trug — `isMailerConfigured()` gibt dann sauber `false` zurück,
und der ausbleibende Versand sieht aus wie ein Code-Fehler. **Jede App, die
`notify()` ruft, braucht ihre eigene SMTP-Konfiguration**; für die
Platform-Instanz auf dem Server ist das noch zu setzen (bisher hatte nur
`control` sie). Zweitens: in dieser Kette heißen ZWEI verschiedene Werte
`communityId` — `community_members.communityId` ist `communities.$id`,
`notifications.communityId` ist `communities.tenantId`. Beide Wege sind
fail-soft, eine Verwechslung erzeugt also nichts als Stille.
### G5 — Der Reconnect-Sturm auf 404-Hosts ✅ 2026-08-03

**Der Nachzügler zu Befund 3 des M13-Wechselwirkungs-Audits.** Dort war der
Presence-Heartbeat auf der 404-Seite eines `abuse`-gesperrten Hosts stillgelegt
worden; beim Beweis dafür fiel daneben ein deutlich größeres Rauschen derselben
Klasse auf, das bewusst offen blieb. Es ist jetzt reproduziert, erklärt und
behoben.

**Die Kette — am Code hergeleitet, im Browser bestätigt.** `useError()` ist auf
so einer Seite gesetzt, der Auth-Store aber **hydriert**: Nuxt lässt für seinen
internen `/__nuxt_error`-Durchgang die Mandanten-Middleware passieren (C12b),
also läuft `02.auth.ts` und der Nutzer ist eingeloggt. Damit startete
`realtime-account.client.ts` seinen cookie-nativen WebSocket. Der kann dort nie
stehen — und **jedes Schließen** zog ein `auth.refresh()` nach sich, also
`GET /api/auth/me` **+** `GET /api/community/role`, beide garantiert 404. Der
Beweis für die Urheberschaft steht im Takt: 1,1 s · 2,2 · 4,2 · 8,2 · 16,3 ·
31,3 · 46,3 — exakt `min(1000·2^n, 15_000)` aus `scheduleReconnect()` in
`useRealtimeAccount`. Kein anderer Aufrufer von `auth.refresh()` läuft
ungefragt (die übrigen sieben hängen alle an einer Nutzeraktion).

**Zwei getrennte Fehler, zwei getrennte Fixe.**

**(a) Auf einer Adresse, die es nicht gibt, wird nichts mehr gestartet.** Neue
Regel `startWhenHostResolves()` (`core/app/utils/hostGate.ts`), benutzt von
`realtime-account`, `realtime-config` (core) und `realtime-themes` (themes).
`realtime-branding` braucht sie nicht — ohne `useSiteId()` steigt es ohnehin
aus. Bedingung ist **`isUnknownHostError`, nicht `useError()` schlechthin** —
und das ist der bewusste Unterschied zu Befund 3: ein 404 auf einer
Tippfehler-URL einer **gesunden** Community ist etwas anderes. Dort lebt der
Host, die APIs antworten, und der Account-WS erfüllt seinen Zweck
(Sofort-Abmeldung bei Session-Widerruf). Ihn dort abzuschalten wäre kein
Sparen, sondern der Verlust eines Sicherheitssignals. Benutzt wird dieselbe
Regel, mit der die Fehlerseite ihren eigenen Satz wählt (`CoreErrorPage`,
`shared/unknownHost.ts`) — Seite und Verhalten behaupten damit garantiert
dasselbe. **Nachgeholt, nicht verworfen:** räumt `clearError()` den Fehler,
startet das Abonnement doch noch; ein blosses `return` liesse einen Tab, der
einmal auf einer 404 war, für den Rest der Sitzung ohne Realtime.

**(b) Der Auth-Nachtrag ist entkoppelt, nicht nur umgeleitet.** Die eigentliche
Verstärkung war „ein Verbindungsabbruch = ein Doppel-Abruf". Neue pure Regel
`accountVerifyDue()` neben dem Realtime-Gate (`shared/realtimeGate.ts`, 30 s
Mindestabstand, unit-getestet). Der Verlust ist klein und benannt: ein Widerruf
ist ein **einmaliges** Ereignis, nach einer normal stehenden Verbindung liegt
die letzte Prüfung lange zurück und die Abmeldung kommt **sofort** — nur wenn
ohnehin gerade geflappt wird, kann sie sich um bis zu 30 s verzögern, und dort
ist die Verbindung sowieso unbrauchbar. `0` heisst „noch nie geprüft" und ist
**ausdrücklich** immer fällig, statt sich darauf zu verlassen, dass `Date.now()`
größer als der Abstand ist (sonst verschwände in jedem Test mit gefälschter
Zeit genau die Abmeldung, um die es geht).

**Zur dritten Frage (exponentieller Backoff): unser Code hatte ihn schon, das
SDK hat ihn nicht.** `useRealtimeAccount` staffelt 1 → 15 s und setzt den
Zähler nur nach einer **stabilen** Verbindung (≥ 5 s) zurück — die Messung oben
zeigt die Treppe. Die 58 Konsolenzeilen „Realtime disconnected. Re-connecting
in **1** seconds." kommen aus dem **Appwrite-Web-SDK**: dessen `createSocket`
setzt `reconnectAttempts = 0` im `open`-Handler, nicht nach einer Weile. Ein
Server, der die Verbindung annimmt und sofort wieder schließt — degradierter
`appwrite-realtime`-Container, abgelehnter Origin — hält den Zähler damit für
immer auf 0, und die Staffelung (1 s → 5 s → 10 s → 60 s) wird nie erreicht.
Das ist Fremdcode ohne Haken; der einzige Hebel von hier aus ist, gar nicht
erst zu abonnieren. Deshalb kein eigener Backoff-Umbau — die Änderung wäre eine
Attrappe.

**Beweis (Playwright, echte Appwrite, Dev-Server aus dem Worktree auf 3016,
je 60 s auf der 404-Seite eines `abuse`-gesperrten Hosts mit eingeloggter,
hydrierter Session):**

| | WebSockets | `/api/*` | Konsole „Realtime disconnected" |
| --- | --- | --- | --- |
| vorher | **66** | **15** (7 × `me`+`role`, 1 × `realtime-token`) | **58** |
| nachher | **1** (Vite-HMR) | **0** | **0** |

**Gegenprobe, damit „gar nichts" nicht als Erfolg durchgeht** (gesunder Host,
30 s): auf `/` läuft Realtime weiter (52 WS-Versuche, `realtime-token`,
Presence-Heartbeat) — und darin **eine einzige** `me`+`role`-Prüfung statt der
fünf, die der alte Takt in derselben Zeit gemacht hätte: Fix (b) sichtbar. Auf
einer gewöhnlichen 404-Unterseite (`/gibt-es-nicht`, HTTP 404) startet Realtime
**ebenfalls** — genau der Unterschied zu Befund 3.

`pnpm -r test` grün (core 544), typecheck 0 Fehler, lint 0 Fehler / 5 bekannte
Warnungen, `check:manifests` und `check:single-copy` konsistent.

**Gelernt:** (1) **Ein Reconnect-Takt ist eine Unterschrift.** Die Deltas
1,1 · 2,2 · 4,2 · 8,2 · 15 · 15 haben den Verursacher eindeutig benannt — ohne
Zeitachse im Netzwerk-Log wäre „irgendwas pollt" die einzige Aussage geblieben.
Bei Rausch-Befunden deshalb immer die **Abstände** mitschreiben, nicht nur die
Summen. (2) **Der Browser-Tab in der Vorschau-Leiste drosselt seine Timer.**
Eine erste Messung dort ergab nach 62 s Wandzeit nur 15,6 s Seitenzeit und
damit ein Sechstel der Ereignisse — das sah aus wie ein viel kleineres Problem.
Zeitbasierte Beweise gehören in einen skriptgesteuerten Browser.
(3) **`fetch` in Node löst `kunde-a.localhost` nicht auf** (nur Chromium tut
das intern) **und Nitro hört auf `::1`** — beides zusammen ergab einen
Prüf-Poller, der stumm ewig lief. Die Projektregel „node:http über ::1 mit
gesetztem Host-Header" gilt für Beweis-Skripte **und** ihre Hilfsschleifen.
(4) **Eine „0 = noch nie"-Konvention muss im Code stehen, nicht in der Uhr.**
Der erste Testlauf fiel um, weil `accountVerifyDue(0, 1)` rechnerisch nicht
fällig war — die Absicht hing daran, dass `Date.now()` groß ist.

---

### G4 — Sicherheits-Paket: Session-Handoff, Einladungen, Drosseln, IP ✅ 2026-08-02

**Was geprüft wurde.** Neun Befunde aus einem Sicherheits-Audit über
`packages/core`, `packages/onboarding` und `packages/control`, nach Schwere
abgearbeitet. Jeder Fix hat einen eigenen Beweis; die zwei großen Live-Beweise
sind gewachsen (`verify-site-authz` 103 → **118/118**,
`verify-community-suspension` unverändert **95/95**), dazu ein neuer
Drossel-Beweis (`verify-rate-limits`, **7/7**).

**1 (KRITISCH, Kontoübernahme) — DER SESSION-HANDOFF GING AN JEDE ADRESSE.**
`/start/done` nahm seinen Ziel-Host ungeprüft aus `?host=`
(`packages/onboarding/app/pages/start/done.vue:16,42,48`), und
`POST /api/onboarding/handoff` siegelte die laufende Session in ein Token, das
an **keinen** Host gebunden war. Beides zusammen war eine vollständige
Kontoübernahme: Opfer öffnet `…/start/done?host=angreifer.example&site=x`,
klickt „Community öffnen", das frische Siegel landet in der Query beim
Angreifer, der es binnen 60 s gegen einen ECHTEN Pukalani-Host einlöst —
`site-session.get.ts` setzte ihm daraufhin das Session-Cookie des Opfers. Kein
Schritt davon verlangte etwas, das ein Angreifer nicht hat.

Geschlossen wurden **beide** Hälften, denn jede allein bleibt löchrig:

*(a) Das Siegel trägt seinen Ziel-Host.* `sealHandoffToken`/`openHandoffToken`
(`core/server/utils/embedHandoff.ts`) haben ein PFLICHT-Argument `audience`
bekommen (Payload-Feld `a`), normalisiert mit derselben Funktion wie die
Mandanten-Auflösung (`normalizeHost` — bewusst keine zweite Variante). Kein
Default und keine Alt-Duldung: ein Token ohne passende Zielgruppe ist `null`.
Das ist gefahrlos, weil beide Seiten im selben Deployment laufen (die
Wildcard-Site `platform` bedient Kontroll- und Mandanten-Hosts), es also nie
gemischte Formate gibt — und weil ein misslungener Handoff in beiden Aufrufern
in einen Fallback auf den normalen Login läuft, nie in eine Sackgasse. Der
EMBED-Weg (Popup → iframe, `embed-handoff`/`embed-session`) wurde mitgezogen
und bricht nicht: dort sind Aussteller und Einlöser per Konstruktion dieselbe
Origin.

*(b) Der Host kommt aus der Mitgliedschaft.* `handoff.post.ts` verlangt jetzt
`communityId` (Pflicht), holt die Community aus der **eigenen** Liste des
Nutzers (`/api/control/community/mine` — dieselbe Quelle wie „Deine
Communities") und antwortet mit `{ token, host }`. Wer nicht Mitglied ist,
bekommt 403 statt eines Siegels; die Seite baut ihr Ziel aus dem
zurückgegebenen Host, kann also gar keinen fremden mehr in den Link schreiben.
`start/community.vue` hängt `host` nicht mehr an die Weiterleitung, und
`done.vue` liest die Adresse aus der Community-Liste — `?site=` ist nur noch
ein SCHLÜSSEL in eine geprüfte Liste. Der zusätzliche Control-Plane-Ruf pro
Klick kostet dasselbe wie die Übersicht darüber und teilt deshalb deren
Budget (`onboarding:communities`, 10/min).

**Beweis** (Abschnitt 5 von `verify-site-authz.mjs`, echter Kundenpfad):
Siegel für Host A → auf Host B **401 ohne Cookie**, dasselbe Siegel auf Host A
weiterhin 302 mit Cookie · Fremder bekommt für eine fremde Community **403** ·
ohne `communityId` **400** · Gast **401** · die Antwort nennt den Ziel-Host
selbst. Dazu sechs Unit-Fälle (Sub-/Superstring des Hosts, Groß-/Kleinschreibung,
Port, leere Zielgruppe beidseitig).

**2 (hoch) — EINE EINLADUNG WAR NUR SO VIEL WERT WIE EIN TIPPFELD.**
`accept.post.ts:70` band auf `identity.email`, prüfte aber `emailVerified`
nicht — obwohl `verifyRuntimeIdentity` es liefert. Der Pool ist EIN
Appwrite-Projekt und die Registrierung verlangt keine Bestätigung, bevor man
loslegt: wer wusste, dass `chef@verein.de` als admin eingeladen wurde und dort
kein Konto hatte, legte sich auf irgendeinem offenen Pool-Host genau diese
Adresse an — ohne je an das Postfach zu kommen — und nahm die Einladung an.
Aus „nur der Eingeladene" wurde „jeder, der den Namen kennt", inklusive der
Rolle aus der Einladung. Dasselbe galt für an eine Adresse GEBUNDENE
Einladungs-Codes (`evaluateInviteCode`, control-017).

Jetzt verlangt beides eine bestätigte Adresse: `evaluateInviteCode` hat einen
vierten Parameter `emailVerified` und einen neuen Grund `unverified_email`,
`accept.post.ts` prüft `identity.emailVerified`. Die Reihenfolge ist wichtig
und getestet — der Unterschied zwischen „falsche Adresse" und „unbestätigt"
wird erst NACH der Adressgleichheit sichtbar, ist also kein Orakel: wer hier
ankommt, führt bereits die passende Adresse.

**Rückwärtskompatibilität war die eigentliche Arbeit.** Ein stummes „gilt
nicht" hätte bestehende unverifizierte Konten ausgesperrt, ohne den Weg zu
zeigen. Deshalb reist genau dieser eine Grund nach außen (`data.code:
'email_unverified'` → `reason` im Envelope; der Control-Plane-Transport reicht
ihn durch), die Vorprüfung des Wizards meldet ihn als `codeReason`, und in der
UI steht die neue Komponente `AuthEmailVerifyRequired` (core) — ein Kasten mit
Knopf, der `POST /api/auth/verification` ruft, also die schon vorhandene
Wiederholungs-Route. Bewusst NICHT an `pukalani.auth.verification` gekoppelt:
die Sperre gilt unabhängig davon, ob die App sonst zur Bestätigung mahnt, und
ein Kasten ohne Ausweg wäre das Schlechteste von beidem. Texte de+en an drei
Stellen (`/join`, Wizard-Schritt 0, Wizard-Abschluss).

**Beweis:** im Live-Lauf nimmt ein UNBESTÄTIGTES Konto die Einladung nicht an
(403 + `reason: email_unverified`, keine Mitgliedschaft), nach
`updateEmailVerification` sofort schon. Dazu drei Unit-Fälle inklusive der
Reihenfolge-Zusage.

**3 (hoch) — DIE REGISTRIERUNG WAR UNGEDROSSELT.** `POST /api/auth/signup`
fehlte in `ALWAYS_LIMITED`, obwohl sie die schärfste der Mail-Routen ist: sie
legt Konten an, verschickt Mail an eine frei wählbare Adresse und läuft über
den Admin-Client, umgeht also auch Appwrites eigenes Limit. Jetzt 5/min und IP
wie ihre Geschwister recovery/otp/verification — ein Mensch legt sich kein
zweites Konto in derselben Minute an, ein geteilter Anschluss bleibt mit fünf
Anmeldungen je Minute bequem darunter.

**4 (hoch, erst verifiziert) — X-FORWARDED-FOR WAR FÄLSCHBAR, UND DIE
BEGRÜNDUNG IM CODE STIMMTE NICHT.** Beide Stellen riefen
`getRequestIP(event, { xForwardedFor: true })`. Nachgemessen: h3 **1.15.11**
nimmt darin `.split(",").shift()` — das ERSTE Segment. Und die nginx-Vorlage
dieses Projekts (`docs/archiv/HELP-GO-LIVE.md:98`) setzt
`$proxy_add_x_forwarded_for`, was die echte IP **anhängt**. Wer also
`X-Forwarded-For: 1.2.3.4` mitschickte, erzeugte `1.2.3.4, <echte IP>` — und
gelesen wurde `1.2.3.4`. Damit war jedes IP-Limit mit einem Header-Zähler
aushebelbar (Login-Brute-Force zuerst) und die IP im Aktivitätsprotokoll frei
erfunden.

Der Kommentar im Code und die Phase-17-Checkliste beschrieben ein Setup, das
es hier nie gab: „nur hinter einem Proxy vertrauenswürdig, der den Header
ÜBERSCHREIBT". Die Firewall verhindert das UMGEHEN des Proxys — nicht das
MITSCHICKEN eines Headers DURCH ihn. Genau diese Verwechslung ließ den Befund
2026-07-05 als „bewusst kein Code-Gate" durchgehen.

Gelöst zentral: `core/server/utils/clientIp.ts` mit der puren, getesteten
`resolveClientIp` (LETZTES Segment = das, was der eigene Proxy angehängt hat)
und `trustedClientIp(event)`. Umgestellt sind **alle fünf** Aufrufer:
Rate-Limit-Middleware, `authAudit`, `admin/server/utils/audit.ts`,
`comments/.../guest.post.ts` (der IP-Hash der Gast-Kontaktspur) und
`apps/photos/.../contact.post.ts` (eigener Mini-Limiter). **Ehrliche Grenze,
im Code notiert:** die Regel setzt GENAU EINEN eigenen Proxy voraus. Für den
einen zusätzlich über Cloudflare laufenden Host (`pukalani.app`) ist das letzte
Segment die Cloudflare-Kante — dort landen alle Besucher in einem Eimer. Das
ist die sichere Richtung (zu streng, nie zu lasch), und dieser Host trägt keine
Auth-Routen.

**5 (mittel) — DER DRITTE OPEN-REDIRECT-GUARD WAR DER SCHWÄCHSTE.**
`site-session.get.ts` prüfte `to` mit einer eigenen Regex
(`^\/(?!\/)[^\s]*$`), die `/\evil.example` durchließ — Browser lesen `\` wie
`/`, daraus wird `//evil.example`. Die beiden anderen Tore des Repos
(`shared/redirectTarget.ts`, `shared/notificationLinks.ts`) sperren Backslashes
seit jeher. Statt einer dritten Variante ruft die Route jetzt
`safeRedirectTarget` im Zod-`refine` auf — die Ablehnung bleibt ein 400 wie
bisher.

**6/7 (mittel) — ZWEI UNGEDROSSELTE VERSTÄRKER.**
`POST /api/storage/<bucket>` (Avatar-Upload, bis 5 MB je Datei auf die geteilte
Platte) bekommt 30/min wie `/api/media`, aber einen eigenen Eimer — ein
Redakteur, der eine Galerie füllt, soll sich nicht am Profilbild aussperren.
`GET /api/presence/count` war unauthentifiziert erreichbar und löste pro Aufruf
bis zu **fünf** Presences-Seiten über den ADMIN-Client aus (der billigste
Verstärker im System: ein GET ⇒ fünf Admin-Abrufe); jetzt 120/min wie die
öffentlichen Kommentar-Lese-Routen.

**8 (niedrig) — DAS KONTEN-ORAKEL.** Bei GESCHLOSSENER Registrierung
antwortete `POST /api/auth/otp` für unbekannte Adressen 403 und für bekannte
200 — eine Adressliste ließ sich damit gegen eine Community prüfen.
`recovery.post.ts` macht es seit jeher richtig (identische Antwort in JEDEM
Pfad); die OTP-Route steigt jetzt genauso still aus: dieselben Felder in
derselben Form (frische `userId`, plausible Sicherheitsphrase), kein Konto,
keine Mail. Der Preis ist bewusst: wer sich vertippt, wartet auf eine Mail, die
nicht kommt — dieselbe Erfahrung wie beim Passwort-Zurücksetzen.

**9 (niedrig) — PRÄFIX OHNE SEGMENTGRENZE.** `isAllowedControlPath` verglich
mit nacktem `startsWith`. Vier der sieben echten Präfixe stehen ohne
Schrägstrich in der `app.config` (`/api/health`, `/api/notifications`,
`/api/feedback`, `/api/abuse`) — damit hätte `/api/feedbackfoo` oder
`/api/abuse-export` das Tor passiert. Heute existiert keine solche Route; ein
Sicherheitstor, das eine noch nicht geschriebene Route mit-erlaubt, ist aber
eine Falle für den Nächsten. Jetzt gilt die Regel aus dem Produkt-Gate
(`=== prefix` · `/` · `?`), mit abgeschnittenem Schrägstrich am Ende — sonst
verlangte `/api/auth/` ein `//` und der ganze Kundenbereich fiele auf 404.

**Nebenbei repariert:** `packages/control/scripts/verify-onboarding.mjs` las
`community_members` OHNE Filter und ohne Limit (25er-Default) — sobald andere
Beweisläufe Zeilen hinterließen, fiel die eigene aus dem Fenster und der Beweis
meldete einen Fehler, den es nicht gab. Jetzt gezielt nach der Community
gefragt (25/25 grün).

**Beweise gesamt.** `pnpm -r test` (1360 Tests, 0 rot — davon 6 neue
Handoff-Zielgruppen-Fälle, 7 IP-Fälle, 3 Einladungs-Fälle, 2
Pfad-Grenzen-Fälle) · `pnpm -r typecheck` sauber · `pnpm -r lint` 6 bekannte
Warnungen · `pnpm check:manifests` konsistent ·
`verify-site-authz` 118/118 · `verify-community-suspension` 95/95 ·
`verify-onboarding` 25/25 · `verify-control-host` 13/13 ·
`verify-rate-limits` 7/7 (neu).

**Gelernt:** *Ein Token ohne Adressat ist ein Generalschlüssel.* Der Handoff
war handwerklich sauber gebaut — AES-GCM, 60 Sekunden, Prüfung gegen Appwrite
vor jedem Cookie — und trotzdem eine Kontoübernahme, weil nirgends stand, WER
ihn öffnen darf. Jede Fähigkeit, die zwischen zwei Kontexten reist, braucht
ihren Empfänger IM Siegel; die Lebensdauer ersetzt das nicht.

**Gelernt:** *Eine begründete Ausnahme veraltet mit ihrer Begründung.* Das
X-Forwarded-For-Vertrauen war 2026-07-05 geprüft und bewusst ohne Code-Gate
gelassen — mit einer Annahme über nginx, die nie zutraf. Wer eine Prüfung mit
„das Setup garantiert es" abschließt, muss die Garantie NACHMESSEN (hier: eine
Zeile in der nginx-Vorlage, eine Zeile im h3-Bundle), nicht behaupten.

**Gelernt:** *Sicherheitsfixes ohne Ausweg sind halbe Fixes.* Die
Einladungs-Sperre hätte bestehende Konten stumm ausgesperrt. Der aufwendigste
Teil war nicht die Prüfung, sondern der eine Grund, der nach außen darf, und
die Stelle, an der er zu einem Knopf wird. Und weil er nach außen darf, musste
die Reihenfolge der Prüfungen zur Zusage passen — sonst wird aus der Hilfe ein
Orakel.

**Gelernt:** *Ein Beweisskript, das absichtlich Fehlversuche erzeugt, drosselt
sich selbst aus.* Die neuen Handoff-Prüfungen sprengten das 5/min-Budget von
`site-session`, ein zweiter Lauf innerhalb einer Minute meldete 429 statt der
geprüften Antwort. Lösung: jeder solche Abschnitt bekommt eine eigene
Client-IP per Header — was lokal genau deshalb wirkt, weil dort kein nginx die
echte anhängt, also exakt die dokumentierte Grenze aus `clientIp.ts`.

**Gelernt:** *Der Mandanten-Kontext hinkt der Control-Plane-Zeile hinterher.*
Die OTP-Prüfung schlug zuerst fehl, weil „Registrierung schließen" sofort in
der Datenbank steht, `tenantRegistrationOpen()` seinen Wert aber aus dem
Resolver-Cache (≤30 s) liest — das Control Plane entscheidet den BEITRITT
ungecacht, die Auth-Routen sehen die Sperre später. Der Beweis wartet jetzt mit
einer nebenwirkungsfreien Sonde (`signup` mit ungültigem Passwort: geschlossen
⇒ 403 VOR der Body-Prüfung, offen ⇒ 400, in keinem Fall ein Konto).

---

### G3 — courses/themes-Audit: eine Meldung für drei verschiedene Absagen ✅ 2026-08-02

**Was geprüft wurde.** `packages/courses` und `packages/themes`. Sechs
Befunde, jeder vor dem Fix am laufenden System reproduziert.

**1 (mittel, Produktfehler) — DREI ABSAGEN, EINE FALSCHE MELDUNG.** Die
Kurs-Seite machte aus JEDEM 403 beim Einschreiben denselben Satz: „Dieser Kurs
gehört zu Pro", mit einem Knopf auf `/pricing`
(`courses/app/pages/courses/[slug]/index.vue:41` — `if (statusCode === 403)`,
mehr stand da nicht). Zusammengefallen sind drei ganz verschiedene Lagen:
(a) diese Instanz kann `paid` gar nicht freischalten (kein Access-Guard —
im Pool der Normalfall), (b) der Guard hat abgelehnt, (c) die Community ist
wegen offener Rechnung gesperrt (M13). Zwei davon waren dadurch gelogen. Im
Pool zeigte der Knopf auf eine Seite, die es dort nicht gibt: `/pricing` lebt
in `packages/billing`, und `apps/platform` bindet den Layer nicht ein
(nachgezählt in der `extends`-Liste) — der Klick endete im 404. Und im Fall (c)
stand eine KAUFAUFFORDERUNG neben der Mahnung, die das globale Hinweis-Plugin
(`core/app/plugins/community-suspended-notice.client.ts`) längst zeigt:
ausgerechnet dann, wenn eine Rechnung offen ist.

Jetzt tragen beide 403 einen fachlichen Grund (`data.code` → `reason` im
Envelope, das etablierte Muster), und die Seite unterscheidet daran:
`course_upgrade_required` ⇒ Upgrade-Hinweis MIT Knopf ·
`course_paid_unavailable` ⇒ ehrlicher Satz OHNE Knopf („Er ist als
kostenpflichtiger Kurs angelegt, aber in dieser Community gibt es keine
Bezahlmöglichkeit") · `community_suspended` ⇒ die Seite schweigt, weil das
Plugin schon spricht. Genau so steht es auch im Kopf jenes Plugins: „wer so
eine Stelle ohnehin anfasst, prüft `error.data.reason` und schweigt dann."

**Warum kein zweites Flag für „gibt es hier ein /pricing?".** Weil der Grund
die Frage schon beantwortet: `course_upgrade_required` kann per Konstruktion
nur fallen, wenn ein Guard registriert ist — und den registriert die App, die
auch billing einbindet. Kein Guard ⇒ kein billing ⇒ kein `/pricing`. Das ist
dieselbe Wahrheit, aus der das Dashboard-Formular schon `paidAvailable` zieht
(F13), nur an der anderen Tür gelesen; ein drittes Feld könnte daneben altern.

**2 (niedrig) — DER F13-FIX WIRKTE NUR IM FORMULAR.** `POST /api/courses` und
`PATCH /api/courses/:id` nahmen `access: 'paid'` weiterhin an, auch ohne
Guard. Über die API, einen alten Client oder einen zweiten Tab entstand also
weiter ein Kurs, dessen Buchen-Knopf anschließend nur noch 403 sagt — die
Regel lebte in der Oberfläche statt dort, wo sie niemand umgehen kann. Jetzt
lehnt `assertPaidAccessOffered()` server-seitig ab (422 mit
`course_paid_unavailable`), gelesen aus derselben `isCourseAccessConfigured()`.
Der PATCH prüft den MERGED Zustand — sonst bliebe ein Bestandskurs unbemerkt
auf `paid` stehen, wenn jemand nur den Titel ändert; der Ausweg ist ein Feld
im selben Formular.

**3 (niedrig) — KEIN NETZ FÜR DIE ZWEI MITGLIEDS-WEGE.** `enroll.post.ts` und
`lessons/[id]/complete.post.ts` setzen `actor: 'member'` HART (sie haben kein
Gate, aus dem sie ihn beziehen könnten — nur eine angemeldete Person). Fällt
das `actor` weg, fallen sie auf die Klinke `operator` zurück und damit still
aus der Inhalts-Sperre (M13) und dem Beitritts-Auslöser (A5) — genau das Loch,
das C1c am Vortag geschlossen hatte. Es fällt niemandem auf: das Einschreiben
funktioniert ja weiter, nur eben auch in einer Community mit offener Rechnung.
Der vorhandene Anker-Test prüfte für die sechs REDAKTIONS-Routen ausdrücklich
das Gegenteil (`not.toContain("actor: 'member'")`), die beiden Mitglieds-Wege
standen gar nicht in der Liste. Jetzt: eigener Anker-Block für sie plus vier
Live-Prüfungen im Sperr-Beweis (einschreiben und Lektion abschließen in einer
gesperrten Community ⇒ 403 mit Grund), inklusive Ausgangslage davor — sonst
wäre ein 403 nicht vom Produkt-Gate oder einem Tippfehler zu unterscheiden.

**4 (niedrig, themes) — EINE FELDLISTE, ZWEIMAL GESCHRIEBEN.** Der
JSON-Import der Theme-Galerie führte 14 Config-Felder als abgeschriebenes
String-Array (`sanitizeConfig`), deckungsgleich mit `ThemeConfig` — solange
jemand daran dachte. Ein neues additives Feld (und additiv ist hier die Regel:
das config-JSON trägt bewusst kein `version`) wäre beim Import STILL
verschluckt worden. Still, weil ein fehlendes Feld kein Fehler ist, sondern
ein Default: das eingeführte Theme sähe anders aus als das exportierte, und
niemand wüsste warum. Jetzt kommt die Liste aus `THEME_CONFIG_KEYS`, das über
`Record<keyof Required<ThemeConfig>, true>` am Typ hängt — ein vergessenes
Feld ist ein Typfehler, kein stiller Verlust. Dazu ein Test, der die
Editor-Defaults danebenhält (die leiten sich bewusst NICHT vollständig aus
`ThemeConfig` ab, dort dürfen Felder `null` sein).

**5 (niedrig, themes) — zwei hartkodierte Strings** in
`CustomizeSceneBranding.vue` („Primary", „Neutral") → i18n de+en. Der
deutsche Begriff ist „Grundton", derselbe wie unter
`/dashboard/settings/community`; en „Base tone" wie im admin-Layer.

**6 (niedrig, themes) — DAS GATE SAH NUR IN EINE RICHTUNG.**
`generate-themes.ts --check` verglich Katalog → Datei. Eine CSS, die zu keinem
Katalog-Eintrag mehr gehört (umbenanntes oder gestrichenes Theme), blieb
liegen und wurde weiter ausgeliefert — und weil mit `neutral.css` eine legitim
handgepflegte Datei danebensteht, war „gehört das hierher?" von außen nicht zu
entscheiden. Jetzt nennt das Gate die erwartete Menge (Katalog + dokumentierte
Ausnahme) und meldet alles andere. Gegenprobe gefahren: eine untergeschobene
`zzz-verwaist.css` bricht den Lauf mit Exit 1, nach dem Löschen wieder grün.

**Nebenbei mitgenommen:** die halbe F22-Zeile — der Kopf von
`courseAccess.ts` nannte als Guard-Beispiel „billings `requireEntitlement`",
das mit G1 entfallen ist; heute ruft der Guard `getEntitledProducts()`.

**Beweise.** `verify-community-suspension.mjs` auf 95 Prüfungen erweitert
(vorher 87, acht neue) und grün — 95 bestanden, 0 fehlgeschlagen · Browser-Beweis für Befund 1 auf `demo.localhost:3006`,
beide Fälle einzeln: bezahlter Kurs ohne Bezahlmöglichkeit ⇒ „Dieser Kurs ist
gerade nicht buchbar", kein `/pricing`-Knopf; gesperrte Community ⇒ GENAU EIN
Hinweis (der globale Sperr-Toast), kein doppelter Kurs-Hinweis ·
`pnpm -r test` 0 Fehlschläge (courses 37 → 44, themes 153) · `pnpm typecheck`
0 Fehler · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`check:manifests` und `check:themes` grün.

**Gelernt:** Ein `catch`, der nur den HTTP-Status liest, ist eine
Meldungs-Falle — er behauptet EINE Ursache, wo der Server drei verschiedene
meint. Und wer eine Oberfläche baut, die auf ein Ziel verweist, muss prüfen,
ob es dieses Ziel auf DIESEM Host überhaupt gibt: im Pool und im Silo laufen
verschiedene Layer-Verbünde, ein `localePath('/pricing')` ist deshalb keine
Zusage, sondern eine Annahme.

**Gelernt (Beweis-Betrieb):** (1) `verify-community-suspension.mjs` braucht
rund **20 Minuten** und steht dabei mehrfach LANGE still — am auffälligsten am
Ende von Abschnitt 7, wo es nach dem Aufheben der abuse-Sperre darauf wartet,
dass der Host zurückkommt (Resolver-Cache, bis 45 s je Schleife, und davon
gibt es viele). Ich habe den ersten Lauf genau dort für hängend gehalten und
abgebrochen; der zweite lief an derselben Stelle unverändert durch. Bei diesem
Skript also am Prozess prüfen, ob es noch lebt, statt am stehenden Log — und
abgebrochene Läufe hinterlassen Communities und Konten, die von Hand weg
müssen (das Aufräumen steht im `finally`). (2) `stdbuf` gibt es auf macOS
nicht; der Aufruf scheitert lautlos mit „command not found" in der
umgeleiteten Datei, und der Wrapper-Exit-Code sagt trotzdem 0. Vor dem Warten
also immer in die Log-Datei sehen, nicht nur auf den Rückgabewert.
(3) Nebenbei: Live-Beweise nicht laufen lassen, während man am selben Code
editiert — Vite lädt den Dev-Server neu, und ein Fehlschlag wäre dann nicht
mehr der neuen Arbeit zuzuordnen.

**Gelernt (Sperre lokal setzen):** Eine `billing`-Sperre direkt in die Row zu
schreiben hält NICHT — der `pastDueSweep` hebt sie binnen Sekunden wieder auf
(„kein `pastDueSince` ⇒ nicht überfällig ⇒ nicht gesperrt"). Wer lokal eine
gesperrte Community braucht, setzt `suspension`, `billingStatus: 'past_due'`
UND ein `pastDueSince` in der Vergangenheit. Das ist kein Fehler der
Automatik, sondern ihr Zweck — es kostet nur eine halbe Stunde, wenn man es
nicht weiß.

---

### G2 — events/posts-Audit: der Geldpfad war seit Wochen tot, und CI blieb grün ✅ 2026-08-02

**Was geprüft wurde.** `packages/events`, der GDPR-Contributor von
`packages/posts` und die A14-Naht in `apps/comments/server/plugins`. Sieben
Befunde, jeder vor dem Fix am laufenden System reproduziert.

**1 (kritisch) — DER GELDPFAD WAR TOT.** `grantEventTicket()` schrieb
`data: { …, tenantId }` in `event_tickets`. Diese Spalte gibt es seit E8-3
nicht mehr (events-007 legte `communityId` daneben, events-008 löschte
`tenantId`) — live nachgemessen trägt KEINE Tabelle irgendeiner Instanz noch
ein `tenantId`. Appwrite lehnt unbekannte Felder ab; reproduziert mit dem
Roh-SDK: `400 row_invalid_structure — Unknown attribute: "tenantId"`. Folge in
der Silo-App, wo billing komponiert ist: der Kunde zahlt, der
Stripe-Webhook ruft über `billing-fulfillment.ts` in `grantEventTicket`, das
wirft, Stripe wiederholt endlos, das Ticket entsteht NIE — und
`assertCanRsvpGoing` hält ausgerechnet den Zahlenden mit 403 fail-closed vor
der Tür. Ein ZWEITER, unabhängiger Bruch lag im Lesepfad: `hasEventTicket`
sucht durch die Datentür, und die filtert auf `communityId` — selbst ein
irgendwie geschriebenes Ticket wäre unauffindbar geblieben. Behoben in Typ,
Schreib- und Lesestelle. Repo-weite Nachsuche nach derselben Fehlerklasse:
zwei tote Typ-Felder (`comments`, `media`), sonst nichts — sie stehen als
F25 offen.

**Warum es niemand sah.** `tests/event-tickets.test.ts` mockt den Row-Store.
Ein nachgebauter Speicher hat kein Schema; er nimmt `tenantId`, `bananenId`
und alles andere klaglos an und bleibt grün, während die echte Datenbank seit
Wochen 400 antwortet. Deshalb zwei Konsequenzen: der Mock lehnt jetzt
unbekannte Felder ab (`TICKET_COLUMNS`, mit Selbstprüfung — eine handgepflegte
Liste, die veralten kann, also kein Ersatz), und der eigentliche Beweis läuft
gegen die echte Instanz: `packages/events/scripts/verify-paid-ticket.mjs`
**13/13** liest die Spaltenliste aus Appwrite und fährt Ausstellen →
Wiederfinden → Nachbar sieht nichts → RSVP erlaubt → Webhook-Retry idempotent
→ Silo-Leerwert → unbekanntes Event wirft. Gegenprobe: mit dem alten
Feldnamen fällt er sofort um. Er importiert den ECHTEN Quelltext samt
Datentür (`registerHooks` + `--experimental-strip-types`), nachgestellt sind
nur die Nitro-Auto-Imports. **Und er läuft jetzt in der CI** (e2e.yml, direkt
nach dem Bootstrap gegen die Wegwerf-Appwrite) — genau dort, wo der Fehler
hätte auffallen müssen.

**2 (hoch) — die Titelbilder blieben öffentlich, wenn die Community zumacht.**
Der Bucket `event-covers` wurde in events-002 bucket-weit `read("any")` mit
`fileSecurity: false` angelegt, und das events-Plugin meldete seine Tabelle im
C18-Umzug OHNE `bucket`. Der Umzug zog also jede Event-Row brav auf
`read(label:<communityId>)` und meldete `complete: true`, während jedes Cover
per Roh-URL für die ganze Welt abrufbar blieb — genau der Fall, den core an
`audienceRepermission.ts` benennt. Migration **events-009** stellt den Bucket
auf `fileSecurity` (übrige Einstellungen vorher gelesen und zurückgeschrieben —
`updateBucket` setzt Weggelassenes sonst auf Vorgaben), zieht jede Bestandsdatei
auf die Rechte IHRER Row und sperrt Waisen zu; fail-loud, Exit 1 bei Resten.
Zur Laufzeit gilt eine Regel in einem Satz: **ein Cover ist nie offener als
sein Termin** (`utils/eventCovers.ts`) — beim Upload gestempelt, beim
Publizieren/Zurückziehen nachgezogen, beim C18-Umzug über den jetzt
registrierten `bucket`-Eintrag. Beweis: `verify-audience-flip.mjs` **25/25**,
erweitert um die DATEI (anonymer HTTP-Abruf der `<img src>`-URL, vor und nach
jedem Umschalten). Mit dem alten Bucket-Zustand fällt genau die neue Zeile um.

**3 (mittel) — die Serien-Expansion lief am Kontingent vorbei.** Gedeckelt war
nur das manuelle Anlegen; `expandSeries` legt bis zu 26 Zeilen je Lauf an und
läuft aus JEDEM Listen-GET. Ein Kunde materialisierte sich so über sein
Kontingent hinaus, ohne je etwas Verbotenes zu tun — er legt EINE Serie an,
der Rest entsteht von selbst. Jetzt wird VOR JEDER Zeile geprüft (ohne
konfigurierte events-Limits kehrt `assertPoolWriteQuota` sofort zurück, kostet
also nichts), und die Schleife bricht SAUBER ab statt zu werfen: ein Sweep darf
den fremden Listen-Aufruf nicht sprengen, an dem er zufällig hängt. Still ist
er trotzdem nicht — `logEvent` schreibt Serie, Anzahl und Community, und
unterscheidet „Kontingent voll" von „Prüfung selbst gescheitert" (beides
stoppt: wer die Grenze nicht kennt, darf sie nicht überschreiten).

**4 (mittel) — der Wartungsmodus kannte die Termine nicht.** `maintenanceMode`
war im events-Layer an KEINER Route geprüft. comments kennt ihn seit jeher,
posts seit S10b an allen fünf Wegen — events an keinem: der Betreiber legte
den Schalter um, Kommentare und Beiträge froren ein, und Termine wurden weiter
angelegt, bearbeitet, abgesagt, bebildert, zu- und abgesagt und bewertet.
`assertEventsWritable` (eigener Layer, eigener NAME — zwei gleichnamige
Auto-Imports in `server/utils` zweier Layer kollidieren) hängt jetzt in allen
acht Mitglieds-Schreibwegen, jeweils NACH der Anmeldung. Ausgenommen bleibt der
schlüsselgeschützte Reminder-Sweep. Netz: `events-maintenance-gate.test.ts`
nach dem posts-Muster — strukturell, weil der Befund strukturell ist.

**5 (niedrig) — der GDPR-Grabstein sprach zur falschen Community.** Der
posts-Contributor setzte `read(label('admin'))`, ein INSTANZ-weites Label: im
Pool hätte jede fremde Community Leserecht auf einen Grabstein, der von einem
Menschen handelt. Jetzt je Zeile aus IHRER `communityId` abgeleitet
(`mod<communityId>`, sonst die globalen Betreiber-Rollen) — bewusst NICHT über
`useTenant(event)`: der Lauf geht über alle Communities des Users, es gibt also
keinen „Mandanten dieses Requests", dem man folgen dürfte.

**6 (niedrig) — der Reminder-Sweep-Endpunkt kannte keinen Mandanten.** Der
Schlüssel sagt „wer", nicht „wessen": ohne Pool-Kontext scopet die Datentür
nicht, der Sweep lief über ALLE Communities und `notify({scope:'tenant'})`
stempelte eine leere tenantId — die Erinnerung landete in der
„unbekannt"-Ablage statt in der Glocke ihrer Community. In
Multi-Tenant-Deployments jetzt 400 mit `tenant_required`: ein Aufruf je
Community-Host. Silo unverändert.

**7 (niedrig) — drei Serien-Fan-outs kappten still.** Publish-Propagation,
Cover-Propagation und „Serie beenden" liefen mit nacktem `Query.limit(200)`.
Eine wöchentliche Serie überschreitet das nach knapp vier Jahren — und dann
lässt „Serie beenden" Termine stehen, die der Owner für abgesagt hält. Jetzt
`listSeriesInstances()`, cursor-paginiert, mit lauter Notbremse bei 5000.

**Migration.** `events-009` (Bucket + Bestand). **Reihenfolge in Prod: ERST
Code deployen, DANN migrieren** — wie media-002: nach der Migration vergibt nur
der neue Code Datei-Rechte, ein frisch hochgeladenes Cover bekäme unter altem
Code gar keine. Andersherum gibt es kein Fenster. Betroffen: platform und
comments. Lokal gefahren, Prod steht aus.

**Beweise.** verify-paid-ticket **13/13** (neu) · verify-audience-flip **25/25**
(erweitert) · verify-community-suspension **95/95** · events-Pool-Isolation
**14/14** · posts-Pool-Isolation **7/7** · `pnpm -r test` (1338 grün) ·
`pnpm -r typecheck` grün · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`pnpm check:manifests` grün.

**Gelernt:** (1) **Ein Mock kann eine Schema-Zusage nicht prüfen — er kann sie
nur bestätigen.** Der Test hier war nicht schlampig, er war gut geschrieben und
prüfte die richtige Frage („kommt der Mandanten-Stempel aus dem Event?"). Nur
lag der Fehler eine Ebene darunter, in einer Zusage, die der Prüfling gar nicht
hat: der nachgebaute Store nimmt jeden Feldnamen an. Regel daraus: wo Code eine
SPALTE benennt, gehört mindestens ein Beweis an die echte Instanz — und in die
CI, die eine hat. (2) **Eine Umbenennung ist erst fertig, wenn der SCHREIBPFAD
sie kennt.** events-007/008 liefen fehlerfrei, mit Backfill, Index-Zwillingen
und fail-loud-Gegenprobe — makellose Arbeit an den DATEN. Der Code, der
hineinschreibt, stand daneben und wurde von keiner dieser Prüfungen berührt.
Die Migrations-Gegenprobe fragt „stimmen die Zeilen?", nie „schreibt noch
jemand den alten Namen?" — dafür gibt es nur `grep` und einen echten
Schreibvorgang. (3) **Ein optionales Registry-Feld ist eine Falle, wenn sein
Fehlen wie eine Aussage aussieht.** `registerAudienceRepermissionTable` hatte
für Dateien längst einen Platz (`bucket`), media nutzte ihn, events ließ ihn
weg — und nichts unterschied „hat keine Dateien" von „hat welche und vergisst
sie". Der Umzug meldete deshalb wahrheitsgemäß `complete: true` über eine halbe
Arbeit. Wo ein Vertrag eine zweite Seite kennt, muss das Weglassen begründet
DASTEHEN, nicht bloß möglich sein.

---

### G1 — Billing-/Admin-Audit: Ware ohne Geld, und drei tote Hälften ✅ 2026-08-02

**Was geprüft wurde.** `packages/billing`, die Admin-Routen der
Nutzerverwaltung und der GDPR-Contributor des system-Layers. Acht Befunde,
alle vor dem Fix am Code reproduziert.

**1 (hoch, vor dem Stripe-Go-Live kritisch) — WARE OHNE GELD.** Der Webhook
erfüllte einen Einmal-Kauf, sobald `checkout.session.completed` eintraf. Diese
Nachricht bedeutet aber nur „der Kunde ist durch den Checkout durch", nicht
„bezahlt": bei einer verzögerten Zahlungsart (SEPA-Lastschrift, Rechnung)
kommt sie mit `payment_status: 'unpaid'`, und die Belastung passiert Tage
später — oder scheitert. `payment_status` kam im ganzen Repo nicht vor, die
drei Nachzügler-Ereignisse (`async_payment_succeeded`, `async_payment_failed`,
`expired`) standen nicht in der Allowlist, und keine unserer
Checkout-Erzeugungen schränkt `payment_method_types` ein — welche Methoden
angeboten werden, entscheidet also das Stripe-Dashboard. Ein einziger Klick
dort hätte gereicht: Ticket sofort ausgestellt, Zahlung platzt später, kein
Rückweg. Jetzt entscheidet der Zahlungs-Status statt des Ereignis-Namens
(`checkoutOutcome`, pure, alle vier Wege getestet), die Nachzügler sind
zugelassen, und was NICHT erfüllt wird, steht als strukturierte Log-Zeile da
(`billing.checkout_not_fulfilled`; `payment_failed` als `error`, weil dort
jemand hinsehen muss). Bewusst KEIN `throw`: ein Stripe-Retry käme zum selben
Ergebnis, und die Webhook-Regel lautet werfen nur, wenn Wiederholen helfen kann.

**2 (mittel) — Preis-Allowlist.** `lookupKey` war ein freier Parameter der
Checkout-Utilities; die Garantie hing allein am Aufrufer. Abos prüfen jetzt
HART gegen `pukalani.billing.plans` (ein Preis, den kein Plan nennt, schaltet
ohnehin nichts frei). Einmal-Käufe lassen sich nicht erschöpfend auflisten —
ein Event-Ticket zeigt auf einen `lookup_key`, den der Betreiber in SEINEM
Stripe-Konto anlegt und als Freitext einträgt. Dort greifen zwei Regeln: nie
ein Plan-Key, und der aufgelöste Stripe-Price MUSS `one_time` sein. Wer es
enger will, trägt `pukalani.billing.oneTimeLookupKeys` ein (exakt oder
`präfix_*`).

**3 (mittel, Isolation am Socket) — das Dashboard hörte pool-weit zu.**
`useRealtimeRows(…, 'comments', …)` lief ohne `where`. Dieselbe Klasse wie B2,
nur eine Ebene tiefer: der Strom liest DIREKT gegen Appwrite und ist von der
Datentür nicht erfasst. Live nachgemessen (zwei lokale Communities, roher
Gast-WebSocket): beide neu angelegten Zeilen kamen an EINEM Socket an, beide
mit `read("any")` — die Row-Permissions sind hier also gar keine Grenze.
Folge im Betrieb: jedes Kunden-Dashboard zog bei jedem fremden Kommentar drei
Refetches. Jetzt `rowBelongsToHost(payload, tenantId)` wie bei Activity-Feed
und Glocke; das Spiegel-Inventar in `tenant-brand.server.ts` nennt den neuen
Leser.

**4 (mittel, GDPR) — die E-Mail überlebte die Kontolöschung.**
`POST /api/admin/users` legte sie als `metadata.email` im Audit-Log ab; der
Contributor pseudonymisierte `actorName`/`ip`/`metadata.name`. Die Adresse
stand aber in der Zeile des ANLEGENDEN Admins, nicht in einer eigenen — der
Actor-Zweig griff sie nie. Beide Hälften gefixt: die Route speichert sie nicht
mehr (gebraucht wurde sie nie, `targetId`/`targetName` beantworten „wer"), und
`stripPersonalMetadata` räumt den Bestand — auch im `targetId`-Zweig.

**5 (mittel) — Teil-Löschung meldete nur „fehlgeschlagen".** Die Route hängte
`{results, failed, exportFileId}` an einen 500er. Der zentrale Handler holt
aus `data` aber ausschließlich `code` heraus: es kam NIE etwas an,
`publicContributorResults()` war in der Produktion toter Code — exakt die
`last_admin`-Bauart vom 2026-07-29. Der Betreiber las „Aktion fehlgeschlagen —
es gilt weiter der Stand, den du hier siehst", während der Nutzer in Wahrheit
GESPERRT zurückblieb und ein zweiter Lauf nötig war. Jetzt reist
`deletion_incomplete` als Grund; die Zuordnung Grund → Text liegt pur in
`packages/admin/shared/userActionErrors.ts` (Liste, Detailseite und Test
benutzen dieselben Schlüssel), Texte in de+en. `publicContributorResults` ist
entfallen — WELCHE Layer offen sind, steht strukturiert im Log.

**6 (niedrig) — `requireEntitlement()` entfernt.** Kein Aufrufer, und das war
kein Versehen: der einzige echte Konsument ist der Kurs-Zugangs-Guard, und ein
Guard braucht eine Antwort (`boolean`), keinen Wurf. Ein zweites, werfendes
Gate daneben ist keine Absicherung, sondern eine Abzweigung — es antwortete 402
ohne fachlichen `data.code`, also ohne `reason` im Envelope.

**7 (niedrig) — Rücksprung-URLs kamen aus dem `Host`-Header.** Auf einer
Wildcard-Site reicht der Header ungeprüft bis in den Node-Prozess: ein
gefälschter Host erzeugte eine ECHTE Stripe-Checkout-URL, die nach der Zahlung
auf einen fremden Host zurückführt. Jetzt gewinnt die konfigurierte Basis-URL
der App; der Request-Origin bleibt nur der Rückfall für die lokale Entwicklung
(`shared/returnOrigin.ts`, pur). Muster war `communityCheckout.ts`, das die URL
schon aus `tenants.host` baut.

**8 (niedrig) — `admin/system/update.post.ts` protokolliert.** Dass sie
dev-only ist, war kein Grund: sie schreibt in `pnpm-workspace.yaml` und stößt
einen Install an. Dabei fiel auf, dass `user.created` in keiner der beiden
Sprachen einen Audit-Text hatte — nachgetragen.

**Beweise.** `pnpm -r test` grün (Billing 52, Admin 64, Core 477 — neu:
`checkout-fulfillment-gate`, `user-action-errors`,
`audit-metadata-pseudonymization`, umgewidmetes `userDataOrchestration`).
`pnpm lint` 0 Fehler / 6 bekannte Warnungen, `pnpm check:manifests` 18 Layer +
8 Apps konsistent, `pnpm typecheck` für `apps/control` (= billing + admin +
system + core) grün. Live: zwei Communities über einen Gast-Socket, Testzeilen
danach wieder entfernt.

**Gelernt:** Ein Fehler-Envelope, das nur bei 4xx einen Grund durchlässt,
erzeugt tote Hälften — und zwar genau dort, wo es weh tut. Die alte Regel
(„bei 5xx gibt es nichts zu erklären, nur zu verschweigen") stimmt für die
MESSAGE, nicht für den GRUND: es gibt 5xx, die eine handlungsleitende Auskunft
tragen, und „teilweise gelöscht, Konto gesperrt, bitte erneut ausführen" ist
eine davon. Seit dem 2026-08-02 gilt `reason` für jeden Status; verschwiegen
bleibt trotzdem alles Interne, weil `domainReasonFrom` nur einen kurzen, selbst
geschriebenen Schlüssel durchlässt. Zweite Lektion, dieselbe Familie: wer eine
Ablehnung nur an `statusText` hängt (`requireEntitlement`, 402 „Upgrade
required"), baut die nächste tote Hälfte — ein fachlicher Grund gehört an
JEDEN Wurf, den eine Oberfläche unterscheiden muss.

**Gelernt (2):** Row-Permissions sind am Realtime-Socket kein Mandanten-Netz.
Bei `read("any")`-Zeilen — und öffentliche Kommentare sind genau das — stellt
Appwrite jedem Zuhörer alles zu, auch einem Gast. Der Beweis dafür kostete
zwanzig Zeilen (roher WebSocket auf `tablesdb.<db>.tables.<table>.rows`, zwei
Zeilen anlegen, zählen was ankommt) und war den Aufwand wert: er verwandelte
„könnte theoretisch lecken" in „leckt, hier ist die Zeile". Das Web-SDK taugt
dafür nicht, es braucht `window`; der rohe Socket spricht dasselbe Protokoll.

---

### F19b · #33 — Der Cache-Anstoß hängt nicht mehr am Aufrufer ✅ 2026-08-02

**Befund.** F19 hatte die Ursache gefunden und den Anstoß gebaut — als
OPTIONALES drittes Argument von `indexStep`. Verdrahtet wurde er in den zwei
Migrationen, die die CI umgeworfen hatten (`media/003`, `events/007`). Am
nächsten Morgen starb die CI-E2E an `posts/004`: `tenantId`,
`column_not_available`, **23 Wiederholungen ohne Bewegung**, Abbruch — genau
das Muster von F19, nur in einer der **61** Migrationen ohne Anstoß. Der Schutz
existierte, an der Stelle des Schadens war er nur nicht eingeschaltet.

**Gebaut — die Sicherung sitzt jetzt in der Schnittstelle.** Es gibt kein
`nudge`-Argument mehr. `createIndexSteps(tablesDB, databaseId)` bindet Client
und Datenbank einmal je Datei und liefert zwei gebundene Formen, die den
`createIndex`-Aufruf **selbst** machen:

```ts
const { indexStep } = createIndexSteps(tablesDB, databaseId)
await indexStep('Index comments.author', {
  tableId: 'comments', key: 'author', type: 'key', columns: ['authorId'],
})
```

Der Index reist damit als DATEN statt als Funktion. Zwei Dinge folgen daraus,
und beide waren der Grund für die Form: der Anstoß kann nicht vergessen werden
(es gibt nichts mehr wegzulassen), und er kann nicht auf die falsche Tabelle
zeigen — er benutzt dieselbe `tableId` wie der Index. `createIndex(spec)` ist
die rohe Schwester für die sieben Migrationen, die ihr 409-Handling selbst
schreiben; `withIndexRetry(run, label, nudge)` bleibt als Unterbau, hat den
Anstoß aber als PFLICHT-Argument.

**Umgestellt:** 69 Migrationen, **148 Aufrufstellen**, mechanisch (Skript, vom
HEAD-Stand aus, jede Datei geprüft) — inklusive der zwei bereits verdrahteten,
damit es EINEN Weg gibt und nicht zwei. Nur der Aufruf hat sich geändert:
Fachlogik, Reihenfolge, Log-Texte und die Kommentare, die den historischen
Grund erklären, stehen unangetastet. Echte Fehler (falsche `tableId`, doppelte
Index-Namen) sind dabei keine gefunden.

**Der Wächter ist ESLint, nicht TypeScript.** Beim Umstellen fiel auf, dass
`packages/*/scripts/migrations/**` in **keiner** tsconfig liegt: weder
`nuxi typecheck` der Apps noch das Core-Playground nimmt die scripts-Ordner der
Layer auf. Ein Typfehler dort fällt nirgends auf (Gegenprobe: ein `tsc` über
alle 63 Migrationen meldet **14 vorbestehende** Fehler, die seit jeher
niemandem aufgefallen sind — Row-Generics, `Compression`, `title` in
`Partial<Row>`; alle unabhängig von dieser Arbeit, keiner betrifft die
Index-Anlage). `eslint .` jedes Layers sieht die Dateien dagegen sehr wohl.
Deshalb verbietet eine `no-restricted-syntax`-Regel rohes
`tablesDB.createIndex` in Migrationen — das ist der letzte Weg an der Fabrik
vorbei, und er ist jetzt zu.

**Beweise.**
- `pnpm -r typecheck` grün. Der Typ-Nachweis selbst per `tsc` über die
  Migrationen: die alte Closure-Form ergibt `TS2345` („`() => Promise<…>` ist
  kein `IndexSpec`"), `withIndexRetry` ohne Anstoß `TS2554` („Expected 3
  arguments, but got 2"). Dieselbe Stelle meldet ESLint zweimal mit der
  Klartext-Begründung; danach zurückgebaut.
- Voller Migrationslauf gegen eine **frische Datenbank** derselben lokalen
  1.9.6 (`NUXT_PUBLIC_APPWRITE_DATABASE_ID=f19proof pnpm --filter comments run
  bootstrap` — alle Layer in CI-Reihenfolge, dieselbe Kette wie
  `appwrite-setup` + `bootstrap --seed`): alle Tabellen, Spalten und Indizes
  angelegt, kein `column_not_available`.
- `packages/media/scripts/verify-index-nudge.mjs` **9/9** am lebenden 1.9.6
  (Cache in Redis vergiftet): Gegenprobe „nur warten" scheitert 8/8, MIT der
  Fabrik stößt der Wrapper beim dritten Fehlversuch an und der Index steht nach
  **5,8 s** — der Anstoß kommt dabei aus der Fabrik, der Aufrufer gibt nichts
  mit. Dazu 12 Unit-Tests in `packages/core/tests/indexRetry.test.ts` (vier neue
  nageln fest, dass die FABRIK verdrahtet und auf die Tabelle des Index zielt),
  `pnpm -r test` und `pnpm -r lint` grün.

**NICHT abgedeckt:** der lokale Lauf benutzt eine bestehende, warme
Appwrite-Instanz (nur die Datenbank ist frisch) und lief ohne `--seed`. Er
beweist, dass alle 148 umgestellten Aufrufe gegen ein echtes 1.9.6 durchgehen —
nicht, dass das Rennen dabei je aufgetreten wäre. Dass der Anstoß im Fehlerfall
wirklich feuert, zeigt nur `verify-index-nudge.mjs` (dort wird der Zustand
künstlich hergestellt); der Ernstfall bleibt der CI-Runner.

**Gelernt:** **Ein Schutz, den der Aufrufer mitgeben MUSS, ist ein Schutz, den
die Aufrufer vergessen.** 2 von 63 haben ihn durchgereicht, 61 nicht — und die
CI fiel prompt in eine der 61. Ein optionales Sicherheits-Argument ist keine
Sicherung, sondern eine Bitte. Die Sicherung gehört in die Schnittstelle: was
der Aufrufer nicht angeben kann, kann er nicht falsch angeben. Zweitens: **wo
eine Regel nicht geprüft wird, ist sie keine Regel.** Der Typfehler wäre hier
folgenlos geblieben — Migrationen typechecked niemand. Erst die ESLint-Regel im
tatsächlich laufenden `pnpm -r lint` macht daraus einen Wächter. Vor dem Bauen
eines Gates also nachsehen, ob das Werkzeug die Dateien überhaupt anfasst.

---

### F19 · #33 — Warum die CI-E2E zufällig starb: ein vergifteter Appwrite-Cache ✅ 2026-08-02

> **Die Nummer F19 war zweimal vergeben** (in OPEN-ITEMS.md standen am
> 2026-08-01 die Zeilen `33 · F19` UND `38 · F19`). Unterschieden wird deshalb
> über die laufende Nummer: **#33** ist dieser Eintrag (CI-E2E / Index-Cache,
> Fortsetzung in F19b · #33), **#38** ist der Sperr-Beweis weiter unten.

**Befund.** Zwei von acht E2E-Läufen eines Vormittags starben im Bootstrap mit
`column_not_available` — einmal `media/003` (`tenantId`), einmal `events/007`
(`communityId`). Die naheliegende Erklärung („Wiederhol-Vorrat zu knapp") war
FALSCH und ließ sich widerlegen: der Vorrat lief jedes Mal **vollständig** ab
(24/24 Versuche über 2,5 min), die letzten fünfzehn bereits auf der
Deckel-Pause — es ging nichts voran. Im selben Lauf gingen **67 andere Indizes
beim ersten Versuch** durch. Kein überlasteter Runner also, sondern ein
Zustand, aus dem Geduld nicht herausführt.

**Ursache (im Container-Quellcode von 1.9.6 nachgelesen, nicht geraten).** Der
Index-Endpunkt prüft die Spalte nicht am `attributes`-Dokument, sondern an der
Spaltenliste im **gecachten Collection-Dokument**
(`Indexes/Create.php:97` + `:170`). Der Worker setzt erst `status = 'available'`
(`Workers/Databases.php:210`) und räumt den Cache **erst danach** (`:242`) —
dazwischen liegt noch das Realtime-`trigger()`. Wer in diesem Fenster liest,
schreibt seinen veralteten Stand **nach** dem Räumen zurück; dann steht die
Spalte dort für immer auf `processing`, weil nichts ein zweites Mal räumt.
Bitter: der Poller, der auf `available` wartet, ist selbst der
wahrscheinlichste Vergifter — er liest genau in diesem Moment.

**Beweis.** Das Rennen ist lokal kaum zu treffen (Fenster im
Millisekundenbereich auf unbelasteter Maschine), der vergiftete ZUSTAND aber
exakt herstellbar: Cache-Eintrag in Redis auf `processing` zurückdrehen.
Damit ist die Kette gemessen — vergifteter Cache ⇒ 4/4 derselbe Fehler;
`updateTable` ⇒ Eintrag weg ⇒ Index sofort da.
`packages/media/scripts/verify-index-nudge.mjs` **9/9** mit Gegenprobe: ohne
Anstoß läuft der Vorrat leer (~2,5 min, wie in der CI), mit Anstoß steht der
Index nach **5,9 s**. Dazu 8 Unit-Tests (`packages/core/tests/indexRetry.test.ts`).

**Gebaut.** `indexStep`/`withIndexRetry` nehmen einen optionalen `nudge`; ab dem
dritten Fehlversuch wird der Cache angestoßen statt länger gewartet. Verdrahtet
in `media/003` und `events/007`. Die 141 übrigen Aufrufe verhalten sich
unverändert — der Rest steht als F19 in OPEN-ITEMS.

**Gelernt:** (1) **Ein erschöpftes Budget beweist nicht, dass es zu klein war.**
„24/24 verbraucht" heißt erst dann „zu wenig Geduld", wenn sich zwischendurch
etwas bewegt hat; hier bewegte sich nichts, und das war das eigentliche Signal.
Der Vorlauf-Commit hatte den Vorrat schon von 15 s auf 150 s erhöht — die
richtige Frage war nicht „wie lange?", sondern „wovon hängt es überhaupt ab?".
(2) **Die naheliegende Kur wäre eine Sicherheitslücke gewesen.** `updateTable`
setzt `rowSecurity` und `enabled` bedingungslos (Vorgaben `false`/`true`, nur
`permissions` erbt) — ein Anstoß mit bloßem `name` hätte still die
Zeilen-Sicherheit einer Tabelle abgeschaltet. Aufgefallen ist das nur, weil vor
dem Einbau die Parameter-Semantik im Quellcode gelesen wurde; der Test trägt
die Gegenprobe seitdem fest. (3) **Ein Beweis ohne Gegenprobe ist keiner** —
beide Beweisskripte zeigen zuerst, dass der Fehler ohne die Kur auftritt.

## 📌 Master-To-do — erledigte Brocken

Legende Wer: **[David]** nur David · **[Claude]** autonom machbar ·
**[beide]** Claude baut, David entscheidet/gibt frei.

| # | Task | Wer | Schwere | % | Status |
|---|------|-----|---------|---|--------|
| 3 | **Money-Path-Rest** — #6b Cross-Sub via Stripe-Autorität + #7a Workspace-Customer/Owner-Portal. Deployt 2026-07-22, Details [DECISION-LOG](DECISION-LOG.md). | — | — | 8 | ✅ fertig |
| 4 | **Horizont 3 — Pool+Silo Multi-Tenancy** ([Blueprint](referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md)) — **Kern KOMPLETT (2026-07-23):** Spike ✅ · Schicht 1 ✅ · 4.1 Pool-Datenpfad ✅ · Naht 1/2 ✅ · tenants-Register + Resolver ✅ · Onboarding-UI ✅ · **Prod-Rollout ✅** (platform.pukalani.app als 4. ploi-Site, Wildcard-DNS + ploi-verwaltetes Wildcard-TLS, Pool-Projekt `pool` mit 9 Tabellen, demo.pukalani.app live: 200 + gescopte Liste, unbekannte Hosts 404; Deploy-Kette + Secret; Learnings: platform-Build braucht 3584 MB Heap, `/api/health` + `/_i18n/` sind host-freie Infra-Pfade) · **4.2 Wellen-Migrationen ✅** (tenants.wave internal→canary→stable, `pnpm migrate --wave` + Control-UI, fail-loud, control-012 auf Dev+Prod) · **4.3 Quota ✅ scharf** (assertPoolWriteQuota, comments 1000/Tag + 50k gesamt im Pool, 429 lokal bewiesen — **Zahlen abnicken, s. Kasten unten**) · Microcaches tenant-aware ✅ (tenantCacheScope: changelog, features). **Fläche 2 ✅** reports (moderation-002) gepoolt. **Quota pro Plan ✅ (2026-07-23):** tenants.plan (control-013, free/pro/business) staffelt die Limits (free 200/Tag+5k · pro 1.000/50k · business 5.000/250k; Silo ohne Limit); limitsForPlan pure-getestet, Control-UI Plan-Badge+Select, Migration Dev+Prod. **Tenant-Homepage MVP ✅ (2026-07-23):** pages-Layer in platform gepoolt (pages-003), index.vue rendert die `home`-Seite des Tenants (Markdown + `[[comments]]`-Block, useRequestFetch für Host-Weitergabe), Isolation lokal bewiesen (kunde-a Seite / kunde-b Fallback). **Live-Isolationsskript** [verify-pool-isolation.mjs](../packages/comments/scripts/verify-pool-isolation.mjs). **Read-only-Control-Plane-Key ✅ (2026-07-24, autonom):** `platform-control-readonly` (NUR rows.read) live auf app-prod (Write-Probe 401, demo 200/unknown 404); dabei kompletten Provisioner-Cleanup nachgeholt (pool-Projekt → Pukalani-App-Team, Team provisioning + provisioner-Account weg — alle 4 Prod-Projekte gehören jetzt David) + geleakten comments/migrations-Key rotiert ([Runbook](runbooks/PLATFORM-CONTROL-KEY-SWAP.md)). **Community-Plattform G0+G1 ✅ (2026-07-24, autonom):** Produktvertrag ([G0](referenz/G0-PRODUKTVERTRAG.md), David: Nav, 5-Rollen, Tarif, EA-Scope; kanonische Kunden-Site = **der Tenant**) + Sicherheits-Naht ([Roadmap](archiv/SAAS-ROADMAP.md) G1): `control-015` (`tenants.workspaceId` + `site_members`), core `tenantAuthz` (5 Site-Rollen owner/admin/mod/editor/viewer), `requireTenantPermission` (Cross-Projekt, 30-s-Cache, fail-closed), **Naht 4** `tenantRowPermissionsFor` (read(label(siteId)), Mechanismus + 11 Tests) + **Isolationsbeweis** grün lokal+prod (162 core + 58 studio). **Nachtrag 2026-07-25/28:** Naht-4-Live-Wiring + Session-Label je Site sind mit O5 erledigt (Site-Label wird gesetzt, `requireSitePermission` gilt), „Admin per Tenant" ist mit den Site-Rollen (N1) erledigt — der Owner erreicht sein Dashboard und sieht nur seine Capabilities. **Gelernt:** (1) Der platform-Build braucht **3584 MB Heap** — mit dem Standard-Cap starb er auf dem Server, nicht lokal. (2) `/api/health` und `/_i18n/` müssen **host-frei** bleiben, sonst sperrt der Mandanten-Resolver die eigene Infrastruktur aus. (3) Ein Migrations-Key war geleakt und musste rotiert werden — Schlüssel gehören in Dateien unter `~/.appwrite-secrets/`, nie in Repo-nahe Env-Dateien. **M4 ✅ (2026-07-31):** der letzte ~1 % — das Schlüssel-Verzeichnis für Silo-Communities (`packages/control/scripts/list-silo-keys.ts`, Eintrag unten). Der dynamische Silo-ADMIN-Zugriff zur Laufzeit bleibt bewusst bei seinem 501 (Sicherheitsentscheidung ohne heutigen Konsumenten) — H3 gilt damit als geschlossen. | Claude (Etappen-Go: David) | schwer | 40 | ✅ 40/40 fertig |
| 5 | **Embed-Widget E2–E4** ([Plan](archiv/EMBED-WIDGET.md)) — **E2 ✅ + E3 ✅ (2026-07-23):** E2 = Schreiben im iframe (Popup-Login + Handoff-Token + CHIPS-Cookie; CSRF-scharf; prod-bewiesen cross-site von davidschubert.com inkl. Cookie-Forensik). **E3 = Site-Registry** `embed_sites` (comments-012, Dev+Prod) + Admin-UI `/dashboard/embed` + Registry-gespeiste frame-ancestors-CSP (allowedOrigins jetzt `['http://localhost:*']` statt `['*']`; davidschubert.com in Prod-Registry) + `GET /api/comments/count` (CORS, `data-pukalani-count`-Loader) + Redis-Rate-Limit. Bewiesen: CRUD per API (Create/409/PATCH/DELETE), CSP-from-Registry + count-CORS + 3 Fehlermeldungs-Zweige, 10 Unit-Tests, Embed-E2E grün. **E4 ✅ (2026-07-23):** (1) **Gast-Kommentare** ohne Account (Name+E-Mail, ohne Verifikation) — POST `/api/comments/guest` (Gate `embed.guests`, Rate-Limit 5/min/IP, Tenant-Quota, kein operatorTarget), comments-013 (`authorKind` + operator-lesbare `guest_authors`-Tabelle; **E-Mail nie auf der read(any)-Row**), GuestCommentForm + „Gast"-Badge; live bewiesen (POST 201, keine E-Mail in der öffentlichen Liste, anon-Read von guest_authors 401, Browser-E2E). Aktiviert auf der comments-App. Migration: lokaler Pool, Prod-Pool, Prod-comments. (2) **Presence im Embed** — funktioniert out of the box (geteilter Realtime-Socket trägt sie ins iframe; heartbeat+realtime-token+presences alle 200 live nachgewiesen). (3) **Web-Component** `<pukalani-comments>` (public/pukalani-comments.js, Shadow DOM, sandboxed iframe → keine XSS-/CORS-Fläche); live bewiesen (Shadow-Root+iframe, Resize 308px). **Bewusst später (supervised):** echte Inline-Render-Variante ohne iframe (eigener Sanitizer + CORS-Allowlist) + E3-Task-17 (dedizierte apps/embed-comments). **Gelernt:** `localhost:PORT` gegen `localhost:PORT` ist same-**site** — ein lokaler „Cross-Origin"-Test beweist beim Cookie-Verhalten NICHTS. Cross-Site-Beweise brauchen echte Domains (deshalb der Prod-Beweis von davidschubert.com samt Cookie-Forensik). Und: die E-Mail eines Gastes darf nie auf einer `read(any)`-Row landen — dafür gibt es die getrennte `guest_authors`-Tabelle. | Claude | schwer | 12 | ✅ E2–E4 fertig |
| 6 | **Themes-Vollausbau 26×11** ([Plan](archiv/THEMES-VOLLAUSBAU.md)) — **✅ FERTIG (2026-07-24, E1–E7 alle per Empfehlung):** kuratierter Katalog `theme.catalog.ts` (21 Hue-Kreis-Welten + 5 gedeckte Ausreißer, je Basis+10 tonale Varianten = 286 Ramps), Generator mit Kontrast-Gate (Anker fest 500 — Bestands-500er byte-gleich, `--ui-primary` bleibt 600/400), committete `themeRegistry.gen.ts` + CI-Gate `check:themes` (lint.yml), Grid-Modal-Picker mit sticky Varianten-Reihe (E7b). Bewiesen: 62 Unit-Tests + Guard (26×11), SSR-Cookie-Beweis, Visual-Baselines 9/9 neu, Dark-Stichprobe. **Gelernt:** Generierte Dateien gehören ins Repo UND hinter ein CI-Gate (`check:themes`) — sonst laufen Katalog und erzeugtes CSS auseinander, ohne dass es jemand merkt. Der Kontrast-Anker muss FEST auf Stufe 500 stehen, sonst verschiebt jede Neugenerierung bestehende Kundenfarben. | Claude | schwer | 10 | ✅ fertig |
| 7 | **Deploy-RAM-Härtung** — Swap (18.07.) + NODE_OPTIONS-Cap 2560 in ploi-`~/.bashrc`; Praxistest: Deploys in Folge sauber. Nachtrag 23.07.: platform-Build braucht 3584 (Deploy-Script), Überhang läuft in den Swap. | — | — | 3 | ✅ fertig |
| 8 | **Shared Rate-Limit-Store** — ✅ 2026-07-23: Redis lief auf app-prod bereits (bei Server-Einrichtung mitinstalliert, localhost:6379). Core `rateLimitStore.ts` (Fixed-Window, peek/hit; Redis wenn `NUXT_REDIS_URL` gesetzt, sonst In-Memory; fail-open mit Log; Keys pro Appwrite-Projekt gescoped), Middleware umgestellt, Unit-Tests + lokaler E2E (5×200 → 429, geteilter Redis-Zähler). | — | — | 3 | ✅ fertig |
| 9 | **E2E studio + portfolio** — Playwright-Smoke (10 + 5 Tests) nach comments-Muster; `pnpm --filter <app> e2e`. | — | — | 3 | ✅ fertig |
| 13 | **Self-Service-Onboarding ✅ GEBAUT (2026-07-25, O1–O6)** — der öffentliche Trichter läuft: `app.pukalani.app` (Kontroll-Host, Nicht-Mandant mit fail-closed API-Allowlist) → Invite-Code → **Wizard in 7 Schritten** → Community steht → **Handoff, der eingeloggt ankommt**. Abnahme nach Roadmap-DoD: **10 unbeaufsichtigte Läufe, Median 0,3 s**, Retry idempotent, keine Waisen-Rows. Dazu: Branding pro Mandant (nicht pro Projekt), `requireSitePermission` (Site-Rolle vor protokolliertem Break-Glass), Site-Label für Naht 4, Startseite aus der Beschreibung, Testphasen-Sweep. **Hosts umbenannt (2026-07-25):** `control.` (Betreiber, Alias der Control-Site + Wildcard-Zertifikat) · `my.` (Kundenbereich) · `start.` (Kurz-Link in den Wizard) — alle live, Altnamen antworten weiter. Details: [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md) | Claude | schwer | — | ✅ Trichter fertig |
| 10 | **SaaS-Produkt-Roadmap + pukalani.app-Landingpage** — ✅ SPEZIFIZIERT (2026-07-24): der verlorene „10-Ideen"-Zettel wurde durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (9 Ideen, Davids Entscheidungen je Idee, UI/UX-Konzepte für Tenant-Selbstverwaltung/Dashboard-IA/Custom-Domains) + [PUKALANI-LANDINGPAGE.md](archiv/PUKALANI-LANDINGPAGE.md) (SEO+UX-Konzept). **✅ GEBAUT (2026-07-27):** die Landing ist live auf `pukalani.app` (ploi-Site 392338, Apex proxied über Cloudflare), Roadmap-Blöcke §A Dashboard-IA, #2 Tenant-Selbstverwaltung und #1 Self-Service-Onboarding sind umgesetzt. Rest: laufende Inhaltspflege (Netto/Brutto s. A3; og:image je Community ist seit 2026-07-29 erledigt, s. B2). | beide | mittel | 2 | ✅ Landing live |
| 11 | **GitHub-Klicks** — ✅ 2026-07-23: #16/#15/#2 hatte David am 21.07. gemergt; Release-PR #18 gemergt → **v2.2.0 released** (Changelog-Draft automatisch angelegt — Kuratieren + Publish von v2.1.0 UND v2.2.0 liegt bei David im Dashboard). Neu offen: Dependabot #19–23 (npm-Bumps, kein workflow-Scope nötig). | — | — | 1 | ✅ fertig |
| 12 | **Kleinkram** — ✅ Demo-Passwörter · ✅ >14k-Limit (MEDIUMTEXT) · ✅ Wegwerf-Projekte gelöscht (2026-07-24): alle 7 lokalen Probes (s0-*, s1-probe-*, s3-*) weg — 5 regulär via Console-API (Login als Spike-User s0-admin), 2 chirurgisch per DB (Appwrite-Delete warf `openssl_decrypt cipher_algo empty`-500; 132 präfix-verifizierte Tabellen gedroppt + Console-Rows entfernt), Wegwerf-Teams s0-org/pukalani-sites gelöscht, Spike-Console-User s0-admin (hartkodiertes PW!) entfernt, Redis-Cache geflusht; echte Projekte per Smoke verifiziert (401 vs 404). **Gelernt:** Appwrites Projekt-Löschung kann mit `openssl_decrypt cipher_algo empty` in einen 500 laufen — dann bleibt nur der chirurgische Weg über die DB, und der verlangt VORHER eine Präfix-Verifikation jeder Tabelle. Und: ein hartkodiertes Spike-Passwort überlebt den Spike, wenn niemand aufräumt. ✅ Dependabot #19–23: von Dependabot selbst geschlossen — die Bumps (u. a. @nuxt/ui 4.10, vue-tsc 3.3.8) kamen längst über den pnpm-Catalog rein. | — | — | 1 | ✅ fertig |

**Fertig-Anteil zum Stichtag 2026-07-30: 82 % ✅ (43 % + 39/40 von H3) ·
offener Rest (18 %) wartet fast vollständig auf David: Rechtstexte (5) +
Stripe-Live (12) + Audience-Entscheidung (1, inzwischen als C18 entschieden).**
Der Stichtag bleibt stehen (Momentaufnahme); H3 steht seit 2026-07-31 auf
40/40 — M4 war der Rest.

> **📋 Quota-Zahlen (H3-4.3) — seit 2026-07-24 IM STUDIO EDITIERBAR:**
> Studio → Tenants → „Pläne & Limits": free 200/Tag + 5.000 gesamt ·
> pro 1.000/50.000 · business 5.000/250.000 (Seed = beschlossene Zahlen;
> 0 = unbegrenzt). Änderungen wirken im Pool nach ≤ 90 s ohne Deploy
> (tenant_plans, control-014 → Resolver legt Limits in den TenantContext;
> app.config bleibt Fallback). Silo-Kunden: ohne Limit (eigenes Projekt).

---

## A — erledigt (blockierte den ersten zahlenden Kunden)

| # | Task | Erledigt | Wer |
| --- | --- | --- | --- |
| A3 | **Netto/Brutto-Angabe** — ✅ ERLEDIGT (2026-07-29, Davids Entscheid: **Brutto**): 29 €/149 € sind Endpreise, Hinweis „inkl. 19 % MwSt." / „incl. 19 % VAT" steht AM Preis — Landing (`PricingSection` + FAQ, de/en), Hilfe (`anleitung/5.abrechnung.md`), Billing-Preistafel (`packages/billing`), Betreiber-Preisfeld (control) als „brutto" beschriftet. **REST [David], läuft in A2 weiter:** Stripe legt die Prices ohne `tax_behavior` an und die Checkouts laufen mit `automatic_tax` — steht das Konto-Default auf „exclusive", rechnet Stripe 19 % oben drauf und widerspricht der Landing. Prüfung vor dem Live-Gang: [STRIPE-GO-LIVE-RUNBOOK](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) §2.4. **Gelernt:** Eine Preisangabe ist erst dann konsistent, wenn auch die ZAHLSTELLE dasselbe rechnet — steht Stripes Konto-Default auf „exclusive", schlägt es 19 % auf den beworbenen Endpreis auf. Preis-Texte und `tax_behavior` immer im selben Arbeitsgang prüfen. | 2026-07-29 | ✅ Claude · Stripe-Rest David |
| A4 | ~~**Presence-Rows sind pool-weit lesbar**~~ — **erledigt 2026-07-29** (Weg (c), Davids Entscheidung): Presencen tragen im Pool `read("label:<siteId>")` statt `read("users")`, das Label vergibt `core/server/middleware/site-label.ts`. Der tenantId-Filter bleibt als Netz. Beweis in beide Richtungen: `packages/core/scripts/verify-presence-boundary.mjs` (23/23). **Nachtrag:** die damalige Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") ist mit A5 ersetzt — sie war mit C16 nicht mehr haltbar. Analyse + Umsetzungs-Stand: [PRESENCE-GRENZE.md](archiv/PRESENCE-GRENZE.md) Abschnitt 8. **Gelernt:** Die erste Fassung der Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") hielt keinen Tag — sie beschrieb ein VERHALTEN statt einer Tatsache und machte „Zugang entziehen" wirkungslos (→ A5). Eine Berechtigung muss an einem Datensatz hängen, den man entfernen kann, nicht an einer Beobachtung. Rest-Falle, die bleibt: eine Label-Änderung berechnet die Rollen bereits OFFENER WebSockets nicht neu. | 2026-07-29 | ✅ |
| A5 | ~~**„Zugang entziehen" wirkte nicht**~~ — **erledigt 2026-07-29** (Davids Entscheidungen 1+2): Mitgliedschaft ist jetzt ein EREIGNIS und das Site-Label folgt ihr, statt sie zu behaupten. Gesteuert vom bestehenden Schalter `tenants.openRegistration`: offen ⇒ Beitritt mit Rolle `viewer` bei (a) Kontoanlage auf dem Mandanten-Host und (b) erstem eigenen Schreibvorgang (abgefangen in der Datentür, nicht in zwanzig Routen) — ein bloßer Seitenaufruf löst bewusst nichts aus; geschlossen ⇒ nur per Einladung. Entfernen zieht Rolle UND Label (`revokeSiteLabel` + Kurzzeit-Notiz gegen den 30-s-Rollen-Cache) und ist gegen Wiederbeitritt gesperrt. Bestand aus der A4-Zeit (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst — kein Backfill-Skript. Mitgliederliste zeigt alle, Standardansicht filtert aufs Team. Beweis: `verify-site-authz.mjs` Abschnitt 10 (97/97) + `verify-presence-boundary.mjs` (23/23). **Gelernt:** Den Beitritts-Auslöser in die **Datentür** zu legen statt in zwanzig Routen war der Unterschied zwischen „einmal richtig" und „neunzehnmal richtig und einmal vergessen". Und: ein 30-s-Rollen-Cache macht jeden Entzug für eine halbe Minute wirkungslos — deshalb die Kurzzeit-Notiz `rememberSiteAccessRevoked`. | 2026-07-29 | ✅ |
| D7 | ✅ **ERLEDIGT 2026-07-30.** Neu ist `listOperatorIds()` in `packages/control/server/utils/inviteRequests.ts`: Appwrite filtert das Label jetzt SELBST (`Query.contains('labels', ['admin'])`, gegen eine laufende 1.9.6 verifiziert), dazu eine Cursor-Seitenschleife. Der `includes('admin')`-Nachcheck bleibt bewusst stehen — `contains` arbeitet auf Strings substring-artig, ein Konto mit Label `administrator` darf hier nicht mitgemeint sein. Wird der Seiten-Deckel erreicht, ist das eine LAUTE Log-Zeile statt einer stillen Kürzung. Dass die Grenze real ist, wurde beim Fix gemessen: die geprüfte Instanz hat **42 Konten**, davon 4 mit `admin` — mit `limit(25)` war das Durchrutschen keine Theorie mehr. Lint sauber, 139 Tests, Typecheck 0 Fehler. **Gelernt:** Jede Liste ohne explizite Seitenschleife ist ein stiller Datenverlust in Zeitlupe — Appwrites Default-`limit` ist 25. Und `Query.contains` arbeitet auf Strings substring-artig: `admin` matcht auch `administrator`, der Nachcheck im Code bleibt Pflicht. Erreichte Deckel gehören LAUT ins Log, nie still gekürzt. | 2026-07-30 | Claude |

---

## B — erledigte Entscheidungen

| # | Frage | Erledigt | Wer |
| --- | --- | --- | --- |
| B2 | ~~**og:image je Tenant-Seite**~~ — **erledigt 2026-07-29** (Davids Entscheidung: **automatisch generiert**, kein Upload-Feld und kein Einheitsbild). `/og/<key>.png` liefert je Community eine 1200×630-Karte aus Theme-Basisfarbe + Community-Name + dezenter Wortmarke; `useLocaleSeoHead()` (core) setzt og:image/width/height/type/alt + `twitter:card` als EINZIGE Stelle, absolut auf dem Request-Host. **PNG, nicht SVG** — Facebook/WhatsApp/LinkedIn zeigen SVG als og:image nicht. Gerastert OHNE Renderer im Betrieb: Chrome hat die Zeichen einmal in ein Deckungs-Atlas gebacken (`packages/themes/scripts/generate-brand-card-font.mjs`, 85 KB committet), der Server setzt sie zusammen (~16 ms Event-Loop, Kompression im Threadpool) und legt das Bild unter `/tmp` ab — je Community faktisch EINMAL. Beweis: `apps/platform/scripts/verify-og-image.mjs` (19/19 grün gegen demo.localhost). Gate `pukalani.seo.tenantOgImage` (Core-Default aus). **Offen als mögliche Ergänzung:** eigenes Bild hochladen (bewusst NICHT gebaut). **Gelernt:** Facebook, WhatsApp und LinkedIn zeigen **kein SVG** als og:image — die erste, elegante SVG-Lösung war unbrauchbar und musste als PNG neu gebaut werden. Beim Rastern gilt: kein Renderer im Betrieb (Chrome backt die Zeichen einmal in ein Atlas), und der Schlüssel in der Bild-URL darf nie EINGABE sein, sonst füllt ein Bot mit erfundenen Schlüsseln die Platte. Ablage in `tmpdir()`, nie in `.output` — Release-Slots wechseln den Pfad. | 2026-07-29 | ✅ |
| B3 | ~~**Theme-Name „Sunrise"** steht im Picker neben dem bestehenden „Sunset"~~ — **erledigt 2026-07-29** (Davids Entscheidung): das Standard-Theme heißt im Picker **„Aloha"**. Geändert wurde AUSSCHLIESSLICH das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n — Theme-Namen sind Eigennamen, de = en); die Id bleibt `default`, weil sie in `tenants.theme`, `data-theme`, den CSS-Dateinamen und gespeicherten Kunden-Configs steckt. Test hält Name + Eindeutigkeit fest (`tests/builtinThemes.test.ts`). **Gelernt:** Ein Anzeige-Label ist NICHT der Schlüssel. Wer ein Theme über seine Id umbenennt, bricht `tenants.theme`, `data-theme`, die CSS-Dateinamen und alle gespeicherten Kunden-Configs auf einmal. | 2026-07-29 | ✅ |
| B5 | ~~**Besucher-Theme vs. Community-Theme**~~ — **erledigt 2026-07-29** (Davids Entscheidung: die Community gewinnt). Auf einem Mandanten-Host wird das Theme-Cookie GAR NICHT mehr gelesen: `data-theme/data-variant` kommen aus `tenants.theme/variant`, ohne eigene Wahl aus der Instanz-Einstellung. Der Theme-Wähler VERSCHWINDET dort (öffentliches Anzeige-Menü + Dashboard-Kontomenü) statt beschriftet zu werden — er hätte auch „nur für dich" nicht mehr gewirkt. Hell/Dunkel, Neutral-Palette und Sprache bleiben Besucher-Wahl. Regel pur + getestet in `packages/themes/shared/themeSelection.ts` (11 Fälle); live belegt an `kunde-a.localhost` (Cookie `crimson` → SSR `data-theme="lagoon"`) gegen `app.localhost` (Cookie gewinnt weiter). **Rest ebenfalls erledigt (2026-07-29, Davids Entscheidung: JA):** die **Neutral-Palette folgt der Community**. Neue Spalte `tenants.neutral` (Migration **control-020**, additiv, `''` = keine eigene Wahl → Voreinstellung), zweite pure Funktion `resolveNeutralSelection` auf EIGENER Achse (die Herkunft kann von der des Themes abweichen, deshalb kein viertes Feld im Theme-Ergebnis) — 14 neue Fälle, Registry-Prüfung `isBuiltinNeutralSelection` gegen `NEUTRAL_REGISTRY`. Gesetzt wird sie als EINE Zeile „Grundton" neben Theme/Variante in `/dashboard/settings/community` (10 Chips inkl. „Voreinstellung"); der Besucher-Umschalter verschwindet auf Mandanten-Hosts aus Anzeige-Menü, Dashboard-Kontomenü und Theme-Studio (`canChooseNeutral`). Hell/Dunkel und Sprache bleiben Besucher-Wahl. Beweis: `packages/onboarding/scripts/verify-site-branding.mjs` 40/40 (u. a. `kunde-a` mit Cookie `pukalani-neutral=olive` → SSR `data-neutral="taupe"`, Kontroll-Host mit demselben Cookie → `olive`). **Rest lief als D6 weiter — erledigt am 2026-08-01 (eigene Zeile unten):** eine Änderung erreichte offene Fenster nicht ohne Reload (`communities` liegt im Control-Plane-Projekt, es gibt dafür kein Realtime); gelöst über den Spiegel `community_branding` im Runtime-Projekt. **Gelernt:** Ein Wähler ohne Wirkung ist eine Lüge — deshalb VERSCHWINDET der Theme-Umschalter auf Mandanten-Hosts, statt beschriftet zu werden. Die Regel selbst gehört in eine PURE Funktion mit Fallmatrix (11 + 14 Fälle); die Composables legen nur Cookies und Registry-Prüfung darum. Und `''` (keine eigene Wahl) darf nie in ein `USelectItem` — Nuxt UI verbietet leere Werte, deshalb Chips. | 2026-07-29 | ✅ |
| B6 | ✅ **ENTSCHIEDEN 2026-07-30 (David): `UTable` ist der Standard für Datenlisten** — Sortierung, Auswahl und Paginierung kommen mitgeliefert und verhalten sich überall gleich; handgebaute Listen nur mit Grund, und der gehört an die Stelle geschrieben. Steht als Regel in CLAUDE.md. **Offen ist damit nicht mehr die Frage, sondern das Ausrollen** auf die ~18 handgebauten Listen — das läuft mit E9 (Dashboard-Umbau), damit die Listen nicht zweimal angefasst werden. | 2026-07-30 | David |

---

## C — erledigt (Claude konnte sofort)

| # | Task | Erledigt | Herkunft |
| --- | --- | --- | --- |
| C0 | ✅ **ERLEDIGT 2026-07-28** — media-002 gegen Projekt `comments` gefahren. Vorher: Tabelle `rowSecurity=false` + `read("any")`, Bucket `fileSecurity=false` + `read("any")` — jeder Anonyme konnte Entwürfe samt Bild abrufen. Nachher: beide `rowSecurity/fileSecurity=true` mit leeren Table-/Bucket-Rechten, das Leserecht hängt an der Row bzw. Datei und folgt `published`. Der veröffentlichte Bestand (1 Eintrag) trägt jetzt `read("any")` + `read("label:admin")` und ist unverändert erreichbar (Galerie-URL → HTTP 200, image/webp). Ist-Zustand vorher als JSON gesichert. **Voraussetzung war**: dem `comments`-Migrations-Key fehlten Storage-Scopes — media-002 ist die erste Migration, die einen Bucket anfasst (David hat sie am 2026-07-28 ergänzt). `photos` war nie betroffen (nicht in Produktion). **Gelernt:** Migrations-Keys haben **Scopes** — media-002 war die erste Migration, die einen Bucket anfasst, und scheiterte, bis David dem `comments`-Key die Storage-Scopes gab. Vor jeder Migration prüfen, welche Ressourcenart sie berührt. Zweitens: den Ist-Zustand VORHER als JSON sichern, sonst gibt es keinen Vergleichspunkt für „nachher unverändert erreichbar". | 2026-07-28 | Audit B3 |
| C0b | ✅ **ERLEDIGT 2026-07-29** — die beiden ruhenden Migrationen sind auf prod gefahren. **system-021** (`activities.tenantId` + `idx_tenant`) auf ALLE vier Instanzen mit Appwrite: control, pool, comments, portfolio (marketing und help haben keine Datenebene). **media-003** (`media_items.tenantId` + `idx_tenant_published_order`) auf comments — die einzige Prod-Instanz mit media, weil photos nur lokal läuft. Vorher je Instanz gesichert, danach gegengeprüft: überall `tenantId` mit Status `available`, Spalten 8→9 bzw. 7→8, Indizes 3→4 bzw. 1→2, Zeilenbestand unverändert (comments 32 Aktivitäten, 1 Medien-Eintrag). Alle Kunden-Hosts danach 200. | 2026-07-29 | C1b / Audit B3 |
| C0c | ✅ **ERLEDIGT — war schon auf prod, die Zeile war veraltet** (nachgeprüft 2026-07-29). `system-022` (`notifications.tenantId` + `idx_recipient_tenant`) liegt auf **allen vier** Instanzen mit Datenebene: `control`, `pool`, `comments`, `portfolio` — je 8 Spalten, `tenantId` mit Status `available`, 4 Indizes inklusive `idx_recipient_tenant` (gelesen über `listColumns`/`listIndexes` gegen `https://api.pukalani.app/v1` mit den Migrations-Keys). Das Rückfall-Fenster, vor dem diese Zeile warnte, hat es also nie gegeben. `notifications` ist auf allen vier noch leer (0 Zeilen) — die Glocke ist jung, ein Backfill wäre ohnehin gegenstandslos. **Gelernt:** Eine Warnung in einer To-do-Liste ist eine BEHAUPTUNG, bis jemand nachmisst. Diese hier warnte vor einem Rückfall-Fenster, das es nie gab. Vor dem Handeln immer den Ist-Zustand gegen die Instanz lesen (`listColumns`/`listIndexes`), nicht gegen die Notiz. | 2026-07-29 | C15 |
| C1 | ✅ **ERLEDIGT 2026-07-28** — `/api/admin/stats\|analytics` gaten über `await requireSitePermission(event, 'dashboard.access')` statt label-only. Bewusst diese Capability: sie ist die Eintrittskarte, die alle fünf Site-Rollen auf die Übersicht bringt — enger gegated bliebe die Seite für Editor und Viewer leer, der Befund wäre nur verschoben. Kennzahl-genau geklemmt: `commentsReported` nur mit `comments.moderate` (offene Meldungen sind Moderations-Wissen), `usersTotal`/`usersInRange` bleiben im Pool `null` wie gehabt — Karte bzw. Balkenreihe entfallen dann, statt eine fremde Zahl zu zeigen. Mitgenommen: **Audit S2** — die Übersicht gatet ihre Widgets jetzt einzeln (Schnellmoderation `comments.moderate`, Aktivität `audit.read`, Speicher `storage.manage`), inklusive `immediate`, damit für Site-Rollen keine vorhersehbaren 403-Fetches mehr rausgehen. Beweise: `packages/admin/tests/dashboard-stats-authz.test.ts` (11 Fälle) + live 30/30 in `verify-site-authz.mjs` (neuer Abschnitt 6b: Owner 200, Fremder 403, Gast 401). | 2026-07-28 | Pool-Audit N8 |
| C1b | ✅ **ERLEDIGT 2026-07-28** — media und activity gehen durch die Datentür. Migrationen: **media-003** (`media_items.tenantId` + idx_tenant_published_order) und **system-021** (`activities.tenantId` + idx_tenant), beide additiv/ruhend ohne Backfill ('' = Silo, im Pool fail-closed). Alle sechs `server/api`-Routen über `tenantDb(event)`, `as:'operator'` nur wo fachlich nötig (Entwurfs-Rows ohne breites Leserecht, Rows ohne Schreibrechte) und je Fall am Code begründet. Auch die Helfer außerhalb des Backstops: `applyMediaVisibility` prüft selbst, `recordActivity` (core) stempelt Mandant + Site-Label statt `read(users)` — sonst hätte im Pool jedes Mitglied den Feed aller Communities bekommen, auch über Realtime. Der Activity-Realtime-Stream filtert zusätzlich clientseitig (`useTenantId`). ESLint-Backstop auf beide Layer erweitert; Isolationsbeweise `packages/{media,activity}/tests/tenant-isolation.test.ts` gegen echte Appwrite grün. **Prod-Migrationen nachgezogen mit C0b (2026-07-29).** **Ein Rest, kein Leck**: Entwurfs-DATEIEN im Bucket tragen nur den globalen Operator-Read — im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht vorschauen; Richtung (server-seitige Vorschau-Route) steht in `media/server/utils/mediaPermissions.ts`. **Gelernt:** Der ESLint-Backstop gegen rohes `.tablesDB` griff nur in `server/api/**` — der Stats-Contributor von comments liegt aber in `server/plugins/**` und zählte deshalb ungebremst pool-weit in eine Kunden-Ansicht. Wer einen `H3Event` bekommt, bedient einen REQUEST und gehört hinter dieselbe Tür wie eine Route. Zweitens: `recordActivity` stempelte `read(users)` — im Pool hätte damit jedes Mitglied den Feed ALLER Communities bekommen, auch über Realtime. Helfer außerhalb des Backstops sind die gefährlichsten Stellen. | 2026-07-28 | Dashboard-Audit S3 |
| C1c | ✅ **ERLEDIGT 2026-08-01** — **die Türklinke sagt nicht mehr, wer handelt.** `tenantDb(event)` hatte bis hierher EINE Angabe (`as: 'member' \| 'operator'`), und die entschied dreierlei auf einmal: welcher Appwrite-Client fragt, ob die Inhalts-Sperre (M13) greift, und ob das Schreiben eine Mitgliedschaft auslöst (A5). Das ging nur so lange gut, wie „Admin-Client" und „Betreiber handelt" dasselbe waren — und das sind sie nicht: viele Routen brauchen den Admin-Client aus rein TECHNISCHEN Gründen (`media_items`, `poll_votes`, `event_rsvps`, `enrollments` tragen bewusst keine User-Schreibrechte; ein Gast hat gar keine Sitzung). Sie meldeten sich damit still von Sperre UND Beitritt ab. **Neu:** `as` = mit welchen Zugangsdaten, `actor: 'member' \| 'guest' \| 'operator'` = wer handelt, Default `actor = as` — alles Bestehende verhält sich unverändert, und wer den Admin-Client braucht, obwohl ein Mensch aus der Community handelt, muss es HINSCHREIBEN. Zwei pure Regeln (`actorFacesContentLock`, `actorJoinsByWriting`) statt zweier `=== 'member'`-Vergleiche im Rumpf. Umgestellt: die vier Medien-Wege (Upload, Metadaten/Veröffentlichen, Löschen, `applyMediaVisibility`) auf `actor: 'member'`; der Gast-Kommentar auf `actor: 'guest'` — INHALT (fällt unter die Sperre), aber kein Beitritt (ein Gast hat kein Konto, dem eine Mitgliedschaft gehören könnte). Genau diese beiden Antworten ließen sich mit einer einzigen Angabe nicht geben. **Dabei gefunden und mitgefixt:** die M13-Zusage nennt „Kommentare, Beiträge, Umfragen, Zu- und Absagen, Kursfortschritt" — von diesen fünf war nur der erste wirklich zu. Umfrage-Stimme, Beitrags-Löschung durch den Autor, Event-Zu-/Absage, Kurs-Einschreibung und Lektions-Abschluss liefen alle über die Operator-Klinke an der Sperre vorbei. **Mitgenommene Befunde:** media hatte als einziger Inhalts-Layer kein Quota-Gate (jetzt `kind: 'media'`, heute No-Op wie courses/events) und kein Rate-Limit (jetzt `media:upload`, 30/min — der einzige Weg, der Binärdaten auf die geteilte Platte legt) und puffert große Uploads nicht mehr blind (Content-Length-Vorprüfung vor `readMultipartFormData`) · `applyMediaVisibility` versuchte die zweite Phase nicht erneut und schwieg beim Scheitern — jetzt ein Retry plus lautes Log (Muster Zwei-Phasen-Hide), denn in BEIDEN Richtungen ist die Datei die offene Seite · `/api/comments/count` ist seit C18 nicht mehr für alle dieselbe Zahl (in einer members-Community sieht ein Mitglied mehr als ein Gast) und cachte sie trotzdem 30 s user-agnostisch und gab sie mit `Access-Control-Allow-Origin: *` an jede fremde Seite: die Route antwortet dort jetzt 404 (F4-Muster) statt den Cache-Schlüssel zu flicken — eine geschlossene Community soll ihre Zahlen gar nicht erst cross-origin veröffentlichen, und danach ist der Cache wieder ehrlich · `guest_authors` war schreib-only ohne Löschpfad: 90-Tage-Frist wie bei den Melder-Adressen, hier fällt die ganze Zeile (sie ist nur ein Rückfragekanal, kein Beleg) · die letzte rohe `.tablesDB`-Stelle in `server/api/**` (Nutzer-Detailseite las `comments` pool-weit) geht durch die Tür, und `packages/admin/server/api/**` steht jetzt im ESLint-Backstop — mit EINER begründeten Ausnahme für die projekt-globalen Betreiber-Tabellen statt zwanzig Einzelzeilen. **Beweise:** neue Unit-Tests für die Trennung (inkl. „Gast löst keinen Beitritt aus" und „Moderation kommt durch die Sperre"), Quelltext-Anker für die fünf Routen, `verify-community-suspension.mjs` um 5 Fälle erweitert → **62/62 grün** (Umfrage-Stimme ist ZU mit `reason: community_suspended`, Moderation SCHREIBT weiter), Pool-Isolation comments 13/13 · events 14/14 · courses 28/28, `count` live: öffentliche Community 200, members-Community 404, `pnpm -r test` (1156) · typecheck · lint · check:manifests · check:single-copy grün. **Gelernt:** Die Türklinke war nie als Aussage über den HANDELNDEN gemeint — sie beschreibt nur, mit welchen Zugangsdaten Appwrite angesprochen wird. Zwei fachliche Regeln daran zu hängen war bequem und genau so lange richtig, wie sich niemand aus technischen Gründen für den Admin-Client entscheiden musste. Wer eine Regel an einen Parameter hängt, muss prüfen, ob dieser Parameter die Frage der Regel überhaupt beantwortet; sonst wird jede spätere technische Notwendigkeit zur stillen Ausnahme von einer fachlichen Zusage. Und: eine Zusage, die eine Aufzählung enthält („Kommentare, Beiträge, Umfragen, Zu- und Absagen, Kursfortschritt"), ist ein Prüfauftrag — vier von fünf Punkten stimmten nicht. | 2026-08-01 | Datentür-Audit |
| C9 | ✅ **ERLEDIGT 2026-07-28** — Ursache war **keine** CI-Eigenheit und **nicht** die localhost-Falle: der Test war schlicht veraltet. Seit **E4** (Gast-Kommentare, 23.07.) steht der Zweig `data-guest-composer` im `v-else-if`-Band VOR `data-embed-login` und verdrängt ihn, sobald `pukalani.comments.embed.guests` an ist — der gesuchte Knopf `[data-embed-login] button` existierte seither nie. Lokal exakt reproduzierbar (also kein Umgebungsunterschied); ältester noch abrufbarer Lauf (26.07.) zeigt dieselbe Signatur. Zwei Änderungen: (1) der Popup-Login-Knopf trägt in BEIDEN Gast-Zweigen den Haken `data-embed-login-cta`, die Spec hängt am Knopf statt am Container; (2) der Test bekommt ein Budget von 150 s — mit den 30 s Standard riss er auf einem kalten Server schon im ersten Warteschritt ab und meldete „Hydration-Zeitüberschreitung" statt des echten Fehlers, was die Diagnose tagelang in die falsche Ecke schickte. Beim Nachmessen kam ein **zweiter**, echter Grund dazu — der Kaltstart des **Dev**-Servers, gegen den die Suite fährt (auch in CI): er kompiliert jede Route beim ersten Zugriff (kalt gemessen `/` gut 25 s, `/embed` samt Client-Bundle über 30 s). Das riss (a) das 30-s-Standardbudget von `realtime` und `embed-write` und (b) die harte 10-s-Kante in `public/embed.js`, die das iframe **endgültig** versteckt (`display:none` + „Comments could not be loaded"), wenn das Widget keine Höhe meldet — gedacht für den CSP-geblockten Einbetter, aber die Höhe kommt erst aus `onMounted`. Danach heilt kein Warten mehr. Deshalb drei Maßnahmen, jede an einer gemessenen Kante: Test-Budget global auf 90 s (embed-write 240 s, es fährt drei Dokumente hoch); beide Embed-Specs rufen `/embed` einmal **im Browser** auf und warten dort bis zur **Hydration**, bevor die Hostseite lädt (ein SSR-Abruf oder ein `goto` bis `load` lässt den Client-Graph unfertig — beides nachgemessen, beides reichte nicht); und die Lebendigkeits-Wartezeiten der Handoff-Kette stehen auf 60 s, weil `/api/auth/login\|embed-handoff\|embed-session` ebenfalls erst beim ersten Aufruf kompilieren. Ohne das war die Suite nur noch dank `retries: 1` grün, also „flaky" statt verlässlich. **Drittens** zeigte sich, dass der lange als „hängt halt 5 Minuten, nicht killen" abgetane Playwright-Teardown-Hang kein harmloses Warten ist: Playwright force-killt jeden Worker nach 300 s und zählt das als Fehler **ausserhalb jedes Tests** — Exit-Code 1 bei komplett grüner Suite. Das trifft **nur lokal** (macOS); in CI läuft dieselbe Suite in ~1,6 min sauber durch, dort taucht die Meldung nie auf. Naheliegende Ursache (die Test-eigenen `node:http`-Hostserver hielten Keep-alive-Sockets, `close()` wartete darauf) ist behoben — `closeAllConnections()` vor `close()`, richtige Hygiene —, **erklärt den Hang aber nicht**: er trifft auch Worker, die nie einen solchen Server hatten. Lokale Ursache bleibt offen (→ E7). Damit ein übersprungener Fall nicht mehr still verschwindet, läuft in CI zusätzlich der `list`-Reporter (der `github`-Reporter meldet nur „9 skipped" als Zahl). **Was der Job künftig fängt / was nicht**: siehe Notiz unter der Tabelle. **Gelernt (der lehrreichste Eintrag der ganzen Liste):** (1) Der E2E-Job war über EINEN TAG rot, ohne dass es jemand merkte — seither gehört `gh run list --branch main` in jeden Durchgang, die lokale Konsole reicht nicht. (2) Ein Test-Haken gehört ans **handelnde Element**, nie an einen Container: ein Config-Gate tauschte den Zweig aus, der Container blieb, der Knopf verschwand. (3) Ein zu knappes Zeitbudget meldet eine Zeitüberschreitung an BELIEBIGER Stelle statt der echten Ursache — das schickte die Diagnose tagelang in die falsche Ecke. (4) `retries: 1` macht aus einem echten Fehler ein „flaky" — grün, aber wertlos. (5) Ein Reporter, der nur „9 skipped" als Zahl meldet, versteckt übersprungene Fälle; deshalb zusätzlich der `list`-Reporter. (6) Ein „hängt halt fünf Minuten"-Verhalten kann ein Exit-Code-1 sein: Playwright force-killt Worker nach 300 s und zählt das als Fehler AUSSERHALB jedes Tests. | 2026-07-28 | CI-Beobachtung 28.07. |
| C10 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Bestätigungs-Vertrag existiert als `packages/core/app/composables/useConfirm.ts` und wird an **10** Stellen benutzt (`await confirm({...})`: Übersicht, System, Speicher, GDPR-Exporte, Changelog, Nutzer ×2, Embed, Kommentare …). Natives `window.confirm()` kommt im ganzen Repo nur noch EINMAL vor — im Docstring von `useConfirm.ts`, der beschreibt, was es ersetzt hat. Auch die Doppelklick-Sperren sind da (`saving`-Guard in `media.vue`, mit „Audit-Befund C10" annotiert). **Gelernt:** Ein Audit-Befund altert. Zwischen Befund und Abarbeitung lag hier die Umsetzung — wer ihn ungeprüft „abgearbeitet" hätte, hätte eine zweite Lösung neben die bestehende gebaut. Jeden Befund vor dem Fixen am Code nachmessen. | 2026-07-30 | Dashboard-Audit, UI-Hebel 2 |
| C11 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Baustein heißt `packages/core/app/components/core/EmptyState.vue` (= `<CoreEmptyState>`) und steht in **22** Dateien. Die Zeile suchte nach `UEmpty` und fand deshalb nichts — die Hausform ist die eigene Komponente, nicht die Nuxt-UI-Variante; CLAUDE.md führt sie inzwischen als Standard („Leerer Zustand über CoreEmptyState"). **Gelernt:** Eine Suche nach dem FREMDEN Namen (`UEmpty`) findet die Hausform nie. Wer prüft, ob ein Muster existiert, muss nach der Sache suchen, nicht nach der Schreibweise, die er erwartet — sonst meldet das Audit eine Lücke, die keine ist. | 2026-07-30 | Dashboard-Audit, UI-Hebel 1 |
| C13 | ✅ **GRÖSSTENTEILS ERLEDIGT 2026-07-28** — jeder Befund erst am Code nachgeprüft, dann gefixt: **S5** „Autor sperren" + Autoren-Link gaten auf `users.manage` (Muster aus dashboard/index.vue; dieselbe Stelle steckte auch in der Schnellmoderation der Übersicht) · **S7** `grantEventTicket` stempelt den Mandanten seines Events, s. D1 · **S8** Appwrite-Fehlertexte bleiben serverseitig (`publicContributorResults()` + strukturierte Logs) · **S10a** Produkt-Gate auf ALLE neun posts-Routen (nicht nur die vier gemeldeten — hide/restore/assist gehören zwingend dazu) · **S10b** Wartungsmodus auf patch/delete **und vote** (der Befund nannte `vote.post` irrtümlich als Referenz; die Prüfung sitzt in `score.post`) · **S10c** Triage-Gate in die Route gezogen. Vier neue Test-Suites, drei davon strukturell (jede Route trägt ihren Gate). **Offen abgespalten:** S6 → C15, S9 (tote Capabilities) → C16. Details + Prüfvermerke: [DASHBOARD-AUDIT-2026-07-28.md](archiv/audits/DASHBOARD-AUDIT-2026-07-28.md). **Gelernt:** Ein Audit-Befund kann die richtige Lücke mit der falschen Fundstelle melden — S10b nannte `vote.post`, die Prüfung sitzt in `score.post`. Und er kann zu klein zählen: gemeldet waren vier posts-Routen, betroffen waren neun. Immer die ganze Route-Familie absuchen, nicht die genannte Liste abarbeiten. Nachhaltig wurde es erst durch **strukturelle** Tests: „jede Route trägt ihr Gate" fängt auch die zehnte, die noch niemand geschrieben hat. | 2026-07-28 | Dashboard-Audit |
| C15 | ✅ **ERLEDIGT 2026-07-29** — die Glocke ist mandantenrichtig. **Migration `system-022`** (`notifications.tenantId` + `idx_recipient_tenant`, ohne Backfill; Prod-Lauf mit C0c bestätigt). Die Spalte trägt DREI Bedeutungen, gebündelt in der einen puren Regel `core/shared/notificationScope.ts`: `<tenantId>` = diese Community, `_account` = Kundenbereich (kollisionsfrei, weil eine Appwrite-Row-Id nie mit `_` beginnt), `''` = unbekannt. `notify()` verlangt jetzt ein **Pflichtfeld `scope: 'tenant' \| 'account'`** — kein Default, damit „mandantenlos" eine Entscheidung ist und kein vergessenes Feld; der TypeScript-Fehler ersetzt hier den ESLint-Backstop, der in `server/utils/**` nicht greift. Alle **acht** Aufrufer gestempelt (nicht sechs, wie hier stand): comments ×3, tickets ×2, events, control-Invites, Stripe-Webhook — die letzten beiden **`'account'`** (Davids Entscheidung 3: Vertrags-Meldungen gehören nicht in eine Kunden-Community). Beide Leserouten + der Realtime-`where` der Glocke filtern über dieselbe Regel. **Bestandszeilen bleiben sichtbar** (Davids Entscheidung 2) — bewusst fail-OPEN, die begründete Ausnahme von der sonst geltenden fail-closed-Regel: sonst leert sich jedem Nutzer im Deploy-Moment die Glocke, und Row-Security hält die Empfänger-Grenze ohnehin. Die Begründung steht an drei Stellen im Code, damit sie niemand „korrigiert". Dazu zwei Rückfälle für das Deploy-Fenster (Code vor Migration): Schreiben ohne Stempel, Lesen ohne Filter — beide **laut** geloggt. Der Digest-Sweep bleibt bewusst mandantenübergreifend (eine Mail pro Tag, nicht eine pro Community) und ist vom Stempel unberührt. Beweise: `packages/core/tests/notificationScope.test.ts` (16 Fälle, Stempel-Vertrag Pool/Silo/mandantenlos) + `packages/core/tests/notification-tenant-isolation.test.ts` (5/5 gegen echte Appwrite: ein Nutzer, zwei Communities, jede Glocke nur ihre eigenen; `_account` nie in einer Community; Bestandszeilen in beiden). **Reste abgespalten:** C17 (Kundenbereich hat keine Glocke), D5 (Mail-Links). **Gelernt:** (1) Ein **Pflichtfeld** ist der bessere Wächter als ein Default, wenn der ESLint-Backstop nicht greift — in `server/utils/**` gibt es keinen, also erzwingt der Typfehler die Entscheidung. Ein geratener Stempel hätte eine Zahlungswarnung in fremde Glocken gelegt. (2) Die sonst geltende fail-closed-Regel war hier FALSCH: ohne Backfill hätte sie jedem Nutzer im Deploy-Moment die Glocke geleert. Solche begründeten Ausnahmen gehören DREIMAL in den Code geschrieben, damit sie niemand „korrigiert". (3) Für das Deploy-Fenster (Code vor Migration) je einen LAUTEN Rückfall einbauen — still weiterlaufen heißt, den Fehler erst beim Kunden zu sehen. | 2026-07-29 | Dashboard-Audit S6 |
| C17 | ✅ **ERLEDIGT 2026-07-29 — die Glocke hängt jetzt dort, wo die Meldungen liegen.** Die Zeile hier hatte den falschen LESER im Verdacht: sie suchte die Anzeige auf `my.pukalani.app` (Platform-App, Pool-Projekt) und schloss daraus auf ein Cross-Projekt-Problem. Am Code nachgeprüft gibt es keines — **Absender, Empfänger und Leser liegen alle drei im `control`-Projekt**: `packages/billing/server/api/stripe/webhook.post.ts:113` (`recipientId: row.userId` aus `billing_subscriptions`, ein Konto DIESES Projekts) und `packages/control/server/utils/inviteRequests.ts:261` (Betreiber mit Label `admin`) laufen beide nur in `apps/control`; `apps/platform` hängt `@pukalani/billing` gar nicht ein und hat deshalb keinen einzigen `account`-Absender. Gefehlt hat nur die ANZEIGE: die Glocke wird ausschließlich aus `pukalani.chrome.utilities` gerendert, und dessen einziger Konsument ist das **blueprint**-Layout — ein Layer, den `apps/control` nicht extended. Fix: neuer Schalter `pukalani.chrome.accountBell` (Core-Default **aus**), gerendert im core-default-Layout (= Kopfzeile von `/workspace` und `/account/billing`) und in der Dashboard-Shell (Sidebar-Reihe neben der Suche — **nicht** als schwebendes Widget oben rechts: dort sitzen die Aktionen der Seiten-Kopfzeilen, das erste Layout verdeckte „Neuer Code"). `apps/control` schaltet ihn an, sonst ändert sich für keine App etwas. Dazu ein zweiter Befund aus demselben Weg: `invite.request` hatte in der Glocke **keinen Lesetext** und fiel auf `'replied'` zurück — die Betreiber-Glocke behauptete „hat auf deinen Kommentar geantwortet"; jetzt `notifications.inviteRequest` (de+en), und der `title` trägt die anfragende Adresse statt eines hartcodierten deutschen Satzes. Beweise: `packages/control/scripts/verify-account-bell.mjs` (**27 bestanden, 0 fehlgeschlagen** — echter Weg vom öffentlichen Anfrage-Formular über das Control Plane bis in die Glocke, Fremder sieht nichts, Gast sieht keine Glocke, plus die Gegenprobe im Pool: Community-Glocke ohne `_account`, Kundenbereich ohne Community-Meldung) + `packages/core/tests/notificationBellTexts.test.ts` (strukturell: jeder gesendete Typ braucht einen eigenen Lesetext in beiden Sprachen — verifiziert rot, wenn der Zweig fehlt). Browser-geprüft (Konsole sauber, nur die bekannte `i18n baseUrl`-Warnung). **KEINE Migration nötig.** Offen geblieben (bewusst): auf `my.pukalani.app` hängt weiter keine Glocke — dort gibt es heute nichts zu zeigen; kommt Pool-Billing (D1), braucht das Onboarding-Layout eine. **Gelernt:** Die Zeile hatte den falschen LESER im Verdacht und leitete daraus ein Cross-Projekt-Problem ab, das es nicht gab. Bei „X wird nicht angezeigt" zuerst Absender, Empfänger und Leser einzeln lokalisieren — hier lagen alle drei im selben Projekt, gefehlt hat nur ein Layout-Schalter. Zweitens: ein neuer `notify()`-Typ ohne eigenen Lesetext fällt still auf `'replied'` zurück, und die Glocke behauptet dann etwas Falsches. Deshalb der strukturelle Test, der jeden gesendeten Typ in beiden Sprachen einfordert. | 2026-07-29 | C15 |
| D5 | ✅ **ERLEDIGT 2026-08-01 — Benachrichtigungs-MAILS verlinken jetzt auf den Host der Community.** Die Glocke war seit C15 mandantenrichtig, die Mail nicht: `absoluteLink()` baute JEDE URL aus einer einzigen Env-Basis (`public.appUrl`). Eine Antwort in Community A verlinkte damit auf den App-Host — ein Pfad, den es dort nicht gibt, auf einer Domain, für die der Empfänger nicht einmal ein Session-Cookie hat (Cookies sind host-gebunden). Betroffen waren BEIDE Zweige, Sofort-Mail und Digest. **Gebaut in drei Teilen.** (1) Die **pure Regel** `packages/core/shared/notificationLinks.ts` (30 Fälle unit-getestet): sie liest genau die drei Spaltenwerte aus `notificationScope.ts` — `<communityId>` ⇒ Host dieser Community, `_account` ⇒ App-Host (per Konstruktion richtig, weil Absender, Empfänger und Leser einer Konto-Meldung im selben Projekt liegen, s. C17), `''` ⇒ App-Host wie bisher (Bestand + Silo). Der Open-Redirect-Guard wandert mit und wird wichtiger als vorher, weil der Pfad jetzt an einen Host aus der DATENBANK geklebt wird. (2) Der **Registry-Vertrag** `registerCommunityHostResolver` (`core/server/utils/communityHost.ts`) nach dem Muster von N9/A5 — core darf das Control Plane nicht kennen (A14), die App verdrahtet die Antwort. Zwei Eigenheiten gegenüber den Nachbarn: **kein `H3Event`** (der Digest-Sweep läuft im Intervall-Plugin, ganz ohne Request — genau das war der Parkgrund) und **gebündelt** (viele Ids rein, EINE Karte raus). Implementierung `packages/control/server/utils/communityHostResolver.ts`, Cache 60 s positiv WIE negativ, fail-soft; registriert in `apps/platform/server/plugins/tenant-resolver.ts` neben den drei bestehenden Resolvern. (3) Die **Verdrahtung**: `notify()` reicht den bereits berechneten Ablage-Wert an den Instant-Zweig weiter (nie zweimal rechnen), der Sweep löst die Hosts EINMAL vor der Empfänger-Schleife auf und gibt die fertige Karte in jede Mail — **jeder EINTRAG** wählt daraus seine Basis, nicht die Mail eine gemeinsame. Das ist der eigentliche Härtefall und kein Sonderfall: der Sweep bündelt bewusst mandantenübergreifend (eine Sammel-Mail pro Tag, nicht eine je Community), also stehen Links aus zwei Communities und dem Kundenbereich regelmäßig nebeneinander. **Beweise:** 30 Unit-Tests der puren Regel · 4 Live-Tests des Resolvers gegen eine echte Appwrite (`packages/control/tests/communityHostResolver.test.ts`) · **Ende-zu-Ende mit Mailpit** (`packages/core/scripts/verify-notification-mail-links.mjs`, **11/11**): eine echte Antwort über `POST /api/comments` auf `kunde-a.localhost` erzeugte eine Sofort-Mail mit `http://kunde-a.localhost/de/threads/…`, und EINE Digest-Mail trug gleichzeitig `http://kunde-a.localhost/…`, `http://kunde-b.localhost/…` und `http://app.localhost:3006/dashboard/billing` — drei Hosts in einer Mail. Der Sweep bleibt unverändert mandantenübergreifend. **Gelernt (drei Stück):** (1) **Der Wert in `notifications.communityId` ist `communities.tenantId`, nicht `communities.$id`** — E8-3 hat die SPALTE umbenannt, den WERT nicht (`scopeRowFor` stempelt weiter `tenant.tenantId`). Ein Nachschlagen über `$id` wäre STILL gescheitert, weil der ganze Vertrag fail-soft ist: die Mail geht raus, mit dem alten falschen Link, ohne eine Zeile im Log. Deshalb ist genau dieser Härtefall als eigener Live-Test festgenagelt und nicht als Fixture. (2) **Ein fail-soft-Vertrag braucht einen Test, der das FEHLSCHLAGEN vom RICHTIGEN Ergebnis unterscheidet** — sonst ist er immer grün. Der Mailpit-Beweis enthält deshalb zwei Gegenproben: „der Community-Link ist NICHT die App-Basis" und „drei verschiedene Hosts in einer Mail". (3) **Der Parkgrund war nur zur Hälfte der Cross-Projekt-Zugriff** — die andere Hälfte war die Form: ein Vertrag mit `H3Event` hätte für den Digest-Sweep nie funktioniert, und ein Einzel-Lookup wäre im Sweep die N+1-Falle über Projektgrenzen gewesen. Die Frage „wer ruft das auf?" entschied die Signatur, nicht die Technik. | 2026-08-01 | C15 |
| D6 | ✅ **ERLEDIGT 2026-08-01 — ein Farbwechsel der Community erreicht offene Fenster jetzt ohne Reload.** Eigene Themes, Schriften und Instanz-Einstellungen morphten seit jeher live; die Farbe der COMMUNITY war die Ausnahme, weil ihre Wahrheit (`communities.theme/variant/neutral`) im **Control-Plane-Projekt** liegt — dort hat der Browser weder Session noch Leserecht, kann also weder fragen noch abonnieren. Gebaut ist der dokumentierte Weg: ein **SPIEGEL im Runtime-Projekt**. Neue Mini-Tabelle `community_branding` (**Migration system-028**, `read(any)` wie `app_config`/`custom_themes`, rowSecurity aus, **eine Row je Community, rowId = `communities.$id`**, drei Varchar-Spalten, **kein Index** — die Zeile wird nur über ihre rowId angefasst). Geschrieben wird sie **nach** dem bestätigten Control-Plane-Schreibvorgang, aus der ANTWORT und **fail-soft**, von `core/server/utils/communityBrandingMirror.ts` (Aufrufer: `PATCH /api/community/branding`). Gelesen wird sie **nur per Realtime**: `core/app/plugins/realtime-branding.client.ts` abonniert **genau die eigene Row** (`Channel…row(<communityId>)` via `useSiteId()`, dazu `mirrorBelongsToCommunity` als Netz) und schreibt das Ergebnis in `useTenantBranding()` — ab da rechnet die bestehende B5-Vorrangregel (`resolveThemeSelection`/`resolveNeutralSelection`) und der Head-Getter zieht `data-theme/-variant/-neutral` **und die Theme-CSS-Datei** nach. Ohne Community-Id (Kontroll-Host, Silo, Playground) abonniert das Plugin **gar nichts**. **Warum keine neue Spalte in `app_config`:** die Tabelle ist per Vertrag EINE Row pro PROJEKT (`global`) — im Pool teilen sich alle Communities sie, und genau diese Verwechslung hatte O5 schon einmal aufgelöst. **Der Spiegel ist Bequemlichkeit, nicht Wahrheit:** SSR fragt weiter den Resolver, ein fehlgeschlagenes Spiegeln heilt der nächste Seitenaufbau (≤30 s). Bewusst NICHT mitgemorpht: Tab-Farbe/Favicon/og:image (sie hängen an `themeSettings.defaultThemeId`; ein Nachziehen würde die Instanz-Voreinstellung überschreiben und wäre beim Zurücksetzen auf `''` nicht mehr rückrechenbar) — gecachte Artefakte, die beim nächsten Aufbau folgen. **Beweise:** Browser gegen echte Appwrite — zwei Fenster derselben Community morphen live (`lagoon → sunset → forest`, jeweils Attribute + `/themes/<id>.css` getauscht, `performance.getEntriesByType('navigation').length` bleibt **1**, also kein Reload), eine Änderung an der Spiegel-Row einer **fremden** Community löst **nichts** aus, und der Kontroll-Host trägt keine Site-Id im Payload (Plugin no-op) · `verify-site-branding.mjs` weiter **42/42** · neue Unit-Tests `packages/core/tests/communityBranding.test.ts` + zwei D6-Fälle in `packages/themes/tests/themeSelection.test.ts` · Migration lokal zweimal gefahren (idempotent). **Gelernt (drei Stück):** (1) **`tablesDB.upsertRow` publiziert KEIN Realtime-Event** (Appwrite 1.9.6, live erwischt): die Spiegel-Row stand korrekt in der Datenbank und kein Browser erfuhr davon — der Spiegel wäre eine teure Attrappe gewesen, die in jedem Unit-Test und jedem Log grün aussieht. `updateRow`, bei 404 `createRow`. Wer je auf „ein Aufruf statt zwei" vereinfacht, nimmt dem Feature die Wirkung. (2) **Ein Live-Beweis braucht eine echte WS-Verbindung** — die lokale Appwrite hat nur `localhost` als Web-Platform registriert, jeder Mandanten-Host (`kunde-a.localhost`, `my.localhost`) wird beim WS-Handshake mit „Invalid Origin" abgewiesen und der Client loggt nur „Realtime disconnected". Das sieht wie ein Fehler im neuen Code aus und ist eine Lücke der Testumgebung; der Beweis lief deshalb über eine temporäre Community auf dem Host `localhost`. (3) **Ein Spiegel darf nie zur zweiten Wahrheit werden** — deshalb wird er nirgends gelesen, um zu rendern, und deshalb ist sein Schreiben fail-soft. Drift kann so gar nicht sichtbar werden. | 2026-08-01 | B5 |

**Was der E2E-Job (C9) beweist — und was nicht.** Er fährt eine echte
Wegwerf-Appwrite hoch und deckt danach 15 Fälle ab: öffentliche Seiten,
i18n-Routing und SSR-Render (smoke), den Auth-Guard, das Embed-Widget auf einer
echten Fremd-Origin samt `frame-ancestors`-Split und `noindex`, den kompletten
Popup-Handoff-Login mit anschließendem Schreiben (embed-write) und — das ist der
teuerste Fall — die **Realtime-Zustellung** gegen die echte Instanz: ein
serverseitig angelegter Kommentar muss live im Browser ankommen und beim Löschen
wieder verschwinden. Das ist der Regressionsschutz für die
SDK-Socket-Konsolidierung. **Nicht** abgedeckt: die 9 visuellen
Theme-Baselines (plattformspezifisch `-darwin`, laufen nur lokal — sie stehen
seit jeher als `skipped` im Log und heißen jetzt beim Namen), und das
CHIPS-Partitionierungs-Verhalten selbst: `localhost:PORT` gegen
`localhost:PORT` ist same-**site**, echtes Cross-Site-Gastverhalten braucht
echte Domains und bleibt ein Prod-Beweis
([EMBED.md](referenz/EMBED.md)).

---

## E — erledigte Betriebs-/Hygiene-Punkte

| # | Task | Erledigt |
| --- | --- | --- |
| E4 (Teil) | **Cutover-Krümel** ([CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md)): ploi-Alias `studio.` ✅ **entfernt 2026-07-30** (ploi → Domain aliases; `studio.pukalani.app` antwortet jetzt 404 über die Wildcard-Site `platform`, alle übrigen Hosts unverändert, verify-tls grün). Das „Doppel-Zertifikat" ist **kein Aufräum-Punkt**: control hat eine eigene Lineage, die den Alt-SAN `studio` bis zur nächsten automatischen Erneuerung mitführt — eine Anforderung nur zum Entfernen eines überzähligen Namens wäre reines Risiko ohne Nutzen. **Rest offen (Read-only-Key im Projekt `control`) steht in OPEN-ITEMS.md.** **Gelernt:** Beim Aufräumen des Cutovers starb einmal die portfolio-App, weil `pm2 jlist` auf ein cwd unter dem ALTEN Hostnamen zu prüfen war (`ops/pm2-heal.sh`). Eine Umbenennung zieht Meldungen mit, PFADE aber nicht — nach jedem Rename die Prozess-/Skript-Pfade einzeln nachsehen. Und: ein überzähliger Zertifikatsname ist KEIN Aufräumgrund; eine Neuanforderung nur zum Entfernen wäre Risiko ohne Nutzen. | 2026-07-30 |
| E6 | ✅ **ERLEDIGT 2026-07-30** — 47 Worktrees + 47 Zweige `worktree-agent-*` entfernt (alle in `main`, ohne `--force` gelöscht, keiner hatte ungesicherte Änderungen). **Stehen geblieben und zwar bewusst:** `worktree-agent-a762b1bc42bba74d7` = der geparkte **Seiten-Editor** (1 Commit, 108 Zeilen, Feature-Stopp) und VIER Worktrees anderer Claude-Sitzungen (`claude/epic-diffie`, `claude/pukalani-landingpage-optimization`, `claude/sleepy-leavitt`, `claude/upbeat-curran`) — deren Arbeit liegt zwar in `main`, aber sie gehören mir nicht und mindestens eine ist aktiv. **Gelernt:** Vor dem Löschen IMMER prüfen, ob ein Worktree einer fremden, laufenden Sitzung gehört — `--force` wäre hier fremder Arbeitsverlust gewesen. Ohne `--force` löschen ist der eingebaute Schutz: Zweige mit ungesicherten Änderungen verweigern sich von selbst. | 2026-07-30 |
| E8 (Etappen 1+2) | **Umbenennung auf `community`** — Davids Entscheidung (2026-07-29/30). Plan: [UMBENENNUNG-AUF-COMMUNITY.md](archiv/UMBENENNUNG-AUF-COMMUNITY.md). **Etappe 1 LIVE:** `sites` → `websites` (control-022). **Etappe 2 LIVE (2026-07-30):** `site_members`/`site_invites` → `community_members`/`community_invites` + Spalte **`siteId` → `communityId`** in beiden UND in `invite_requests` (control-023); der Name `communityId` gilt jetzt überall, wo eine `tenants.$id` transportiert wird (TenantContext, Resolver-Verträge, Service-Naht). Beweise nachgefahren: **97/97** Site-Autorisierung · **23/23** Presence-Grenze · **17/17** + **19/19** Einladungen. Beim Ausrollen bewusst KEINE Kompatibilitäts-Brücke: das Deploy-Fenster (control vor platform, dieselbe Schleife, unter einer Minute) lässt die Naht kurz mit 400 antworten — bei leeren Tabellen und ohne Kunden verhältnismäßig, eine Brücke wäre ein neuer Halbzustand gewesen. **Das Aufräumen der Alt-Tabellen ist mit E11 miterledigt.** Etappen 3+4 sind am 2026-07-31 nachgezogen — eigene Einträge weiter unten (E8-3, E8-4); in OPEN-ITEMS.md steht davon nichts mehr offen. **Gelernt:** Eine Kompatibilitäts-Brücke ist nicht automatisch die vorsichtigere Wahl — sie wäre hier ein neuer HALBZUSTAND gewesen, den später wieder jemand hätte abbauen müssen. Bei leeren Tabellen und ohne Kunden ist ein Deploy-Fenster von unter einer Minute mit kurzen 400ern die ehrlichere Lösung. Die Entscheidung hängt an der Frage „wer sieht den Zwischenzustand?", nicht an der Technik. | Etappe 1+2: 2026-07-30 |
| E11 | **Vokabular aufräumen — ein Wort je Sache** ([VOKABULAR-AUFRAEUMEN.md](plans/VOKABULAR-AUFRAEUMEN.md)) — Davids Auftrag 2026-07-30. **`feature` → `product` ist DURCH (Etappen A+B, 2026-07-30):** Migrationen control-024 + system-023 + courses-003 auf allen vier Instanzen (lokal+Prod), 964 regelbasierte Ersetzungen in 226 Dateien + 43 git mv, Typecheck 10/10 + alle Tests + Gates grün. **Das ZUSAMMENZIEHEN ist DURCH (2026-07-30, Davids Go — Beobachtungsnacht erlassen):** control-025/026 + system-024 + courses-004 auf lokal + Prod, alle Übergangs-Spiegel/Aliasse entfernt; auch das E8-Aufräumen (Alt-Tabellen) ist damit erledigt. „Customize theme" ersetzt das Theme-Studio (Davids Entscheidung). NEU: Betreiber-Seite „Gesperrte Namen" (control-027) und A6 Schritte 0–2 (control-028, Community-Fulfillment). Ursprünglicher Kern war: **`feature` → `product`**, also `feature.manifest.ts` → `product.manifest.ts` (**18 Dateien**), `featureKey` (56), `featureGates` (18), `check:manifests` (13) — insgesamt **2.626 Zeilen in 413 Dateien**. **Bewusste Kehrtwende:** CLAUDE.md hält bis heute fest „im CODE bleibt das Vokabular `features`" (P4); das gilt damit nicht mehr. Zwei Stellen mit echtem Risiko waren: die Appwrite-Tabelle **`feature_catalog`** (kein Rename möglich ⇒ Muster control-022/023, Zeilen MIT `rowId: row.$id`, und die Row-Id ist hier der Feature-Key, der in `entitlements.featureKey` steckt) und die **öffentliche Route `/api/platform/features`**. Die Altlast **`pukalani.studio.*`** ist ebenfalls DURCH (2026-07-30: → `pukalani.control.*` samt Log-Präfixen, controlUserData, Prosa; RESERVED `studio` + Theme-Studio bleiben bewusst); übrig drei bewusste `reddit`-Kommentarreste. **Einzige offene Frage war `maui` vs. `pukalani`** — inzwischen entschieden und als eigener Punkt (E11b) in OPEN-ITEMS.md geführt. Reihenfolge zwingend seriell (alle fassen dieselben Dateien an): A6 → E8-3 → E8-4 → feature/product ✅ → pukalani.studio ✅ → E9/E10. **Gelernt (fünf Fallen, alle beim Bauen aufgetaucht):** (1) **`app_config` stand am utf8mb4-Zeilenbudget** — die neue Spalte `products` passte nicht mehr als `varchar(4000)` und musste als **MEDIUMTEXT** angelegt werden (off-row, kostet kein Zeilenbudget). Bei breiten Konfig-Tabellen vor jeder neuen Spalte das Budget rechnen. (2) **Die DRITTE Migrations-Lücke (`courses.entitlementFeature`) fiel erst beim Bauen auf**, nachdem schon zwei gefunden waren: dieselbe Vokabel liegt in MEHREREN Projekten. Regel: vor jedem Vokabular-Rename ALLE `scripts/migrations/**` nach dem Wort greppen — sowohl als `key:` (Spaltenname) wie als `tableId` — und die Trefferliste abhaken, statt sich auf das Gedächtnis zu verlassen. (3) **Die Changelog-Kategorie `'feature'` ist ein DATEN-WERT** („Neuerung") und kein Vokabel-Vorkommen — sie darf nie mitbenannt werden. Ein regelbasiertes Ersetzen muss Daten von Bezeichnern trennen; dasselbe gilt für **Locale-WERTE**: das Skript benennt Schlüssel um, niemals die Sprache dahinter. (4) **`entitlements.featureKey` war `required` + Unique-Index** — ohne Dual-Write wäre JEDER Insert im Umstellungsfenster gescheitert. Pflichtspalten mit Unique-Index brauchen immer die Doppelschreibphase. (5) Die Row-Id von `feature_catalog` IST der Feature-Key und steckt in `entitlements.featureKey` — beim Kopieren also `rowId: row.$id` mitführen, sonst zerreißt die Referenz. | 2026-07-30 |
| F9 | **`channel: 'chrome'` in den letzten zwei Test-Configs nachgezogen** — ✅ **ERLEDIGT 2026-08-01.** `apps/portfolio/playwright.config.ts` und `apps/control/playwright.config.ts` fahren jetzt wie `apps/comments` Playwrights **gebündeltes Chromium** (kein `channel`), samt Kopfkommentar mit dem E7-Grund (System-Chrome startet auf macOS GoogleUpdater/crashpad, die das stdout-Socketpair des Workers erben, zu launchd reparenten und nie schließen ⇒ 300-s-Force-Kill, Exit 1 trotz grüner Suite). **CI-Install-Schritt bewusst NICHT nötig und deshalb auch nicht gebaut:** ein Durchgang durch alle sieben Workflows zeigt, dass Playwright **ausschließlich** in `e2e.yml` und dort **nur für `comments`** läuft — portfolio und control haben gar keinen E2E-Job, ihre Suiten sind lokale Smoke-Netze. Das steht jetzt so in beiden Kopfkommentaren, damit niemand den Schritt „sicherheitshalber" nachrüstet. Beweis: `portfolio` **5/5 grün in 11,9 s**, `control` **10/10 grün in 14,3 s**, beide Exit 0 und ohne Teardown-Hang. Die zwei Einmal-Skripte (og-images, brand-card-font) bleiben wie geplant auf System-Chrome. **Gelernt:** Bevor man einen CI-Schritt „analog zum Vorbild" nachzieht, erst nachsehen, ob die Suite in CI überhaupt läuft — hier wären zwei Install-Schritte für Jobs entstanden, die es nicht gibt. Die Begründung gehört in den Kopfkommentar der Config, sonst wird sie beim nächsten Durchgang erneut erwogen. | 2026-08-01 |
| F10 | **`embed-write.spec.ts` — die Diagnose war falsch, die Ursache eine ganz andere** — ✅ **ERLEDIGT 2026-08-01.** In der Aufgabenliste stand „fällt unter **Parallel-Last** durch, der 60-s-Popup-Puffer reißt", mit den Kandidaten „Budget hoch" oder „Worker-Exklusivität". **Beide wären am Problem vorbeigegangen, beide durch Messung ausgeschlossen:** ein höheres Budget hilft nicht (im Voll-Lauf hatte der Fall die letzten 34 s praktisch allein und fiel trotzdem), und Worker-Exklusivität hilft nicht (**kalt und ALLEIN** fällt er genauso, 90 s) — Playwright böte sie über ein eigenes Projekt mit `dependencies` an (per-Projekt-`workers` gibt es seit 1.61 auch, isoliert aber NICHT gegen andere Projekte), nur nützt sie hier nichts. Die echte Ursache steckte im **Popup**: `__vue_app__` entsteht beim `createApp`, die Seite darunter hängt an einem `<Suspense>` und wird **erst rund 100 ms später** hydratisiert. In diesem Spalt sieht das SSR-Markup interaktiv aus, ohne dass Vue lauscht — `fill()` landet nur im DOM, die reaktive Kopie des Formulars bleibt leer, und beim Absenden meldet **Zod „Please enter a valid email address"**. `/api/auth/login` wurde nie gerufen, das Popup blieb offen, das iframe stand für immer auf `status='waiting'` (CTA disabled) — und der Fall starb 60 s später an einer Wartezeile, die mit der Ursache nichts zu tun hatte. Nachgewiesen mit einer Wegwerf-Spec, die Konsole, `pageerror` und alle `/api/`-Antworten des Popups mitschnitt und die Kandidaten-Signale im 100-ms-Takt abtastete: bei `__vue_app__` war `isMounted:true`, aber `formVnode:false`; 100 ms später `formVnode:true`, danach `login 200` → Popup geschlossen → Composer da. **Fix:** ein `subtreeHydrated(selector)`-Prädikat neben dem bestehenden `hydrated` — es prüft `__vnode` am Element, also ob Vue **diesen Teilbaum** übernommen hat — und zwei Wartezeilen davor (`[data-login-form]` im Popup, `[data-comment-section]` im iframe). Kein `retries`-Kaschieren, keine verstellte Uhr, die 60-s-Puffer bleiben unverändert stehen. Beweis: der zuvor dreimal reißende Fall (kalt+allein) läuft **10,5 s statt 90 s Fehlschlag**; volle Suite **3× hintereinander grün, Exit 0, kein Teardown-Kill** — Lauf 1 **kalt 54 s** (24/24, embed-write 25,6 s), Lauf 2 **15 s**, Lauf 3 **15 s**. Zum Vergleich vorher: kalte Volllauf-Suite 103 s **mit** Fehlschlag. **Gelernt (drei Stück):** (1) **Eine Fehlerbeschreibung in der Aufgabenliste ist eine Hypothese, kein Befund.** „Unter Parallel-Last" stimmte als Beobachtung und war als Ursache trotzdem falsch — der erste Lauf war zufällig warm und gewann das 100-ms-Rennen, alle späteren nicht. Die Gegenprobe „kalt UND allein" kostete drei Minuten und drehte die ganze Richtung. (2) **`__vue_app__` ist kein Beweis, dass ein Formular bedienbar ist.** Unter `<Suspense>` lebt die App, bevor die Seite hydratisiert ist; wer in diesem Spalt tippt, füllt nur den DOM. Wartezeilen gehören an den Teilbaum, mit dem der Test tatsächlich umgeht — dieselbe Lektion wie C9 („Haken ans handelnde Element"), nur eine Ebene tiefer. (3) **Ein stiller Validierungsfehler tarnt sich als Zeitüberschreitung.** Sichtbar wurde er erst, als der Zwischenzustand mitgeschrieben wurde (Popup-URL, `window.opener`, Fehlertext, Composer-Zahl im 2-s-Takt). Bei „wartet und wird nie fertig" zuerst den Zustand protokollieren, statt an der Wartezeit zu drehen — und **zwei falsche Fährten unterwegs** (Appwrite-Rate-Limit, Vite-Optimizer-Reload) waren beide in unter fünf Minuten widerlegt, weil sie messbar formuliert waren. | 2026-08-01 |
| F13 | **Keine Preise mehr für Unverkäufliches** — ✅ **ERLEDIGT 2026-08-01.** Das Events-Dashboard bot im Pool „Bezahlt" samt Preis und `priceLookupKey` an, obwohl der Kauf-CTA dort „Bald verfügbar" zeigt (D1/F7). Jetzt entscheidet **dieselbe Wahrheit wie der CTA** — `pukalani.events.ticketCheckoutPath`, kein neues Flag —, ob die Zeile „Zugang" überhaupt erscheint: gesetzt im Silo (`apps/comments`), leer im Layer-Default und damit im Pool. Pure Regel `paidAccessChoosable()` in `packages/events/shared/types/event.ts`, 7 Tests plus 3, die die **Herkunft** der Wahrheit festnageln (Layer-Default leer · comments gesetzt · platform setzt sie nicht — sonst wäre die Sperre lautlos wirkungslos). **Zwei bewusste Kanten:** (1) Ein **bestehendes Paid-Event** bringt die Option beim Bearbeiten zurück — eine Sperre darf Bestandsdaten nicht umschreiben, sonst stünde die Auswahl auf einem Wert, den sie nicht kennt, und das nächste Speichern setzte den Zugang still auf „Kostenlos". (2) Die Entscheidung wird **beim Öffnen des Dialogs eingefroren**, nicht laufend berechnet: sonst verschwände die Option mitten im Ausfüllen, sobald jemand versuchsweise auf „Kostenlos" stellt — und der Rückweg wäre weg. Wo nur „Kostenlos" übrig bliebe, fällt die ganze Zeile weg statt als Ein-Punkt-Auswahl stehen zu bleiben. **Kurse hatten dieselbe Sackgasse und sind mitgemacht** — dort sogar schlimmer: ein bezahlter Kurs im Pool ist fail-closed 403 und der Upgrade-Hinweis zeigt auf ein `/pricing`, das es im Pool gar nicht gibt. Die Wahrheit hat dort aber eine **andere Form**: sie ist keine Config, sondern die Frage, ob eine App `registerCourseAccessGuard` gerufen hat. Deshalb **keine gespiegelte Config**, sondern die echte Wahrheit durchgereicht: `isCourseAccessConfigured()` → `paidAvailable` in `/api/courses/manage` → das Formular blendet 'paid' aus ('members' bleibt). Beweise: `pnpm -r test` grün (events 47, courses 20 — je 3 neue Fälle), Typecheck 10/10, Lint 0 Fehler. | 2026-08-01 |
| F18 | **Gast-Kontaktdaten: die Erhebung ist gefallen, nicht die Lese-Stelle nachgereicht** — ✅ **ERLEDIGT 2026-08-02, Davids Entscheidung.** Die Ausgangslage war ein Patt: `guest_authors` nahm seit E4 Name, **E-Mail und IP-Hash** jedes Gast-Kommentars auf, seit dem 2026-08-01 mit 90-Tage-Frist — aber die Moderation kam nirgends heran. **Erste Handlung war deshalb, die Prämisse zu prüfen statt zu bauen:** eine Volltextsuche über das ganze Repo fand für die Tabelle **genau drei** Berührungspunkte — den Schreibvorgang in `guest.post.ts`, die Konstante `GUEST_AUTHORS_TABLE` und `guestAuthorPrune.ts`, der die Zeilen **löscht**. Keine Moderations-Ansicht, keine Admin-Route, kein GDPR-Export, kein Skript, kein Sweep, der sie *liest*. Die Prämisse stimmte also, und damit war die Frage entschieden: personenbezogene Daten, die nie jemand ansieht, sind unter DSGVO nicht die milde, sondern die **schlechteste** Variante — man trägt das volle Risiko für null Nutzen. **Der Zweck war erkennbar, aber nur zur Hälfte gebaut:** `docs/referenz/EMBED.md` versprach die Tabelle „für Moderation + DSGVO", gedacht als Rückfragekanal zu einem Gast. Erhebung fertig, Gegenstelle nie angefangen — und ein Auskunftspfad wäre auch nicht trivial gewesen, weil `guest_authors` keinen Index auf `email` hat und „gleiche Adresse = gleicher Mensch" eine Annahme bleibt, keine Tatsache. **Entfernt:** `guestEmail` aus dem Zod-Schema, dem Formular (samt Zweispalten-Raster, das jetzt eine halbe Zeile Leere gestempelt hätte), dem Store-Aufruf und drei i18n-Schlüsseln je Sprache; der komplette `guest_authors`-Schreibvorgang aus der Route samt `createHash`/`trustedClientIp` — der IP-Hash existierte ausschließlich für diese Zeile. Der **Anzeigename bleibt**: er steht ohnehin öffentlich auf der Kommentar-Row und ist keine Kontaktspur. **Bewusst NICHT `.strict()`** im Schema: Widgets liegen im Browser-Cache fremder Einbetter, und ein alter Client, der `guestEmail` weiter mitschickt, bekommt weiter 201 — Zod strippt das Feld, statt jeden noch nicht neu geladenen Einbetter bis zum Cache-Ablauf vom Kommentieren auszusperren. **Tabelle bleibt vorerst stehen** (Davids Neigung, bestätigt): ein Drop ist unumkehrbar und gehört in eine eigene Zeile; der Bestand war beim Umbau **1 Zeile lokal, 0 auf prod-pool, 0 auf prod-comments**, also erledigt die 90-Tage-Frist ihn ohne Lösch-Migration. `guestAuthorPrune.ts` ist damit vom Dauerbetrieb zum **Abräum-Sweep** geworden, und das steht jetzt an ihm dran. Ein **Rückfragekanal** ist damit bewusst weg — wer ihn will, baut ihn als Ganzes (Zweck, Lese-Stelle, Frist, Auskunftspfad), nicht wieder nur die Erhebung. **Rechtstexte blieben unangetastet und mussten es auch:** die Vorlage in `packages/pages/shared/legalTemplates.ts` nennt Konto, Inhalte, Server-Protokolle und Sitzungs-Cookie — Gast-Kontaktdaten kamen dort nie vor, es gab also weder etwas zu streichen noch (nach F18) etwas zu ergänzen. Korrigiert wurde die **Kunden-Hilfe** (`apps/help/.../embed-widget.md`), die Kunden noch zusagte, Name/E-Mail/IP-Hash lägen „für Moderation und Auskunftsersuchen" bereit — eine Aussage, die nach dem Umbau schlicht falsch gewesen wäre. **Beweise:** Live gegen den comments-Dev-Server **6/6** (Gast ohne E-Mail → 201 mit `authorKind: 'guest'`; alter Client MIT `guestEmail` → weiter 201, Adresse weder auf der Row noch in der DB; `guest_authors` vorher 1, nachher 1 — es entsteht keine Zeile mehr), neue Unit-Tests für Schema/Strip/Route-Quelltext, `verify-community-suspension` **117/117**, comments-Pool-Isolation **13/13**, `pnpm -r test` · typecheck · lint (0 Fehler) · `check:manifests` grün. **Gelernt:** (1) Bei „die Daten sind unlesbar" ist die erste Arbeit die **Gegenprobe an der Prämisse**, nicht der Entwurf einer Lösung — hätte sich EINE Lese-Stelle gefunden, wäre die ganze Entscheidungsgrundlage falsch gewesen. (2) Eine Frist ist die richtige Antwort auf Daten, die man **braucht**, und nur ein Pflaster auf Daten, die man nie benutzt; wir hatten tags zuvor das Pflaster geklebt und einen Tag später gemerkt, dass die Wunde keine war. (3) Ein halb gebautes Feature verrät sich an genau dieser Asymmetrie — **Erhebung fertig, Auswertung nie angefangen**; wer die Erhebung schreibt, ohne die Lese-Stelle im selben Zug zu bauen, produziert im besten Fall Datenmüll und im schlechteren eine Haftung. (4) Beim Entfernen eines Feldes aus einem **eingebetteten** Widget entscheidet der Browser-Cache fremder Seiten mit: `.strict()` wäre hier ein stiller Ausfall für jeden Einbetter gewesen, der noch die alte Datei ausliefert. | 2026-08-02 | Audit-Befund 2026-08-01 |
| F17 | **Rest-Schreibwege auf „wer handelt" durchgesehen — vollständig, nicht stichprobenhaft** — ✅ **ERLEDIGT 2026-08-01.** Inventar über ALLE Layer statt der drei genannten: **84 Aufrufstellen der Operator-Klinke in 73 Dateien** (100 Textstellen inkl. Kommentaren und Tests). Aufgeteilt: **41 reine Lese-Wege** (für Sperre und Beitritt bedeutungslos), **10 trugen schon einen `actor`** (C1c) und **33 Schreibwege** waren zu entscheiden — zwei davon (Meldung abgeben/zurückziehen) schon mit Begründung versehen. Ergebnis: **14 umgestellt** (Kurs anlegen/bearbeiten/veröffentlichen, Lektion anlegen/bearbeiten/löschen/umsortieren, Termin anlegen/bearbeiten/absagen, Serie beenden, Titelbild setzen/entfernen, Seite speichern/löschen), **17 bleiben Betreiber-Sache — jetzt mit einem Satz Begründung an der Stelle**, damit die nächste Durchsicht nicht wieder rät. **Die eigentliche Erkenntnis war nicht „welche Routen", sondern WOHER die Antwort kommt:** ein hartkodiertes `actor: 'member'` (das Muster aus C1c) wäre an genau diesen Routen falsch gewesen, weil sie alle über `requireCommunityPermission` laufen — und der lässt neben der Community-Rolle auch das **protokollierte Betreiber-Break-Glass** durch. Mit festem 'member' hätte ein Support-Eingriff den Betreiber als `viewer` in die Mitgliederliste seines Kunden geschrieben (A5) und ihn in einer gesperrten Community von den Inhalten seines eigenen Kunden ausgesperrt (M13). Der Gate weiß die Antwort bereits, also **liefert er sie jetzt mit**: `requireCommunityPermission` gibt `via` + `actor` zurück, die Regel ist pur und getestet (`actorForCommunityAccess` in `core/shared/communityAccess.ts`: Rolle ⇒ 'member', Break-Glass/Silo ⇒ 'operator'), die Routen schreiben nur noch `tenantDb(event, { as: 'operator', actor })`. **Die drei Kategorien, die operator bleiben** (je mit Begründung im Code): **Moderation** (Kommentar-Status, Post hide/restore, Auto-Hide, Feed-Eintrag löschen) — die Sperre lässt sie ausdrücklich durch; **Sweeps** (publishDuePosts, Serien-Expansion, Reminder) — sie laufen im GET eines beliebigen Lesers, oft eines Gastes, und schreiben auf fremden Zeilen: ein `actor` machte dort jeden Vorbeisurfer zum Mitglied; **Ableitungen und Einstellungen** (Vote-Recount, lessonCount, recordActivity, Publikums-Umzug, embed-sites hinter `system.manage`) — die Handlung ist eine Zeile vorher schon durch Sperre und Beitritt gegangen, bzw. es ist eine Owner-Einstellung, die Davids Grenze ausdrücklich offen lässt. **Ein strittiger Fall, entschieden und im Code begründet:** ein Termin **absagen** ist technisch ein Status-Write auf Inhalt, schützt aber die Zusagenden, die mit der offenen Rechnung nichts zu tun haben. Entschieden für die Sperre (eine Absage ist eine neue Aussage an alle Teilnehmer, keine Rücknahme; eine Ausnahme „löschen ja, anlegen nein" schreibt sich fort; die Mahnung ist in Minuten aufgehoben und das Break-Glass kommt weiter durch) — Umkehr wäre EINE Zeile, die Begründung steht in `events/[id].delete.ts`. **Beweise:** `verify-community-suspension.mjs` um 24 Fälle erweitert → **86/86 grün** (Termin/Kurs/Lektion/Seite je ZU mit `reason: community_suspended`, plus die Gegenprobe „Publikum umstellen bleibt offen"), Ausgangslage vorher 201/200 — sonst wäre ein 403 nicht vom Produkt-Gate zu unterscheiden; Pool-Isolation courses 28/28 · events 14/14 · comments+pages 13/13 · posts 7/7 (Abschnitt „Operator-Break-Glass" fährt den neuen Pfad mit), `verify-site-authz` 103/103, `verify-presence-boundary` 23/23; neue Unit-Tests für die pure Regel und den Gate-Rückgabewert plus Quelltext-Anker je Layer (`redaction-actor.test.ts` in courses/events/pages), `pnpm -r test` **1248** · typecheck · lint (6 bekannte Warnungen) · check:manifests · check:single-copy grün. **Gelernt:** Wenn eine fachliche Frage („handelt hier ein Mensch dieser Community?") an einer Route beantwortet werden muss, die einen **Autorisierungs-Gate** hat, dann ist die Antwort schon im Gate — sie dort abzuholen ist nicht nur weniger Code, sondern der einzige Weg, der auch für den Ausnahmefall stimmt. Ein hartkodierter Wert beantwortet immer nur den Normalfall; hier hätte er den Break-Glass-Pfad still falsch gemacht, und zwar unsichtbar, weil dieser Pfad selten und nur im Log sichtbar ist. Zweite Lehre aus derselben Durchsicht: **„Schreibweg" ist nicht dasselbe wie „jemand schreibt".** Ein Drittel der gefundenen Schreibstellen hat gar keinen Handelnden — Sweeps, Zähler, Protokolle. Wer sie mit derselben Regel belegt wie eine Redaktions-Route, macht aus einem Lese-Request eine Mitgliedschaft. | 2026-08-01 |
| F9 (Rest) | **DevTools-Abzeichen aus den neun Theme-Baselines** — ✅ **ERLEDIGT 2026-08-01.** In jeder der neun `themes-visual`-Baselines saß mitten im Bild das Nuxt-DevTools-Abzeichen **mit wechselnder ms-Zahl**; überlebt hatte es nur, weil `maxDiffPixelRatio: 0.02` es verschluckte. **Schalter:** `devtools: { enabled: !process.env.PW_E2E }` in `apps/comments/nuxt.config.ts`, gesetzt vom `webServer.env` in `playwright.config.ts` — der normale Dev-Betrieb behält seine DevTools, nur der Testlauf nicht. `nuxt.config` ist die Stelle, weil `devtools` eine **Build-Option** ist (kein runtimeConfig, nicht pro Request umschaltbar); dass E2E gegen den DEV-Server fährt, macht den Schalter überhaupt erst wirksam. Weil `reuseExistingServer: true` einen schon laufenden Server samt SEINER Umgebung übernimmt, prüft die Spec zusätzlich `nuxt-devtools-frame` auf 0 und nennt beim Fehlschlag den Grund — **verifiziert, dass die Zusicherung wirklich anschlägt** (gegen einen DevTools-Server: „Received: 1"). Neun Bilder neu gebacken, danach **`maxDiffPixelRatio` von 0.02 auf 0.0001 gesenkt** (gemessen: mit Toleranz 0 sind die Läufe pixelgleich; 0,01 % ≈ 166 px ≈ ein 13×13-Feld für vereinzelte Kantenglättung). Beweis: volle comments-Suite **3× grün, 24/24, Exit 0**. **Gelernt (zwei Stück):** (1) **`--update-snapshots` backt nur FEHLGESCHLAGENE Bilder neu.** Der erste „Neubau"-Lauf meldete 9 grün und schrieb **keine einzige Datei** — die tolerante Toleranz ließ die vergifteten Baselines bestehen. Ein Rebake, der nichts ändert, ist kein Rebake: `--update-snapshots=all` erzwingen und danach `git status` lesen. (2) **Eine großzügige Toleranz ist kein Sicherheitsabstand, sondern ein Versteck.** 2 % waren das Zehnfache dessen, was das Abzeichen brauchte — ein Netz, das ein ganzes Bedienelement verschluckt, verschluckt auch eine kaputte Ramp. Erst die Quelle des Rauschens beseitigen, dann die Toleranz auf das messbare Minimum ziehen. | 2026-08-01 |
| E11b | **`maui` → `pukalani` im Repo-INHALT** ([VOKABULAR-AUFRAEUMEN.md](plans/VOKABULAR-AUFRAEUMEN.md) Abschnitt 4) — Davids Entscheidung: **Inhalt jetzt, Ordner später.** Der lokale Ordner und das GitHub-Repo heißen weiter `maui-monorepo`, die Domain `maui.photos` bleibt überall unverändert (Vorgabe 2026-07-31). **Die 567 Dateien im Plan stammten von VOR Etappe A** — nachgemessen blieben am 2026-07-31 nur **180 Treffer in 84 Dateien** (ohne `docs/archiv/**`, `CHANGELOG.md`, `pnpm-lock.yaml`). Regelbasiert wie Etappe A/B: **88 Ersetzungen in 50 Dateien** über 11 Regeln + 1 `git mv`; **92 Treffer bleiben bewusst** (maui.photos · Insel Maui als Ort · Stripe-Datenschlüssel · Embed-Rückwärtskompatibilität · echter Repo-/Ordnername · historische Sätze · spikes). Beweise: 826 Unit-Tests, `check:manifests` 18 Layer/8 Apps, `check:single-copy`, `pnpm -r typecheck` 10/10 grün; `pnpm-lock.yaml` unverändert. **Gelernt (drei Fallen, alle Altlasten AUS Etappe A):** (1) **Ein Vokabel-Rename hinterlässt tote Bezeichner, die still weiterlaufen.** Fünf Gruppen zeigten ins Leere: `maui.*`-Config-Gates (Namensraum heißt `pukalani.*`), `@maui/*`-Importe (Scope heißt `@pukalani/*`), das Einladungscode-Präfix `MAUI-` (Codes heißen `PUKA-`), die Brand-Fallback-Kommentare (Fallback ist `'Pukalani'`) und `public/maui-comments.js`, dessen eigene Anleitung schon `/pukalani-comments.js` nannte — **die dokumentierte URL lieferte 404**. Regel: nach jedem Rename nicht nur greppen, sondern die Treffer GEGEN den neuen Zustand prüfen. (2) **Ein Beweis-Skript kann durch einen Rename lautlos wertlos werden.** `verify-invite-stock.mjs` prüfte NEGATIV auf `MAUI-` (passt seither immer) und einmal POSITIV (`Kunde hat den Code per Mail`) — Letzteres wäre rot gelaufen, Ersteres grün ohne Aussage. Prüfungen auf Abwesenheit brauchen nach einem Rename dieselbe Sorgfalt wie Prüfungen auf Anwesenheit. (3) **Blindes Ersetzen macht historische Sätze zur Lüge.** Etappe A schrieb in `themes/app/plugins/theme.ts` „die Head-Ids heißen `pk-*`, nicht mehr `pukalani-*`" — sie hießen `maui-*`, nie `pukalani-*` (git 00674664). Protokoll-Sätze gehören in die Ausnahmeliste, nicht in die Regel. | 2026-07-31 |

---

## 2026-07-30 — am selben Tag zusätzlich fertig geworden

Diese vier Punkte sind aus E11 hervorgegangen und standen deshalb nie als
eigene Zeile in OPEN-ITEMS.md. Sie stehen hier, weil ihre Lektionen sonst
verloren gingen.

| Was | Ergebnis | Gelernt |
| --- | --- | --- |
| **Zusammenziehen der Übergangs-Spiegel** (control-025 `product-contract-cleanup`, control-026 `drop-site-legacy`, system-024 `drop-app-config-features`, courses-004 `drop-entitlement-feature`) | Alle Doppel-Spalten und Aliasse aus der `feature`→`product`-Umstellung sind weg, lokal und auf Prod; damit ist auch das E8-Aufräumen (Alt-Tabellen `site_members`, `site_invites`, `sites`) erledigt. Davids Go kam ohne die geplante Beobachtungsnacht. | **Die Drop-Migrationen liefen ein paar Minuten VOR dem Cleanup-Deploy.** In diesem Fenster konnte der Health-Sweep nicht mehr in die bereits gelöschte Spalte spiegeln — der Fehler wurde gefangen und heilte sich mit dem Deploy selbst, war also folgenlos. **Regel:** Drop-Migrationen laufen IMMER erst, nachdem der Code live ist, der die Spalte nicht mehr braucht — und die Reihenfolge ist **je Instanz** zu prüfen, nicht einmal global. Additive Migrationen laufen vorher, löschende nachher. |
| **„Customize theme" ersetzt das Theme-Studio** (Davids Entscheidung) | Der Bereich heißt in der Oberfläche jetzt nach dem, was man dort tut, nicht nach einem internen Produktnamen. | Interne Produktnamen („Studio") wandern mit der Zeit in die Kundenoberfläche, wenn niemand sie stoppt. Ein Bereichsname sollte die HANDLUNG beschreiben. Der Schlüssel/Pfad bleibt dabei unangetastet — siehe die Lektion aus B3 (Label ≠ Id). |
| **Betreiber-Seite „Gesperrte Namen"** (Migration control-027 `reserved-names`) | Reservierte Subdomains sind nicht mehr nur eine Konstante im Code, sondern vom Betreiber pflegbar. | **Eine Appwrite-Row-Id fasst nur 36 Zeichen.** Weil der gesperrte Name selbst die Row-Id ist, musste das Namenslimit von 40 auf **36** — sonst antwortet `createRow` mit einem generischen 400, dessen Text nicht verrät, woran es liegt. **Regel:** Wenn ein Fachwert als Row-Id dient, ist seine Maximallänge 36, und das Formular muss das durchsetzen, nicht die Datenbank. |
| **A6 Schritte 0–2** (Migration control-028 `community-billing`) | Der Befund ist festgehalten und das Community-Fulfillment additiv angelegt; die Schritte 3–6 stehen offen in OPEN-ITEMS.md. | **Schritt 0 war ein PURER TEST, kein Dokument:** er hält fest, dass der Geldpfad nur `workspaceId` kannte. Beweis-Tests VOR dem Umbau zu schreiben kostet fast nichts und zahlt doppelt — sie belegen den Befund unbestreitbar, und beim Bauen drehen sie sich mit um, statt nachträglich erfunden zu werden. |

### Prozess-Lektion: geteilter Arbeitsbaum

Bei parallel laufenden Sitzungen im **selben** Arbeitsbaum ließ ein
`git stash push -u` / `pop` eines Sub-Agenten unkommittete Dateien der anderen
Sitzung vorübergehend verschwinden. Es kam am Ende alles zurück — der Schreck
war trotzdem echt, und bei einem abgebrochenen `pop` wäre es Arbeitsverlust
gewesen. **Regeln:** (1) früh und klein committen, statt große unkommittete
Stände liegen zu lassen; (2) Sub-Agenten **stashen nie** in einem geteilten
Baum — wer Isolation braucht, bekommt einen eigenen Worktree.

---

## Ältere, bereits abgeschlossene Abschnitte

Die folgenden Abschnitte standen bis 2026-07-30 unverändert in OPEN-ITEMS.md und
sind vollständig erledigt bzw. bewusst entschieden. Sie bleiben hier als
Begründungs-Archiv.

> **2026-07-06 bis 2026-07-09 — Produkt-Arc „Community-Plattform":**
> GOALS-Phasen 21–27 sind komplett (Feed, Events + v2 inkl. Serien, Billing,
> Courses, Posts), dazu Tickets-Board P1–P4 und das **KI-Paket** (core
> `aiComplete()`, Moderations-Assist für Kommentare + Posts, globales
> Laufzeit-Model-Override `app_config.aiModel`). Details: README-Status
> 56–60 + GOALS.md.
>
> **2026-07-02 — Großes Abarbeitungs-Paket:** ALLE offenen Findings des
> Gesamtchecks (🟠 + 🟡) wurden umgesetzt (siehe „Bereits erledigt"), dazu die
> Ideen 1–3 (App-Template, @-Mentions, Markdown). Für die größeren Blöcke
> liegen jetzt umsetzungsreife Pläne unter **docs/plans/**.

### 🟠 Ehemals „Offen — als Nächstes angehen"

- **Phase 17 – Production Deployment** — Plan + Schritt-für-Schritt-Checkliste
  für den Betreiber: [docs/archiv/PHASE-17-PRODUCTION.md](archiv/PHASE-17-PRODUCTION.md).
  **Vorarbeit ✅ (2026-07-11): Prod-Build lokal generalprobiert** — nuxi build
  + node .output, 14/14 funktionale E2E (inkl. Realtime) gegen den Build;
  Prod braucht nur noch NUXT_PUBLIC_I18N_BASE_URL + NUXT_SMTP_* auf echte Werte.
  (Empfehlung: 2 Hetzner-VMs, ploi-Daemon, deploy.yml via workflow_run,
  Realtime-Watchdog; ~60 abhakbare Schritte, ~25–28 €/Monat).
  **Komplett erledigt 2026-07-19 (s. unten „Roadmap").**
- ✅ **Changelog Track 2B AKTIV** (2026-07-19): Function `changelog-draft`
  läuft auf Prod, GitHub-Release-Webhook → `https://changelog.pukalani.app/`
  (Custom Domain mit Let's-Encrypt; functions-Subdomains bekommen auf 1.9.5
  kein Einzel-Cert). Smoke-/HMAC-Tests bestanden; echter Release-E2E läuft
  mit dem nächsten release-please-Release mit. Ist-Zustand + Betrieb:
  [docs/archiv/CHANGELOG-2B-AKTIVIERUNG.md](archiv/CHANGELOG-2B-AKTIVIERUNG.md).

### 📋 Ehemals „Pläne für größere Ausbauten"

- **Themes-Vollausbau 26×11**: [docs/archiv/THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md)
  — Generator-Script muss neu gebaut werden (nicht im Repo!), 9 Schritte,
  ~7–10 PT, 7 Entscheidungen (E1–E7). **Vorgezogen erledigt (2026-07-02):
  Theme-Studio** unter /dashboard/themes (themes-Layer via pukalani.admin.modules):
  Galerie aller Themes mit Live-Wechsel + Nuxt-UI-Showcase, EIGENE Themes
  anlegen/bearbeiten/sortieren/löschen (Runtime-Ramp-Generator
  themes/shared/ramp.ts mit WCAG-Kontrast-Check + CSS-Export; Table
  custom_themes via system-009, CRUD /api/admin/themes, öffentliche Liste
  /api/themes, SSR-flash-frei injiziert). Der 26-Themes-KATALOG aus dem Plan
  **ist seit 2026-07-24 gebaut** (Master #6).
- ✅ **packages/billing (Stripe)** — umgesetzt 2026-07-08 als GOALS-Phase 23
  ([Plan](archiv/BILLING-STRIPE.md) exekutiert): hosted Checkout/Portal,
  Webhook (Signatur/Allowlist/Stale-Guard), Entitlements + `useBilling`,
  Live-Matrix mit echtem Test-Key gefahren. Details README-Status 56.
- **Embed-Widget**: [docs/archiv/EMBED-WIDGET.md](archiv/EMBED-WIDGET.md)
  — **E0+E1 ✅ (2026-07-09): Read-only-MVP live** (iframe + embed.js,
  frame-ancestors-Split, Read-Rate-Limit, [docs/referenz/EMBED.md](referenz/EMBED.md)).
  **E2–E4 ✅ 2026-07-23** (Master #5).

### 🟡 Klein / Reste

- **Audit-Produktfragen (2026-07-05 ENTSCHIEDEN):**
  (a) **Presence-Sichtbarkeit — so lassen**: Presence-Metadata (`userName`/
  `avatarUrl` + Aktivität) bleibt per `read("users")` für alle eingeloggten
  User lesbar — Name/Avatar sind ohnehin öffentlich (Kommentare), „wer ist
  online/tippt/reviewt" IST das Feature; nur eingeloggte sehen es. Bei
  Kundenprojekten/Multi-Tenant neu bewerten (dann Reads über Server-Route
  proxien). *(Genau das ist mit A4/A5 passiert.)* (b) **deleted-Tombstones zählen
  mit**: sie sind sichtbare Listeneinträge („[gelöscht]", Reddit-Verhalten);
  Zähler = Liste; Nicht-Zählen würde Anzeige und total auseinanderlaufen lassen.
  (c) **X-Forwarded-For**: kein Code-Gate — als expliziter Checkpunkt im
  Phase-17-Plan verankert (App NUR hinter ploi-nginx, Port 3000 nie exponiert,
  Firewall erzwingt es). Akzeptiert ohne Fix: L15 (controversial-Cap 200,
  dokumentierte Grenze).
- ✅ **Kleinkram-Batch (2026-07-02)**: `appwrite.config.json` umbenannt (inkl.
  Doku-Referenzen); **Stats-Contributor-Registry** umgesetzt
  (`registerDashboardStatsContributor` in core, Plugins in comments/moderation,
  admin/stats kennt keine Feature-Tabellen mehr); A14-Vertragsliste + die
  bewusste core→system-Matrix-Ausnahme in CONCEPT dokumentiert; SEO-Caveat
  dokumentiert (s. u.).
- ✅ `redirectOn:'all'`-**SEO-Caveat GELÖST (2026-07-10)**: hreflang-Alternates
  + og:locale + canonical via `useLocaleHead` in den App-Shells; `detect-
  BrowserLanguage.fallbackLocale` entfernt (signal-lose Crawler-Requests
  bekamen auf /de/* EN-Content — jetzt URL-Locale als Autorität). Absolute
  URLs via `NUXT_PUBLIC_I18N_BASE_URL` — in Prod (Phase 17) auf die echte
  Domain setzen. Details README-Status 65.
- **Bewusst akzeptiert/zurückgestellt (2026-07-02 entschieden)**:
  **UserMenu → /dashboard**: bleibt als
  capability-gegateter localePath-Link (Apps ohne admin-Layer haben keine User
  mit dashboard.access — der Link erscheint dort nie). **PresenceAvatar auf
  UChip**: ✅ umgesetzt 2026-07-11 (Badge aus dem Chip-Theme, live verifiziert).
  **Flag-Registry statt commentsEnabled
  in core**: mittlerer Refactor der AppConfig-Typen, lohnt erst mit dem
  nächsten neuen Flag. `useFormatCurrency`: bleibt als Baukasten-Vorhaltung
  (billing-Plan nutzt sie).
- **Geprüft, bewusst NICHT umgesetzt**: `login.post` kann den Namen nicht
  billig an `logAuthEvent` durchreichen — das Session-Objekt enthält keinen
  Namen, jede Alternative kostet denselben users.get (2026-07-02 geprüft).
  Client-seitiges `usePresence.refresh()` bleibt bei limit 200 (jedes Event
  triggert ein list(); Pagination dort würde Requests vervielfachen — der
  SERVER paginiert seit 2026-07-02 bis 1000).

### 💡 Ideen fürs nächste Level — alle umgesetzt

1. ✅ **E-Mail-Notifications + Digest** (2026-07-10) — Opt-in-Mails (instant/
   digest) über den Core-SMTP-Mailer (nodemailer statt Appwrite Messaging —
   kein Console-Setup/Key-Scope nötig); Details README-Status 63.
2. ✅ **Admin-Bulk-Aktionen + CSV-Export** (2026-07-10) — Multi-Select in
   Queue + User-Liste, Bulk-Routen mit Einzel-Flow-Guards, CSV-Export;
   Details README-Status 64.
3. ✅ **Caching/Microcache** (2026-07-10) — core createMicrocache für
   Gast-Kommentare Seite 1, Changelog-Liste (Write-Invalidierung) und
   /api/stats (L11). SSR-Seiten-SWR bewusst NICHT (Session-State im HTML);
   Details README-Status 64.
4. ✅ **CI mit echter Appwrite-Instanz** (2026-07-10) — e2e.yml startet den
   1.9.5-Stack im Runner, Console-Setup per Script, bootstrap+seed, volle
   Playwright-Suite inkl. Realtime — grün; Details README-Status 64.
5. ✅ **Auto-Hide-Threshold** (2026-07-09) — Eskalations-Vertrag
   `registerReportEscalationHandler` (moderation) + Auto-Hide in comments
   (`pukalani.comments.autoHideReports`, zweiphasig + Cascade, Meldungen bleiben
   offen); Report-„Kategorien" existierten bereits als offener reason-Katalog.

### 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🔧 Cleanup / Improvements / NITs

- ✅ **Status-Codes** (2026-06-29): `status.patch`-`getRow` → 404 (statt 500) und `status.patch`-`updateRow` + `users/[id].delete`-`users.delete` via `toH3Error` gemappt. `comments/index.post` und `config.patch` waren bereits via `toH3Error` sauber, `users.get`/`appConfig` schon abgefangen.
- ✅ **i18n/A11y** (2026-06-29, bereits erledigt — Note war stale): Sidebar-Labels nutzen `t('dashboard.sidebar.*')` (Keys de+en vorhanden); [AnalyticsTrendChart.vue](../packages/admin/app/components/AnalyticsTrendChart.vue) hat `role="img"` + `aria-label` + per-Bar `<title>`; [OtpLoginForm.vue](../packages/core/app/components/auth/OtpLoginForm.vue)-`resend()` setzt `errorMessage = null` vor dem Request.
- ✅ **Dead Code** (2026-06-29): `useSeo.ts` entfernt (nur `useSeoMeta` wird genutzt). `useAnalytics.ts` und `RowList<T>` existierten schon nicht mehr.
- ✅ **Duplizierung** (2026-06-29, bereits konsolidiert — Note war stale): Avatar-Auflösung → `core/server/utils/avatars.ts` (`resolveAvatars`, von comments/presence/audit genutzt); GDPR-Export-Mapper → `core/server/utils/dataExport.ts` (`mapExport*`, beide Export-Endpoints); Changelog-Row→DTO → `admin/shared/changelog.ts` (`rowToChangelogEntry`, public + admin).
- ✅ **Coverage-Lücke** (2026-06-29, geprüft — keine echte Lücke): Der App-`nuxi typecheck` (comments extends ALLE Layer) prüft transitiv auch deren Server-Code — per absichtlichem Typfehler in `moderation/.../reportQueries.ts` verifiziert (wird gefangen). Kein `test`-Script-Gap: themes/moderation/system haben 0 Tests, comments/admin/core haben Tests + Script. Standalone-Typecheck pro Layer bräuchte je ein `.playground` (wie core) — bewusst nicht.
- ✅ **NITs** (2026-06-29, geprüft): `stats.get.ts` nutzt schon die moderne `users.list({ queries })`-Form; `.env.example` enthält `NUXT_PUBLIC_APPWRITE_PROJECT_NAME` nicht (mehr) und nirgends Code-Nutzung — beide stale. Bewusst akzeptiert: `isOutdated`-Prerelease-Ordering (installed/latest kommen aus stable-only package.json/Registry → Pfad triggert real nie, ein Fix wäre toter Code) und CI-`@vN`-Tags (Dependabot-managed, first-party/reputable Actions).
- ✅ **Hydration-Mismatch (relative Zeit)** (2026-07-01): „vor X Sekunden" renderte server/client mit unterschiedlichem `now` → ~16 Mismatches + Vue-Warnungen pro Load. Fix: `now`-Basis in [useFormatRelativeTime](../packages/core/app/composables/useFormatRelativeTime.ts) via `useState` (SSR→Client identisch), Update erst nach Mount + 30s-Ticker. Verifiziert: 0 Mismatches/0 Warnungen.
- ✅ **Destruktive Migration `comments-002`** (2026-07-01): Migration ist jetzt idempotent — sind beide Tables schon am Zielschema (Pflichtspalten `targetId`/`content` bzw. `commentId`/`userId`/`value` vorhanden), wird der DROP übersprungen (kein Datenverlust bei Re-Run). `createTable`/Spalten/Indizes sind ohnehin 409-idempotent; der Erst-Umbau (altes `postId`-Schema → Ziel) droppt weiterhin wie vorgesehen.
- ✅ **Zwei Presence-Systeme vereinheitlicht** (2026-07-01): Globale Online-, Thread- und Moderations-Presence teilen sich jetzt **eine** Presence pro User (`presenceId=userId`, metadata trägt `scope`/`action`/`typing`) über die Presences-API. `usePresenceState()` ist die einzige Upsert-Autorität, `usePresence(predicate)` liest gefiltert. Entfernt: `presence`-Table, `presenceRowId` (der `presence/leave`-Endpoint EXISTIERT weiterhin — er löscht die Presences-API-Presence per sendBeacon beim Verlassen). `admin/users`-Routen lesen `listOnlinePresences()`; „online jetzt" via `updatedAt`-Recency (60s). Neue Use-Cases: Moderations-Claim-Lock (`useModerationPresence`), Edit-Awareness auf Config/Changelog (`useEditAwareness`), Live-Online im Dashboard + Users-Liste. **Nachtrag (verifiziert per Playwright + Live-Appwrite):** In der SSR-Cookie-Architektur kann der Browser seine Presence nicht selbst schreiben (Web-SDK-Client ohne Session → `realtime.upsertPresence()` als Guest-WS verworfen, `PUT /presences` → 401). Der WRITE läuft daher server-seitig über `POST /api/presence/heartbeat` (Admin-Client, `read("users")`, `expiresAt` 90s); `usePresenceState` ruft die Route (Heartbeat 20s + `visibilitychange`/`focus`). Der Reader liest weiter direkt über die Presences-API (Cookie-GET). Ohne diesen Fix fielen eingeloggte User nach 60s auf „offline".
- ✅ **Echtes Realtime-Presence** (2026-07-01, ~280ms verifiziert, in production): (1) WS-Upsert (`realtime.upsertPresence`, JWT-Client, Owner-Rechte) — nur der WS-Weg löst das Event aus, der HTTP-Upsert nicht; (2) JWT-authentifizierter Reader-WS (empfängt `read("users")`-Events); (3) **gesunder realtime-Worker** — der laufende war durch einen Swoole-Crash degradiert und lieferte nichts, `docker compose up -d --no-deps appwrite-realtime` hat es gefixt. Poll (20s) ist jetzt nur noch Backstop. Betriebs-Hinweis: bei degradiertem Worker Container neu erstellen (der User hatte mit „muss neugestartet werden?" recht).
- ✅ **Presence-Use-Cases erweitert** (2026-07-01, verifiziert per Playwright): neue metadata-Felder `page`/`replyingTo`/`near` (je eigener Zweck). (a) **Betrachtungs-Presence** (`useViewingPresence` + `DashboardViewers`): „N andere sehen diese Seite" global im Dashboard → deckt „anderer Admin schaut denselben User/dieses Dashboard an" + Live-Betrachterzahl pro Seite ab. (b) **Antwort-Presence**: offenes Antwort-Formular meldet `replyingTo` → Kommentar zeigt „X antwortet gerade …". (c) **Lese-Präsenz**: IntersectionObserver meldet den sichtbarsten Kommentar als `near` → „N lesen hier" je Kommentar. (d) **`PresenceAvatar`** (core): Icon-Badge in der Ecke (Stift = tippt, Pfeil = antwortet) statt Farbpunkt. Damit sind alle vorgeschlagenen Presence-Beispiele umgesetzt.

### ⏸️ Ehemals „Zurückgestellt — brauchen Design"

- ✅ **Cross-Layer-Write (Notifications)** (2026-06-29): Core stellt jetzt `notify(event, {...})` ([core/server/utils/notify.ts](../packages/core/server/utils/notify.ts)) als Vertrag bereit (best-effort, Row-Security); comments ruft ihn statt direktem `tableId: 'notifications'`-Zugriff. Kein String-Coupling mehr (CONCEPT A14). Der `/`-Link-Teil war schon gelöst (`targetUrl` + Open-Redirect-Guard).
- ✅ **`total`-Semantik / Hide-Orphaning** (2026-06-30, gelöst): **Client** — Hide entfernt jetzt den ganzen Subtree (`removeWithDescendants` + reine, getestete `descendantIds`), keine verwaisten Replies, `rows`/`total` konsistent. **Server (Cascade-Hide, gewählt)** — `status.patch` blendet beim Ausblenden den Subtree mit aus (Thread per rootId laden → BFS → nur aktive Nachfahren), so zählt der globale `total` keine unerreichbaren non-hidden-Antworten mehr. Wiederherstellen kaskadiert bewusst nicht (nur der Parent; Antworten ggf. einzeln). Per-Nachfahre-Realtime-Events sind im Client reihenfolge-unabhängige No-ops.
- ✅ **Pro-Melder-Report-Modell** (2026-06-30, bereits gebaut als generischer `moderation`-Layer — Note war stale): `reports`-Tabelle mit `reporterId` + Unique-Index `reporter_target` (eine Meldung pro User/Target), eigener Rückzug (`index.delete` nach `reporterId` gefiltert), Status-Lifecycle, und Admin-Melder-Anzahl (`openReportsByTarget.counts` → `reportCount` in der Moderations-Queue). Das alte `'reported'`-Status-Flag am Kommentar ist entfernt (`status` = nur noch active/hidden/deleted). Übertrifft die ursprüngliche Spec (generisch statt comment-spezifisch). Einziger Rest: das akzeptierte LOW-`targetType`-Residual (s. Security-Review).
- ✅ **„Bearbeitet"-Indikator** (2026-06-29, bereits umgesetzt — Note war stale): `editedAt`-Spalte (Migration 005) wird beim Edit gesetzt ([id].patch.ts) und in CommentItem angezeigt — unabhängig von `$updatedAt`.

### 🗺️ Roadmap — bewusst ausgeklammert

- ✅ **Phase 17 – Production Deployment** (KOMPLETT 2026-07-19,
  [Checkliste + Learnings](archiv/PHASE-17-PRODUCTION.md)):
  **comments.pukalani.app ist LIVE** — Appwrite 1.9.5 auf api.pukalani.app,
  ploi-Site mit pm2 + Auto-Deploy-Kette (Push→Test→Deploy→pm2-Restart, e2e
  bewiesen), Offsite-Backups (Storage Box), UptimeRobot, Watchdog, HSTS,
  Schema-Bootstrap (29 Tables) + voller Smoke-Test inkl. OTP-Mail (Resend)
  und Realtime-ohne-Reload. A.10-Follow-ups: changelog-draft-Function
  deployen, Zero-Downtime Stufe 2.
- ✅ **Phase 18 – Realtime/Presence auf SDK** (KOMPLETT erledigt 2026-07-01
  auf 1.9.5+MariaDB — GOALS-Header nachgezogen + Trigger-Task
  `appwrite-release-watch` gelöscht am 2026-07-09):
  - ✅ **P2 Presence** — **komplette** Presence (global + Thread + Moderation) auf die **Presences API** vereinheitlicht: eine Presence pro User (`presenceId=userId`, metadata `scope`/`action`/`typing`), `usePresenceState` als einzige Upsert-Autorität + `usePresence(predicate)` als Reader. Alt-System (Endpoints `presence/heartbeat|leave`, `presence`-Table system-007, `presenceRowId`) entfernt. Multi-User end-to-end verifiziert. Use-Cases live: Claim-Lock, Edit-Awareness, Live-Online (s. erledigtes Finding oben).
  - ✅ **P1 Rows-Rückbau** (2026-07-01) — `useRealtimeRows` läuft jetzt auf der **einen geteilten, JWT-authentifizierten SDK-Realtime** ([useRealtimeClient.ts](../packages/core/app/composables/useRealtimeClient.ts)): `realtime.subscribe(Channel.tablesdb().table().row())` mit optionalem server-seitigem `queries`-Passthrough; `where`-Filter bleibt als sicherer Default. Presence, Row-Streams und Config-Flags multiplexen über **denselben Socket** (vorher: ein nativer WS pro Aufruf). `useRealtimeAccount` bleibt bewusst cookie-nativ (Instant-Session-Revoke hängt am Cookie-Close-Signal). Tote `appwrite.client.ts` entfernt. Verifiziert per Playwright (Gast-Tab): Row-Create + -Delete live über den JWT-Socket, sauberer Reload ohne Console-Fehler.
  - ✅ **P3 Email-Policies** — Signup-UX für Wegwerf-/Free-Adressen (422→i18n); Console-Toggle ist der Betreiber-Schritt.
- **Backlog**: ✅ Themes-Vollausbau (26×11) FERTIG 2026-07-24 (s. Master #6); obsidian-community-concept
  (`packages/billing` ✅ 2026-07-08 als Phase 23).
  - ✅ **E2E-Tests (Playwright)** (2026-07-01): comments hat eine erste E2E-Ebene ([e2e/smoke.spec.ts](../apps/comments/e2e/smoke.spec.ts)) — auth-freie Smoke-Tests (Routing, SSR-Render, i18n, öffentliche Seiten, 404) gegen System-Chrome, `pnpm --filter comments e2e`. Eingeloggte/Realtime-Flows bleiben manuell verifiziert (passwortbasierter Login). Weitere Apps: sobald vorhanden.
- ✅ **Changelog Track 2B** (2026-07-01, deploy-bereit): Appwrite Function [functions/changelog-draft](../functions/changelog-draft) + [appwrite.json](../appwrite.config.json) — GitHub-Release-Webhook (HMAC) → Commits via Compare-API → Entwurf. Teilt die Parsing-Logik mit Track 2A (`src/parse.js`, unit-getestet). **Aktiv erst mit Prod + öffentlicher Domain** (GitHub muss den Webhook per HTTPS erreichen); bis dahin bleibt `pnpm changelog:draft` (2A) der Weg. **Aktiv seit 2026-07-19.**
- **Sonstiges**: ✅ öffentliche `/changelog`-Vollhistorie-Seite existiert bereits ([changelog.vue](../packages/admin/app/pages/changelog.vue), auth-frei, alle Einträge). Die 10 gesammelten SaaS-Feature-Ideen sind durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (Master #10).

---

## ✅ Bereits erledigt (Referenz, historisch)

- **Gesamtaudit + Abarbeitung (2026-07-05)** — Read-only-Audit über 9 Slices
  (Orchestrator + audit-scout/audit-worker je Slice) gegen alle dokumentierten
  Invarianten: **0 Critical, 0 High**, Ergebnis in [docs/archiv/audits/GESAMTAUDIT-2026-07-05.md](archiv/audits/GESAMTAUDIT-2026-07-05.md)
  (inkl. Requested-Changes-Reconciliation: kein einziges „Regressed").
  Abarbeitung in 4 Paketen:
  - **Garantie-Fixes**: GDPR-Recipient-Query strikt statt geschlucktem catch
    (M1, system-Contributor), Sperr-Schritt in `deleteUserCompletely` strikt
    (L1), Hide-Phase-2 mit Retry + lautem Log statt Schlucken (L2).
  - **CSS-Sink-Härtung** (L3): `customFontCss`/`customThemeCss` prüfen die
    admin-Zod-Allowlists gespiegelt am Render-Sink (fail closed), Pointer-
    Kommentare in beide Richtungen, 7 Injection-Tests.
  - **Kleinkram** (L4–L10, L12–L14): Storage-Orphan-Scan auf Cursor,
    unread-Count über Gesamtmenge, `REPORTS_WINDOW`-Konstante + Überlauf-Log,
    `commentsReported`-Stat zum Konsumenten (comments) verschoben,
    Function ohne statischen Key-Fallback, bootstrap app-agnostisch
    (+ Package- statt Verzeichnisname in pnpm-Filtern), Migration 006→010,
    statusText-Leak, Return-Typ.
  - **Doku**: CONCEPT.md D1–D4 nachgezogen (A4 → geteilte JWT-Realtime,
    A14-Matrix ohne presence + mit custom_themes/fonts, Package-/Stack-Tabelle
    aktuell), migrate.mjs-Kommentar. Offene Produktfragen s. 🟡.
- **Observability-Gate `pukalani.observability` (2026-07-02)**: strukturierte
  JSON-5xx-Logs am ZENTRALEN `core/server/error.ts` (4xx bleiben still, keine
  Bodies/Header — PII), Client-Error-Inbox (`observability-errors.client.ts`:
  vue:error + window.onerror + unhandledrejection, dedupliziert, max
  10/Session → `POST /api/telemetry/error`, Zod + Rate-Limit 30/min),
  Sentry-Andockpunkt dokumentiert in `logEvent.ts` (bewusst ohne SDK-Dep).
  Core-Default aus; comments aktiviert. Live verifiziert: 500 → JSON-
  Zeile mit Pfad/Stack, 4xx still, Browser-Fehler beide Pfade geloggt,
  Rate-Limit greift (429). Unit-Tests für shapeErrorLog/logEvent.

- **GDPR-Löschung/-Export komplett (2026-07-02)** — Umsetzung des Plans
  [plans/GDPR-DELETE-AND-EXPORT.md](archiv/GDPR-DELETE-AND-EXPORT.md) mit den
  Plan-Defaults (E1–E8; u. a. Tombstone mit geleertem Content, Snapshot auch
  bei Selbst-Löschung, 30-Tage-Lazy-Cleanup):
  - **UserDataContributor-Vertrag** (`core/server/utils/userData.ts`) +
    Contributors in comments/moderation/system (je `server/plugins/user-data.ts`)
    — die A14-Verletzung core→comments im Export ist WEG (`dataExport.ts`
    kennt kein Feature-Schema mehr); system hat damit erstmals Server-Code.
  - **`deleteUserCompletely`**: Snapshot → Sperren → Audit (ohne Klarname) →
    Contributors sequenziell/isoliert → Avatar+Presence → `users.delete` NUR
    bei Voll-Erfolg (Teilfehler = gesperrter User + Report, idempotenter Re-Run).
    Kommentare → Tombstone in der ROW (Roh-REST ohne PII), Votes/Reports/
    Notifications (Empfänger + Verursacher via neuem `senderId`) hart gelöscht,
    Audit-Logs pseudonymisiert (actorName/ip/metadata.name/targetName leer).
  - **Exports vollständig**: `exportUserCompletely` (Self + Admin, Cursor-
    Pagination via `listAllRows`, alle Datenarten inkl. Votes/Reports).
  - **Snapshots**: Bucket `gdpr-exports` (bootstrap, encryption, keine
    Bucket-Permissions), Admin-Routen List/Download/Delete + Audit, UI-Tab
    unter /dashboard/admin, Lazy-Cleanup > 30 Tage.
  - **Migrationen**: comments-009 (votes-userId-Index), system-008
    (notifications.senderId + Index, audit_logs-target-Index) — auf Dev
    ausgeführt. `notify()` trägt jetzt `senderId` (Reply + Mention).
  - **Verifiziert**: 41/41 Live-E2E-Checks (Self-Delete-Vollprüfung mit allen
    PII-Arten, fremde Antwort überlebt, Roh-REST-Check, Admin-Delete +
    Download, RBAC least-privileged 403, Bucket-Allowlist), Unit-Tests
    (Registry, listAllRows), 12/12 Playwright, typecheck/lint grün.
    Akzeptiert: E8-Lücke (Alt-Notifications ohne senderId).

- **Gesamtcheck-Abarbeitung (2026-07-02)** — alle offenen 🟠/🟡-Findings + Ideen 1–3 in 10 Batches:
  - **admin ohne comments**: `stats.get` degradiert mit catch + 0-Fallback (search/analytics waren schon sauber).
  - **toH3Error-Serie**: changelog patch/delete, users status.patch/sessions.delete, admin-storage delete, core-storage get/delete, otp.post — 4xx statt unmaskiertem 500.
  - **Effizienz**: `assertNotLastAdmin` via `Query.contains('labels','admin')`+limit 2 (live auf 1.9.5/MariaDB verifiziert); `reports/resolve` parallel in 10er-Chunks; `presences.list total:false`.
  - **Vote-Privacy**: `comment_votes` Table-`read(users)` entfernt (Migration 007, auf Dev ausgeführt); 002 legt frisch ohne Table-Read an.
  - **Migrations entkoppelt + apps/_template**: zentraler Runner `scripts/migrate.mjs` (`pnpm migrate --app <app>`, Auto-Detect nur bei genau einer App, `--env-file` für CI/Prod); Layer-Scripts rufen den Runner; bootstrap.ts app-agnostisch; MDC/ProseMirror-Config in den admin-Layer gezogen; Template-App (Port 3002) mit README läuft in lint/typecheck der CI mit.
  - **i18n**: core `ui.cancel` (statt 7× Cross-Layer-Key), tote admin-Keys entfernt (gegen dynamische Kompositionen geprüft), `admin.users.notFound` statt hartkodiertem „— 404".
  - **9 Client-Bugs**: useLogout() mit Presence-Beacon + try/catch (3 Stellen dedupliziert); Dashboard-Suche Stale-Guard; Vote-In-Flight-Serialisierung (Client) ; useRealtimeAccount Stabilitätsfenster-Backoff + nur für eingeloggte User; pending-Reply-Puffer; WhatsNew-Unread auf `$createdAt`; IntersectionObserver re-observed bei temp-ID-Tausch; `?status=`-Watch; s.o.
  - **Vote-Lost-Update (Server)**: `serializePerComment` — Recount+Write pro Kommentar serialisiert (Multi-Instanz-Grenze im Util dokumentiert → Appwrite-Transactions).
  - **Kanten**: Antworten-Subtrees + Cascade-Hide-Thread + Changelog + users-active-Sort + Analytics auf Cursor-Pagination (Notanker mit Log statt stillem Cap); listOnlinePresences bis 1000; Rate-Limit-Fallback auf Session-Identität statt `unknown`-Sammeltopf; Avatar-Upload mit Magic-Bytes-Check.
  - **hidden-REST-Leak GESCHLOSSEN**: Lese-Sichtbarkeit auf Row-Ebene (Migration 008 + Backfill, auf Dev ausgeführt); Hide = zweiphasig (Status-Event → Permission-Entzug), Restore in einem Write; live verifiziert (Gast-REST 404 auf hidden, Gast-WS bekommt weiterhin Events).
  - **UAuthForm**: Regel präzisiert — UAuthForm ist Vorlage, die optimierten UForm-Implementierungen bleiben; Abweichungen dokumentiert in [docs/referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md); CLAUDE.md/CONCEPT.md angepasst.
  - **@-Mentions**: `resolveMentions()` gegen Thread-Teilnehmer (kein globaler Namensraum, max 5), notify(type:'mention'), Bell-Text je Typ, Autocomplete im CommentForm; live verifiziert.
  - **Markdown-Kommentare**: eigener sicherer Subset-Parser (`shared/markdown.ts`, 20 Tests inkl. XSS) + vnode-Renderer `CommentMarkdown.vue` (kein v-html; MDC bewusst NICHT für Fremd-Content); SSR-verifiziert.
  - **6 Plan-Dokumente** unter docs/plans/ (GDPR, Phase 17, Changelog 2B, Themes, Billing, Embed).

- **Appwrite 1.9.5 + MariaDB-Umstieg + Phase-18-P2 + Tooling (2026-07-01)**:
  - **Server-Upgrade** Appwrite 1.9.0 → 1.9.5 (Backup, manueller Tag-Bump da
    Web-Installer interaktiv, `migrate`) — dann **DB-Adapter-Umstieg MongoDB →
    MariaDB** (frische Instanz, empfohlener Default). Stolpersteine gelöst:
    Traefik-Segfault (Neustart), SMTP → Mailpit, Console-Whitelist, fehlende
    1.9.5-Schema-Attribute (`migrate`), inkonsistente `main`-DB-Metadaten
    (neu angelegt), API-Key-Scopes.
  - **P2 Presence** auf die Presences-API (s. Phase 18).
  - **P3 Email-Policies**-UX (422 → freundliche i18n-Meldung im Signup).
  - **Bootstrap-Tooling**: `pnpm bootstrap` (DB + Bucket + Platform + alle
    Migrationen, Guard gegen destruktiven Re-Run) + `pnpm seed` (Demo-User mit
    Rollen + Kommentare). Beide reproduzierbar/idempotent.
  - **Security-Test**: XSS/HTML/JS/SQL-Payloads als Kommentar-Inhalt → alle
    escaped (Vue-Autoescaping, kein `v-html`), 0 injizierte Elemente, DB intakt.
  - **Hydration-Fix** (relative Zeit) + README-/Doku-Update.
- **Pre-Production Security Review (2026-06-29)** — Review über `d1a2e13..HEAD`
  (2 Review-Agents: Authz + Input/Leak/Redirect, plus eigener Pass):
  - **MEDIUM behoben — Stored Open-Redirect via `targetUrl`**: der alte Guard
    (`startsWith('/') && !startsWith('//')`) ließ protokoll-relative Bypässe
    durch (`/\evil` — Browser normalisiert `\`→`/` —, `/%2F%2Fevil`,
    Whitespace-Tricks `/ /evil`, `/\t//evil`). Diese flossen unverändert in den
    Reply-Notification-Link → Off-Site-Navigation (Phishing). Fix: strenge
    Regex `^\/(?![/\\%])[^\s\\]*$` im
    [comment-Schema](../packages/comments/schemas/comment.ts) **+**
    `safeLink()`-Render-Guard in
    [NotificationBell.vue](../packages/core/app/components/NotificationBell.global.vue)
    (defense-in-depth gegen alt gespeicherte Rows) **+** Regressionstest
    [schema.test.ts](../packages/comments/tests/schema.test.ts).
  - **LOW behoben — `reports/resolve`-Input-Hygiene**: lose `typeof`-Checks +
    unbegrenztes `resolution` → `resolveReportSchema` (Zod, längenbegrenzt).
  - **LOW behoben — Rate-Limiting auf Schreib-Endpoints**: `rate-limit`-Middleware
    deckt jetzt auch `POST /comments`, `PATCH /comments/[id]`, Vote und
    `POST /reports` ab (eigenes, weiteres Budget `WRITE_MAX=60/min`; Vote-Spam
    über viele IDs teilt EINEN Bucket). `reports/resolve` bewusst ausgenommen
    (Moderator-gated).
  - **Akzeptiertes Restrisiko (LOW) — `reports.targetType` ungeprüft**: ein
    eingeloggter User könnte Meldungen mit beliebigem `targetType`/nicht
    existierendem `targetId` absetzen. Entschärft: die Moderations-Queue filtert
    Junk bereits über Comment-Existenz; nur die „Gemeldet"-KPI ließe sich minimal
    aufblähen. Moderation bleibt bewusst domänen-generisch → kein Existenz-Check
    (würde den Layer an Comments koppeln). Sauberer Fix kommt mit dem
    zurückgestellten `comment_reports`-Modell.
  - **Sauber bestätigt (kein Defekt)**: Error-Envelope leakt keine Appwrite-/
    Zod-/Stack-Details; alle Authz-Guards (reports/comments/admin) korrekt,
    `reporterId` server-autoritativ; Moderations-Inputs parameterisiert (keine
    Injection, keine `Role`-Spoofing-Fläche).
- **3. Review-Pass (2026-06-24)** — neue Funde abgearbeitet:
  Storage-Orphan-Erkennung paginiert jetzt ALLE User+Files (vorher nur 100 →
  Falsch-Orphans, die der Bulk-Delete gelöscht hätte); Passwortänderung beendet
  Fremd-Sessions; Analytics-Chart-Buckets und KPI-Totals aus derselben
  In-Range-Menge (kein Balken-vs-Legende-Widerspruch mehr); Status-Guards auf
  Comment-PATCH + Vote (kein Editieren/Voten auf hidden/deleted per Direktrequest);
  Rate-Limit-Budget je Methode+Route (Reset-Confirm teilt nicht mehr das
  Mail-Budget); avatarUrl auf relative Storage-URL/https eingeschränkt;
  Notifications mit zusätzlichem recipientId-Filter; loadAll iteriert über
  Seitenzahl (controversial überspringt keine Zeilen); changelog-date als
  ISO-datetime validiert; OAuth-Redirects locale-aware; xForwardedFor-Trust
  dokumentiert; Dead-Migration 001 entfernt; README-Baum korrigiert.
  Bewusst NICHT angefasst: report-Toggle-TOCTOU (`active↔reported` ist bereits
  geguardet; sauberer Fix = das zurückgestellte `comment_reports`-Modell).
- **🟠+🟡-Batch (2026-06-24)** — alle 14 Punkte abgearbeitet:
  Layer-Scan TTL-Cache (~60 s); Realtime-WebSocket `new WebSocket()` in
  try/catch + Backoff (rows + account); kein Falsch-Logout mehr
  (`refresh()` nullt nur bei 401/403, `onClose` feuert nur nach erfolgreichem
  `open`); Dashboard-`today` client-only (kein Hydration-Mismatch);
  comments-`migrate`-Script repariert (002→004 idempotent + `--env-file`);
  vote-`myVote` autoritativ aus der DB nachgelesen; users-`total` echte
  Gesamtzahl bei „Jetzt aktiv"; analytics-KPIs per Count-Query statt Sample;
  changelog-Patch-Audit `row.title`; healthCheck-Default `unknown`;
  changelog-Löschdialog `localized()`; GDPR-Export `account.get()` abgefangen
  (Fallback Context-User); NotificationBell Re-Subscribe via `watch`;
  release-please `bootstrap-sha` entfernt.
- **Code-Review Batches A–G**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME; GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell `<i18n-t>`; Vote-Flicker behoben (Single-Write, autoritative Counts) inkl. Flip-Race/Score-Drift/409; Controversial-Sort über Fenster; Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren); `assertNotLastAdmin` paginiert; `config.patch` 404-only; `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-Sortierung; admin-Middleware `status/statusText`; CI `permissions`+`concurrency`; Dependabot; `@nuxtjs/i18n` als echte Dep; `changelog-draft` `execFileSync`.
- **Kommentar-UI (Reddit-Stil)**: borderless, kompakte Aktionszeile, Edit/Delete/Report hinter ⋯, Antworten ein-/ausklappen, „Alle {x} laden"-Button (löst die verborgenen Kommentare + verwaiste Replies), **unreport** (Melden ⇄ zurückziehen).
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei; keine Prod-Fehler-Leaks (Nitro maskiert ungefangene Fehler).

### C19 — /de-Endlosschleifen-Fix ✅ 2026-07-31

3xx-Antworten mit leerem Location-Header werden im Core auf die App-Wurzel
normalisiert (Commit 5528d01); mit dem Deploy von Build 49442b7 auf allen
Hosts live, Nachweis per Ancestor-Check des Live-Builds.
**Gelernt:** Ein „im Code behoben"-Punkt ist erst zu, wenn der Fix nachweislich
im LIVE-Build steckt — der Ancestor-Check (`git merge-base --is-ancestor
<fix> <live-build>`) ist dafür der billigste Beweis, kein erneutes Deployen.

### E8-3 — tenants→communities + 19 communityId-Spalten ✅ 2026-07-31

Komplett in einem Tag, in drei Phasen je Instanz (4 Prod + 4 lokal):
(1) control-029 kopierte `tenants`→`communities` und `tenant_plans`→
`community_plans` GENERISCH (Spalten+Indizes aus der Quelle gespiegelt,
Zeilen MIT Row-Id, upsert-fähig); (2) acht Layer-Migrationen legten
`communityId` neben `tenantId` in alle 19 Pool-Tabellen (Backfill +
Index-Zwillinge, Unique erst nach vollständiger Kopie), Code-Umschaltung am
Engpass (Datentür: Filter neu, Stempel doppelt); (3) Aufräumer mit finalem
Drift-Backfill + Gegenprobe VOR jedem Löschen, control-030 ließ die
Alt-Tabellen fallen. Beweise: comments 13/13 · presence 10/10 · posts 7/7 ·
events 14/14 · courses 28/28; alle Instanzen paginiert nachverifiziert.
**Gelernt:** `listColumns` paginiert bei 25 — die spaltenreiche
events-Tabelle wurde vom generischen Skip STILL übersprungen und flog erst
im Isolationsbeweis auf (Query.limit(200) gehört in JEDEN Spalten-Scan;
Beweise nach jedem Schritt sind der Grund, warum so ein Umbau verantwortbar
ist). **Gelernt:** Tabellen liegen auf MEHR Instanzen als die Manifeste
sagen (events-Altbestand auf comments, pages auf control, media auf photos)
— Schema-Verifikation immer über ALLE Instanzen, nie über die Layer-Liste.

### E8-4 — der EINE Wächter + Community-Vokabular ✅ 2026-07-31

requireTenantPermission war bereits toter Code (null Aufrufer — organisch
gestorben); requireSitePermission/resolveTenantRole heißen jetzt
requireCommunityPermission/resolveCommunityRole in EINER Datei. 908
Ersetzungen in 129 Dateien, 51 Umbenennungen; EINE CommunityRole-Definition
(die Zweitkopie mit „muss identisch bleiben"-Kommentar ist weg), Capability-
Keys community.*, Routen /api/community/**. Beweise: alle Tests, Typecheck,
comments 13/13 · presence 23/23 · site-authz 97/97. E8 ist damit KOMPLETT
(Plan → docs/archiv/UMBENENNUNG-AUF-COMMUNITY.md).
**Gelernt:** Nitro sortiert Middleware lexikografisch — ein RENAME kann die
Ausführungs-Reihenfolge verschieben (community-label wäre vor csrf/rate-limit
gerutscht). Reihenfolge gehört EXPLIZIT in Nummern-Präfixe, nie an den Zufall
eines Dateinamens. **Gelernt:** „muss identisch bleiben"-Kommentare markieren
eine Kopie, die man zusammenführen sollte, nicht pflegen.

### A6 — die Community ist das zahlende Objekt ✅ 2026-07-31

Alle Schritte: Beweis-Test → control-028 → Community-Fulfillment (Cross-Sub-
Guards) → Checkout/Portal über die Service-Naht (Stripe-Testmodus Ende-zu-
Ende bewiesen: cs_test-URL + Portal) → Abo-Seite im Community-Dashboard →
Workspace-Rückbau (69 Dateien, −2364 Zeilen; Lizenz-Mechanik geparkt in
entitlementGrants/entitlementPlan) → control-031 (Bremse: keine lebende
Subscription, sonst Abbruch). Schritt 4 war leer (Pool hat null Nutzer).
**Gelernt:** Instanz-weite Capabilities (billing.manage) nie an Site-Rollen
vergeben — der Rollen-Trennungs-Test hat genau das gefangen; Site-Belange
brauchen EIGENE community.*-Capabilities. **Gelernt:** GDPR-Contributor nur
dort, wo die userId-Verankerung wirklich liegt — ein Contributor, der
strukturell nichts findet, täuscht Vollständigkeit vor.

### E9 — Menü-Umbau: eine Navigation, drei Ebenen ✅ 2026-07-31

scope 'operator'|'community'|'account' als Pflichtfeld je Registry-Modul,
PURE Filter-Regel (dashboardNav.ts, 20 Tests): dreiwertiger Ort, getrennte
Rechte-Quellen, fail-closed ohne scope. Gruppen nach Davids Entwurf; keine
Menüpunkte ins Leere — die 14 fehlenden Seiten kommen einzeln (Plan bleibt in
docs/plans/DASHBOARD-IA.md). **Gelernt:** die Silo-Ausnahme muss an
tenancy.enabled hängen, nicht an isTenantHost — sonst erscheinen
Community-Einträge auf Kontroll-Hosts, wo ihre APIs 404en.

### E10 — Customer Feedback zentral ✅ 2026-07-31

Nach Davids acht Vorab-Entscheidungen: feedback+tickets zogen von comments
nach control (Silo-Bestand vorher gesichert: 10 lokal/1 Prod), vier neue
Control-Tabellen (control-032, lokal+Prod gefahren), Feedback-Widget auf
jeder Community-Seite, /dashboard/feedback (Trending/Top/New) +
/dashboard/roadmap (vier Spalten), Naht „jedes Dashboard fragt seinen
eigenen Server" (controlService in core, in-process auf control,
fail-soft), origin nur für den Betreiber, eine Stimme pro Person,
Rate-Limits, GDPR-Contributor. Roadmap = Sicht auf Feedback, NICHT das
Ticket-Board (bleibt Betreiber-intern). Bewusst offen im Plan: Auto-
Changelog bei Complete, Owner-Sicht, Verfasser-Benachrichtigung (D5-Wand).
**Gelernt:** Wenn zwei Layer denselben Naht-Transport brauchen, gehört er
in core hochgezogen — nicht kopiert (controlService, Config-Schlüssel
unverändert, onboarding delegiert nur noch).

### C18 — Sichtbarkeit pro Community ✅ 2026-07-31

Wählbar unter Settings→Community (team.manage), neue Communities entstehen
öffentlich (dokumentierte Kehrtwende zu G0-7). Permissions-Flip in beide
Richtungen über pure Regel repermissionRow() (liest „veröffentlicht" am
BESTEHENDEN Array ab — öffnet nie, was zu war) + Registry/Cursor/Zeitbudget;
SEO zieht mit (noindex, robots, sitemap-404 VOR dem Datenlesen, og zu);
pages ohne Row-Permissions bekam die eigene Wache. Beweise:
verify-audience-flip 19/19, pool-isolation 13/13 unverändert; Demo nach dem
Deploy explizit public gestempelt (Status quo). **Gelernt:** Ein Feld, das
bisher nichts steuerte, macht beim Scharfschalten den BESTAND fail-closed
„halb zu" — der Betriebsschritt (Stempel-Einzelvorgang) gehört in denselben
Plan wie der Code. **Gelernt:** Mandantenübergreifende Schreiber (GDPR-
Tombstone) dürfen nie hart read(any) stempeln — sie öffnen sonst Inhalte
geschlossener Communities.

### C12 — Dashboard-Kleinteile ✅ 2026-07-31

Audit-Liste komplett (96 Dateien): Kunden-Labels statt interner IDs
(gebündelte Namens-Auflösung statt 50 Einzelabrufen), Jargon übersetzt,
Nuxt-UI statt Handbau, aria-Labels, Toasts 15→190 mit Beschreibung über
fünf parallele Gruppen — jede Beschreibung gegen den Code verifiziert.
**Gelernt:** error.statusMessage als Toast-Text ist unter HTTP/2 IMMER leer
(Reason-Phrase entfällt) — Beschreibungen brauchen übersetzte Fallbacks
(Rest als F1). **Gelernt:** Audit-Zeilennummern altern — Stellen per Inhalt
suchen, Erledigtes ausweisen statt doppelt bauen. **Gelernt:** Eine gute
Fehler-Beschreibung sagt, was NICHT passiert ist („dein Text steht noch im
Formular") — und muss gegen den Code geprüft sein, sonst ist sie gelogen.

**Rest: der UTable-Rollout (B6) ✅ 2026-07-31.** Die Audit-Zahl „18 handgebaute
Listen" stammt vom 2026-07-28 und war beim Nachmessen längst abgetragen: die
B6-Welle (Merge `d1692c49` plus `a2be6cae`, `7dcf4515`, `173c2bad` …) hat sie
umgebaut — heute halten **26 Dashboard-Seiten** plus die geteilte
`SessionsTable` eine `UTable`. Neu gemessen
wurde über alle `app/pages/dashboard/**` und `app/components/**` der Layer;
übrig blieben zwei echte Datenlisten, beide umgebaut: die **letzten Kommentare**
auf der Nutzer-Detailseite (`admin/users/[id].vue` — dieselbe Karten-Reihe, in
der Sitzungen und Protokoll schon Tabellen waren; Spaltenköpfe aus
`admin.moderation.col.*`, damit dieselben Felder nicht zweimal übersetzt
werden) und die **Abhängigkeiten** auf `dashboard/system.vue` (eine Tabelle JE
KATEGORIE, damit die Gruppierung bleibt; Inhalt 1:1, inkl. Dev-Update-Knopf).
Alles andere ist **bewusst keine Tabelle** und trägt den Grund jetzt AN DER
STELLE als Kommentar (B6 verlangt genau das): Vorschau-Kacheln der Übersicht
(`admin/dashboard/index.vue`, fünf Zeilen + „Alle ansehen") · Benachrichtigungs-
Kanäle in der schmalen Steuerspalte (`users/[id].vue`) · Schalter-mit-Erklärtext
statt Datensatz (`admin/products.vue`, `admin/config.vue`) · der Aktivitäts-Feed
(`activity.vue` — dieselbe Komponente wie öffentlich, Bündelung + Endlos-
Nachladen) · die Roadmap und das Ticket-Brett (der Status IST dort die Spalte;
die tabellarische Sicht auf dieselben Daten steht unter `/dashboard/feedback`) ·
die Beobachtet-Schublade (`tickets.vue`) · Preiskarten
(`settings/subscription.vue`) · der Quota-Katalog in `control/tenants.vue`
(Formular mit Eingabefeldern). **Gelernt:** Eine Audit-ZAHL altert wie eine
Zeilennummer — vor dem Ausrollen neu messen, sonst baut man an bereits
umgebauten Stellen. Und: „handgebaut" ist kein Befund, solange der Grund
danebensteht — die Arbeit an solchen Stellen ist, den Grund zu schreiben, nicht
die Bauweise zu wechseln.

### C16 — die drei toten Berechtigungen haben ein Ziel ✅ 2026-07-31

`branding.manage`, `posts.write` und `community.delete` standen in der
Rollen-Matrix und steuerten nichts. Jede hat jetzt eine Fläche — zwei davon
anders, als die Notiz es vorgezeichnet hatte:

**`branding.manage` (= F5).** Nicht „die Themes-Seiten auf branding.manage
ziehen": `custom_themes`, `custom_fonts` und `app_config.themeSettings` gehören
dem Appwrite-PROJEKT (read(any), Live-Propagation an ALLE Communities des
Pools) — ein Community-Admin hätte damit fremde Communities umgefärbt. Der
Schnitt heißt **Wahl ≠ Katalog**: die Wahl (`communities.theme/variant/neutral`)
zog aus der Settings-Karte auf eine eigene Seite `/dashboard/branding` im
**onboarding**-Layer (dort, wo ihre Route lebt — dieselbe Regel wie bei den
Mitgliedern), der Katalog bleibt `system.manage`, und das Theme-Studio ist
jetzt `scope: 'operator'`. Umgezogen, nicht kopiert.

**`posts.write`.** Der gemeldete Befund war schon halb erledigt: die Routen
prüften die Autorschaft längst (`row.authorId !== user.$id` ⇒ 403), das
Karten-Menü bot Bearbeiten/Löschen an. Die echte Lücke war das DASHBOARD — die
posts-Sektion verlangt `posts.moderate`, und Editor und Moderator sind in der
Matrix **Geschwister**, keine Kette. Also: die dreifach ausgeschriebene
Autoren-Regel zu einer puren Funktion zusammengezogen
(`postAuthorPolicy.ts`, 15 Tests) und eine zweite Nav-Registrierung +
`/dashboard/my-posts` (`GET /api/posts/mine`) für `posts.write` gebaut.

**`community.delete`.** Kehrtwende zur Entscheidung 3 vom 2026-07-29, mit einem
Schnitt, der deren Einwand auflöst: **stilllegen statt vernichten**
(`communities.status='disabled'` ⇒ Host 404 in ≤30 s, alle Mitgliedschaften
'removed', Labels eingezogen — INHALTE BLEIBEN). Gesperrt bei laufendem Abo
(409 `subscription_active`) und bei bereits stillgelegter Community. Volle
Begründung im [DECISION-LOG](DECISION-LOG.md#2026-07-31).

**Gelernt:** Eine tote Capability sagt nicht, WO ihre Fläche hingehört. Bei
zweien lag die Antwort im Datenmodell, nicht in der Nav — `branding.manage` an
die Themes-Seiten zu hängen hätte eine Mandanten-Grenze geöffnet, weil die
dortigen Tabellen dem Projekt gehören und nicht der Community. Erst die Frage
„wem gehören die Zeilen, die diese Seite schreibt?" ergab den Schnitt.
**Gelernt:** Ein Modul der Nav-Registry trägt genau EINE `requiredCapability` —
bei Geschwister-Rollen (Editor ⊥ Moderator) braucht deshalb jede Zielgruppe
ihren eigenen Eintrag; ein gemeinsamer stellte eine der beiden vor eine Wand.

### F2 — doppelter i18n-Schlüssel in der Mitgliederliste ✅ 2026-07-31

`members.role` war in de+en ZWEIMAL definiert (String-Spaltenkopf und Objekt
`role.done`). `JSON.parse` behält still den letzten — der Spaltenkopf „Rolle"
rendert dadurch als roher Key-Pfad. Objekt in `members.roleChange.*` umbenannt,
Nutzung nachgezogen. **Gelernt:** Weder `JSON.parse` noch `jq --stream` noch
ein Blatt-Pfad-Diff finden das, denn die Blätter heißen verschieden
(`members.role` vs. `members.role.done`) — es braucht einen Scanner über den
ROHTEXT, der Schlüssel pro Objekt zählt. Gegenprobe über alle 48 Locale-Dateien
des Repos: sonst keine Dubletten.

### C14 — Bild-Naht Schritt 2: `@nuxt/image` mit Appwrite-Anbieter ✅ 2026-07-31

**Zuerst gemessen, dann entschieden — die Messung hat den Default gedreht.**
Zwei Läufe: (a) sharp/libvips, also das, was `ipx` unter @nuxt/image auf dem
APP-Server täte, (b) Appwrite 1.9.6 selbst. sharp auf einem M1 Max: AVIF kostet
das **3- bis 24-Fache** an CPU (0,5 MP → 1280 px: 1348 ms CPU gegen 56 ms für
WebP; 2 MP: 2280 ms gegen 136 ms). Auf dem geteilten CX23/CX33 neben sieben
Apps ist das nicht vertretbar. Appwrite ist milder (1,0–3,0× Wanduhr, zweiter
Abruf ~5 ms aus dem Cache), aber der **Byte-Gewinn trägt den Aufpreis nicht**:
bei gleicher `quality` war AVIF nur unter ~q60 kleiner (10–40 %) und ab q78
sogar GRÖSSER als WebP. **Entscheidung: Default WebP, AVIF nur ausdrücklich je
Bild** (`format="avif"`), und `image.format: ['webp']` im Core-Layer, damit auch
`<NuxtPicture>` niemanden unbemerkt AVIF bezahlen lässt.

**Der Anbieter rechnet nichts.** Appwrite kann `/preview` mit
width/height/quality/output und cacht das Ergebnis — gegen die lokale Instanz
nachgemessen: `output` akzeptiert **jpg, jpeg, png, webp, heic, avif, gif**
(ein unbekannter Wert antwortet 400 und nennt genau diese Liste), Kante hart bei
4000 px. Der Anbieter ist deshalb ein reiner URL-Bauer; `ipx` (und damit `sharp`
samt der 26-teiligen `@img/sharp-*`-Plattform-Matrix) steht als
`ignoredOptionalDependencies` in `pnpm-workspace.yaml`. Netto neu im Lockfile:
**zwei** Pakete. Beide Prod-Builds (photos, comments) enthalten weder einen
`/_ipx`-Handler noch sharp.

**Gelernt (teuer, 188 Typfehler):** @nuxt/image referenziert die Typ-Vorlage
jedes EIGENEN Anbieters mit `{ nitro, nuxt, node, shared }` — die Anbieter-Datei
landet also in ALLEN VIER generierten tsconfigs, und in zweien davon gibt es
weder `#imports` noch die App-Auto-Imports. Ein `useRuntimeConfig` aus
`#imports` im Anbieter kostete 188 Fehler quer durch alle Layer, von denen nur
EINER auf die Anbieter-Datei zeigte; die anderen 187 sahen aus, als hätten die
Auto-Imports aufgehört zu funktionieren. Der Ausweg war zugleich die einfachere
Bauart: die URL, die `<NuxtImg>` bekommt, ENTHÄLT Endpoint und Projekt schon —
der Anbieter braucht überhaupt keine Konfiguration. **Ein Anbieter darf nur
importieren, was in jedem der vier Projekte existiert.**

**Gelernt (still und gefährlich):** `sizes="100vw"` OHNE Stufen-Präfix liest
@nuxt/image als Schlüssel `1px`, macht daraus eine Bildschirmbreite von 1 und
liefert ein srcset `1w, 2w` — ein 1-Pixel-Bild, ohne Fehlermeldung. Jede
Aufrufstelle schreibt deshalb `xs:100vw`; festgehalten in
`packages/core/tests/nuxtImageProvider.test.ts`.

**Umgestellt:** EventCard, EventDetail, Event-Formular (events), Medien-Tabelle
(media), Galerie-Raster und Hero (photos). Kein Layout verändert — nur `<img>`
zu `<NuxtImg>` plus `sizes`/`placeholder`. Statische Bilder (`about.vue`) und der
Core-Proxy `/api/storage/*` (admin) bleiben unangetastet: der Anbieter reicht
alles durch, was keine Appwrite-Storage-URL ist, und darf deshalb global der
Default sein. **Beweise:** 40 Unit-Tests, `pnpm -r test/typecheck/lint` und
`check:manifests`/`check:single-copy` grün, zwei Prod-Builds, und ein Lauf gegen
die lokale Appwrite, der die vom Anbieter gebauten URLs wirklich abruft (alle
Varianten 200, Content-Type und Maße geprüft, Testbild wieder gelöscht).
**Rest:** `srcset` in der Antwort von `/api/media` hat seither keinen Leser mehr.

### F3 — Kontolöschung räumt jetzt auch das Control Plane ✅ 2026-07-31

**Der Befund:** `deleteUserCompletely` räumt das Appwrite-Projekt der RUNTIME
ab. `community_members` und `community_invites` liegen aber im Control Plane —
einem anderen Projekt, auf das die Runtime nur einen read-only-Key hat. Nach
der Löschung eines Pool-Kontos blieb die Mitgliedschaft mit toter
`runtimeUserId` stehen, und — der eigentliche Punkt — die E-Mail-Adresse der
Person unbefristet in jeder Einladung an sie. Eine userId ohne Konto ist ein
Pseudonym ohne Auflösung; eine E-Mail ist ein Personenbezug.

**Gelöst über die BESTEHENDE Service-Naht**, keine neue Vertrauensfläche: zwei
Routen im Control Plane (`/api/control/community/members/user-data` und
`…/user-erase`, Gate = Service-Secret) plus ein GDPR-Contributor `onboarding`
in dem Layer, dem die Naht gehört (A14 — dieselbe Stelle wie der
Beitritts-Handler). Silo-Apps ohne onboarding bekommen keinen Contributor, und
das ist richtig: dort gibt es keine Mitgliedschaften.

**KEIN JWT, anders als bei allen anderen community-Routen.** Das ist die
einzige Möglichkeit, nicht eine Aufweichung: beim Aufruf ist das Konto gerade
gesperrt und verschwindet gleich — bei einem Betreiber-Auftrag oder einem
Re-Run nach Teilfehler existiert es womöglich gar nicht mehr. Ein JWT zu
verlangen hieße, die Löschung genau dann zu verweigern, wenn sie am nötigsten
ist (derselbe Schnitt wie bei `feedback/user-erase`). Identität ist das Paar
(runtimeProjectId, runtimeUserId), und alles wird hart darauf gescopt —
dieselbe userId in zwei Projekten sind zwei Menschen.

**Die Letzter-Owner-Regel** (pure, `decideMembershipErasure`, 7 Tests): der
Regelfall ist LÖSCHEN — an einer Mitgliedschaft hängt kein fremder Kontext.
Die einzige Ausnahme ist der letzte Owner einer AKTIVEN Community; dort bleibt
die Zeile als Struktur stehen, aber ohne Personenbezug (E-Mail geleert), und
jeder solche Fall reist im KLARTEXT (Community-Name + Rolle) in die Antwort
und ins Log — der Betreiber muss wissen, welche Community einen verwaisten
Owner-Platz hat. Verweigern wäre falsch (das Löschrecht hängt nicht daran, ob
jemand erbt), einfach löschen auch (dann hätte die Kontolöschung von hinten
aufgehoben, was „Zugang entziehen" von vorn verbietet). Ein Test nagelt beide
Wege aneinander: was `decideRemoval` als `last_owner` sperrt, bleibt hier
stehen.

Einladungen werden HART gelöscht (der Personenbezug einer Einladung IST die
Adresse — ohne Empfänger ist der Token-Hash wertlos) und über die Community
auf das rufende Projekt eingegrenzt, weil `community_invites` keine
`runtimeProjectId` trägt. Die Adresse geht nur mit, wenn sie BESTÄTIGT ist:
eine unbestätigte gehört nachweislich niemandem. Export degradiert bei
unerreichbarer Naht auf leer, Löschung NICHT — sie scheitert laut, damit das
Voll-Erfolgs-Gate von `deleteUserCompletely` greift.

**Gelernt:** Ein GDPR-Contributor gehört dorthin, wo die NAHT zu den Daten
liegt, nicht dorthin, wo die Tabelle steht — sonst müsste ein Fundament-Layer
ein Produkt kennen. **Gelernt:** Wenn eine Löschregel und eine Verwaltungsregel
dieselbe Sache schützen, müssen sie dieselbe pure Funktion benutzen oder
aneinander getestet sein; zwei Wege zu einer Community ohne Owner sind einer zu
viel.

**Nachtrag (2026-07-31):** die drei dokumentierten Reste des Befunds sind zu.
(1) **`community_invites.invitedBy`/`acceptedBy` gekappt** — das sind die
Spuren, die ein Konto in FREMDEN Einladungen hinterlässt (wer eingeladen, wer
angenommen hat); die Zeile gehört jemand anderem und bleibt, nur der Verweis
fällt auf `''`. Gefahrlos, weil beide Spalten im ganzen Repo KEINEN Leser haben
(nur Schreibstellen in `invite.post.ts`/`accept.post.ts` — die Mail nennt den
Einladenden aus `invitedByName` im JWT). Eine pure Regel
(`inviteReferenceErasure`, 5 Tests) sagt, welche Felder ein Update anfasst;
pauschales Leeren hätte die Spur eines Unbeteiligten mitgelöscht. Idempotent per
Konstruktion, weil `''` die Abfrage nicht mehr trifft. (2) **`invite_requests`
in Auskunft UND Löschung** — der Personenbezug einer Early-Access-Anfrage ist
die Adresse PLUS der Freitext („Wofür willst du Pukalani nutzen?"), und der
Prune-Sweep räumt bewusst nur `declined` (30 d) und `redeemed` (90 d) ab: eine
OFFENE Anfrage lag bisher unbegrenzt da, gerade weil auf sie noch niemand
geantwortet hatte. Gescopt allein über die BESTÄTIGTE Adresse — die Tabelle
trägt keine Projekt-Spalte, sie entsteht vor jeder Community. (3) **Die
kaufmännische Frage ist ein eigener offener Punkt geworden** (F8): nach der
Kontolöschung des Owners bleiben `communities.stripeCustomerId`/`billingStatus`
bewusst stehen, weil die Letzter-Owner-Zeile nur entpersonalisiert wird — ob das
so bleibt (Aufbewahrungspflicht) oder eine Frist bekommt, ist Davids
Entscheidung und keine, die eine Löschroutine still trifft.

**Gelernt:** Eine Spalte ohne Leser ist trotzdem ein Datum. „Wird nirgends
angezeigt" beantwortet die Frage, ob das Kappen weh tut — nicht die Frage, ob
die Zeile dauerhaft auf eine gelöschte Person zeigen darf.

### F4 — Gäste schreiben nur, wo Gäste lesen dürfen ✅ 2026-07-31

**Der Befund (C18-Kante):** eine Gast-Kommentar-Row bekommt beim Anlegen
`withPublishedRead()`, und in einer Community mit Publikum 'members' ist das
`read(label:<communityId>)`. Ein Gast trägt kein Label — er sah nach dem
nächsten Seitenaufbau weder seinen eigenen Beitrag noch irgendeinen anderen.

**Die POST-Response-Lösung trägt nur die halbe Strecke** und war schon da: der
Store hängt die Antwort des POST per `upsertRow` in den lokalen Zustand, der
Gast sieht seinen Kommentar also sofort. Das ist bei Gästen keine
Bequemlichkeit, sondern das Einzige, was funktioniert — ein Nachladen der Liste
brächte ihn nicht zurück. Es hilft aber nur bis zum Neuladen; danach schrieb
der Gast nachweislich in ein Loch.

**Die kleinste ehrliche Lösung ist deshalb, die Frage vorn zu stellen:** Gäste
schreiben genau dort, wo Gäste auch LESEN dürfen. Eine pure Regel
(`guestCommentsAllowed`, 5 Tests) mit zwei Konsumenten — die Route antwortet
404, die Ansicht zeigt den Composer nicht. Liefen sie auseinander, stünde ein
Formular da, dessen Absenden garantiert scheitert.

Verworfen: `read(any)` auf der Gast-Row (macht die geschlossene Community genau
dort auf, wo jeder Fremde schreiben darf) und ein kurzlebiges
Sichtbarkeitsfenster (eine Permission, die wieder verschwindet, ist eine zweite
Wahrheit über dieselbe Zeile).

**Gelernt:** Der alte Kommentar im Anlegepfad nannte den Widerspruch schon
richtig, verwies aber auf einen Schalter, der ihn nicht auflösen kann:
`pukalani.comments.embed.guests` gilt für die INSTANZ, `audience` je COMMUNITY
— im Pool hätte der Betreiber Gast-Kommentare nur für ALLE Communities
abschalten können. Ein Rat, der in der beschriebenen Situation nicht befolgbar
ist, ist keine Dokumentation eines bewussten Verhaltens, sondern ein offener
Befund.

### F6 — type-only-Imports in alten Migrationen ✅ 2026-07-31

Bereits behoben vorgefunden: alle Migrations-Ordner linten fehlerfrei (die
parallele Session hat die Imports mit ihrem Index-Race-Retry-Refactor
mitgezogen). **Gelernt:** Funde vor dem Fixen erst REPRODUZIEREN — in einem
Repo mit parallelen Sessions altern Befunde in Stunden.

### C5 + C2 — Seitentitel + Nav-Tarif-Gate ✅ 2026-07-31

C5: 26 titellose Dashboard-Seiten über 7 Layer (Audit sagte 17/3 — Zahlen
altern) + verify/join, exakt im Bestandsmuster (useHead/useBrandTitle), ein
einziger neuer i18n-Key. C2: planProduct-Feld in der Nav-Registry (Name aus
dem Chrome-Vertrag — kein zweites Wort für dieselbe Frage), Gate an der
EINEN Filterstelle, an planAllowsProduct genagelt (dieselbe pure Funktion
wie der Server); Nicht-Pool unverändert; +7 Tests. **Gelernt:** Undefined-
Behandlung gehört IN die pure Regel, nicht an jede Aufrufstelle — der
Testfall planOn=false hat den vergesslichen Aufrufer sofort reproduziert.

### C3 + C4 — Kompositionen und Nav-Einträge in ihre Layer ✅ 2026-07-31

Events-/Kurs-Kompositionen aus apps/comments in den blueprint-Layer (Pool
und Silo identisch — platform zeigt die Einträge jetzt ERSTMALS, obwohl es
die Layer längst zog: der C4-Gewinn); Nav-Einträge in ihre Produkt-Layer,
Dedup strukturell (Objekt-Map, Key = Id). **Gelernt:** Beim Umzug einer
Komposition reist jeder fest verdrahtete APP-Pfad mit und wird woanders zur
Lüge — der Ticket-Checkout-Pfad wurde ein expliziter Config-Vertrag
(pukalani.events.ticketCheckoutPath, leer = fail-closed „Bald verfügbar").


### F1 — leere Fehler-Beschreibungen (statusMessage) ✅ 2026-07-31

Bereits behoben vorgefunden: der C12-Commit (`7bf22c92`) hat die vier
gemeldeten Stellen mitgenommen — in `packages/{comments,pages,media,admin}`
steht heute NULL `statusMessage`. Nachgemessen repo-weit: die einzigen
verbliebenen Vorkommen sind die sieben Betreiber-Stellen in
`packages/control` (invites 2×, tenants, websites 3×, requests) und die
tragen alle schon den Fallback (`statusMessage || t('…Hint')`); `requests.vue`
lässt die Beschreibung bei 502 bewusst leer, weil der Titel dort die Ursache
nennt. Die Regel, die daraus überlebt: **Kunden-Dashboard = nur übersetzter
Text** (ein englischer Entwickler-Satz sagt dem Community-Betreiber nichts),
**Betreiber-Konsole = `statusMessage` vorn, übersetzter Fallback dahinter**.
Beides steht als Begründung IN den Dateien (embed.vue, media.vue, pages.vue,
system.vue, products.vue), nicht nur hier. **Beweise:** `pnpm -r test`
(51 Suiten), `check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die
6 bekannten Warnungen), plus eine statische i18n-Gegenprobe: 2877 Keys in de
und en, keiner nur auf einer Seite, jeder statisch auflösbare `t()`-Key der
fünf Pakete in beiden Sprachen vorhanden. **Gelernt:** Eine „Rest"-Zeile, die
MITTEN in der Ausführung des Elternpunkts geschrieben wird, ist am Ende oft
schon miterledigt — vor dem Fixen reproduzieren (dieselbe Lektion wie F6).

### C7 — App-Icon je Community ✅ 2026-07-31

`/icon/<key>.png` (512, `?size=180` für iOS' `apple-touch-icon`): randlose
Kachel in der Basisfarbe der Community + Initiale, gerastert ohne Renderer im
Betrieb aus demselben gebackenen Zeichensatz wie die Vorschau-Karte. Gate
`pukalani.seo.tenantAppIcon` (Core-Default AUS, platform AN), verdrahtet an
der EINEN Stelle, an der schon Favicon und og:image hängen
(themes/app/plugins/theme.ts). Die Karten-Zeichenwerkzeuge sind dafür nach
`shared/brandRaster.ts` gewandert — statt einer zweiten Kopie hat jetzt auch
das Icon dieselbe Fläche, Mischung und Glyphen-Skalierung. Neu darin ist das
VERGRÖSSERN (der Atlas ist bei 72 px gebacken, ein 512er-Icon will ~300 px):
bilinear plus Steilerstellen der Deckung um 0,5, gedeckelt auf Faktor 2.
Anders als das og:image bleibt das Icon auf „nur für Mitglieder"-Communities
ERREICHBAR — begründet in der Route: es entsteht nur, wenn ein Mitglied die
Seite selbst auf seinen Home-Bildschirm legt, liegt danach ausschließlich auf
dessen Gerät und trägt nichts nach außen (anders als eine Vorschau in fremden
Chats, C18). **Beweise:** 15 neue Tests (Maße + PNG-Magic-Bytes je Größe,
Größen-Allowlist, Schlüssel-Trennung zur Karte), `pnpm -r test`,
`check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die 6 bekannten
Warnungen), dazu drei gerenderte Muster angesehen. **Gelernt:** Zwei Dinge
kamen erst durchs Hinsehen. (1) Der Test „Icon-Schlüssel ≠ Karten-Schlüssel"
schlug fehl — beide Versionszahlen standen auf 1, der gemeinsame Hash lieferte
denselben Wert; ein Namensraum ('icon') macht die beiden Gestaltungs-Stände
wirklich unabhängig. (2) Die erste Kanten-Steilheit (Faktor 2,7) sah in der
gerenderten Datei am „C" wellig aus: Steilerstellen verstärkt nicht nur die
Kante, sondern auch die Ungenauigkeit der Vorlage. Ein PNG-Test prüft Maße und
Magic Bytes — wie es AUSSIEHT, sieht nur, wer es ansieht.

### C12b — die Fehlerseite eines unbekannten Hosts sagt jetzt die Wahrheit ✅ 2026-07-31

Wer sich vertippt (`tippfehler.pukalani.app`), bekam eine Seite mit der
Überschrift **„500 - Unknown host"** über einer Antwort, die korrekt **404**
war: falsche Zahl, dazu Betreiber-Jargon vor einem Besucher.

**Wie die 500 zustande kam** (nachgelesen im Modul-Code, nicht geraten): der
404 fällt in der SERVER-Middleware `core/server/middleware/00.tenant.ts`, also
vor dem Renderer. Nuxts Fehler-Handler rendert die Fehlerseite über einen
INTERNEN Request auf `/__nuxt_error` (`localFetch`,
`@nuxt/nitro-server/dist/runtime/handlers/error.mjs`) — der lief durch dieselbe
Middleware, mit demselben unbekannten Host, und warf wieder. Für genau diesen
zweiten Durchgang schaltet Nuxt seinen Renderer bewusst ab
(`event.path.startsWith('/__nuxt_error') ? null : localFetch(…)`, sonst gäbe es
eine Endlosschleife) und fällt auf sein **eingebautes** Template zurück
(`templates/error-500.mjs`). Dieses Template liest `status`/`statusText` —
Nitros Fehler-Body trägt aber `statusCode`/`statusMessage`
(`nitropack/dist/runtime/internal/error/prod.mjs`). `status` fehlt also, das
Template nimmt seinen eigenen Default **500**, während `statusText` durchkam
(`errorObject.statusText ||= error.statusMessage`). Daher exakt die Paarung
„500" + „Unknown host" über einer 404-Antwort.

**Gebaut:** eine pure Regel-Datei `packages/core/shared/unknownHost.ts`
(Statustext + fachlicher Code + `isErrorPageRenderPass` + `isUnknownHostError`),
die Middleware lässt den Renderpass durch (`/__nuxt_error`) und wirft sonst
weiter 404 — jetzt mit `data.code = 'unknown_host'`. `CoreErrorPage` macht
daraus den Besuchersatz „Diese Adresse gehört zu keiner Community." (de/en) und
zeigt statt „Zur Startseite" (das im Kreis führte) einen Ausweg auf die
Anbieter-Seite: neues Feld `pukalani.brand.homeUrl` (Core-Default leer,
`apps/platform` = `https://pukalani.app`). Ohne Mandant rendert die Seite mit
der Instanz-Voreinstellung — kein Community-Branding, korrekt, die Adresse
gehört ja zu keiner. Der Theme-Plugin-Fetch auf `/api/themes` läuft dort in
denselben 404 und ist bereits `.catch`-gesichert.

**Kein Loch:** `/__nuxt_error` beantwortet Nuxts Renderer nur für INTERNE
Requests (`'__unenv__' in event.node.req`, `handlers/renderer.mjs`) und wirft
für alles von außen selbst 404 — die Ausnahme in der Middleware kann also nur
die Fehlerseite rendern, nie eine ungescopte Route. Beweis: 7 neue Unit-Tests
`packages/core/tests/unknownHost.test.ts` (u. a. „beschönigt keinen 5xx" — ein
kaputter Resolver bleibt fail-loud). **Gelernt:** Wenn eine Middleware wirft,
wirft sie auch beim Rendern der Fehlerseite — der Renderpass ist ein eigener
Request und braucht eine bewusste Ausnahme. Und: eine gerenderte Fehlerzahl ist
kein Beweis für den HTTP-Status; hier stammten Zahl und Text aus zwei
verschiedenen Quellen.

### C8 — Suche in der internen Doku ✅ 2026-07-31

Die Zeile las sich als „gibt es nicht"; gemessen wurde etwas anderes. Die
Doku-Site (`docs/`, eigenständige Nuxt-Content-App) hatte die Suche seit dem
ersten Commit — `queryCollectionSearchSections('docs')` plus
`UContentSearch`/`UContentSearchButton`. Sie funktionierte auch: gegen den
gebauten Server geprüft (⌘K, Abschnitts-Treffer mit Brotkrumen und
Hervorhebung, Pfeiltaste + Enter springt auf `/features/uebersicht#feature-layers`).

**Was wirklich fehlte, war die Sprache:** Nuxt UI beschriftet seine eigenen
Bausteine ohne gesetzte Locale englisch — „Search…", „Type a command or
search…", „Theme", „No matching data" — auf einer durchgehend deutschen Doku.
Gesetzt ist jetzt `<UApp :locale="de">` (app.vue + error.vue, Import aus
`@nuxt/ui/locale`), womit die gesamte Oberfläche mitzieht, nicht nur die Suche.
Der doppelte Suche-Block (app.vue UND error.vue) steht als eine Komponente
`docs/app/components/AppSearch.vue` mit deutschem Platzhalter („Doku
durchsuchen …") und Dialog-Titel. Kein externer Dienst: der Abschnitts-Index
entsteht im Browser aus der lokalen Content-Datenbank (`server: false` — er hat
im SSR-Payload nichts zu suchen). **Beweise:** `pnpm --filter @pukalani/docs
build` grün, Header zeigt „Suchen… ⌘K", Suche nach „presence" liefert neun
Abschnitts-Treffer über drei Gruppen. **Gelernt:** Zweimal in einem Durchgang
hat die MESSUNG gelogen, nicht der Code. (1) Der erste „Klick tut nichts" war
ein Klick daneben — Screenshot-Koordinaten sind skaliert, Elemente gehören per
`ref` angeklickt. (2) Danach war die Seite plötzlich tot mit 404 auf
`_nuxt/*.js`: der alte Vorschau-Server lief noch, der neue starb still an
EADDRINUSE, und das Fenster lud neues HTML gegen alte Chunk-Hashes. Vor jedem
Beweis prüfen, ob der Server, den man misst, auch der ist, den man gebaut hat.

### M4 — Schlüssel-Verzeichnis für Silo-Communities ✅ 2026-07-31

Der letzte ~1 % aus Horizont 3. Der Wellen-Runner war schon fail-loud (fehlt
`~/.appwrite-secrets/migrations/<projectId>.env`, bricht er ab, BEVOR er
irgendetwas migriert — keine halbe Welle); was fehlte, war der Blick VORHER.
Gebaut ist deshalb genau ein Betreiber-Skript,
[`packages/control/scripts/list-silo-keys.ts`](../packages/control/scripts/list-silo-keys.ts):
es liest das Community-Register des Control Plane und den lokalen
Schlüssel-Ordner und sagt je Silo-Projekt, in welcher Welle es steht, welche
Hosts daran hängen und ob seine Migrations-Env bereitliegt. Aufruf
`node --experimental-strip-types --env-file=apps/control/.env
packages/control/scripts/list-silo-keys.ts [--wave <welle>] [--keys-dir
<ordner>]`; Exit 1, wenn ein Projekt den Lauf blockieren würde — damit taugt
es auch als Vorabprüfung vor `pnpm migrate --wave` (im Runbook
[DEPLOYMENT.md 2b](runbooks/DEPLOYMENT.md) verlinkt).

**Bewusst klein gehalten:** kein Schreiben (weder DB noch Ordner), keine neue
Tabelle, keine Schlüssel in Appwrite — und **nie ein Wert auf stdout**. Es
meldet nur „Datei da / Pflicht-Variable gesetzt"; die einzige Ausnahme ist die
`projectId` aus der Datei (kein Geheimnis), denn eine vorhandene Datei, die auf
ein ANDERES Projekt zeigt, kommt durch die Existenzprüfung des Runners und
migriert dann die falsche Instanz. Die Wellen-Zuordnung kommt aus derselben
puren Regel wie der Lauf (`siloProjectsForWave` — `''` = stable, disabled zählt
mit, Projekte dedupliziert); ein Verzeichnis, das anders gruppiert als der
Lauf, wäre wertlos. Deshalb ist es auch `.ts` neben `list-silo-tenants.ts` und
kein `.mjs`: sonst stünde die Regel ein zweites Mal im Repo.

**Keine UI.** Die Betreiberseite läuft auf dem SERVER, die Schlüssel liegen auf
Davids Rechner — eine Spalte „Schlüssel vorhanden" könnte dort nur raten. Ein
Verzeichnis, das an der falschen Stelle nachsieht, ist schlimmer als keines.

**Nicht gebaut, bewusst:** der DYNAMISCHE Silo-Admin-Zugriff zur Laufzeit
(fremdes Projekt → fremder Key) bleibt bei seinem 501 in
`core/server/lib/appwrite.ts`. Das ist eine Sicherheitsentscheidung (ein
Server, der fremde Admin-Keys hält), kein Verzeichnis — und sie hat heute
keinen Konsumenten: kein fremder Silo-Host wird von der Platform-App bedient.

**Beweis (lokale control-Instanz):** leeres Register → „Keine Silo-Communities
im Register", Exit 0. Mit drei Wegwerf-Zeilen (zwei Hosts auf EIN Projekt,
eine Zeile mit `wave: ''`) und einem Wegwerf-Ordner: Welle `canary` zeigt
`m4probe-a` als bereit, Welle `stable` fasst beide Hosts unter `m4probe-b`
zusammen (also `''` → stable UND Dedup bewiesen) und meldet an einer
absichtlich kaputten Datei alle drei Befunde auf einmal — fehlende
`NUXT_PUBLIC_APPWRITE_DATABASE_ID`, kein Migrations-Key, falsche `projectId` —
Exit 1. Leerer Ordner → „Datei fehlt" + erwarteter Pfad. Wegwerf-Zeilen
danach gelöscht (Register wieder bei den drei Pool-Zeilen).

**Ehrlicher Ist-Stand:** produktiv listet das Verzeichnis heute NICHTS, und
das ist richtig — es gibt keine fremden Silo-Kunden. Die Einzel-Instanzen
`comments`/`portfolio`/`photos` stehen nicht im Community-Register und
migrieren über `pnpm migrate --app <app>`, nicht über Wellen (s. E5).
**Gelernt:** Ein Vorab-Check darf nicht bloß prüfen, ob eine Datei DA ist —
der Wellen-Runner tut genau das, und eine falsch befüllte Datei besteht diesen
Test und migriert danach die falsche Instanz. Anwesenheit ist keine Eignung.

### E7 — der lokale Playwright-Hang ist weg ✅ 2026-08-01

**Was war:** auf macOS beendeten sich die Playwright-Worker nach grünen Tests
nicht. Playwright force-killte sie nach 300 s und zählte das als Fehler
AUSSERHALB jedes Tests — Exit 1 trotz grüner Suite. Schlimmer: nach einem ROTEN
Test startet Playwright den Worker neu und wartet dabei auf den alten; ein Lauf
mit roten Baselines stand deshalb bei 21 von 24 Tests über 500 s still. In CI
trat das nie auf.

**Ursache (am 2026-07-31 belegt):** der Worker ist längst fertig (Event-Loop
leer, Stack in `kevent`), hängt aber an zwei offenen `net.Socket`-Handles —
stdout/stderr des Browsers. Ein Start von System-Chrome (`channel: 'chrome'`)
weckt auf macOS den `GoogleUpdater` (`--wake-all`), dessen
`--crash-handler`-Prozesse **erben genau diese beiden Deskriptoren**, reparenten
zu launchd (PPID 1) und schließen sie nie. Der Worker bekommt kein EOF. Über
Startflags war nichts zu machen: Playwright übergibt
`--disable-background-networking`, `--disable-component-update`,
`--disable-breakpad` und `--no-service-autorun` bereits, der Updater kommt
trotzdem.

**Die Kur (Davids Entscheidung):** `channel: 'chrome'` aufgeben, Playwrights
**gebündeltes Chromium** nutzen. Geändert: `apps/comments/playwright.config.ts`
(kein `channel` mehr), die 9 eingecheckten `-darwin`-Baselines der
Theme-Screenshots neu aufgenommen (Dateinamen unverändert — das Projekt hieß
schon vorher `chromium`), und in `.github/workflows/e2e.yml` ein eigener Schritt
`playwright install --with-deps chromium`, weil ubuntu-latest zwar Chrome, aber
kein Playwright-Chromium mitbringt.

**Beweis (eigener Dev-Server auf Port 3011, `PW_BASE_URL` gesetzt):** volle
Suite mehrfach — **24/24 grün, Exit 0, 23 s bzw. 26 s**, keine
`worker process did not exit`-Meldung, danach kein übrig gebliebener
Chromium-Prozess (`ps`/`lsof` sauber; der einzige „Google"-Treffer war Davids
eigener Browser, PPID 1, gestartet Wochen vorher). Vorher: 17+ Minuten.
Entscheidend ist der ROTE Fall: Läufe mit einem fehlgeschlagenen Test endeten
jetzt nach 69–83 s mit Exit 1 statt minutenlang stillzustehen — der Hang war
genau dort am teuersten und ist genau dort weg.

**Nebenbefund, NICHT von diesem Wechsel:** `embed-write.spec.ts` fällt bei
Playwrights Standard-Arbeiterzahl (hier 5) reproduzierbar durch, bei 1 oder 2
Arbeitern nie. Gegenprobe mit System-Chrome: fällt genauso durch — also
Parallel-Last, kein Browser-Problem (auf dieser Maschine liefen zusätzlich drei
Dev-Server fremder Arbeitsbäume). Als Fund gemeldet, noch nicht eingeplant.

**Gelernt:** Ein Prozess, der „nicht beendet", muss nicht selbst beschäftigt
sein — es reicht, dass ein FREMDER Prozess seine Pipes geerbt hat. Rezept für
das nächste Mal: im hängenden Worker `process._getActiveHandles()` ausgeben
(zeigt die offenen Sockets), dann per `lsof` den PEER derselben Socket-Inode
suchen — steht dort ein fremder Prozessname statt `/dev/null`, ist der Erbe
gefunden. Und: die Suche nach „welches Startflag schaltet das ab" war die
falsche Frage; abschaltbar war nicht der Updater, sondern die Entscheidung,
überhaupt System-Chrome zu starten.

### B7 — Dunkles Design für die Landingpage ✅ 2026-08-01

**Davids Entscheidung am Morgen: Ja** (zusammen mit B4 → Variante a). Die
Hell-Klemmung bestand aus DREI Teilen und alle drei mussten fallen:
`preference: 'light'` in der Config, ein `pages:extend`-Hook, der jeder Seite
`colorMode: 'light'` aufzwang (schlug sogar gespeicherte Besucher-Wahlen), und
— der eigentliche Grund — ein `marketing.css` ohne `.dark`-Zweig. Jetzt:
System-Präferenz entscheidet (`fallback: 'light'` hält Crawler/OG-Scraper
hell), die Licht-Dramaturgie läuft im Dunkeln „eine Oktave tiefer" (dieselben
acht HSL-Tripel, dunkel), Akzente drehen über die `--ui-color-primary-*`-
Stufen statt über ~30 Klassen-Änderungen. Umschalter (Hell/Dunkel/System) in
der Fuß-Basiszeile neben dem Sprachwähler; Auslöser-Icon bewusst fest, weil
SSR-gerendert (Hydration-Mismatch). Kontrast-Fix am gefüllten CTA: eigene
Label-Variable, dunkel 8,4:1 statt 1,9:1. Hell blieb bis auf drei Haarlinien
unverändert. Beweis: 20 Screenshots (alle Sektionen + Unterseiten, hell+
dunkel), Tests 4/4, Typecheck, Lint-Baseline, Build grün.

**Gelernt:** Eine „Klemmung" hat selten nur eine Schraube — wer nur die
Config-Preference löst, bekommt eine halb-dunkle Seite mit erzwungenen
Ausnahmen. Erst alle Stellen finden, die denselben Zustand erzwingen, dann
gemeinsam lösen. Und: wenn EIN Wert zwei Aufgaben trägt (Ink = Text UND
Bandgrund), braucht der Dunkel-Zweig eine Trennung in zwei Variablen — sonst
zwingt eine Farbe die andere mit.

### B4 — Appwrite-Web-SDK erst bei Bedarf ✅ 2026-08-01

**Davids Entscheidung am Morgen: Variante (a)** — das Web-SDK (im Projekt nur
für Realtime erlaubt) verschwindet aus dem Initial-Bundle und wird erst
geladen, wenn wirklich abonniert wird. Variante (b) (spekulative
`prefetch`-Hints filtern) blieb bewusst liegen: sie hätte den
Navigations-Vorsprung nach dem Login gekostet.

Umgebaut wurde genau die Realtime-Schicht des Core:
`useRealtimeClient.ts` (Clients + geteilte `Realtime` hinter EINEM
`clientsPromise`), `useRealtimeRows.ts` und `usePresence.ts`. Aus den
statischen `import { … } from 'appwrite'` wurden `import type` (verschwindet
beim Kompilieren restlos) plus ein dynamisches `import('appwrite')` an genau
den drei Stellen, die SDK-Symbole brauchen. Race-Freiheit hängt am einen
`clientsPromise`: Config-Plugin, Themes-Plugin und Presence starten fast
gleichzeitig und bekommen denselben Socket, nie zwei.
`syncRealtimeAuth()` lädt bewusst NICHTS nach — ohne bestehende Clients gibt
es keinen Socket umzuauthentifizieren, und ein Login auf einer Seite ohne
Abonnement soll keine 75 kB nachziehen. SSR ist unberührt (Web-SDK ist
client-only, die `import.meta.server`-Guards standen schon).

**Bundle, gemessen am Produktions-Build (statischer Initial-Graph = Entry plus
alles, was von dort per `import` hängt und im Head als `modulepreload` steht):**

| App | vorher | nachher | Ersparnis |
|---|---|---|---|
| `comments` | 704.254 B roh / **247.145 B gzip** | 630.050 B roh / **222.428 B gzip** | −74.204 B roh / **−24.717 B gzip (−10,0 %)** |
| `marketing` | 613.732 B roh / **217.274 B gzip** | 541.545 B roh / **192.836 B gzip** | −72.187 B roh / **−24.438 B gzip (−11,2 %)** |

Der SDK-Chunk selbst wandert vom Preload-Graph in einen eigenen, nachgelagerten
Chunk: **75.458 B roh / 25.400 B gzip** — also nicht größer als der frühere
statische Anteil (76.279 / 25.653). Ein Prefetch-Hint entsteht dafür NICHT:
`vue-bundle-renderer` verlinkt nur `dynamicImports` der GERENDERTEN Module,
und der Chunk hängt an drei Composable-Chunks, nicht am Entry-Modul.

**Beweise, alle live und nicht angenommen:**
- comments-E2E **24/24 grün in 31,2 s, Exit 0** (inkl. `realtime.spec.ts`
  „serverseitig angelegter Kommentar erscheint live" und des Popup-Login-
  Flows) — gegen den Dev-Server dieses Arbeitsbaums.
- **Live-Theme-Morphen für Gäste funktioniert weiter:** in einem Fenster ohne
  Session (`document.cookie` ohne `a_session`) wurde `app_config.themeSettings`
  server-seitig auf `crimson` und danach auf `jade` gesetzt — beide Male sprang
  `<html data-theme>` ohne Reload mit, samt frisch eingehängter
  `/themes/<name>.css`. Danach auf `mist` zurückgesetzt.
- **Seite ohne Realtime-Konsumenten lädt kein SDK:** `help` (keine
  Appwrite-Instanz) zeigt im Netzwerk-Log null `appwrite`-Requests und null
  `/api/auth/realtime-token`.
- `pnpm -r test` (alle Pakete grün), `-r typecheck` Exit 0, `-r lint` mit den
  6 bekannten Warnungen, `check:manifests` konsistent.

**F11 ist damit NICHT miterledigt** (nachgemessen statt vermutet): auf
`marketing` feuert `/api/auth/realtime-token → 401` unverändert, weil das
Config-Plugin weiter bedingungslos abonniert. Die Zeile in OPEN-ITEMS ist
entsprechend präzisiert.

**Gelernt (zwei Stück):** (1) **Ein bequemer `loadAppwriteSdk()`-Helfer kostet
das Tree-Shaking.** Erste Fassung reichte den SDK-Namespace durch eine
Funktion — Rollup sieht dann nicht mehr, welche Exporte benutzt werden, und
der Chunk wuchs von 76 kB auf **148 kB** (Storage, Messaging, Functions, Teams,
Avatars kamen mit). Der Initial-Graph schrumpfte trotzdem, die Zahl sah gut
aus, und die Regression wäre unbemerkt geblieben, hätte man nur die
Ersparnis gemessen. Fix: jeder Konsument destrukturiert DIREKT am
`import('appwrite')` — und **auch ein `Promise.all([import('appwrite'), …])`
zerstört es wieder**, weil der Namespace in eine Funktion wandert. (2)
**`useRuntimeConfig()` muss vor dem ersten `await` gelesen werden.** Beim
Umbau auf async ist der Nuxt-Kontext nach dem ersten `await` weg; alle
Einstiegspunkte lesen die Config deshalb synchron und starten erst danach das
Lade-Promise. Und der Port-Fallback der Dev-Server hat wieder zugeschlagen:
`PORT=…` wirkt nicht, weil das `dev`-Script `--port` fest übergibt — comments
landete auf 3000, marketing auf 3002 (die Standard-Ports hielt ein fremder
Arbeitsbaum). Erste Log-Zeile lesen, sonst misst der Beweis fremden Code.

### M13 (Teil) — Testphase-Hinweis gebaut, /workspace-Umzug gegenstandslos ✅ 2026-08-01

**Testphase-Hinweis:** `communities.trialEndsAt` (control-016) existierte,
zeigte aber nirgends hin. Jetzt: pure Regel `trialNotice` in
`packages/control/shared/onboarding.ts` (sichtbar 7 Tage vor Ablauf bis 14
Tage danach — ohne Nachlauf-Grenze wäre es ein Dauer-Verkaufsbanner, weil der
Sweep nur `plan` senkt und das Datum stehen lässt), Wert reist durch den
bestehenden Mandanten-Resolver (kein Extra-Hop), Route
`GET /api/community/billing/trial` gegated auf `community.billing` (der
Vertragszustand geht Mitleser nichts an — Beweis: Gast 401, Fremder 403,
Moderator 403, Kontroll-Host 404). Gerendert über die NEUE Registry
`pukalani.admin.notices` (Bauart chrome.utilities) auf der Dashboard-
Übersicht, client-only (Text hängt an Date.now() — SSR wäre ein
Hydration-Bruch). Beweis: verify-trial-notice.mjs 15/15 (echter
Wizard-Abschluss, alle vier Zustände, vier Verweigerungen), Browser beide
Sprachen inkl. Singular/Plural.

**/workspace → my.*: nichts zu bauen.** `/workspace` fiel schon mit A6
(8b11edbc, 2026-07-31, Workspaces ersatzlos abgeschafft) und lag außerdem auf
control.pukalani.app, nie auf my.* — es gab weder ein Ziel für einen Redirect
noch Code-/Mail-/Stripe-Verweise (Inventar geprüft; nur zwei Doku-Stellen,
beide mit datierten Hinweisen markiert statt blind umgeschrieben). Dabei die
ECHTE Lücke gefunden: my.* hat keine Landeseite für Bestandskunden → F12
(am selben Tag gebaut, Eintrag unten).

**Gelernt:** (1) Ein Listen-Eintrag altert wie eine Diagnose — „Umzug
/workspace→my.*" beschrieb einen Zustand von vor A6; erst Bestandsaufnahme,
dann bauen (der „Umzug" wäre eine erfundene Entsprechung gewesen). (2)
Appwrite gibt Datetimes als `…+00:00` zurück, `toISOString()` schreibt `…Z`
— String-Vergleiche auf Datetime-Spalten sind ewig falsch, immer als
Zeitpunkt vergleichen. (3) Vertragszustands-Daten gehören nicht in den
SSR-Payload öffentlicher Seiten, auch wenn es bequem wäre.

### F12 — `my.pukalani.app` ist jetzt der Kundenbereich ✅ 2026-08-01

**Befund (aus M13):** `my.*` hatte keine Landeseite. `/` leitete auf JEDEM
Kontroll-Host hart nach `/start`, und weil `useAuthRedirect()` mangels
`?redirect=` auf `/` zurückfällt, landete auch der Post-Login-Redirect dort —
ein Bestandskunde wurde in seinem eigenen Kundenbereich mit „Neue Community
anlegen" begrüßt.

**Gebaut (Davids Entscheidung: Kunden-Übersicht mit Plan-Badge +
Testphase-Status).** `my./` zeigt „Deine Communities": Name, Adresse, eigene
Rolle, Plan-Badge, Testphasen-Hinweis; Klick → Handoff-Token → `https://<host>/
dashboard`, eingeloggt (dasselbe 60-s-Siegel wie am Wizard-Ende). Wer 0
Communities hat, wird weiter in den Wizard geschickt — für den Neukunden war
das alte Verhalten immer richtig. Ausgeloggt greift der bestehende Auth-Guard
und bringt danach auf die Übersicht zurück (`?redirect=`).

**Vier Entscheidungen, die den Bau tragen:**

1. **Zwei Kontroll-Hosts, zwei Aufgaben.** Neue Achse
   `pukalani.tenancy.wizardHosts` (Env `NUXT_PUBLIC_TENANCY_WIZARD_HOSTS`,
   Prod `['start.pukalani.app']`) statt „der erste `controlHost` ist der
   Kundenbereich" — eine Reihenfolge-Regel kippt beim nächsten Env-Override
   unbemerkt. Pure, unit-getestete Funktion `controlHomeTarget()` in
   `core/shared/controlCenter.ts`; ein `?code=` schlägt beides (weitergeleitete
   Einladungs-Mail auf `my.*` darf den Code nicht verlieren).
2. **Post-Login blieb unangetastet.** Der Redirect zeigt weiter auf `/`; dass
   `/` jetzt woanders hinführt, erledigt dieselbe eine Middleware. Kein
   zweiter Ort, an dem ein Ziel gepflegt werden muss.
3. **Kein neuer API-Präfix — bewusst geprüft, nicht übersehen.**
   `GET /api/onboarding/communities` fällt unter den schon eingetragenen
   Präfix `/api/onboarding/`, und der Grund der Allowlist (auf einem Host ohne
   Mandant scopt nichts) trifft hier nicht zu: die Route berührt keine Tabelle
   des Runtime-Projekts, sie mintet ein JWT und lässt das Control Plane
   antworten (`POST /api/control/community/mine`), das nur nach der Identität
   AUS diesem JWT sucht. Auf einem Mandanten-Host antwortet sie 404 — Route
   UND Seite, denn eine versteckte Seite sperrt keine Route.
4. **Karten statt `UTable`** (bewusste Abweichung von Davids Regel B6, im Kopf
   der Seite begründet): die Liste ist per Konstruktion kurz (eigene
   Communities auf 3 gedeckelt), jeder Eintrag ist ein SPRUNG AUF EINEN
   ANDEREN HOST statt ein Datensatz zum Vergleichen, und es ist das Erste, was
   ein Kunde nach der Anmeldung sieht — oft auf dem Telefon. Wo dieselben
   Daten zum VERWALTEN stehen (`/dashboard/members`), bleibt UTable.

**Die Testphase reist nur zum Zahlenden.** `trialEndsAt` steht in der Antwort
nur für Mitgliedschaften, deren Rolle `community.billing` trägt (heute:
owner) — dieselbe Grenze, die M13 für `/api/community/billing/trial` gezogen
hat. Der **Plan** dagegen steht für alle: er liegt ohnehin im SSR-Payload
jeder Community-Seite (`tenant-brand.server.ts` spiegelt ihn für
`planAllows()`), ihn hier zu verschweigen wäre eine Geheimhaltung, die einen
Klick weiter nicht existiert. Der Umschlag trägt exakt sechs Felder — kein
`stripeCustomerId`, kein `projectId`, kein `tenantId`.

**Beweis:** `packages/onboarding/scripts/verify-my-overview.mjs` **25/25** —
zwei echte Wizard-Communities, Alice sieht genau ihre beiden (Bobs nicht),
Bob nur seine, ein Konto ohne Mitgliedschaft nichts, ein **entferntes**
Mitglied (`status='removed'`) die Community NICHT; Owner mit Testphasen-Datum
vs. Viewer derselben Zeile mit `null`; Feld-Liste des Umschlags; Gast 401,
Mandanten-Host 404 (Route + Seite); alle sechs Wege von `/` (my./ →
Übersicht · 0 Communities → Wizard · ausgeloggt → Login mit `?redirect=` ·
start./ → Wizard · `?code=` auf beiden Hosts → Wizard mit Code). Dazu 6+4
Unit-Tests (`myCommunities.test.ts`, `controlCenter.test.ts`) und der
Browser-Beweis in beiden Sprachen. `pnpm -r test` grün, typecheck grün, lint
mit den 6 bekannten Warnungen, `check:manifests` konsistent.

**Gelernt:** (1) **Ein „Redirect-Ziel ändern" ist selten eine Zeile.** Die
ehrliche Frage war nicht „wohin zeigt `/`?", sondern „welcher Host ist das
hier?" — ohne die neue Achse hätte `start.pukalani.app` still seinen Zweck
verloren, und genau das wäre erst dem ersten Kunden aufgefallen, der den
Kurz-Link aus einer Bio anklickt. (2) **Eine Liste eigener Dinge ist trotzdem
eine Datengrenze.** Der erste Entwurf hätte Plan und Testphase pauschal
mitgeliefert; erst der Blick auf M13 zeigte, dass „diese Community testet
noch" eine Aussage über den Vertrag ist — und dass der Plan es NICHT ist. Wer
Felder aus einer Zeile in einen Payload hebt, muss jedes einzeln begründen.
(3) **Nuxt fasst verkettete Middleware-Weiterleitungen zu EINEM 302
zusammen** — `my./` ausgeloggt antwortet direkt `/login?redirect=/communities`,
nicht erst `/communities`. Ein Beweis, der auf die Zwischenstufe wartet, misst
etwas, das es nie gibt. (4) Ein Wegwerf-Skript im Scratchpad findet
`node-appwrite` nicht (pnpm-Store) — es muss im Paket-Verzeichnis liegen, das
die Abhängigkeit hat.

### F11 — Gäste holen keinen Realtime-Token mehr ✅ 2026-08-01

**Befund (B7-Fund, in B4 nachgemessen und ausdrücklich NICHT miterledigt):**
`packages/core/app/plugins/realtime-config.client.ts` abonniert `app_config`,
sobald eine App eine Datenebene hat. Jeder Abonnent ruft
`ensureRealtimeJwt()`, und das holte den Token für JEDEN — auch für einen
Besucher ohne Session. Auf der Marketing-Landing hieß das: **ein
`GET /api/auth/realtime-token → 401` pro Seitenaufruf**, für jeden Gast,
ohne jeden Nutzen.

**Was NICHT das Problem war — und deshalb bleibt:** der WebSocket selbst.
`read(any)`-Channels (`app_config`, `custom_themes`, öffentliche Kommentare)
liefern auch einem Gast Events; davon lebt das Live-Theme-Morphen für
Besucher (in B4 live bewiesen). Der Gast-WS ist Feature, nicht Restposten.
Gefixt wurde also genau der sinnlose Token-Abruf, nichts sonst.

**Die Lösung ist eine Bedingung an EINER Stelle** — der einzigen, die
`/api/auth/realtime-token` überhaupt ruft: `ensureRealtimeJwt()` in
`packages/core/app/composables/useRealtimeClient.ts`. Ohne erkennbare Session
kein Abruf und kein Refresh-Timer; der Socket verbindet als Gast weiter.
Erkannt wird die Session am **Auth-Store**, den `plugins/auth.server.ts` beim
SSR aus `event.context.user` stellt und der Pinia-Nuxt-Plugin im Browser aus
dem Payload zurückspielt — **ein sessionloser Erstbesuch weiß es also ohne
einen einzigen Request**. Das httpOnly-Cookie kann der Browser nicht lesen,
und ein `/api/auth/me`-Ping wäre nur derselbe 401 unter anderem Namen
gewesen.

**Der Login im offenen Fenster zieht nach** — über den Weg, den es schon gab:
`plugins/realtime-auth.client.ts` beobachtet `auth.user.$id`, ruft
`syncRealtimeAuth(true)`, das nullt den memoisierten `jwtPromise`, holt über
dasselbe (jetzt passierbare) Gate den Token und schließt den Socket einmal —
die SDK verbindet neu und re-subscribed alles selbst. Bewusst **nicht**
memoisiert wird die Gast-Antwort: sie wird bei jedem Aufruf frisch gelesen,
sonst bliebe ein Fenster nach dem Login dauerhaft Gast.

**Mitgenommen (dieselbe Wurzel, gleiche Datei):** der 12-Minuten-Refresh
wurde bisher bei jedem `ensureRealtimeJwt()`-Erststart neu angelegt und nie
angehalten. Weil `syncRealtimeAuth()` den `jwtPromise` bei JEDEM Auth-Wechsel
nullt, sammelte ein Tab mit mehreren Login/Logout-Runden **mehrere parallele
Timer** — und nach dem Logout tickten sie weiter gegen einen Endpunkt, der
nur noch 401 antwortet. Jetzt: genau ein Timer (`jwtTimer ??=`), angehalten
bei Logout und bei jedem Gast-Aufruf.

**Diff:** eine Datei, `packages/core/app/composables/useRealtimeClient.ts`
(Gate + Timer-Wächter + Kommentare). Kein Plugin, kein Aufrufer, keine
Route geändert.

**Beweise, alle live gemessen:**
- **A/B auf der Marketing-Landing (Gast, Dev):** mit deaktiviertem Gate
  reproduziert — `GET /api/auth/realtime-token → 401`. Mit Gate: **null**
  `/api/`-Requests überhaupt, während der SDK-Chunk (`deps/appwrite.js`)
  weiterhin geladen wird — die Subscription läuft also, nur der Token fällt weg.
- **comments als Gast:** null Token-Requests, Realtime-WS steht
  (`ws://localhost/v1/realtime?project=…`, **ohne** `jwt`), ein
  server-seitig angelegter Kommentar kommt live an.
- **Live-Theme-Morphen als Gast:** `app_config.themeSettings` von `mist` auf
  `forest` gesetzt → `<html data-theme>` springt ohne Reload mit
  (navigation-Einträge 1 → 1), dabei null Token-Requests.
- **Login im selben Fenster (SPA-Navigation, kein Reload):**
  `/api/auth/realtime-token → 200`, der Socket verbindet neu und trägt jetzt
  den Token in der URL (`…/realtime?project=…&jwt=eyJ…`), Presence-WS-Upsert
  ohne Warnung.
- **comments-E2E 24/24 grün in 29,6 s, Exit 0** (inkl. `realtime.spec.ts` und
  des Popup-Login-Flows) · **`verify-presence-boundary.mjs` 23/23** ·
  `pnpm -r test` alle grün · `typecheck` Exit 0 · `lint` mit den 6 bekannten
  Warnungen · `check:manifests` konsistent.

**Gelernt (vier Stück):** (1) **Der Beweis „kein Request" braucht den
Gegenbeweis.** Ein leeres Netzwerk-Log beweist genauso gut, dass der Code gar
nicht lief — erst der A/B-Lauf mit ausgeschaltetem Gate (401 da, 401 weg)
trennt „gefixt" von „nie ausgeführt". Dazu gehört der positive Beleg, dass
der abhängige Pfad noch läuft (SDK-Chunk geladen, Theme morpht). (2)
**`performance.getEntriesByType('resource')` puffert nur 250 Einträge.**
Genau daran wäre der erste Marketing-Beweis gescheitert: der SDK-Chunk lud
nachweislich, tauchte aber nicht mehr in der Liste auf — „also hat das
Abonnement nicht stattgefunden". Netzwerk-Messungen gehören auf die
Werkzeug-Seite (Playwright/DevTools), nicht in die Seite. (3) **`pnpm --filter
X dev -- --port N` kippt den Dev-Server in eine Attrappe.** Das `--` schiebt
`--port 3017` in `nuxi dev [rootDir]` als POSITIONALES Argument — Nuxt startet
mit rootDir `--port`, bindet einen Fallback-Port und liefert die
„Welcome to Nuxt"-Seite. Sah aus wie ein kaputter Build, war ein kaputter
Aufruf. Der Port lässt sich so nicht erzwingen; richtig ist `pnpm --filter X
dev` und dann die Zeile `[get-port] … Using alternative port …` lesen.
(4) **`verify-presence-boundary.mjs` braucht ZWEI Server:** ohne laufendes
`apps/control` (Port 3004) scheitern 7 der 23 Prüfungen an fehlenden
Site-Labels — der Beitritt ist ein Control-Plane-Vorgang. Das sieht nach
Regression aus und ist Umgebung; Akt 2 überspringt sich nur, wenn `platform`
fehlt, nicht wenn das Control Plane fehlt.

### D1 — Neubewertung: in F7 eingerückt ✅ 2026-08-02 (Davids Entscheidung)

Der Wartegrund „der Stripe-Webhook kennt den Community-Host nicht" war seit
S7+A6 sachlich überholt (die Zuordnung läuft über die Event-Row bzw.
metadata.communityId — der Webhook braucht nie einen Host; D5 löst die
GEGENrichtung und war hier irrelevant). Der echte Blocker stand nirgends:
ohne Stripe Connect landet das Ticketgeld eines Community-Events beim
BETREIBER, und der Owner bräuchte je Preis einen von David angelegten
lookup_key — kein selbstbedienbares Produkt. David: Nein zu
Betreiber-als-Verkäufer ⇒ D1 ist Teilstück von F7 (Events-Hälfte M,
Kurse-Hälfte L/XL — community-scoped Entitlements sind unentworfen).
Nebenbefund als F13: das Pool-Formular bietet „paid" an, obwohl der CTA
„Bald verfügbar" zeigt (am 2026-08-01 behoben — eigener Eintrag oben, samt
der gleichen Sackgasse bei den Kursen).

**Gelernt:** Ein geparkter Wartegrund altert wie eine Diagnose — er hat hier
einen D5-Verdacht erzeugt, der ins Leere lief. Geparkte Zeilen beim Erledigen
ihrer Nachbarn gegenlesen; und „technisch möglich" ist nicht „produktlich
sinnvoll": die Geldfluss-Frage (wer ist Verkäufer?) schlägt jede Verdrahtung.

### M13 (Rest) — Sperr-/Missbrauchspfad ✅ 2026-08-02 (Davids Entscheidungen)

Damit ist M13 vollständig; das letzte Stück war die Frage, die eine Plattform
irgendwann beantworten muss: **was passiert, wenn eine Community nicht zahlt
oder Schaden anrichtet?**

**Davids Entscheidungen (2026-08-02):** drei Auslöser — (1) der Betreiber
sperrt von Hand, mit protokolliertem Grund; (2) Zahlungsverzug automatisch
nach 14 Tagen; (3) eine GEPRÜFTE Missbrauchsmeldung von außen. Zwei Stufen —
`billing` macht die Community **nur-lesend** (Gäste und Mitglieder lesen
weiter, jedes Schreiben ist zu, der Owner sieht einen Hinweis mit dem Weg zur
Zahlung), `abuse` nimmt den **Host sofort komplett vom Netz** (404 wie eine
unbekannte Adresse, Inhalte bleiben nur dem Betreiber zugänglich). Entsperren
geht immer von Hand; eine ausgeglichene Zahlung hebt die billing-Sperre von
selbst auf.

**Migration control-034** (additiv): `communities.suspension` (''|billing|abuse)
· `suspensionReason` · `suspendedAt` · `pastDueSince`, dazu die Indizes
`idx_billing_status`/`idx_suspension` und die Tabelle `abuse_reports`
(permissions: [], wie invite_requests). BEIDE `createRow<TenantRow>`-Stellen
setzen die vier Felder explizit — die Migration muss vor dem Code-Deploy laufen.

**Warum eine eigene Achse neben `status`** (der 404et den Host auch): `status`
ist der LÖSCHWEG (C16) und lässt die Community aus der Kundenübersicht
verschwinden. Eine gesperrte muss dort BLEIBEN — sonst kann der Owner weder
zahlen noch erfahren, warum seine Adresse tot ist. Und `status` trägt weder
Grund noch Zeitpunkt.

**Durchgesetzt an genau zwei Stellen, keiner Route:**
- `abuse` ⇒ `mapTenantRowToContext()` liefert `null`. Damit fällt der
  BESTEHENDE C12b-Pfad an: 404 mit `unknown_host`, Seite wie API, ohne dass
  eine einzige Route davon weiß.
- `billing` ⇒ die DATENTÜR (`tenantDb`) weist `create/update/remove/
  increment/decrement/updatePermissions` für die Türklinke `'member'` ab —
  403 mit `data.code: 'community_suspended'`. Dieselbe Stelle wie der
  A5-Beitritt, und aus demselben Grund: „jede Route muss daran denken" hat
  sich am 2026-07-26 schon einmal als keine Regel erwiesen. `'operator'`
  bleibt offen, sonst nähme die Mahnung dem Betreiber die Moderation aus der
  Hand.
Die puren Regeln liegen in `packages/core/shared/communitySuspension.ts`
(fail-OPEN beim Lesen der Spalte: ein krummer Wert darf nie eine zahlende
Community vom Netz nehmen; die Schreibseite ist per Zod-Enum eng).

**Zahlungsverzug:** der Stripe-Webhook stempelt nur `pastDueSince` — und zwar
NUR beim ersten Mal (jedes weitere Dunning-Event würde die Frist sonst neu
starten und sie liefe nie ab). Gesperrt wird im stündlichen Sweep
(`runPastDueSweep`, mitfahrend im bestehenden trial-sweep-Plugin statt eines
zweiten Timers), aufgehoben in derselben Runde, sobald kein Verzug mehr
besteht — das ist das Netz unter dem Webhook, der die Sperre beim
`active`-Event sofort löst. `POST /api/control/sweeps/past-due`
(`sites.manage`) stößt ihn an, damit die 14-Tage-Automatik beweisbar ist,
ohne eine Stunde zu warten.

**Missbrauchsmeldung:** öffentliche Seite `/missbrauch-melden` (en
`/report-abuse`) ohne Anmeldung — wer meldet, ist fast nie Mitglied der
gemeldeten Community. Honeypot + Rate-Limit 5/min/IP + strenges Zod; der Host
wird pur normalisiert (ein voller Link ist erlaubt). Der Weg läuft über die
bestehende Service-Naht ins Control Plane (`/api/abuse` neu in
`controlApiPrefixes`, damit die Seite auf einem Kontroll-Host lebt — der
gehört niemandem und kann deshalb nie gesperrt sein). **Eine Meldung bewirkt
für sich NICHTS**: sie legt eine Zeile an und weckt den Betreiber. Sonst wären
fünf erfundene Meldungen eine Waffe gegen jede beliebige Community. Entschieden
wird in der Warteschlange `/dashboard/abuse` (UTable, `sites.manage`); der
Knopf „Community sperren" schreibt über dieselbe eine Sperr-Funktion, also
steht auch dieser Weg im `audit_logs`-Protokoll.

**Was der Kunde sieht:** ein Hinweis auf der Dashboard-Übersicht über die
M13-Registry `pukalani.admin.notices` (`order: 5`, vor dem Testphasen-Hinweis
— eine gesperrte Community ist die dringlichere Nachricht), Text = der Grund,
den der Betreiber getippt hat, Knopf → Abo-Seite. Der GRUND reist bewusst
NICHT im Mandanten-Kontext mit (er stünde sonst im SSR-Payload jeder
öffentlichen Seite und erzählte jedem Gast vom Zahlungsverzug), sondern kommt
über einen einzelnen, auf `community.billing` gegateten Service-Ruf — und nur,
wenn wirklich gesperrt ist.

**In „Deine Communities" (my.*):** billing-gesperrte Communities BLEIBEN mit
Hinweis stehen und sind klickbar (der Host läuft ja). Eine abuse-gesperrte
sieht **nur, wer abrechnet** (heute der Owner) — als Karte OHNE Link mit
Status-Text. Zwei Gründe: der Host ist offline, für alle anderen ist die
Community schlicht weg (dieselbe Erfahrung wie bei jeder abgeschalteten
Adresse); und „wegen Missbrauchs gesperrt" ist ein Vorwurf — den liest der,
an den er gerichtet ist, nicht seine zwanzig Mitglieder.

**Beweise:** `packages/onboarding/scripts/verify-community-suspension.mjs`
**50/50** (echter Wizard-Abschluss; billing: Gast liest 200 / Mitglied-POST 403
mit `reason` / Owner sieht Banner-API samt Text / Mitglied 403 / Moderation
offen; abuse: Seite UND API 404 als `unknown_host`, selbst für den Owner;
Meldeformular bleibt erreichbar; Übersichts-Karten; Betreiber-Route 401/403/400
ohne Grund + Protokoll; Sweep 13 vs. 15 Tage mit injizierter Zeit, Idempotenz,
automatische Aufhebung, abuse unangetastet; Meldeformular ohne Konto inkl.
Honeypot und Warteschlangen-Kanten). Dazu 3 neue Unit-Dateien (core
communitySuspension, control pastDueSuspension + abuseReports) und erweiterte
Bestandstests. `verify-site-authz` **97/97** unverändert;
`verify-my-overview` **27/27** (war 25/25 — der Umschlag-Whitelist-Test kannte
`suspension` noch nicht, plus zwei neue Prüfungen). Browser: Sperr-Dialog und
„nur lesen"-Abzeichen in der Communities-Liste, Missbrauchs-Warteschlange,
öffentliches Meldeformular, roter Owner-Hinweis im Dashboard einer gesperrten
Community.

**Gelernt:** (1) **`toH3Error()` verschluckte fachliche 4xx.** Die
Aufrufstellen sehen fast alle so aus: `await db.create(…).catch(e => { throw
toH3Error(e, '…') })` — das `.catch` fängt also auch die bewussten Fehler der
DATENTÜR. Aus dem 403 der Sperre wurde ein 500 „interner Fehler": der Server
wies korrekt ab und log dem Client dabei. Behoben, indem ein bereits fertiger
H3-Fehler unverändert durchgeht. Wer eine Regel in eine geteilte Naht legt,
muss prüfen, was die Aufrufer mit ihren Fehlern machen. (2) **Ein Beweis nach
einem Datei-Edit misst unter Umständen den alten Server.** Ein Lauf war rot,
weil Nitros HMR nach der `appwriteError.ts`-Änderung mit einem halb alten
Bundle antwortete — derselbe Lauf war ohne jede Codeänderung sofort grün. Nach
einer Änderung an `server/utils/**` erst den Dev-Server durchatmen lassen (oder
neu starten), sonst debuggt man eine Regression, die es nicht gibt. (3)
**Die Frist braucht eine eigene Spalte.** `pastDueSince` aus `$updatedAt`
abzuleiten wäre bequem und falsch: der Webhook schreibt bei jedem
Dunning-Versuch, die 14 Tage begännen jedes Mal von vorn und liefen nie ab.
(4) **Zeit im Beweis injizieren, nicht abwarten.** Der Sweep rechnet gegen eine
Spalte — 13 Tage und 15 Tage sind zwei `updateRow`-Aufrufe und eine
Sekunde Laufzeit; „eine Stunde auf den Timer warten" wäre kein Beweis, sondern
eine Hoffnung.

### Quer-Audit-Befunde gefixt ✅ 2026-08-02

Sechs Befunde aus dem Quer-Audit über den frisch gebauten M13-Pfad, alle vorher
am Code reproduziert, dann behoben. Der Reihe nach:

**1 (HIGH) — Der gemeldete Link lief roh in ein `href`.** `abuse.vue` rendert
`:href="row.original.url"`; auf dem ganzen Weg dorthin (öffentliche Route →
Service-Naht → Zeile → Projektion) prüfte niemand mehr als `max(500)`. Ein
`javascript:`-Wert wäre damit **einen Klick des Betreibers** von fremdem Code im
control-Origin **mit `sites.manage`-Session** entfernt gewesen; `target="_blank"`
hilft dagegen nicht, weil ein `javascript:`-Ziel gar kein neues Fenster öffnet.
Gefixt auf ALLEN Stationen: neue pure Regel `isDisplayableReportUrl` /
`normalizeReportedUrl` (`packages/control/shared/abuseReports.ts`) — sie räumt
erst \t\r\n **überall** und C0-Leerraum an den Rändern weg (Browser tun genau
das, bevor sie das Schema lesen: `java\nscript:` **ist** `javascript:`) und
parst dann mit `new URL()`, statt einen zweiten, eigenen Parser zu erfinden.
Beide Eingänge (`abuse/report.post.ts`, `control/abuse-reports/index.post.ts`)
normalisieren jetzt; ein unbrauchbarer Link **leert nur das Feld** und weist die
Meldung nie ab — der Fließtext ist der wertvolle Teil. Die Warteschlange macht
zusätzlich nur dann ein `<a>`, wenn dieselbe pure Regel zustimmt, sonst steht
der Wert als Text da (Bestandszeilen von vor dem Fix). **Entscheidung, festgehalten:
`url` ist BELEG, der Klick nur KOMFORT** — deshalb bleibt der Wert vollständig
lesbar, auch wenn er nie klickbar wird.

**2 (MEDIUM) — `/api/onboarding/communities` ohne Deckel.** Jeder Aufruf prägt
ein Appwrite-JWT und lässt danach zwei Tabellen über zwei Projekte lesen — die
Kostenklasse der `realtime-token`-Route, die schon auf 10/min stand. Gleicher
Deckel (`TOKEN_MAX`), eigener Bucket.

**3 (MEDIUM) — Der Zahlungsverzugs-Sweep kappte still bei 100.** Beide Schleifen
lasen `Query.limit(100)` ohne Pagination. Nach oben fehlte damit nur eine
verspätete Sperre — nach **unten** blieb jemand gesperrt, der längst bezahlt
hat, und niemand hätte es gemerkt: genau die Hälfte, die das Netz unter dem
Webhook ist. Neu: `collectPastDueWork()` sammelt beide Vorräte über den
hauseigenen `listAllRows` (Cursor bis zur Teilseite, wirft bei 50.000 statt
unvollständig zurückzukehren). **Erst lesen, dann schreiben** ist dabei keine
Stilfrage: der Lauf ändert genau die Spalten, nach denen er filtert — eine
bearbeitete Zeile verlässt die Ergebnismenge und verschöbe alles Nachfolgende.

**4 (LOW) — Mail-Links zeigten auf abuse-gesperrte Hosts.** `communityHostResolver`
kannte nur `status`, weil die Sperre nach ihm gebaut wurde. Jetzt fällt
`suspension === 'abuse'` genauso durch wie `disabled` (der Host ist komplett
offline, der Link wäre eine 404-Sackgasse). `billing` bleibt bewusst drin: dieser
Host **lebt**, nur-lesend, und der Link führt genau richtig. Gefiltert wird im
Code statt per `Query.notEqual` — die Spalte ist optional, und ein SQL-`!=`
sortiert NULL gleich mit aus, womit der Resolver für Bestandszeilen gar nichts
mehr fände.

**5 (LOW) — Mitgliedschafts-Seite ohne `status`-Filter.** `community/mine.post.ts`
holte 50 Zeilen und siebte **danach**: wer aus mehr als 50 Communities entfernt
worden war, bekam eine leere Übersicht, obwohl er anderswo aktiv ist. Der Filter
steht jetzt in der Abfrage, wie bei der Schwester `suspension.post.ts`. Damit
das Literal `'active'` ehrlich bleibt, ist `hasCommunityAccess` neu festgenagelt.

**6 (LOW) — `reporterEmail` reiste in den Browser,** obwohl die Warteschlange sie
nirgends rendert. Aus dem Umschlag genommen; sie steht weiter in der Zeile und in
der Alarm-Mail, wo sie gebraucht wird. (Ihre Löschfrist bleibt offen — F8.)

**Dazu eine Klärung ohne Codeänderung:** in `abuse-reports/[id].patch.ts` steht
jetzt an der Stelle, warum `status: 'open'` eine verhängte Sperre NICHT
zurücknimmt — mehrere Meldungen können zu derselben Sperre geführt haben, und
Entsperren ist ein eigener Vorgang mit eigenem Protokolleintrag.

**Beweise:** `verify-community-suspension.mjs` **54/54** (war 50/50 — vier neue
Live-Prüfungen für den Link: `java\nscript:`-Meldung wird ANGENOMMEN, die Zeile
steht, das Feld ist leer, ein gewöhnlicher https-Link kommt getrimmt an),
`verify-my-overview.mjs` **27/27** unverändert. Unit: 15 Fälle für die pure
URL-Regel (`javascript:`/`data:`/`vbscript:`/`file:`, `JaVaScRiPt:`,
Leerzeichen- und Steuerzeichen-Tricks inkl. `java\nscript:`, relative Werte),
4 für die Sweep-Pagination gegen ein seitenlieferndes Fake-TablesDB, 2 für den
Host-Resolver (env-gated; mit der lokalen Appwrite scharf gelaufen, 6/6 —
abuse fällt durch, billing bleibt, eine Zeile OHNE gesetzte Spalte bleibt
auflösbar), 1 für `hasCommunityAccess`. `pnpm -r test` grün (1131 bestanden, 33 übersprungen —
die env-gated Läufe gegen echte Appwrite), typecheck 0 Fehler, lint
6 bekannte Warnungen, `check:manifests` konsistent. Der neue Deckel live
gemessen: zehn Aufrufe kommen durch, der elfte bekommt 429; `/api/health`
bleibt frei.

**Gelernt:** **Dieselbe Route normalisierte den Host ein zweites Mal, die URL
kein einziges Mal.** Der Host war das Feld, über das jemand nachgedacht hatte —
er hat eine Bedeutung, also bekam er eine Regel, und zur Sicherheit gleich
zweimal. Die URL daneben galt als „nur ein Link" und rutschte roh bis in ein
`href` der Betreiber-Oberfläche durch. Bei einer Quelle OHNE Anmeldung braucht
**jedes** Feld dieselbe Paranoia, nicht nur das, dessen Format man interessant
fand. Zweitens: eine **Prüfung muss denselben String prüfen, der später
ausgeführt wird** — Browser entfernen \t\r\n mitten in einer URL, bevor sie das
Schema lesen, und jede Regel, die das nicht nachmacht, prüft an der
Angriffsfläche vorbei. Drittens, aus Befund 3: **ein `limit()` ohne Schleife ist
ein stiller Datenverlust**, und er tut dort weh, wo etwas ZURÜCKGENOMMEN werden
soll — eine nicht verhängte Sperre fällt auf, eine nicht aufgehobene nicht.

---

### F8 (Abrechnungs-Hälfte) — Abrechnungsdaten überleben die Kontolöschung ✅ 2026-08-02

**Davids Entscheidung:** `communities.stripeCustomerId` und `billingStatus`
bleiben stehen, wenn der (letzte) Owner sein Konto löscht — es gibt KEINE
Löschfrist für Abrechnungsdaten. Grundlage ist die kaufmännische
Aufbewahrungspflicht (§147 AO / §257 HGB): Rechnungs- und Zahlungsvorgänge
müssen 8–10 Jahre nachvollziehbar bleiben, und Art. 17 Abs. 3 lit. b DSGVO
nimmt genau diesen Fall vom Löschrecht aus. Der Personenbezug an der
Community-Zeile selbst ist durch F3 bereits versorgt: die Letzter-Owner-
Mitgliedschaft wird entpersonalisiert (E-Mail geleert), die Einladungen und
Anfragen sind weg — was bleibt, ist der Zahlungs-Verweis auf Stripe, und dort
gelten Stripes eigene Aufbewahrungsregeln. Begründung steht jetzt an der
Stelle (`packages/control/server/utils/communityErasure.ts`), im
[DECISION-LOG](DECISION-LOG.md). Der Rest — die Löschfrist für
`abuse_reports.reporterEmail` (Melder ohne Konto, die erreicht kein
GDPR-Contributor) — hat David am selben Tag entschieden und steht weiter
unten als **F8-Rest**.

---

### C20 / F14 — Apps ohne Realtime bekommen keinen Socket mehr ✅ 2026-08-01

**Befund (aus B7, vorbestehend):** Die Marketing-Landing hielt bei jedem
Seitenaufruf eine Realtime-Verbindung zu Appwrite offen und abonnierte
`app_config` — Laufzeit-Flags, die diese Seite nirgends liest. Sie hat weder
Konto noch Composer noch Wartungs-Hinweis. Ursache ist kein Fehler in einem
Plugin, sondern **Vererbung**: `packages/core/app/plugins/realtime-config.client.ts`
läuft in JEDER App, die core erweitert, und der einzige Riegel davor war
„hat diese App eine Datenbank-Id?" — die hat `marketing` (`.env` setzt
`NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`, damit die Layer booten).

**Der 401 aus dem ursprünglichen C20-Text war zu diesem Zeitpunkt schon weg**
(siehe F11, am selben Tag): `ensureRealtimeJwt()` fragt seit dem nach einer
Session und holt für Gäste keinen Token mehr. Übrig blieb das, was F11
ausdrücklich stehen ließ — der Gast-WebSocket samt nachgeladenem
76-kB-Web-SDK. Für eine App, die davon lebt (Live-Theme-Morphen für Besucher),
ist das ein Feature; für eine statische Landing ist es Ballast. F14 nimmt
genau diesen Fall, ohne F11s Entscheidung anzutasten.

**Die Lösung ist ein ausdrücklicher Vertrag, kein Sonderfall im Plugin.**

1. **Eine pure Regel** — `packages/core/shared/realtimeGate.ts`,
   `realtimeAllowed(enabled, ...ids)`. Sie beantwortet die beiden Fragen, die
   dasselbe bedeuten („hier gibt es nichts zu abonnieren"): das Config-Gate
   `pukalani.realtime.enabled` **und** die Datenebene (Datenbank-/Tabellen-Id
   bzw. Endpoint/Projekt). Der alte `!databaseId`-Guard aus dem
   Live-Vorfall vom 2026-07-29 geht darin auf statt daneben zu stehen.
   5 Unit-Tests (`packages/core/tests/realtimeGate.test.ts`).
2. **Core-Default AN** — die begründete Ausnahme von „Core-Default ist IMMER
   aus". Realtime ist kein Zusatz, den eine App anschaltet, sondern das
   bestehende Verhalten jeder Produkt-App. Ein Default AUS hätte sie alle
   stillschweigend entkoppelt, und der Ausfall wäre unsichtbar gewesen: die
   Seite sieht richtig aus, sie aktualisiert sich nur nicht mehr.
3. **Gelesen an EINER Stelle** — `realtimeEnabled()` in
   `useRealtimeClient.ts`, memoisiert (die App-Config ist zur Laufzeit
   konstant, anders als der Auth-Zustand in F11). Nicht in den drei Plugins:
   dieselbe Regel an drei Aufrufern wäre beim vierten vergessen — dieselbe
   Überlegung, die den `!databaseId`-Guard schon in `useRealtimeRows` gestellt
   hatte.
4. **Der Vertrag steht im TYP, nicht in einer Konvention.**
   `ensureRealtimeClients()` / `sharedRealtime()` / `realtimeCookieClient()`
   geben jetzt `… | null` zurück. Der strict-Modus **zwingt** damit jeden —
   auch jeden künftigen — Konsumenten, „diese App hat keine Realtime" zu
   behandeln. Ein `throw` hätte dieselbe Wirkung nur zur Laufzeit gehabt, und
   ein stiller Rückgabewert gar keine.
5. **Zweite Tür mitgenommen:** `useRealtimeAccount()` geht bewusst NICHT über
   das Web-SDK (Cookie-Auth, Instant-Session-Revoke — CLAUDE.md) und hätte das
   Gate deshalb nicht von selbst geerbt. Es fragt dieselbe Regel selbst ab.
   Ebenso `usePresenceState()`: ohne Realtime schriebe der HTTP-Heartbeat
   Presences, die kein Leser mehr abholen kann.

**Abgeschaltet ist es in `marketing` und `help`** — beide öffentlich,
kontenlos, ohne Laufzeit-Flags, beide ohne `themes`-Layer (es gibt dort also
auch kein Live-Theme-Morphen zu verlieren). Der bewusst gezahlte Preis steht
an beiden Stellen im Code: Flag-Änderungen greifen dort erst beim nächsten
Seitenaufbau.

**Beweis (A/B am selben Server, nur die eine Zeile geändert):**
`enabled: true` → `…/deps/appwrite.js` wird geladen (Web-SDK + Socket);
`enabled: false` → kein SDK, kein `/api/auth/realtime-token`, Konsole ohne
einen einzigen Eintrag. Gegenprobe, dass nichts kaputtging: die volle
comments-E2E-Suite **24/24 grün**, darin der Realtime-Guard („serverseitig
angelegter Kommentar erscheint live und verschwindet beim Löschen"). Dazu
`pnpm -r test` (431 core-Tests), Lint und `typecheck` von marketing und
comments; alle sieben Apps starten.

**Gelernt:** (1) **`performance.getEntriesByType('resource')` puffert nur 250
Einträge.** Im Dev-Modus sind das ein paar hundert Modul-Requests — der
nachgeladene SDK-Chunk fiel hinten raus, und die Messung sagte „kein SDK
geladen", obwohl es geladen war. Zwei Messungen hintereinander waren dadurch
scheinbar identisch, obwohl das Gate umgelegt war. Für solche Beweise das
Netzwerkprotokoll des Browsers nehmen, nicht die Performance-API — oder den
Puffer vorher vergrößern. (2) **`pnpm --filter <app> dev -- --port N` wirkt
nicht:** das Skript hat `--port` schon fest verdrahtet, das zweite landet als
Positionsargument, und Nuxt weicht bei belegtem Port still auf einen anderen
aus (hier 3007 → 3000). Genau die Falle, vor der CLAUDE.md unter „Tests"
warnt — ein Beweis liefe dann gegen den Server eines fremden Worktrees.
Richtig: `pnpm --filter <app> exec nuxi dev --port N`. (3) **Der erste
Seitenaufruf nach einem Dev-Server-Start beweist nichts über nachgeladene
Abhängigkeiten:** Vite bündelt `appwrite` beim ersten Import erst („dependency
optimized") und lädt die Seite dabei neu. Immer die zweite Messung nehmen.

### E2 — UptimeRobot nachgezogen ✅ 2026-08-01

Erledigt in Davids echtem Chrome (eingeloggte UptimeRobot-Session), kein
API-Key nötig. Von den „drei Klicks" war beim Nachsehen nur noch EINER echt:

- **Monitor `help.pukalani.app/api/health` angelegt** (ID 803644024, HTTP,
  5-min-Intervall, E-Mail-Alarm — dieselbe Bauart wie die übrigen sechs).
  Der Endpunkt war vorab geprüft (`{"ok":true,"build":…}`).
- **Die Umbenennung war schon passiert:** Monitor 803548622 trägt den
  Friendly-Name `control.pukalani.app/api/health` — die „studio…"-Zeile war
  veraltet.
- **Die öffentliche Statusseite existierte schon** („Pukalani",
  stats.uptimerobot.com/MFP8D9JGlW, Public + Published, 4 Monitore) — sie
  musste nicht eingeschaltet, sondern nur ERGÄNZT werden: help ist jetzt der
  fünfte Service, von der öffentlichen Seite aus verifiziert (alle 5
  „Operational").

**Nachtrag (gleicher Tag, Davids Entscheidung):** `pukalani.app` (Landing) und
`demo.pukalani.app` (Platform-Stellvertreter) sind ebenfalls auf die
Statusseite gewandert — sie zeigt jetzt ALLE 7 Monitore, öffentlich verifiziert
(alle „Operational").
**Gelernt:** Dieselbe Woche, dritte veraltete Zeile (nach C8 und C12b-Notiz):
Betriebs-Punkte altern schneller als Code-Punkte, weil sie auch außerhalb des
Repos erledigt werden können — vor dem Ausführen erst nachsehen, was WIRKLICH
noch fehlt.

---

### F8-Rest — Melder-Adressen leben höchstens 90 Tage ✅ 2026-08-02

**Davids Entscheidung** (am selben Tag wie die Abrechnungs-Hälfte, siehe oben):
`abuse_reports.reporterEmail` verfällt nach **90 Tagen**, gerechnet **ab der
Meldung** (`$createdAt`) und **unabhängig vom Status**.

**Warum diese Spalte überhaupt einen eigenen Sweep braucht:** sie ist die
einzige personenbezogene Spur im System ohne Konto. Wer eine Community meldet,
ist fast nie Mitglied darin und meist gar nicht angemeldet — es gibt keine
userId, an der ein GDPR-Contributor ansetzen könnte. Ohne eigene Frist bliebe
die Adresse für immer liegen, und zwar unbemerkt, weil der normale Löschpfad
sie nie zu Gesicht bekommt.

**Warum der Anker `$createdAt` ist und nicht `handledAt`:** Der Anker an der
Bearbeitung klingt naheliegender („die Adresse wird ja bis zur Klärung
gebraucht"), macht die Zusage aber von der Warteschlangen-Disziplin des
Betreibers abhängig — eine Meldung, die ein Jahr unbearbeitet liegt, hielte die
Adresse ein Jahr fest. Genau das darf die eigene Bequemlichkeit nicht
entscheiden. Mit `$createdAt` ist die Zusage hart und ohne Fußnote
aussprechbar: *eine Melder-Adresse lebt höchstens 90 Tage.*

**Warum die Zeile bleibt:** gelöscht wird nur das Feld. Die Meldung ist der
Beleg für eine womöglich verhängte Sperre — sie zu entfernen hieße, die
Begründung der eigenen Maßnahme wegzuwerfen. Ohne Adresse ist sie exakt das,
was eine anonyme Meldung von Anfang an ist. **Idempotent per Konstruktion:**
eine geleerte Zeile trägt `null` und fällt damit aus der Kandidaten-Abfrage; es
braucht kein Merkmal „schon aufgeräumt".

**Wo es hängt:** pure Regel `shouldEraseReporterEmail` + Sweep
`eraseStaleReporterEmails` in
`packages/control/server/utils/abuseReportPrune.ts` (Muster:
`inviteRequestPrune.ts`), eingehängt als vierter Mitfahrer im stündlichen
`packages/control/server/plugins/trial-sweep.ts` — gleicher Takt, gleiches
Fehler-Verhalten wie die drei daneben. Ein eigener Timer wäre nur ein weiterer
Ort, an dem man nach dem Grund für ein verschwundenes Datum sucht. Fehler pro
Zeile werden geloggt und übersprungen, der Sweep läuft weiter. 6 Unit-Tests in
`packages/control/tests/abuseReports.test.ts`.

**Gelernt:** Die Spalte hat `''` als Vorgabe (Migration control-034), nicht
`null` — und anonyme Meldungen sind der Regelfall. Eine Kandidaten-Abfrage nur
mit `Query.isNotNull` hätte deshalb Stunde für Stunde ihre 100 Plätze mit
Zeilen belegt, an denen nichts zu tun ist, und die wirklich fälligen nie
erreicht. Sie filtert jetzt **beide** Leer-Schreibweisen weg und sortiert
`orderAsc('$createdAt')`, damit der Sweep sich garantiert vorwärts arbeitet.
Wo eine Spalte zwei Arten hat, „leer" zu sein, muss die Abfrage beide kennen.

**Öffentliche Zusage geprüft, nichts zu ändern:** die Formular-Copy
(`onboarding` i18n, `abuse.privacy` / `abuse.emailHint`) nennt **keine**
Speicherdauer — sie sagt nur, dass gespeichert und ohne Adresse anonym
gemeldet wird. Die Frist widerspricht also keinem Versprechen; ob sie
irgendwann in der Datenschutzerklärung auftaucht, entscheidet A1 (echte
Rechtstexte).
[DECISION-LOG](DECISION-LOG.md) und die F8-Zeile in OPEN-ITEMS.md trägt nur
noch den offenen Rest: die Löschfrist für `abuse_reports.reporterEmail`
(Melder ohne Konto — die erreicht kein GDPR-Contributor, sie braucht einen
eigenen Sweep).

### Wechselwirkungs-Audit M13 × übrige Features — 5 Befunde ✅ 2026-08-02

Fünf Befunde aus dem Audit „was macht die Sperre mit dem Rest des Produkts",
alle zuerst am Code (und drei davon live) reproduziert, dann behoben. Davids
Vorgabe vorab: **die Sperre friert NUR INHALTE ein** — Owner-Einstellungen
bleiben bewusst offen; das war zu dokumentieren, nicht zu ändern.

**1 (MEDIUM, echter Produktfehler) — die Sperre erreichte die Falschen.**
`COMMUNITY_SUSPENDED_CODE` reiste sauber bis in den Browser (403,
`reason: community_suspended` im Envelope) und **niemand las ihn**: ein Mitglied,
das in einer gesperrten Community schrieb, bekam den generischen „hat nicht
geklappt"-Toast seines Layers. Die Mahnung war also für genau die Leute
unsichtbar, die sie zum Owner tragen. Jetzt gibt es **einen** Leser für alle
Layer: `packages/core/app/plugins/community-suspended-notice.client.ts` zeigt
„Diese Community ist gerade schreibgeschützt" (de/en), **ohne** den Grund zu
verraten — der bleibt `community.billing`-gegated.

**2 (LOW) — die `my.*`-Karte widersprach ihrem eigenen Kommentar.**
`projectMyCommunities` blankte `suspension` für jede Rolle ohne
`community.billing`, während der Kommentar daneben „nur der GRUND ist gegated"
versprach. Eine Wahrheit gewählt, und zwar die des Kommentars: neues Feld
**`readOnly`** (DASS) für jede Karte, `suspension` (WARUM) weiter nur für den
Abrechnenden. Ein Viewer sieht Schloss + „Nur zum Lesen — gerade sind keine
Beiträge möglich", nie „Zahlung offen". Der Vorwurf „Missbrauch" kann auch
nicht indirekt durchkommen: abuse-gesperrte Communities verschwinden für
Mitleser ohnehin ganz aus der Liste.

**3 (LOW) — Presence-Rauschen auf abuse-404-Hosts.** Auf einem gesperrten Host
wirft `00.tenant.ts` für JEDEN Pfad 404 — auch für `/api/presence/heartbeat`.
Die Fehlerseite rendert trotzdem mit Auth-Kontext, also startete
`usePresenceState()` seinen 20-s-Takt und feuerte dauerhaft 404-POSTs, still
verschluckt vom `.catch(() => {})`. Der Heartbeat startet jetzt **gar nicht**,
solange `useError()` gesetzt ist — und wird **nachgeholt**, sobald der Fehler
geräumt ist (ein blosses `return` hätte einen Tab, der einmal auf einer 404
war, für den Rest der Sitzung unsichtbar gemacht).

**4 (LOW, Dokumentation) — die bewusste Grenze stand nirgends.** Jetzt an der
zentralen Stelle (`core/shared/communitySuspension.ts`) und in CLAUDE.md, mit
Davids Begründung: zu ist jeder INHALT (Türklinke `member` der Datentür), offen
bleiben Branding, Team/Rollen, Publikum, Registrierung und die Moderation
(Klinke `operator`) — die laufen über die Service-Naht ins Control Plane. Die
Sperre soll zum ZAHLEN bewegen, nicht den Owner aussperren; eine gesperrte
Community, die niemand mehr moderieren kann, wird zum Problem des Betreibers.

**5 (LOW, geprüft und ENTSCHIEDEN) — `community_branding` ist aufzählbar.**
Stimmt, live nachgemessen: ein anonymer Client bekommt per REST die Row-Ids und
Farben **aller** Communities (`read(any)`, `rowSecurity: false`, system-028).
**Entscheidung: akzeptiert, nicht geräumt.** Vier Gründe, in der Reihenfolge
ihres Gewichts: (a) es liegen dort nur eine undurchsichtige Row-Id und drei
Farb-Tokens, die ohnehin als `data-theme/-variant/-neutral` im HTML jeder Seite
dieser Community stehen — kein Name, kein Host, keine Mitgliedschaft, und ohne
Host lässt sich eine Id keiner Community zuordnen; aufzählbar ist die ANZAHL,
nicht die Identität. (b) Appwrite kennt kein Recht, das Lesen erlaubt und
Auflisten verbietet — „nicht aufzählbar" hiesse hier „kein Leserecht", also kein
Live-Morphen (D6); es gibt nichts zu härten, nur zu entfernen. (c) Dieselbe
bewusste Bauart wie bei den Schwestern `app_config` (system-005) und
`custom_themes` (system-013), letztere trägt sogar NAMEN. (d) „Beim Sperren
räumen" klingt billig und ist es nicht: die Sperre entsteht im
**Control-Plane-Projekt**, der Spiegel liegt im **Runtime-Projekt**, und einen
Schlüssel in diese Richtung gibt es bewusst NICHT (derselbe Grund, aus dem
`revokeCommunityLabel` in der Runtime läuft) — eine neue Service-Naht für drei
Farbwörter wäre teurer als das, was sie schützt. Damit die Abwägung nicht
stillschweigend verfällt, ist ihre **Bedingung** jetzt geprüft: Abschnitt 12 von
`verify-site-branding.mjs` listet die Tabelle anonym und geht rot, sobald ein
Feld ausserhalb der drei Farb-Spalten auftaucht.

**Zusatzfrage aus dem Audit, beantwortet ohne Codeänderung:**
`onboardingProvision.ts` setzt theme/variant beim Anlegen, spiegelt aber nicht —
die Spiegel-Row entsteht erst beim ersten Branding-PATCH. **Keine Lücke:** der
Abonnent hängt am Row-Kanal, auch wenn es die Zeile noch nicht gibt, und
`createRow` publiziert dort ein Event (live gegen Appwrite 1.9.6 geprüft — anders
als `upsertRow`). Nachrüsten liesse es sich ohnehin nicht ohne neue Naht:
`onboardingProvision` läuft im Control-Plane-Projekt und hat keinen Schlüssel
fürs Runtime-Projekt. Steht jetzt in `core/shared/communityBranding.ts`.

**Beweise:** `verify-community-suspension.mjs` **55/55** (war 54/54),
`verify-my-overview.mjs` **30/30** (war 27/27), `verify-site-branding.mjs`
**44/44** (war 42/42). Browser gegen echte Appwrite: ein Mitglied schreibt in
eine billing-gesperrte Community → der klare Hinweis steht **über** dem
generischen Toast des Layers; auf der 404-Seite eines abuse-gesperrten Hosts
feuert der alte Stand binnen Sekunden `POST /api/presence/heartbeat → 404
Unknown host` und wiederholt es, der neue in 70 s **kein einziges Mal**.
`pnpm -r test` grün, typecheck 0 Fehler, lint 6 bekannte Warnungen,
`check:manifests` konsistent, Prod-Build einer App durchgelaufen.

**Gelernt:** (1) **Ein `$fetch`-Interceptor in einem Plugin wirkt NICHT — und
sieht dabei richtig aus.** Nuxts `#build/fetch.mjs` endet auf
`export const $fetch = globalThis.$fetch`: eine **Momentaufnahme**. Wer
`globalThis.$fetch` in einem Plugin ersetzt, erreicht Konsolenaufrufe und
`useFetch`, aber **nicht** das auto-importierte `$fetch` der Komponenten — das
Modul ist längst ausgewertet. Live erwischt: derselbe 403 toastete aus der
Konsole und schwieg aus dem PostComposer. Der Interceptor gehört deshalb per
`app:templates`-Hook **in die Vorlage**, und zwar als String-Ersetzung auf
Nuxts eigener Ausgabe: ein Bump, der die Zeile umbenennt, nimmt uns still den
Hinweis, statt den Build zu brechen. (2) **Ein Live-Beweis pro Minute — sonst
misst man den Rate-Limiter.** `GET /api/onboarding/communities` steht auf
10/min und IP, und `verify-my-overview` lag schon knapp darunter (die
SSR-Abrufe der Seiten zählen mit). Zwei zusätzliche Abrufe kippten den Beweis
in 429-Fehler, die wie ein kaputtes Feature aussahen. Neue Prüfungen in einen
laufenden Live-Beweis kosten **Budget**, nicht nur Zeit. (3) **Ein Beweis, der
in `| head` läuft, stirbt nicht — er läuft weiter.** Drei abgebrochene
Durchgänge legten danach munter weiter Test-Communities an, und die tauchten
als „Geister" in jeder folgenden Messung auf. Verify-Skripte mit Aufräum-Block
immer in eine Datei schreiben, nie durch eine Pipe kürzen. (4) **Der
past-due-Sweep hebt eine von Hand gesetzte `billing`-Sperre wieder auf**, wenn
`billingStatus` nicht `past_due` ist — für einen Browser-Beweis muss man beide
Spalten setzen, sonst ist die Community 30 Sekunden später wieder frei und man
sucht den Fehler im eigenen Code.

---

### Index-Retry in elf Migrationen nachgerüstet ✅ 2026-08-02

**Aufgefallen als Nebenbefund beim Landen von F14** (nicht davon verursacht):
die CI-E2E starb im Bootstrap, bevor ein einziger Test lief —
`AppwriteException: The requested column 'communityId' is not yet available`
(400, `column_not_available`) aus dem `createIndex` von
`packages/moderation/scripts/migrations/003-community-id.ts`.

**Es ist genau das Rennen, für das es `scripts/migrations-lib/indexRetry.mts`
schon gab:** der Index-Endpunkt prüft die Spalten-Verfügbarkeit nicht am
`attributes`-Dokument, sondern an der im Collection-Dokument eingebetteten
Kopie aus Appwrites Metadaten-Cache — und die hinkt nach. `waitAvailable()`
pollt also die frische Wahrheit, und der Index-Aufruf danach sieht die
veraltete. Pollen allein reicht nicht; CLAUDE.md schreibt den Retry vor.

**Elf Migrationen hatten ihn trotzdem nicht:** die acht `*-community-id.ts`
der E8/E11-Umbenennungswelle plus `control-025/028/029`. Die acht sind
praktisch Kopien voneinander (identische Struktur, identische Zeilennummer der
Index-Anlage) — die Vorlage hatte den Retry offenbar nie, und die Kopien haben
ihn brav mitvererbt.

Umgestellt ist **ausschließlich die Hülle um `createIndex`** (je eine
Import-Zeile und `step(` → `indexStep(`; der Helfer ist als Drop-in mit
gleicher Ausgabe und gleicher 409-Idempotenz gebaut). `step()` bleibt überall
stehen, wo es hingehört: Spalten-Anlage in allen elf, und in `control-025` das
`deleteIndex` — ein Delete kennt den Spalten-Race nicht. Inhaltlich ist keine
Migration angefasst: keine Spalte, kein Backfill, kein Name, keine Reihenfolge.
Danach steht die Prüfung „gibt es noch ein `createIndex` ohne Retry?" über alle
Layer auf null.

**Beweis:** E2E `success` auf `5c212ae0` (enthält den Fix) — alle
Index-Zwillinge der Welle sauber angelegt (`activities.idx_community`,
`notifications.idx_recipient_community`, `comments.idx_community`,
`embed_sites.uq_community_host`, `post_votes.idx_community_vote`, …). Dazu
`pnpm -r test` und `pnpm -r lint` unverändert.

**Gelernt:** (1) **Der grüne Lauf beweist weniger, als er aussieht.** In ihm
hat der Retry KEIN einziges Mal ausgelöst (null „noch nicht sichtbar"-
Meldungen) — belegt ist damit „bricht nichts, Migrationen laufen durch",
nicht „rettet das Rennen". Ein sporadischer Fehler lässt sich nicht auf
Bestellung vorführen; wer hier mehr behauptet, verwechselt Abwesenheit mit
Beweis. (2) **Eine Migrations-Vorlage vererbt auch ihre Lücken.** Acht
identische Kopien hieß: ein vergessener Retry wurde achtfach ausgerollt, ohne
dass es je auffiel — bis der Zufall eine davon traf. Wer eine Migration
kopiert, kopiert die Sicherungen mit oder eben nicht; ein Blick auf
`grep -L indexStep` über die Migrationen kostet Sekunden. (3) **Der
Import-Pfad ist die Stelle, an der so ein Fix real scheitert.** Migrationen
laufen als eigenständige `node --experimental-strip-types`-Prozesse, die
Auflösung ist relativ zur DATEI. Unit-Tests sehen davon nichts — die billige
Gegenprobe ist, jede Datei einmal ohne Env-Variablen zu starten: lädt sie und
bricht sie regulär an der Env-Prüfung ab, stimmt der Pfad.

---

### Moderations-Audit gefixt ✅ 2026-08-01

Neun Befunde über `packages/moderation` (Melde-Weg), alle **vorher am Code
reproduziert**, dann behoben. Zwei davon waren echte Grenz-Fehler, einer eine
Lüge in der Oberfläche, der Rest Nachlauf und tote Verzweigungen.

**1 (MEDIUM, Isolation + kaputtes Feature) — `reports` war die einzige
Pool-Tabelle ohne zweite Verteidigungslinie.** `/api/reports` setzte seine
Row-Permissions von Hand und benutzte dafür die GLOBALEN Betreiber-Labels
`read("label:admin")` / `read("label:moderator")` statt der zentralen
Permission-Bildung. Falsch nach **beiden** Seiten: ein Kunden-Moderator trägt
diese Labels nicht (seine Rolle steht in `community_members`) — Appwrite lieferte
ihm also **keine Realtime-Ereignisse**, während der Kommentar in
`dashboard/comments.vue` „live" behauptete; und wer ein globales Label trägt, las
per Realtime die Meldungen **aller** Communities des geteilten Pool-Projekts.

Die Antwort war nicht „dieselbe Bildung wie überall", denn keins der beiden
vorhandenen Publika passt: `read("label:<communityId>")` wäre **jedes Mitglied**
(eine Meldung nennt einen Menschen, einen Vorwurf und eine Notiz — sie ist kein
Inhalt), die globalen Rollen sind zu weit. Appwrite kennt aber nur ODER-Rollen,
den Schnitt „Moderator UND diese Community" gibt es dort nicht. Also bekommt er
einen eigenen Schlüssel: ein **zweites, abgeleitetes Label je Community**
(`mod<communityId>`, `packages/core/shared/communityModeratorLabel.ts`, pure +
7 Tests), vergeben von `core/server/middleware/06.community-label.ts` an jeden
mit `reports.moderate`. Neues Publikum `read: 'moderators'` in
`tenantRowPermissionsFor` (Pool: das Moderations-Label; Silo/Single-Tenant: die
globalen Rollen, denn dort IST das Projekt die Grenze; ohne communityId
fail-closed). Die C18-Regel gilt hier bewusst **nicht** — auch die offenste
Community macht Meldungen nicht öffentlich.

Drei Feinheiten, die dazugehören: (a) das Label wird nur bei **erfolgreicher**
Rollen-Auflösung nachgezogen — ein Entzug auf Verdacht ließe das Publikum eines
Moderators bei jedem Netz-Schluckauf flackern; (b) `revokeCommunityLabel` nimmt
seitdem **beide** Labels in **einem** `updateLabels` (zwei Schreibvorgänge wären
zwei Gelegenheiten, sich gegenseitig zu überschreiben) — „draußen" heißt auch
fürs Moderations-Publikum draußen; (c) eine Beförderung wirkt innerhalb des
bestehenden **30-s-Rollen-Caches**, nicht sofort — das Control Plane kann den
Runtime-Cache nicht leeren.

**Beweise:** `packages/moderation/scripts/verify-report-boundary.mjs` (neu,
**25/25**) — Akt 1 zeigt das Leck im Alt-Zustand und die Grenze im Neu-Zustand
direkt gegen Appwrite, Akt 2 fährt den echten Weg über `/api/reports` und liest
das Ergebnis mit **echten Sessions am eigenen Code vorbei** (genau die Frage,
die auch Realtime stellt). Dazu `verify-site-authz.mjs` Abschnitt 9b (neu) für
Vergabe/Beförderung/Entzug des Labels, insgesamt **103/103** ·
`packages/moderation/tests/reportPermissions.test.ts` (an
`tenantRowPermissionsFor` genagelt, Muster `presencePermissions.test.ts`) ·
`packages/core/tests/tenantRowPermissions.test.ts` um sieben `moderators`-Fälle
erweitert.

**2 (MEDIUM) — Melden ging, Zurückziehen nicht.** Das Abgeben lief über die
Operator-Klinke der Datentür (die M13-Zahlungssperre greift dort nicht), das
Zurückziehen über die Mitglieds-Klinke (sie greift). In einer gesperrten
Community bekam der Melder also 403, während die Oberfläche „deine Meldung ist
noch aktiv" behauptete — und das war sie dann auch, unabänderlich.
**Entscheidung, im Code festgehalten:** eine Meldung ist kein INHALT, sondern
eine AUSSAGE über andere; sie abgeben zu dürfen, aber nicht zurücknehmen, ist
die falsche Hälfte. Also dieselbe Klinke wie beim Abgeben. Sicher trotz
Admin-Client, weil der Zugriff doppelt eingeengt bleibt (`find` auf
`reporterId = <Session-User>` **und** Mandanten-Filter, `remove` belegt die
Zugehörigkeit erneut). Beweis: zwei neue Prüfungen in
`verify-community-suspension.mjs` (**62/62**).

**3 (MEDIUM) — eine tote Verzweigung, gleiche Klasse wie der alte
`last_admin`-Fall.** Die Route antwortete auf eine Doppel-Meldung `200
{ alreadyReported: true }`, die Konsumenten verzweigten auf `409` — der Zweig
konnte nie feuern, und der Nutzer las „Meldung eingegangen" für etwas, das nicht
angelegt wurde. **Eine Wahrheit, und zwar die im Repo etablierte:** 409 mit
`data.code: 'already_reported'`, der zentrale Handler hebt ihn als `reason` ins
Envelope, der Client liest `error.data.reason`. Codes + Leser pur in
`packages/moderation/shared/reportErrors.ts`, damit Server, Client und Test
dieselben Strings benutzen. Konsumenten nachgezogen: `ReportButton` schaltet auf
„Zurückziehen" statt Fehler-Toast, `PostCard` sagt „bereits gemeldet" statt „kam
nicht an".

**4 (MEDIUM) — Event-Meldungen versandeten: Knopf entfernt, nicht gebaut.**
`EventDetail.vue` meldete mit `targetType: 'event'` und versprach „ein Moderator
sieht sie sich an". Kein Eskalations-Handler kannte den Typ, keine Queue fragte
ihn ab (comments fragt 'comment', posts fragt 'post'). Die ehrliche Lösung wäre
eine Moderations-Queue für Events — und die ist **nicht klein**: Events kennen
nur `draft/published/cancelled`, es fehlt also der Moderations-Zustand
(Migration + Schema + Filter), dazu eine Capability `events.moderate`, eine
Queue-Route, eine Dashboard-Seite und ihre Texte. Das ist ein Feature, kein Fix.
Also **Knopf weg** (samt `events.report.*` in de/en), Begründung als Kommentar an
der Stelle, und der Rest als F-Zeile in OPEN-ITEMS. Lieber kein Knopf als einer,
der ins Leere meldet.

**5 (LOW) — Typ-Nachlauf E8-3.** `shared/types/report.ts` trug noch `tenantId?`,
obwohl die Spalte mit `moderation-004` gefallen ist; `communityId` fehlte.

**6 (LOW) — Catch-all-500.** Jeder Nicht-409 wurde „Could not submit report" mit
Status 500 — auch ein bereits geformter H3-Fehler samt fachlichem `data.code`.
Jetzt `toH3Error` (das ist genau der Fall, für den es seit M13 H3-Fehler
durchreicht).

**7 (LOW) — `openCount` sättigte bei 100.** Die Eskalation zählte
`openReportsForTarget(...).length`, und die Funktion holt höchstens 100 Zeilen —
ein `autoHideReports`-Schwellwert über 100 hätte **nie** gezündet. Neu:
`countOpenReportsForTarget` liest `total` mit `Query.limit(1)` (keine Zeile
übertragen, richtig gezählt). `openReportsForTarget` bleibt das Anzeige-Fenster
für Detailansicht und KI-Assist und sagt das jetzt auch.

**8 (LOW) — Phantom-Ziele.** targetType/targetId waren freie Strings; jede
angemeldete Person konnte beliebig viele Zeilen mit erfundenen Zielen erzeugen
(der Unique-Index bremst nicht, jedes erfundene Ziel ist ein neues Paar). Neue
Registry `registerReportTarget` (Muster `registerReportEscalationHandler`, A14):
comments meldet 'comment' an, posts meldet 'post' an; unbekannter Typ → 400
`unknown_target`, fehlendes Ziel → 404 `target_not_found`. Das macht Befund 4
zugleich selbst-durchsetzend — ein wiederbelebter Event-Knopf liefe jetzt in
einen Fehler statt in eine stille Karteileiche.

**9 (LOW, Entscheidung) — `GET /api/reports` bleibt.** Geprüft und behalten, mit
Begründung im Kopf der Datei: sie ist keine tote, sondern eine **unbenutzte**
Oberfläche. Sie ist (a) die Autorisierungs-Probe zweier Beweis-Skripte
(`verify-site-authz`, `verify-community-suspension`) und (b) die typ-agnostische
Sicht des Layers, dem die Tabelle gehört — der Weg für jeden meldbaren Typ ohne
eigene Queue, also genau der Fall, an dem Events aufgelaufen sind.

**Gates:** `pnpm -r test` grün (u. a. neu: moderation 19, core 456) ·
`pnpm typecheck` 0 Fehler · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`pnpm check:manifests` + `check:single-copy` grün · Pool-Isolation weiter grün
(comments 13/13 · posts 7/7 · events 14/14 · courses 28/28) ·
`verify-presence-boundary` 23/23.

**Gelernt (vier Stück):**

1. **Eine Route zu gaten beweist nichts über die Row-Permissions.**
   `GET /api/reports` war korrekt per `reports.moderate` geschützt und las über
   den Admin-Client — sie war nie das Leck. Das Leck lag eine Ebene tiefer, dort
   wo Appwrite entscheidet, was ein WebSocket ausliefert. Wer eine Grenze
   beweisen will, muss **mit einer echten Session am eigenen Code vorbei** lesen;
   alles andere prüft die Anwendungslogik gegen sich selbst.
2. **Handgesetzte Permissions sind der Ort, an dem eine zentrale Regel
   ausfällt** — und zwar leise, weil die Zeile ja *irgendwelche* Rechte trägt.
   Die drei Nachbartabellen waren richtig, genau diese eine nicht. Ein
   `permissions:`-Feld an einer Aufrufstelle gehört ab jetzt begründet oder
   ersetzt; das Publikum lebt als pure Funktion neben der Route und wird gegen
   `tenantRowPermissionsFor` genagelt.
3. **Ein 200 mit `{ ok: true, alreadyReported: true }` ist eine Lüge mit
   Beleg-Charakter.** Der Client hatte den richtigen Zweig — er konnte ihn nur
   nie erreichen. Es gibt genau einen Kanal für fachliche Ablehnungsgründe
   (`data.code` → `reason`); ein zweiter über ein Erfolgs-Feld erzeugt zwei
   plausible Hälften, die zusammen nicht funktionieren.
4. **Beim Beweis-Schreiben zweimal die eigene Erwartung erwischt, nicht den
   Code:** (a) Zwei Meldungen desselben Melders auf dasselbe Ziel liefen in den
   Unique-Index und meldeten „Row already exists" — das sah wie ein Grenz-Fehler
   aus und war meine Fixture. (b) `reports.communityId` ist die **Spalte** mit
   dem Zeilen-Scope (`tenantId`-Wert), das **Label** leitet sich von
   `communities.$id` ab — zwei Schlüssel für denselben Mandanten (so gewollt,
   `$id` hat die einzige alnum-Garantie). Meine Prüfung verglich beide und
   scheiterte zu Recht. Und ein `Promise.resolve(probe(...)).catch(…)` fängt eine
   **synchron** werfende Prüfung nicht — das fand ein Test, den ich zum Beweis
   geschrieben hatte, bevor er je einen echten Fehler sehen sollte.
### Missbrauchs-Warteschlange blättert ✅ 2026-08-02

Der Nachzügler des Quer-Audits: `abuse-reports/index.get.ts` las
`Query.limit(100)` und schrieb ein `console.warn`, wenn mehr da war — ein
ausdrücklicher TODO des Autors und ein **stiller Deckel**, denn die Warnung
stand nur im Server-Log. Die Oberfläche zeigte 100 Zeilen und sagte nirgends,
dass es mehr gibt; bei „neueste zuerst" fällt dabei ausgerechnet die **älteste**
Meldung hinten heraus, also die, die am längsten wartet.

**Gebaut:** echte Seiten mit `Query.offset` (25 pro Seite,
`ABUSE_REPORTS_PAGE_SIZE`), `UPagination` unter der `UTable` (Davids Regel B6),
`?page=` über die pure `parseAbuseReportsPage` (alles Krumme wird Seite 1, nie
ein 400). **Offset statt Cursor** ist hier die richtige Wahl, obwohl das Haus
`listAllRows` mit `Query.cursorAfter` hat: ein Cursor kann nur „weiter", die
Paginierung springt aber auf Seite N. Der bekannte Preis — eine neue Meldung
oben verschiebt die Seiten um eine Zeile — ist klein, weil aus dieser Liste
nichts VERSCHWINDET (ein Statuswechsel ändert die Zeile nur).

**Die Kennzahlen haben eine eigene Quelle bekommen** (die eigentliche
Entscheidung): `summarizeAbuseReports` rechnete aus den GERENDERTEN Zeilen —
mit Paginierung hätte „3 offen" plötzlich die 25 sichtbaren Zeilen beschrieben
statt der Warteschlange. Das ist die teuerste Sorte Fehler: die Zahl sieht
richtig aus, und auf Seite 1 stimmt sie sogar. Ersetzt durch
`abuseReportStatsFromCounts({ total, suspended, dismissed })` — `total` kommt
aus der Listen-Abfrage, die beiden anderen aus je einer eigenen Zählung mit
`Query.limit(1)` (gelesen wird nur deren `total`; `idx_status` aus control-034
deckt sie). **`open` wird gerechnet, nicht gezählt**, und das ist kein Sparen:
`projectAbuseReport` rendert JEDEN unbekannten Spaltenwert als 'open' — eine
dritte Abfrage `equal('status','open')` würde genau diese Zeilen auslassen, und
Kachel und Zeilen-Abzeichen widersprächen sich. `total − suspended − dismissed`
ist dieselbe Regel wie die Anzeige, nur andersherum gelesen; bei 0 geklemmt,
weil drei Abfragen drei Zeitpunkte sind.

**Beweise:** `verify-community-suspension.mjs` **66/66** (elf neue Prüfungen;
54 → 65 auf dem Arbeitsstand, nach dem Merge mit `main` 55 → 66, weil dort das
Wechselwirkungs-Audit eine `readOnly`-Prüfung dazugelegt hat — Seite 1 liefert
genau 25, der Umschlag nennt `page`/`pageSize`, Seite 2
überschneidet sich nicht, beide Seiten zusammen tragen alle 30 frisch angelegten
Meldungen, die Kacheln zählen mehr als die Seite, sie zählen einen Zustand mit,
der auf Seite 1 gar nicht vorkommt, offen+gesperrt+verworfen ergibt gesamt, beim
Blättern ändern sie sich nicht, eine Seite hinter dem Ende ist leer statt Fehler
und zeigt dieselben Kacheln, `?page=abc` fällt auf 1 zurück). Unit: 9 neue Fälle
(Kennzahlen inkl. krummer Bestandswerte und auseinanderlaufender Zählungen,
Seitenzahl-Parsing). In der Oberfläche nachgesehen (30 erfundene Meldungen, 3
davon verworfen): Seite 1 zeigt 25 offene, die Kacheln stehen auf
27/0/3/30 — auf Seite 2 stehen die drei verworfenen, **die Kacheln bleiben
gleich**. `console.warn` ist weg, weil der Deckel weg ist. typecheck 0 Fehler,
lint unverändert.

**Gelernt:** (1) **Ein TODO im Log ist kein Deckel, den jemand bemerkt.** Wer
kappt, muss der OBERFLÄCHE sagen, dass gekappt wurde — sonst ist die Warnung
nur eine Notiz an sich selbst. (2) **Wer paginiert, muss zuerst die Kennzahlen
darüber prüfen.** Jede Zahl, die vorher aus „allem, was ich geladen habe"
entstand, beschreibt hinterher nur noch die Seite; das Aggregat braucht eine
eigene Quelle, sonst wird aus einer Verbesserung eine leise Lüge. (3) Die
Kennzahl muss nach DERSELBEN Regel zählen, nach der die Zeile rendert —
deshalb wird `open` gerechnet und nicht abgefragt. (4) **Worktree-Falle
wieder live:** die Dev-Server auf 3004/3006 gehörten dem HAUPT-Repo, ein Beweis
dort hätte den alten Code gemessen; und `pnpm --filter <app> dev -- --port X`
wirkt NICHT (das Skript hat sein `--port` schon fest verdrahtet, der zweite
Wert wird ignoriert und `get-port` weicht still auf 3000 aus) — der Weg ist
`pnpm --filter <app> exec nuxi dev --port X`. (5) **Der ERSTE Lauf gegen einen
frisch gestarteten Dev-Server ist kein Messwert.** Abschnitt 3 fiel dabei
mehrfach um (mal „unknown_host", mal blieb das Schreiben bei 201) — der
45×1-s-Ring wartet auf den 30-s-Resolver-Cache, konkurriert aber mit dem
Kaltstart-Kompilat der Seiten. Der zweite Lauf war jedes Mal grün. Vor einem
roten Befund also erst einmal warmlaufen lassen, sonst jagt man einen
Regressionsschaden, den es nicht gibt.

### F19 · #38 — der Sperr-Beweis war beim Kaltstart falsch-rot ✅ 2026-08-02

> Zweite Vergabe der Nummer F19 (laufende Nummer **#38**) — nicht zu verwechseln
> mit F19 · #33 weiter oben (CI-E2E / Index-Cache). Siehe die Notiz dort.

`verify-community-suspension.mjs` meldete beim ersten Lauf regelmäßig 14
Fehlschläge; ein zweiter Lauf war sauber. Die naheliegende Erklärung
(30-s-Resolver-Cache) war FALSCH — das Skript wartet ohnehin bis zu 45 s in
einer Poll-Schleife. Die Ursache war der **past-due-Sweep**: er läuft im
control-Plugin bei JEDEM Serverstart mit und hebt eine billing-Sperre auf,
sobald `billingStatus` nicht `past_due` ist. Das ist korrekt (er ist das Netz
unter dem Webhook) — nur setzte das Skript die Sperre von Hand OHNE passenden
Zahlungsstatus. Dieser Widerspruch wurde vom Sweep zu unseren Ungunsten
aufgelöst, und danach kamen alle Schreibvorgänge durch.

Zwei Änderungen: (1) `setSuspension('billing')` stempelt jetzt
`billingStatus: 'past_due'` + frisches `pastDueSince` mit — ein Zustand, den
der Betrieb auch herstellen würde, statt eines, den der Sweep aufräumen muss;
(2) `assertSuspensionStands()` prüft während der Warteschleife, ob die Sperre
überhaupt noch steht, und BRICHT mit klarer Ansage ab („kein Befund über den
Code, Umgebung prüfen") statt sich als Dutzend rätselhafter Fehlschläge zu
tarnen. Beweis: zwei Kaltläufe hintereinander **87/87, Exit 0** — davon der
erste genau in der Situation, die vorher zweimal rot war.

**Gelernt:** Ein Beweis-Skript muss einen Zustand herstellen, den das System
selbst für stimmig hält — sonst räumt eine korrekte Automatik ihn weg und der
Beweis misst etwas anderes, als er behauptet. Und: Flakiness ist kein
Schicksal, sondern eine unfertige Diagnose. Die These „Cache" hielt zwei Tage,
weil niemand nachgesehen hat, ob die Sperre zum Prüfzeitpunkt noch steht — die
Prüfung darauf kostete vier Zeilen und beantwortet die Frage endgültig.

---

### G5 — Nacht-Audit-Nachlese: fünf Härtungen in core/control/admin ✅ 2026-08-02

**Was das war.** Fünf Befunde aus dem Nacht-Audit (F32, F33, F34, F35, F23) —
alle in `packages/core`, `packages/control`, `packages/admin`. Keiner war ein
offenes Loch mit Ausnutzung von heute; alle fünf waren Zusagen, die der Code
machte, ohne sie zu prüfen. Jeder wurde erst am Code REPRODUZIERT, dann
gefixt, jeder hat einen eigenen Unit-Beweis. Die beiden Live-Beweise bleiben
grün (`verify-site-authz` **118/118**, `verify-community-suspension`
**117/117** — dort waren 95 der Stand der Auftragsnotiz, die Suite ist
seither gewachsen; 0 Fehlschläge, Exit 0). Unit-Stand danach: core **515**,
control **264**, admin **70**; `pnpm typecheck` und `check:manifests` sauber,
`lint` bei den bekannten 6 Warnungen und 0 Fehlern.

**Betriebsnotiz zu den Live-Läufen (nicht am Code):** zwei Läufe des
Sperr-Beweises blieben mitten in der Suite an einer EINZELNEN HTTP-Anfrage
hängen (einmal gegen platform :3006, einmal gegen control :3004) — Socket
ESTABLISHED, keine Antwort, kaum CPU. Beide Male antwortete genau dieselbe
Route unmittelbar danach per `curl` in unter 0.3 s. Das passierte während
parallel an anderen Layern gearbeitet wurde (`packages/events`,
`packages/themes` hängen in den Extends dieser beiden Apps): ein
Nitro-Dev-Reload mitten in einer laufenden Anfrage lässt sie stehen, und das
Skript setzt kein Socket-Timeout. Wer den Beweis führt, prüft bei einem Hänger
also erst den Dev-Server (`curl` auf dieselbe Route), bevor er den Code
verdächtigt. Der dritte Lauf lief in einem Zug durch.

**F32 (Mittel) — UNTER DER WILDCARD IST JEDER MANDANT „SAME-SITE".** Der
CSRF-Herkunftscheck (`core/server/middleware/03.csrf-origin.ts`) lehnte nur
`Sec-Fetch-Site: cross-site` ab und ließ `same-site` bedingungslos durch. Das
ist richtig für eine App auf EINEM Host — dieses Deployment hängt aber unter
`*.pukalani.app`, und dort ist jeder Mandanten-Host same-site zu jedem
anderen. `boese-community.pukalani.app` durfte also schreibende Requests an
`verein.pukalani.app` schicken, und der Browser meldete brav „same-site".
Heute hält noch das `SameSite=Lax`-Cookie; scharf wird es genau dann, wenn das
partitionierte Embed-Cookie (`SameSite=None`) kommt — also in dem Moment, für
den dieser Check überhaupt gebaut wurde.

Gefixt mit der kleinsten Härtung: `same-site` fällt jetzt in den
Origin-gegen-Host-Vergleich, der drei Zeilen weiter unten schon stand. Ein
`same-site` OHNE `Origin` wird abgelehnt — same-site heißt per Definition
cross-origin, ein Browser schickt dabei immer einen Origin, seine Abwesenheit
ist ein Widerspruch. Bewusst NICHT strenger wurden `same-origin` (bei manchen
gleichherkünftigen Formular-POSTs fehlt der Origin — ein Zwang bräche echte
Requests, ohne etwas zu gewinnen), `none` und der origin-lose
Server-zu-Server-Fall (Stripe-Webhook, curl: kein Browser-Cookie im Spiel).

Die Entscheidung liegt jetzt PURE in `core/server/utils/csrfOrigin.ts`, die
Middleware ist nur noch Gate + Header-Auslesen.

**DER EMBED-FLUSS BRICHT NICHT — nachgeprüft, nicht vermutet.** `apps/comments`
ist der einzige aktive Konsument (`csrfOriginCheck: true`). Alle unsicheren
Embed-Routen werden aus einem Dokument DERSELBEN Origin gerufen: das iframe
zeigt auf `<widget-host>/embed` und ruft `<widget-host>/api/*`, das Login-Popup
ruft `/api/auth/embed-handoff` von der Widget-Origin, das iframe danach
`/api/auth/embed-session`. Alle melden `same-origin`. `embed.js` läuft zwar auf
der fremden Gastgeber-Seite, macht dort aber nur GET (`/api/comments/count`) —
unsichere Methoden fasst die Regel gar nicht an. Es war also **keine Ausnahme
zu ziehen**, und das ist die eigentliche gute Nachricht: hätte es eine
gebraucht, wäre sie die Sollbruchstelle des ganzen Checks geworden.

**Beweis:** 13 Fälle (`packages/core/tests/csrfOrigin.test.ts`) — same-origin
mit und ohne Origin, same-site mit passendem Origin (nur Schema unterschiedlich),
same-site mit fremdem Mandanten-Host, same-site mit anderem PORT, same-site ohne
Origin, `'null'` aus einem sandboxed iframe, Präfix-/Suffix-Tricks am Hostnamen,
cross-site (auch mit passend gefälschtem Origin), `none`, fehlender Header mit
und ohne Origin.

**F33 (Niedrig) — DIE NAHT GLAUBTE DEM AUFRUFER SEIN PROJEKT.**
`POST /api/control/community/members/user-erase` nahm `runtimeProjectId` aus
dem Body und scopte hart darauf. Das fehlende JWT ist begründet (das Konto ist
beim Aufruf schon gesperrt und gleich weg), aber niemand prüfte das genannte
Projekt: wer das Service-Secret hatte, konnte damit Mitgliedschaften und
Einladungen in JEDEM Runtime-Projekt löschen — also im Silo eines fremden
Kunden. Jetzt hält `assertOnboardingRuntimeProject` (control
`server/utils/onboardingService.ts`) das genannte Projekt gegen das EINE, das
diese Naht bedient (`onboardingRuntimeProject`), und antwortet sonst 403. Der
Body darf das Projekt weiterhin NENNEN — aber nur, um bestätigt zu werden.

**MITGEFIXT, weil derselbe Schnitt:** `members/user-data.post.ts`, die
Auskunfts-Route daneben, hatte die identische Lücke in Leserichtung. Eine
Auskunft über die Mitgliedschaften und Einladungs-ADRESSEN eines fremden
Runtime-Projekts ist auch ohne Schreibrecht ein Datenleck. Beide sind die
einzigen Community-Routen, die ihr Projekt aus dem Body nahmen — alle anderen
ziehen es ohnehin aus `verifyRuntimeIdentity` (nachgezählt: 7 Routen,
`Query.equal('runtimeProjectId', identity.projectId)`).

**Beweis:** `packages/control/tests/onboardingRuntimeProject.test.ts` —
eigenes Projekt (auch mit Whitespace aus Env-Dateien), fremdes Projekt,
Teil-Treffer (`pool` vs. `poo`/`pool2`), Groß-/Kleinschreibung (Appwrite-Ids
sind case-sensitiv, also wird NICHT normalisiert), leer gegen leer.

**F34 (Niedrig) — EIN TIMEOUT SCHALTETE DIE MANDANTEN-TRENNUNG DER GLOCKE AB.**
`runScopedNotificationQuery` fing JEDEN Fehler und wiederholte die Abfrage
UNGESCOPT. Gedacht war das als Deploy-Brücke für den Fall „Spalte noch nicht
migriert"; getroffen hat es auch Timeouts, Appwrite-5xx und abgerissene
Sockets — also genau die Fehler, die im Betrieb tatsächlich vorkommen. Für die
Dauer der Störung mischten sich fremde Communities in die Glocke.

**ENTSCHIEDEN: verengen statt streichen.** Der Rückfall feuert jetzt nur noch
bei `code === 400` UND `general_query_invalid` (bzw. „attribute not found" im
Text, falls Appwrite den Typ je umbenennt) — `isUnknownScopeColumnError`, pure
und getestet. Alles andere fliegt durch; der Aufrufer bekommt seinen 5xx, und
die Glocke bleibt getrennt. Ganz entfernt wurde die Brücke NICHT, obwohl die
Migration überall gelaufen ist: in diesem Zustand kostet sie nichts (sie kann
nur noch auf einer Instanz ohne Migration feuern) und deckt denselben Fall bei
der NÄCHSTEN Umbenennung der Spalte wieder ab — die es schon gab
(`tenantId` → `communityId`, system-025). Was sie nicht mehr darf, ist bei
irgendetwas anderem feuern. Ein Transportfehler ist kein Grund, eine
Sicherheits-Grenze fallen zu lassen.

**Beweis:** `packages/core/tests/notificationScopeFallback.test.ts` — 400er
mit und ohne Typ, 500/504/ECONNRESET/429/401 und blanke Fehler als „nicht der
Fall", dazu der Ablauf selbst: Normalfall EIN gescopter Lauf, Silo ohne
Rückfall-Pfad, nicht migrierte Spalte mit genau EINEM ungescopten
Wiederholungslauf, Timeout mit genau EINEM Versuch und durchgereichtem Fehler.

**F35 (Niedrig) — DIE ATTRAPPEN-PHRASE WAR AN DER GROSSSCHREIBUNG ZU ERKENNEN.**
Seit G4 antwortet `/api/auth/otp` bei geschlossener Registrierung auch für
unbekannte Adressen 200, mit einer erfundenen Sicherheitsphrase. Der Code nannte
die selbstgebaute Wortliste eine „ehrliche Grenze" („wer beide Listen kennt,
könnte an EINEM Wort erkennen …"). **Nachgemessen ist es viel schlimmer als
das:** Appwrite baut die Phrase in `src/Appwrite/Auth/Phrase.php` aus einem
GROSSgeschriebenen Adjektiv und einem KLEINgeschriebenen Substantiv („Radiant
zebra") — unsere Attrappe schrieb BEIDE Wörter groß („Amber Anchor"). Die
Unterscheidung brauchte also gar keine Wortlistenkenntnis: die
Groß-/Kleinschreibung des zweiten Wortes verriet in **100 % der Fälle**, dass
keine Mail unterwegs ist. Genau die Konten-Enumeration, die der stille Pfad
verhindern sollte, funktionierte weiter. Obendrein lagen nur 6 von 16
Adjektiven und 1 von 16 Substantiven überhaupt in Appwrites Listen.

Gefixt mit Appwrites EIGENEN Listen, verbatim übernommen
(`core/server/utils/securityPhrase.ts`) — nicht abgetippt, sondern aus dem
laufenden Container gelesen (`docker exec appwrite cat
/usr/src/code/src/Appwrite/Auth/Phrase.php`, Appwrite 1.9.6): 129 Adjektive,
104 Substantive **einschließlich der drei Dubletten** („umbrella", „globe",
„xylograph" stehen dort je zweimal). Appwrite zieht mit `array_rand`, eine
Dublette hat also die doppelte Wahrscheinlichkeit — wer die Liste „aufräumt",
baut den statistischen Unterschied wieder ein, den diese Datei beseitigt.

**Die Drift-Sorge des alten Kommentars war richtig, aber die kleinere Gefahr:**
Drift entsteht nur, wenn Appwrite die Liste ÄNDERT, und verrät dann höchstens
die hinzugekommenen Wörter. Der bisherige Zustand verriet jede einzelne
Attrappe sofort. Die Datei gehört jetzt auf die Prüfliste beim
Appwrite-Upgrade; der Vergleich ist der eine `docker exec`-Befehl oben.

**Beweis:** `packages/core/tests/securityPhrase.test.ts` — Umfang (129/104,
101 eindeutige Substantive, die drei Dubletten je zweimal), Groß-/Kleinregel
beider Listen, keines der alten Eigenbau-Substantive mehr enthalten, und 500
gezogene Phrasen, deren beide Wörter aus den Listen stammen („ice cream" mit
Leerzeichen inklusive) und deren zweites Wort kleingeschrieben ist. Live
mitbewiesen in `verify-site-authz.mjs` Abschnitt 10c („OTP: UNBEKANNTE Adresse
antwortet identisch").

**F23 (Niedrig) — DER STATS-CACHE TRUG EINE MANDANTENZAHL ÜBER HOST-GRENZEN.**
`/api/admin/users/stats` hielt ALLE VIER Zahlen in einer prozessweiten,
ungeschlüsselten 60-Sekunden-Variablen. Drei davon sind projektweit
(`total`/`active`/`new` aus `users.list()`; im Pool teilen sich alle
Communities EIN Appwrite-Projekt), die vierte — `online` aus
`listOnlinePresences(event)` — ist seit A4 mandantengescopt. Ein Betreiber, der
binnen einer Minute zwei Community-Hosts ansah, bekam auf dem zweiten die
Anwesenheitszahl des ersten.

**ENTSCHIEDEN: trennen statt schlüsseln.** Ein mandantengeschlüsselter Cache
(Muster `tenantCacheScope`) hätte die Zahlen MITGESCHLEPPT, die gar nicht pro
Mandant verschieden sind — und mit ihnen den teuren Teil: `active` scannt bis
zu 5.000 Nutzer per Cursor, weil `accessedAt` bei Appwrite nicht queryfähig
ist. Bei N Communities wären das N Scans für N identische Ergebnisse; ein
Cache, der Last sparen soll, hätte sie vervielfacht. `online` dagegen ist EIN
Presences-Aufruf ohne Scan — es zu cachen sparte praktisch nichts und war der
einzige Grund, warum der Cache falsch sein konnte. Es kommt jetzt bei jedem
Request frisch, was für eine Live-Zahl ohnehin das richtige Verhalten ist.

Der Cache liegt jetzt in `admin/server/utils/userStatsCache.ts` (auf dem
bestehenden `createMicrocache`), sein Schlüssel ist das APPWRITE-PROJEKT —
genau das, was diese Zahlen beschreiben. Im Betrieb ist das ein einziger
Eintrag; er steht trotzdem im Schlüssel, damit der Cache nicht wieder zu einer
namenlosen Variablen wird, an die man den nächsten Wert einfach anhängt. Der
Typ `ProjectUserCounts` schließt `online` STRUKTURELL aus.

**Beweis:** `packages/admin/tests/userStatsCache.test.ts` — Treffer im TTL
lädt nicht nach, ein anderes Projekt bekommt einen eigenen Eintrag, nach TTL
wird neu geladen, das Ergebnis trägt genau die Schlüssel `total`/`active`/`new`;
dazu zwei Quelltext-Prüfungen an der Route (Muster
`dashboard-stats-authz.test.ts`): `listOnlinePresences` steht AUSSERHALB des
gecachten Laders, und es gibt keine eigene `let cache`-Variable mehr.

**Gelernt (drei Zeilen, die zusammengehören):**

1. **Ein „ehrlicher Grenze"-Kommentar ist eine Behauptung, bis jemand
   nachmisst.** F35 stand als bewusst getragener Restposten im Code — mit einer
   Begründung, die plausibel klang und die eigentliche Lücke (die
   Groß-/Kleinschreibung) gar nicht erwähnte, weil niemand die Referenz
   aufgemacht hatte. Sie lag zwei `docker exec` entfernt. Wo ein Kommentar eine
   fremde Implementierung beschreibt, gehört die Quelle DAZU — Pfad, Version
   und der Befehl, mit dem man es nachprüft.
2. **Ein Fehler-Rückfall braucht ein Fehler-PRÄDIKAT.** `catch (error)` ohne
   Bedingung sagt „bei Problemen die Sicherheitsregel weglassen" — und trifft
   dann garantiert die Fälle, für die es nicht gedacht war. Wer eine
   Deploy-Brücke baut, prüft den Fehler, den die Brücke überbrücken soll.
3. **Ein Cache ohne Schlüssel ist ein Versprechen, dass alles darin global
   gilt.** Als er gebaut wurde, stimmte das; `online` kam später dazu und hat
   das Versprechen still gebrochen. Deshalb hier nicht „Schlüssel dran",
   sondern erst die Frage „was IST hier eigentlich projektweit?" — die Antwort
   war ein eigener Typ, und der lässt den nächsten Anbau nicht mehr zu.

---

## F30 — die Live-Beweise laufen jetzt mit (2026-08-02)

**Der Befund:** im Repo lagen 24 `verify-*.mjs`. In der CI lief davon GENAU
EINER (`verify-paid-ticket`, seit G2). Alle anderen prüften, wer zufällig daran
dachte — und genau deshalb blieben am 2026-08-02 ein toter Geldpfad und ein
Isolations-Loch wochenlang unentdeckt, OBWOHL es für beide einen Beweis gab.
Ein Beweis, den niemand ausführt, ist kein Beweis, sondern eine Datei.

**Eingehängt in `e2e.yml` (fünf neue Schritte, alle grün gemessen):**
Mandanten-Isolation `comments`/`reports`/`pages` (13 Prüfungen) ·
Mandanten-Isolation `posts`/Votes/Polls (7) · Sichtbarkeit je Community aus
GAST-Sicht, C18/F28 (38) · Presence-Grenze Akt 1 an der Appwrite-API, A4 (10) ·
Index-Anstoß bei vergiftetem Metadaten-Cache, F19 (9). Zusammen **+~30 s** auf
einen Job von ~5 min. Jeder bekam einen EIGENEN Schritt mit sprechendem Namen:
ein roter Lauf soll am Schritt-Namen zeigen, welche Zusage gebrochen ist,
statt in einem Sammel-Schritt zu verschwinden.

**Bewusst NICHT eingehängt:** die übrigen 18. Dreizehn davon brauchen einen
Platform-Dev-Server MIT den Wegwerf-Communities `kunde-a`/`kunde-b` in einem
Control-Plane-Projekt, fünf zusätzlich einen zweiten Dev-Server (`apps/control`)
und teils Mailpit; `verify-community-suspension` allein braucht ~20 min. Das ist
EIN fehlendes Stück Bühne, nicht achtzehn Probleme — die Skizze steht in
`docs/referenz/LIVE-BEWEISE.md`. Nicht nebenbei gebaut, weil die E2E ein
Deploy-Gate ist: eine halb gebaute Bühne erzeugt rote Läufe, die nichts über
das Produkt aussagen, und rot heißt hier „kein Deploy".

**Beweis:** alle sechs Schritt-Rümpfe aus dem YAML extrahiert, mit `bash -n`
geprüft und einzeln in Workflow-Reihenfolge aus dem Repo-Wurzelverzeichnis
gefahren (Exitcode 0); der Wächter des Redis-Schritts gegengeprüft (Exitcode 1
mit `::error::`-Ansage); alle sechs Workflow-Dateien durch einen YAML-Parser.

**Gelernt (drei Zeilen):**

1. **Eine zweite Appwrite auf demselben Docker-Daemon ist keine zweite
   Appwrite.** Der Versuch, die CI-Instanz lokal nachzustellen, scheiterte
   zweimal an Übersprechen: traefik entdeckt Container über den DOCKER-SOCKET,
   nicht über das Compose-Projekt — es griff sich die Container der laufenden
   Dev-Instanz und verteilte Anfragen im Wechsel (Konto angelegt auf Stack A,
   Login gegen Stack B ⇒ „Invalid credentials", ein Fehler, den es nicht gab).
   Danach nahm der `databases`-Worker des zweiten Stacks gar keine Aufträge mehr
   an; Spalten blieben für immer auf `processing`. In CI gibt es diesen Fall
   nicht (ein Stack, ein Runner) — lokal muss man am traefik VORBEI direkt auf
   den Container zielen, oder es bleiben lassen.
2. **Vor jedem Live-Beweis gehört geprüft, WER auf dem Port liegt.** Ein
   „Fehlschlag" von `courses/verify-silo-unchanged` war in Wahrheit
   `apps/control` auf :3001 statt `apps/comments` — dieselbe Falle, die
   CLAUDE.md unter WORKTREE-BEWEISE beschreibt, nur eine Tür weiter.
   `lsof -nP -iTCP -sTCP:LISTEN`, dann das `cwd` des Prozesses ansehen.
3. **Einen Container-Namen nicht raten, wenn man ihn erfragen kann.**
   `<projekt>-<dienst>-<n>` stimmt heute; als HARTE Zeile in einem Deploy-Gate
   wäre es eine stille Kopplung, die bei einer Umbenennung wie ein Produktfehler
   aussieht. `docker compose ps -q redis` liefert die Id, und fehlt sie, bricht
   der Schritt mit eigener Ansage ab.

### G6 — Sichtbarkeit der Titelbilder + zwei Sperr-Entscheidungen ✅ 2026-08-02

**Was das war.** Vier Punkte aus dem Nacht-Audit in `packages/events`,
`packages/media`, `packages/posts`, `packages/comments`: ein Rest-Leck bei den
Titelbildern (F28), zwei von David an mich delegierte PRODUKT-Entscheidungen zur
Zahlungssperre (F25, F26) und zwei tote Typ-Felder (F29). Jeder Befund wurde
erst reproduziert, dann gefixt; die zwei Entscheidungen stehen jetzt AN BEIDEN
Stellen, die sie betreffen, samt der überstimmten Gegenargumente.

---

**F28 (Mittel) — EIN ENTWURFS-TITELBILD SAHEN ALLE MITGLIEDER.**

Der große Teil war schon zu (events-009 band die Cover-Datei an ihre Row); übrig
blieb eine Ausnahme mit gutem Grund: ein Cover, dessen Row kein Leserecht trägt
(Entwurf), bekam ersatzweise das MITGLIEDER-Publikum der Community. Der Grund
war die Vorschau im Bearbeiten-Dialog — die holte der BROWSER direkt aus dem
Bucket, „niemand" hätte dort ein kaputtes Bild bedeutet. Die Wirkung: jedes
Mitglied konnte das Titelbild eines unveröffentlichten Termins per Roh-URL
abrufen. Die Datei war offener als ihre Zeile, und genau das darf nicht sein.

Gefixt, indem der GRUND weggeräumt wurde statt der Regel: neue Route
`GET /api/events/:id/cover` (server-seitig, hinter `events.manage` UND der
Datentür; die fileId kommt aus der geprüften Row, nie aus der URL; skaliert auf
800 px WebP, `Cache-Control: private, no-store`). Damit ist die Regel wieder
eine Zeile — **eine Datei ist nie offener als ihre Zeile** —, und sie steht PURE
in `packages/events/shared/coverAudience.ts`, gelesen von der Laufzeit UND vom
Live-Beweis. `eventCoverPermissions()` hat dabei seinen `H3Event`-Parameter
verloren: die Rechnung hängt an nichts mehr außer der Row, und ein ungenutzter
Parameter wäre eine Einladung, wieder Request-Wissen hineinzuziehen. Migration
**events-010** zieht den Bestand nach (eigene Migration statt Korrektur an 009 —
009 ist gelaufen, und beide hintereinander ergeben denselben Endzustand).

**MEDIA WAR NICHT BETROFFEN, nachgemessen statt vermutet.** Dort bekommen Row
und Datei an JEDER Stelle dasselbe Array (Anlegen, Umschalten, C18-Umzug); die
Entwurfs-Datei ist genauso weit offen wie ihre Zeile, nämlich für ein einziges
Operator-Label. Was dort bleibt, ist Vorschau-KOMFORT im Pool (die eigene
Redaktion sieht ihre Entwurfs-Kacheln nicht), kein Publikum — die neue
events-Route ist die Vorlage dafür, wenn es drankommt.

---

**F25 (Produktentscheidung) — SWEEPS IN EINER GESPERRTEN COMMUNITY: AUFGETEILT.**

Beide Sweeps laufen bewusst ohne `actor`, die Inhalts-Sperre der Datentür greift
also bei keinem von beiden. Die Antwort ist trotzdem nicht dieselbe, und die
Grenze verläuft zwischen ÄNDERN und ANLEGEN:

* `publish-on-read` (posts) **läuft weiter**. Es ändert nur die SICHTBARKEIT
  einer vorhandenen Zeile, die der Autor vor der Sperre auf genau diesen
  Zeitpunkt gestellt hat. Nichts entsteht, nichts kostet Kontingent — sie
  festzuhalten wäre keine Mahnung, sondern die nachträgliche Zensur eines
  fertigen Beitrags.
* `Serien-Top-up` (events) **hält an**. Es erzeugt NEUE Zeilen und verbraucht
  Kontingent; das ist genau, was die Zahlungssperre meint. Ohne die Bremse wächst
  eine Serie monatelang weiter, ausgelöst von jedem beliebigen Lese-Request eines
  Fremden.

Die Prüfung steht VOR dem Marker `seriesGeneratedUntil` — würde er trotz Sperre
geschrieben, hielte er das Fenster für erledigt und die Serie bekäme nach dem
Entsperren ein Loch, das nie wieder auffällt. Fail-soft (Rückgabe 0 + `logEvent`,
kein Wurf): der Sweep hängt an einem fremden Listen-Aufruf, der weiter
funktionieren muss. Die Begründung steht an BEIDEN Stellen, jeweils mit Verweis
auf die andere — wer die Entscheidung dreht, dreht sie zweimal.

---

**F26 (Produktentscheidung) — RSVP ZURÜCKZIEHEN BLEIBT OFFEN.**

Dieselbe Logik wie bei Davids Absage-Entscheidung: eine Rücknahme ist keine neue
Aussage. Wer nicht absagen kann, blockiert einen Platz und verfälscht die
Planung des Organisators — wegen einer Rechnung, mit der er nichts zu tun hat.

Die eigentliche Arbeit war nicht die Entscheidung, sondern die Toggle-Semantik:
Zusagen und Zurückziehen sind DERSELBE Aufruf mit DEMSELBEN Body, sie
unterscheiden sich nur am Bestand. Die Route hat deshalb jetzt zwei Türen —
`actor: 'member'` für alles, was eine neue Aussage ist, und eine türlose
(`{ as: 'operator' }`, dieselbe Bauart wie beim Absagen) für genau den Zweig, der
die eigene Zeile löscht, Zähler-Dekrement inklusive. Eng gezogen: der WECHSEL
going → declined bleibt zu, obwohl er ebenfalls einen Platz frei machen würde —
er hinterlässt eine neue Aussage. Der Weg zum freien Platz steht trotzdem offen
(dieselbe Schaltfläche erneut). Die Ausnahmen werden ab jetzt an EINER Stelle
geführt (`[id].delete.ts`); die Liste ist von einem auf zwei Einträge gewachsen,
statt dass sich der neue Weg auf eine Formulierung beruft, die ihn nicht kennt.

**DABEI GEFUNDEN, echter Fehler:** der Zusage-Zweig übersetzte JEDEN Fehler des
atomaren Hochzählens in `409 Event is full`. In einer gesperrten Community warf
die Datentür dort ihr 403 mit `reason: community_suspended` — der Kunde las
„Event is full" an einem leeren Termin ohne Kapazitätsgrenze. Der Beweis lief
genau deshalb erst rot. Jetzt reist ein fertig geformter H3-Fehler unverändert
weiter (`isError`), übersetzt wird nur der rohe Appwrite-Fehler.

---

**F29 (Niedrig) — ZWEI TOTE `tenantId`-FELDER** in `comments/shared/types/
comment.ts` und `media/shared/types/media.ts` entfernt. Die Spalten sind mit
comments-017/media-005 gefallen, gelesen oder geschrieben wurden die Felder
nirgends. An ihrer Stelle steht jetzt der Grund, warum dort NICHTS steht — genau
diese Drift zwischen Typ und Schema hat im events-Layer den Geldpfad gebrochen.

---

**Beweise (alle live, gegen die laufende Instanz).**
`verify-community-suspension` **117/117** (vorher 95, +22: RSVP in beide
Richtungen samt Zähler, der Wechsel als Gegenprobe, beide Sweeps in beide
Richtungen) · `verify-audience-flip` **38/38** (vorher 25, +13: die vier
Zustände eines Titelbilds, je anonym UND als eingeloggtes Mitglied mit
Community-Label — inklusive einer VORHER-Messung, die den Befund zeigt) ·
`verify-paid-ticket` 13/13 · Pool-Isolation events 14/14, posts 7/7,
comments 13/13 · `pnpm -r test` (1409 grün), typecheck, lint (6 bekannte
Warnungen), `check:manifests`.

**Gelernt (vier Zeilen):**

1. **Ein Gast-Abruf beweist bei Mitglieder-Rechten gar nichts.** Der Befund war
   ja gerade, dass die Datei das MITGLIEDER-Publikum trug — der Gast scheiterte
   vorher wie nachher. Ein Beweis muss den Betrachter haben, um den es geht:
   `verify-audience-flip` legt dafür jetzt ein echtes Konto mit dem
   Community-Label an und liest mit dessen Sitzung.
2. **Ein Sweep-Beweis muss dem Sweep erst etwas ZU TUN geben.** Der erste Anlauf
   maß „nach der Sperre kam kein Termin dazu" — es wäre auch ohne Sperre keiner
   dazugekommen, das Rolling Window war voll. Erst das Löschen der jüngsten
   Instanzen (Lücke) macht aus „nichts passiert" eine Aussage. Dieselbe Falle
   wie bei jedem idempotenten Vorgang: kein Effekt ist kein Ergebnis.
3. **Ein `.catch()` ohne Fallunterscheidung ist eine Falschauskunft mit Ansage.**
   „Event is full" war jahrelang die Antwort auf jeden Fehler beim Hochzählen.
   Gefunden hat es kein Test, sondern der Live-Beweis, der einen konkreten GRUND
   erwartete statt nur einen Status.
4. **Zwei Appwrite-Stacks auf demselben Docker-Daemon sprechen über.** Während
   der Läufe stand parallel eine Wegwerf-Instanz (F30) auf denselben
   Docker-Netz; traefik entdeckt Container über den SOCKET und verteilte
   Anfragen abwechselnd auf beide — jede zweite meldete
   `project_not_found`. Erkennbar am Wechselmuster, nicht am Fehlertext. Ausweg:
   am traefik vorbei direkt auf die Container-IP der gemeinten Instanz zielen.
   (Deckt sich mit dem, was F30 an derselben Stelle gelernt hat.)

---

### F31 — die vierte Stelle der Theme-Feldliste ✅ 2026-08-02

`ThemeConfig` (`packages/themes/shared/ramp.ts`) wächst additiv — das
config-JSON trägt bewusst kein `version`. Seit G3 hängen zwei Stellen am Typ
(`THEME_CONFIG_KEYS` per `Record<keyof Required<ThemeConfig>, true>`, und der
JSON-Import der Galerie-Seite leitet seine Liste daraus ab). Die Aufgabenliste
nannte eine dritte, die weiter von Hand nachzuziehen war: die strikte
Zod-Prüfung der Speicher-Routen. **Beim Nachzählen waren es vier** — das Schema
steht WÖRTLICH ZWEIMAL im admin-Layer, in `themes/index.post.ts` und in
`themes/[id].patch.ts`.

Diese vierte Stelle ist die einzige, an der ein Auseinanderlaufen wehtut, und
zwar sofort: das Schema ist `.strict()`. Ein Feld, das die Liste kennt und das
Schema nicht, lässt nicht dieses eine Feld fallen, sondern weist den GANZEN
Speichervorgang mit 400 ab — der Editor ließe sich dann gar nicht mehr
speichern. Und weil die Kopie doppelt liegt, wäre auch „anlegen geht, bearbeiten
wirft 400" ein möglicher Zustand.

**Entschieden wurde gegen ein geteiltes Schema — nicht aus Bequemlichkeit,
sondern weil es dafür kein legales Zuhause gibt.** Der naheliegende Weg wäre,
das Zod-Schema aus `packages/themes` zu exportieren und im admin-Layer zu
importieren. Beide Richtungen sind von der Layer-Grenze A14 gesperrt, und zwar
per ESLint-Backstop, nicht nur per Prosa: `packages/themes/**` darf **kein**
`@pukalani/*` importieren (auch core und system nicht — themes ist rein
visuell), und `packages/admin/**` darf keinen anderen Feature-Layer importieren,
also auch nicht `@pukalani/themes`. Ein gemeinsames Zuhause gäbe es erst nach
einer bewussten Änderung der Layer-Matrix; das ist eine
Architektur-Entscheidung, keine Aufräumarbeit, und sie gehört David, nicht
einem Aufräum-Auftrag.

**Gebaut wurde deshalb ein Quelltext-Anker** in
`packages/themes/tests/themeConfigKeys.test.ts` (Muster: die Anker in
`packages/events/tests/redaction-actor.test.ts`). Er LIEST die beiden
admin-Dateien, zieht die Schlüssel der obersten Ebene aus dem
`themeConfigSchema`-Literal und hält sie gegen `THEME_CONFIG_KEYS` — plus zwei
Zusicherungen, die die eigentliche Falle abdecken: beide Routen prüfen wörtlich
dasselbe, und `.strict()` bleibt stehen (ohne `.strict()` verschwände ein
unbekanntes Feld still, der Test wäre grün und das Theme trotzdem falsch
gespeichert). Geprüft werden bewusst nur die SCHLÜSSEL, nicht die Wertebereiche:
ob `hueShift` von −180 bis 180 geht, ist eine Produktfrage mit genau einer
richtigen Antwortstelle; ob ein Feld überhaupt BEKANNT ist, ist eine
Ja/Nein-Tatsache, und nur die kann auseinanderlaufen.

Beweis: `pnpm --filter @pukalani/themes test` **157/157** (vorher 153),
`check:themes` grün.

**Gelernt:** Wenn zwei Stellen zusammengehören und die Layer-Grenze einen Import
zwischen ihnen verbietet, ist der Quelltext-Anker nicht die faule Lösung,
sondern die einzige, die keine Grenze verschiebt — er LIEST die Datei, er
importiert sie nicht. Zweite Lehre, teurer: **die Aufgabenliste sprach von drei
Stellen, es waren vier.** Die vierte war eine wörtliche Kopie der dritten in der
Nachbardatei. Vor dem Beheben einer Doppelung immer erst zählen, statt der
Beschreibung zu glauben — sonst hält man zwei von drei Kopien zusammen und die
dritte läuft weiter weg.

---

### F22 — tote Doku-Verweise: einmal aufgeräumt, dann bewacht ✅ 2026-08-02

Die Aufgabenliste nannte EINEN Fall (CLAUDE.md behauptete, `community.delete`
sei bewusst nicht gebaut — seit C16 vom 2026-07-31 ist es gebaut, als
Stilllegen). Gesucht wurde nach dem ganzen Muster, und zwar mit einem Werkzeug,
das bleibt: **`scripts/ops/verify-doc-links.mjs`** (`pnpm check:doc-links`).
Es prüft in `docs/**`, `CLAUDE.md`, `AGENTS.md`, `README.md` und in den
Kopfkommentaren aller Skripte drei Dinge: Markdown-Links auf Repo-Dateien,
`[[…]]`-Verweise und pfad-artige Angaben in Backticks. Dazu die Routen der
internen Doku-Site (`docs/content/**` → `/architektur/migrationen`), die sonst
niemandem beim Schreiben auffallen, sondern erst dem Leser als 404.

**Die eigentliche Arbeit war die Kalibrierung, nicht das Finden.** Der erste
Entwurf meldete **120 Stellen, davon war eine Handvoll echt** — die Doku ist
voller Fragmente, die wie Pfade aussehen und keine sind (`pages/login.vue` in
einer Aufzählung, `users/[id].vue` als Name einer Dashboard-Seite,
`src/main.js` aus dem Beispiel-Repo eines fremden Projekts). Drei Regeln haben
daraus ein brauchbares Signal gemacht:

1. **Nur eindeutige Repo-Pfade zählen** — entweder ab Wurzel (`packages/…`) oder
   in der gewachsenen Layer-Kurzform (bekannter Layer-/App-Name + Struktur-Ordner,
   also `core/server/…`, `themes/shared/…`). Beide Segmente werden gegen die
   WIRKLICHEN Verzeichnisse geprüft, die Liste pflegt sich also selbst.
2. **Die Kurzform aus Layer-Sicht wird aufgelöst, nicht bestraft.** Die Doku
   schreibt ständig `scripts/generate-themes.ts` und meint
   `packages/themes/scripts/…`. Das ist die übliche Schreibweise hier, kein
   Fehler.
3. **`[[…]]` bedeutet in diesem Repo „Notiz AUSSERHALB"** — nachgesehen: alle
   zehn zeigen in Davids Obsidian-Vault oder auf eine Claude-Memory-Notiz (eine
   trägt das sogar als „(Memory)" dabei). Sie werden aufgelistet, nie als Fehler
   gezählt; prüfbar wären sie nur gegen ein Verzeichnis auf einer bestimmten
   Maschine, und ein Wächter, der nur dort grün ist, ist keiner.

**Die Grenze, an der das Skript aufhört — und warum sie so verläuft.**
`docs/archiv/**`, `docs/OPEN-ITEMS-COMPLETE.md`, `README.md` und `CHANGELOG.md`
sind PROTOKOLLE. Ein Dateiname im Fließtext ist dort eine historische Aussage
(„die Datei hieß damals so"); ihn zu „korrigieren" wäre Geschichtsfälschung.
Ein Link auf ein DOKUMENT ist etwas anderes: er verspricht „hier kannst Du es
nachlesen", und das altert nicht — zieht die Datei um, muss der Link mitziehen,
es ist ja dasselbe Dokument. Deshalb: **Dokument-Links überall erzwungen, auch
im Archiv; Pfad-Angaben und Links in den CODE nur außerhalb der Protokolle**
(`--strict` macht auch sie zu Fehlern, für eine bewusste Durchsicht).

**Gefunden und behoben (7 Stellen):**

- **CLAUDE.md, `community.delete`** — der genannte Fall. Steht jetzt richtig da:
  gebaut als Stilllegen (`communities.status='disabled'`, Host 404 in ≤30 s,
  Mitgliedschaften 'removed', INHALTE BLEIBEN), gesperrt bei laufendem Abo,
  samt beider Routen.
- **CLAUDE.md, `tenants.*` → `communities.*` (6 Stellen)** — die Tabelle
  `tenants` ist mit control-030 GEFALLEN (E8-3, Umbenennung control-029). Wer
  nach `tenants.theme` oder `tenants.openRegistration` greppt, findet nichts.
- **CLAUDE.md, `Role.label(siteId)` → `Role.label(communityId)`** und die
  Presence-Zeile `read("label:<siteId>")` — dieselbe Umbenennung.
- **CLAUDE.md, die Pool-Scope-Spalte** — `create` stempelt `communityId` (nicht
  mehr `tenantId`), `notifications.communityId`, `<communityId>` als
  Spaltenwert. Die INDEXNAMEN (`uq_tenant_host`, `uq_tenant_slug`) blieben
  dagegen unverändert; das steht jetzt ausdrücklich dabei, sonst „korrigiert"
  sie der nächste Durchgang fälschlich mit.
- **`docs/CONCEPT.md`** — das Migrations-Beispiel zeigte auf
  `comments/…/001-comments-tables.ts`; die früheste vorhandene ist `002-`.
- **`docs/plans/VOKABULAR-AUFRAEUMEN.md` + der E8-Eintrag hier** — beide
  verlinkten `plans/UMBENENNUNG-AUF-COMMUNITY.md`; der Plan ist ausgeführt und
  liegt in `archiv/`.
- **`docs/archiv/UMBENENNUNG-AUF-COMMUNITY.md`** — der Kopf sagte „Status:
  geplant, nicht ausgeführt" und „Liegt in `docs/plans/`", während die Datei im
  Archiv lag und die Etappen 1–4 am 2026-07-30/31 gelaufen waren. Kopf richtig
  gestellt, der Plan-Text darunter bewusst unverändert.

**Bewusst STEHEN GELASSEN (18 Pfad-Angaben in Protokollen + 10 externe
Notizen):** `docs/archiv/PRESENCE-GRENZE.md` nennt `siteLabel.ts` und
`site-label.ts`, `THEMES-VOLLAUSBAU.md` nennt `styleguide.vue` — alles Dateien,
die es unter diesen Namen einmal gab. Das Archiv ist Protokoll (CLAUDE.md,
Doku-Ordnung). Zwei davon stehen im Lern-Archiv selbst (`A4` nennt
`core/server/middleware/site-label.ts`, heute `06.community-label.ts`) und
bleiben aus demselben Grund.

Nicht behoben, weil außerhalb dieses Auftrags: **`tenantId` lebt im Code
weiter** — als Feld im Request-Kontext, als Presence-Metadatum
(`presenceFilter.ts`, in CLAUDE.md korrekt so benannt) und als Spalte
`communities.tenantId` (der Mandanten-SCHLÜSSEL, nicht die Row-Id). Die
Umbenennung betraf die Pool-Spalten, nicht das Wort. Wer hier weiter aufräumt,
muss die drei Bedeutungen auseinanderhalten.

Beweis: `pnpm check:doc-links` **0 tote Verweise**, Exit 0.

**Gelernt:** Ein Doku-Wächter scheitert nicht am Finden, sondern am Schreien.
Der erste Entwurf hatte eine Trefferquote von unter 5 % — so ein Skript wird
beim ersten Lauf abgeschaltet, und dann ist die Doku schlechter dran als ohne.
Die Regel, die es gerettet hat, ist nicht „strenger prüfen", sondern **„nur
prüfen, was maschinell EINDEUTIG entscheidbar ist"**: Pfade ja, Symbolnamen
nein (`requireEntitlement` ist kein Pfad, und eine Heuristik darauf meldete
jeden Begriff, der einmal anders hieß).
**Gelernt:** Die nützlichste Unterscheidung war nicht „Archiv oder nicht",
sondern **„Wegweiser oder Protokoll"**. Ein Link verspricht Erreichbarkeit und
muss auch in einem zehn Monate alten Dokument stimmen; ein Dateiname im
Fließtext beschreibt einen Zustand von damals und darf gar nicht stimmen. Wer
beides gleich behandelt, schreibt entweder Geschichte um oder lässt kaputte
Wegweiser stehen.
**Gelernt (Nebenbefund):** Die Umbenennung `tenants`→`communities` (E8-3) war im
CODE vollständig, in CLAUDE.md an **vierzehn** Stellen nicht — und CLAUDE.md ist das
Dokument, aus dem jeder Agent seinen Weltzustand bezieht. Eine Umbenennung ist
erst fertig, wenn auch die Anleitung sie kennt; sonst greppt der nächste nach
einer Tabelle, die es seit drei Tagen nicht mehr gibt.

### F24 — `/dashboard/settings/community` liegt jetzt bei seinen Routen ✅ 2026-08-02

Die Seite lag im **admin**-Layer und rief ausschließlich Routen des
**onboarding**-Layers (`/api/community/{registration,audience,delete}`) —
derselbe Schnitt-Fehler, wegen dem `/dashboard/members` (S9) und
`branding.vue` (F5) schon umgezogen waren. Der Leitsatz dahinter:
**eine Seite kann nur so weit reichen wie ihre Routen.**

Umgezogen ist die Datei nach
`packages/onboarding/app/pages/dashboard/settings/community.vue`, dazu die
i18n-Teilbäume `dashboard.community.*` und `dashboard.settings.community`
(de+en). Die Texte lagen bis heute in `admin`, obwohl `branding.vue`
(onboarding, seit F5) sie schon mitbenutzte — die Schicht-Grenze lief also
schon vorher quer durch eine Sprachdatei.

**Der eigentliche Punkt war der Reiter, nicht die Datei.** Er stand fest
verdrahtet in `packages/admin/app/pages/dashboard/settings.vue` und war nur zur
LAUFZEIT versteckt (`isTenantHost`). Eine Silo-App ohne onboarding hatte ihn
damit im Bauplan und verließ sich darauf, dass eine Beobachtung ihn wegblendet.
Jetzt gibt es dafür eine Registry — `pukalani.admin.settingsTabs`
(`packages/core/shared/types/settings-tab.ts`), dieselbe Bauart wie
`pukalani.admin.modules`: wer die Routen besitzt, registriert den Einstieg.
Gefiltert wird mit der BESTEHENDEN puren Regel aus
`core/shared/dashboardNav.ts` (Ort × Capability, `resolveSettingsTabs`) — kein
zweites Regelwerk für dieselbe Frage. Die vier KONTO-Reiter (Allgemein,
Benachrichtigungen, Geräte, Sicherheit) bleiben bewusst in der Hülle
verdrahtet: sie gehören dem admin-Layer, der die Hülle mitbringt.

Der ehrliche Hinweis statt der Schalter BLEIBT: `scope: 'community'` hält den
Reiter vom Kontroll-Host fern, aber `apps/platform` bedient Kontroll- UND
Mandanten-Hosts aus derselben App — die Seite ist über ihre URL dort weiterhin
erreichbar.

**Beweis je App** (`.nuxt` frisch erzeugt, `nuxi prepare`):

| App | Route `/dashboard/settings/community` | onboarding-app.config im Merge | Reiter möglich |
|---|---|---|---|
| comments | nein | nein | **nein** |
| photos | nein | nein | **nein** |
| portfolio | nein | nein | **nein** |
| control | nein | nein | **nein** |
| platform | ja | ja | ja |

Gegenprobe: `/dashboard/settings/security` existiert in allen fünf Apps
weiterhin — es sind die FREMDEN Reiter verschwunden, nicht die Hülle.
Dazu 9 neue Fälle in `packages/core/tests/settingsTabs.test.ts`,
`pnpm -r test` grün, `typecheck` Exit 0, `lint` Exit 0 (6 bekannte
Warnungen), `check:manifests` 18 Layer / 8 Apps,
`verify-site-authz` **118/118**, `verify-community-suspension` **117/117**.

**Gelernt:** „Versteckt" und „nicht vorhanden" sehen im Browser gleich aus und
sind es im Bauplan nicht. Der Reiter war seit S9 und F5 nachweislich falsch
platziert, aber weil eine Laufzeit-Bedingung ihn zuverlässig wegblendete, sah
jede Prüfung grün aus — der Fehler war nur durch die Frage „wem gehören die
Routen?" zu finden, nicht durch Hinsehen. Wo eine Seite lebt, entscheiden ihre
Routen; wo ihr Einstieg lebt, muss derselbe Layer entscheiden dürfen. Und:
i18n-Schlüssel wandern bei so einem Umzug MIT — sonst hängt der neue Layer
still am alten, und der nächste Silo-Aufbau merkt es erst, wenn Texte fehlen.

### Audit der nie geprüften Layer: blueprint · pages · system ✅ 2026-08-02

Drei Layer, die noch nie einzeln durchgesehen wurden. Sie halten ihre
Verträge — die drei Kern-Invarianten sind BESTANDEN, nicht knapp bestanden:

- **blueprint** ist weiterhin ein reiner Kompositions-Layer: acht Dateien,
  kein `server/`, keine Migrationen, keine Tables. Die vier Kompositionen
  (`feed.vue`, `events/[id].vue`, `courses/[slug]/lessons/[id].vue`,
  `layouts/default.vue`) existieren wirklich nur EINMAL — keine App unter
  `apps/*/app/pages` beschattet eine davon, und `comments` wie `platform`
  listen blueprint in `extends` VOR den Produkt-Layern.
- **pages** hält die Datentür lückenlos: alle sechs Routen unter
  `server/api/pages/**` gehen durch `tenantDb(event)`, kein rohes `.tablesDB`,
  ESLint deckt den Pfad ab. M13, C18, der Unique-Index pro Mandant und die
  MEDIUMTEXT-Grenzen stimmen; ein GDPR-Contributor fehlt zu Recht, weil
  `PageRow` gar keine Nutzerdaten trägt.
- **system** verteilt seine Tabellen nicht: alle neun Zugriffe auf `app_config`
  benutzen dieselbe eine Row `global`, Mandanten-Branding wird beim LESEN
  überlagert und nie hineingeschrieben, und keine Community-Rolle trägt
  `system.manage`. Alle 28 Migrationen sind idempotent, jede
  index-anlegende benutzt `createIndexSteps`.

**Direkt behoben (kleine, echte Fehler):**

1. **Die Reihenfolge einer Seite überlebte keine Bearbeitung** (pages,
   `server/api/pages/index.put.ts`). Der Upsert schrieb
   `sortOrder: body.sortOrder ?? 0` in BEIDE Zweige, die Dashboard-Seite sendet
   das Feld aber nie (sie hat kein Bedienelement dafür). Getroffen hat es genau
   die Seiten, für die `sortOrder` gedacht ist: `seedLegalPages` stempelt
   Impressum/Datenschutz bewusst auf 90/91, damit sie ans ENDE der Navigation
   rutschen — nach der ersten Korrektur standen sie vorn, ohne Weg zurück.
   Jetzt gilt beim Aktualisieren „fehlendes Feld heißt nicht angefasst"
   (dieselbe Regel wie `neutral` im Community-PATCH); beim Anlegen bleibt 0.
   Netz: `packages/pages/tests/page-sort-order.test.ts`.
2. **App-Code importierte eine Nitro-Route** (blueprint →  pages).
   `layouts/default.vue` holte `PublicPageNavItem` aus
   `pages/server/api/pages/public/index.get.ts` — einer Datei, die
   `node-appwrite` und Server-Auto-Imports auf oberster Ebene benutzt und die
   aus jeder `tsconfig.app.json` ausgeschlossen ist. Der Typ wohnt jetzt in
   `pages/shared/types/page.ts`, wo geteilte Domain-Typen hingehören.
3. **Eine Idempotenz-Prüfung, die ab 25 Spalten lügt** (system, sieben
   `app_config`-Migrationen: 002, 011, 015, 016, 018, 019, 023). `listColumns`
   lief ohne `Query.limit()`. Eine abgeschnittene Liste meldet „Spalte fehlt",
   `createColumn` antwortet dann **400 `column_limit_exceeded` statt 409** —
   und genau die 409-Abkürzung IST die Idempotenz dieser Migrationen. 021/022/
   025/026/027 nennen `Query.limit(200)` schon „Pflicht"; die älteren sind
   nachgezogen. `app_config` steht heute bei ~7 Spalten und wächst mit jedem
   Flag.
4. **Ein Poller, der nie pollt** (system, `008-gdpr-columns.ts`).
   `waitForColumns` prüfte `columns.every(...)` ohne den `columns.length > 0`-
   Wächter, den 001/003/014/020/028 alle haben — auf einer leeren Liste ist
   `.every()` wahr, die Funktion hätte sofort „verfügbar" gemeldet.
5. **Zwei Kopfzeilen, die die Unwahrheit sagten** (system). `nuxt.config.ts`
   behauptete „Kein App-/Server-Code, nur Migrationen" — der Layer liefert zwei
   Lese-Routen und den GDPR-Contributor; und `product.manifest.ts` nannte im
   betreiber-sichtbaren Katalogtext `changelog` (gehört admin) und verschwieg
   `app_secrets` + `community_branding`. Dazu ein hinterherhinkender Kommentar
   in `core/server/utils/recordActivity.ts` („stempelt tenantId", seit
   system-025/026 ist es `communityId`).

**Gemeldet statt gefixt** (steht als F-Zeilen in OPEN-ITEMS.md): die
Pool-Komposition in `apps/platform/app/pages/index.vue`, die eigentlich
blueprint gehört; die fehlenden ESLint-Blöcke für `blueprint` und `pages`; der
`app_config`-Schreibzugriff von `tickets` unter einer Moderator-Capability; und
der doppelt hartkodierte `activities`-Tabellenname im activity-Layer.

**Gelernt:** Zwei der fünf Funde sind derselbe Fehlertyp — **eine Prüfung, die
im Erfolgsfall wie im Fehlerfall grün aussieht.** `columns.every()` auf einer
leeren Liste und `listColumns` ohne Limit melden beide „alles in Ordnung",
wenn sie in Wahrheit nichts gesehen haben. Beide waren an anderer Stelle im
selben Ordner schon richtig gelöst und dort sogar als „Pflicht" kommentiert;
der Fehler war nicht fehlendes Wissen, sondern dass die Erkenntnis nie
rückwärts in die älteren Dateien lief. Wer eine Falle dokumentiert, sollte im
selben Zug greppen, wo sie sonst noch steht.

---

### F37 — Embed-Widget und Code-Login im Pool freigeschaltet ✅ 2026-08-02

**Der Befund** (Paritäts-Audit Silo × Pool, Davids Entscheidungen 1 + 2): zwei
Produkte lebten nur in `apps/comments`, obwohl nichts sie am Pool hinderte.

1. **Das Embed-Widget.** `pukalani.comments.embed.*`, `auth.embedSession` und
   `security.csrfOriginCheck` standen nur im Silo — dabei ist die Technik seit
   comments-015/016 mandantenfähig (`embed_sites` trägt `communityId`), und die
   Landing verkauft das Einbetten als Teil von „Diskussionen". Im Pool
   antwortete `/embed` schlicht 404.
2. **Der passwortlose Login.** `pukalani.auth.otp` war im Silo an, im Pool aus
   (Core-Default).

**Der eigentliche Blocker war die Berechtigung.** Die Einbetter-Seite und ihre
drei Routen verlangten `system.manage` — ein INSTANZ-Label, das ein
Kunden-Owner nie trägt. Selbst mit gesetztem Config-Schalter wäre die Fläche im
Pool für jeden Kunden zu geblieben, obwohl sie in seinem Dashboard steht. Neu
ist deshalb die Community-Capability **`community.embed`**, nach dem Muster von
`community.billing` (A6) im **Owner**-Bündel: wer eine fremde Domain freigibt,
öffnet die Community nach außen (`frame-ancestors` **plus** ein partitioniertes
Session-Cookie auf der Gastgeber-Seite) — dieselbe Klasse Entscheidung wie das
Abo. Ein Admin verwaltet, was INNEN passiert. Durchgesetzt an drei Stellen:
Seiten-Meta (`/dashboard/embed`), den drei Routen
(`await requireCommunityPermission`) und dem Nav-Eintrag. Der **Silo-Weg bleibt
offen**, weil die Cap in `ALL_CAPABILITIES` steht — ohne Mandanten fragt
`decideCommunityAccess` ausschließlich das Betreiber-Label.

**Die Mandantengrenze war schon richtig** — und das ist der wichtigste Befund:
die drei Routen gingen längst durch die Datentür (`tenantDb(event, {as:
'operator'})`), also scopt `list`, stempelt `create` und belegen
`update`/`remove` die Zugehörigkeit. Zu bauen war hier nichts, zu BEWEISEN
alles: der neue Live-Beweis
`packages/comments/scripts/verify-embed-boundary.mjs` (**40/40**) fährt zwei
echte Communities gegeneinander — derselbe Einbetter-Host in beiden (Unique ist
tenant-relativ), Zugriff über die bekannte FREMDE Row-Id endet in 404, die
Owner-Rolle reist nicht mit, und die `frame-ancestors`-CSP von A nennt nie den
Einbetter von B.

**`csrfOriginCheck` wurde für den Pool NEU belegt**, nicht aus dem Silo
übernommen — die F32-Härtung vom selben Tag behandelt `Sec-Fetch-Site:
same-site` streng, und unter der Wildcard ist jeder Mandanten-Host same-site zum
nächsten. Abschnitt 7 des Beweises zeigt live: same-origin (Dashboard + der
gesamte Embed-Fluss) geht durch, ein Formular auf der Nachbar-Community wird
abgewiesen, der cross-site-GET des Zählers aus `embed.js` bleibt erlaubt, und
kopflose Server-zu-Server-Aufrufe (Control-Naht, Beweis-Skripte) laufen weiter.

**Der Code-Login endet nicht mehr in einer Sackgasse.** Ob eine Instanz OTP
kann, entscheidet die Appwrite-Console („Auth → Settings → Email OTP") und das
SMTP der Instanz — bis heute wurde daraus ein generischer 500 und die
Anmeldeseite sagte „bitte erneut versuchen", ein Text, der zum Wiederholen
einlädt, obwohl Wiederholen nie hilft. Jetzt erkennt die Route die zwei
Instanz-Ursachen (`user_auth_method_unsupported` 501, `general_smtp_disabled`
503, pure Regel in `core/shared/authMethodAvailability.ts`), antwortet 503 mit
`reason: 'otp_unavailable'` und loggt für den Betreiber, WELCHE der beiden es
war. Die Oberfläche macht daraus „hier gerade nicht verfügbar, nimm dein
Passwort". Beweis: `packages/core/scripts/verify-otp-availability.mjs` (4/4) —
prüft nicht „OTP geht", sondern die immer wahre Zusage „Code ODER benannte
Absage, nie ein generischer 500", und sagt im Klartext, welcher Fall vorliegt.

**Der Nav-Eintrag hängt jetzt am Produkt.** Die Modul-Registry kannte zwei
Produkt-Gates (`productKey` = Betreiber-Schalter zur Laufzeit, `planProduct` =
Tarif des Kunden), aber keines für den BAU-Schalter der App. Der Einbetter-Punkt
stand deshalb im Menü jeder App, die den comments-Layer zieht — auch in
`photos` und `_template`, wo die Seite 404 antwortet. Neu: `configFlag`
(+ `configOn`/`configFlagEnabled`, fail-closed — ein Tippfehler im Pfad blendet
aus statt ein).

**Beweise:** verify-site-authz **118/118** · verify-community-suspension
**117/117** · verify-embed-boundary **40/40** (neu) · verify-otp-availability
**4/4** (neu) · `pnpm -r test` grün (core 541) · typecheck · lint (0 Fehler,
5 bekannte Warnungen) · check:manifests · check:doc-links.

**Offen für David (Console):** im Appwrite-Projekt **`pool`** der PRODUKTION
prüfen, ob „Auth → Settings → Email OTP" aktiv ist. Lokal ist es an (der Beweis
meldet Fall A); ist es in Prod aus, sperrt das den Login nicht mehr aus,
sondern zeigt den ehrlichen Hinweis.

**Gelernt:** Ein Config-Schalter ist nur die halbe Freischaltung — **die andere
Hälfte ist die Frage, wer das Produkt bedienen darf.** Beide Male steckte der
Fehler an derselben Stelle: eine Fläche stand im KUNDEN-Dashboard, verlangte
aber ein BETREIBER-Recht. Im Silo fällt das nie auf, weil dort beide dieselbe
Person sind. Wer ein Silo-Produkt in den Pool hebt, muss deshalb zuerst die
Capability-Zeile lesen, nicht die Config-Zeile — und zweitens prüfen, ob der
Menüpunkt an das Produkt gebunden ist, denn ein toter Menüpunkt fällt niemandem
auf, ein fehlender sofort. Zweite Lektion aus dem Aufräumen: ein
`.catch(() => {})` auf einem Tippfehler im Tabellennamen (`tenants` statt
`communities`) räumt still gar nichts weg — und der Lauf sieht trotzdem grün
aus. Genau derselbe Fehlertyp wie im Layer-Audit desselben Tages: eine Prüfung,
die im Erfolgs- wie im Fehlerfall grün aussieht.

### F38 — `media` und `activity` sind Pool-Produkte ✅ 2026-08-02

**Davids Entscheidung:** beide Layer werden in `apps/platform` montiert. Sie
waren seit C1b (2026-07-28) vollständig mandantenfähig gebaut —
`communityId`-Spalten, jede Route durch die Datentür, ESLint-Backstop,
C18-Umzug inklusive Bucket — aber in **keiner** Pool-App gewählt. Das war der
schlechteste aller Zustände: `recordActivity()` schrieb im Pool jeden Tag
Zeilen, die niemand lesen konnte, weil es dort keinen Feed gab. Und die
Mediathek, das einzige Produkt, mit dem eine Community eigene Bilder verwaltet,
gab es nur im Silo.

**Montiert an allen vier Stellen** (`pnpm check:manifests` erzwingt sie):
`apps/platform/site.manifest.ts` (Produkt-Wahl) · `nuxt.config.ts` (`extends`,
Reihenfolge aus `EXTENDS_ORDER`: media hinter events, activity hinter courses) ·
`package.json` (`@pukalani/media`, `@pukalani/activity`) ·
`scripts/migrate.mjs` (`media` stand dort schon; `activity` gehört **nicht**
hinein — der Layer hat bewusst keine eigenen Migrationen, `activities` gehört
`system`, A14).

**Plan-Zuordnung — VORSCHLAG, David bestätigt noch:** `media: 'personal'`,
`activity: 'basic'` (`pukalani.tenancy.products`). Begründung: die Mediathek
ist der **einzige** Layer, der Binärdateien auf die geteilte Platte legt und
damit laufend Speicher kostet; der Feed zeigt nur, was ohnehin passiert ist,
und ohne ihn wirkt eine frische Community tot. Die Zeilen sind einzeln
umstellbar, ohne Code-Änderung — die Gates hängen an ihnen.

**Gates, an allen sechs Einstiegen nachgezogen:** `requirePlanProduct` fehlte in
beiden Layern komplett (sie waren nie im Pool). Jetzt an
`/api/media` GET/POST/PATCH/DELETE und `/api/activity` GET/DELETE, jeweils als
erste Zeile — auch im öffentlichen Lese-Zweig der Galerie, der keine Sitzung
verlangt. Dazu `planProduct` an den Nav-Einträgen beider Layer (Modul-Registry
**und** Chrome-Nav): ohne das Feld stünde der Menüpunkt auch dort, wo die Route
404 antwortet — das Menü lügt sonst. `assertPoolWriteQuota(kind: 'media')`
stand schon; der Plan-Katalog nennt noch keine media-Grenzen, die Drossel ist
also ein No-Op wie bei events/courses (→ offener Punkt).

**F28, media-Hälfte: mit dem Umzug geschlossen.** Der Kopf des media-Layers
sagte selbst, das sei „fällig, bevor media in apps/platform gezogen wird" — zu
Recht: eine Entwurfs-DATEI trägt seit media-002 nur `read(label:'admin')`, ein
GLOBALES Betreiber-Label. Im Silo trägt der Betreiber es und die Vorschau in
`/dashboard/media` lud direkt aus dem Bucket; im Pool trägt es **niemand aus der
Community**, jede Redaktion hätte ihre eigenen Entwürfe als kaputte Bilder
gesehen. Gebaut ist die Antwort von events (`GET /api/events/:id/cover`):
`GET /api/media/:id/file`, hinter `media.manage` + Datentür, skaliertes WebP,
`private, no-store`. Welche Kachel diesen Weg nimmt, entscheidet der **Server**
(`index.get.ts` kennt `published` ohnehin) — veröffentlichte Bilder bleiben auf
der Bucket-URL, sonst zöge eine Liste mit 100 Kacheln durch Nitro. Das Label auf
der Datei bleibt bewusst unverändert: die Lösung ist eine Route, **nicht** ein
weiteres Label.

**Der Bestand des Feeds bleibt unsichtbar — das ist die Entscheidung.**
`system-021` hatte sie ausdrücklich offengelassen („Backfill über die Objekte
oder Alt-Einträge wegwerfen"). Gemessen (lokale Instanz, neuer Beweis-Abschnitt):
**242 von 2038** Feed-Zeilen tragen keine `communityId` — und **alle 242** tragen
`read("users")`, das Publikum von VOR C1b. Im Pool heißt das: jeder eingeloggte
Nutzer **aller** Communities. Sie nur zu stempeln würde sie in einen
Community-Feed holen und dabei pool-weit lesbar lassen; das wäre schlechter als
unsichtbar. Dazu kommt, dass die Hälfte gar nicht zuzuordnen ist —
`user.joined` (30) und `milestone.*` haben kein Objekt, wegmoderierte Objekte
sind weg. Ein Feed ist ein Strom: was vor dem Einschalten war, fehlt niemandem.
**Neue** Zeilen sind ab der ersten korrekt — `recordActivity()` stempelt seit
C1b `communityId` UND `Role.label(communityId)`.

**Beweise:** `packages/media/scripts/verify-pool-isolation.mjs` **14/14** (neu —
Galerie-Trennung, Zugriff per ID für PATCH/DELETE/`/file`, und der Gast-Abruf
der DATEI in beiden Richtungen) · `packages/activity/scripts/verify-pool-isolation.mjs`
**8/8** (neu — Server-Weg *und* Realtime-Weg mit einer echten Mitglieds-Sitzung,
dazu die Bestands-Messung) · `verify-audience-flip` **49/49** (war 38/38, um
media_items + Bucket `media` erweitert — der einzige Layer, der sich MIT
`bucket` in der C18-Registry anmeldet, und bis heute der einzige ungeprüfte) ·
`pnpm -r test` grün · beide `tenant-isolation.test.ts` **mit** Live-Env gefahren
(media 11/11, activity 5/5) · typecheck (platform, comments, photos) · lint
(0 Fehler, 6 bekannte Warnungen) · check:manifests · check:doc-links ·
check:single-copy.

**Migrations-Reihenfolge für Prod** steht in OPEN-ITEMS.md — sie ist der einzige
Teil, der nicht allein von hier aus geht: `media-001` legt als einzige Migration
des ganzen Repos einen **Bucket** an, und der Pool-Schlüssel hat heute keine
Storage-Rechte (F36).

**Gelernt:** **Ein Layer, der „pool-fähig gebaut" ist, ist nicht dasselbe wie
ein Layer, der im Pool läuft.** Beide waren technisch fertig — Spalten,
Datentür, Backstop, C18-Registry —, und trotzdem fehlten *sechs* Plan-Gates,
*drei* `planProduct`-Felder und die halbe F28-Route. Der Grund ist immer
derselbe: geprüft wurde gegen die Frage „ist der Datenzugriff dicht?", nicht
gegen „was sieht ein Kunde, der das Produkt nicht gekauft hat?". Zweite
Lektion, und sie ist unangenehmer: die env-gated Integrationstests
(`tenant-isolation.test.ts`) waren seit dem `tenantId`→`communityId`-Rename
**falsch** — sie prüften eine Spalte, die es auf keiner Instanz mehr gibt. In
der CI standen sie als „skipped", also grün. Ein Test, der ohne Env
stillschweigend übersprungen wird, ist so lange kein Beweis, bis ihn jemand
**mit** Env fährt; genau dieselbe Fehlerklasse wie das `.catch(() => {})` aus
F37. Dritte Lektion, ganz praktisch: zwei Dev-Server derselben App liefen
parallel, der zweite hatte `--port 3006` bekommen und still auf 3000
zurückgeschaltet — der Nuxt-Lock zeigte dann „Dir: apps/platform, URL :3000".
Vor jedem Live-Beweis `lsof -nP -iTCP -sTCP:LISTEN` lesen, wie es in CLAUDE.md
steht.

## Paritäts-Audit 2026-08-02 — sieben Befunde aus dem Paket „Wächter und Vorlagen"

Alle sieben zuerst NACHGESTELLT, dann behoben. Was dabei auffiel, steht am Ende
unter **Gelernt**.

**Ein Moderator konnte die Instanz umstellen.** `PATCH /api/tickets/settings`
schreibt `app_config/global` — die EINE Einstellungszeile des Projekts —,
verlangte dafür aber `tickets.manage`, und das liegt im Moderator-Bündel
(`authz.ts`). Jeder andere `app_config`-Schreiber (`admin/config.patch`,
`admin/themes/settings.patch`, `admin/products/[key].patch`) verlangt
`system.manage`. Ein Moderator konnte damit das KI-Modell der ganzen Instanz
wechseln; jede folgende Triage lief auf Kosten des Betreibers über sein Modell.
Nachgestellt an der Rechte-Matrix (`hasCapability(['moderator'],
'tickets.manage') === true`, `system.manage === false`). Die Trennlinie ist
jetzt nicht „Ticket-Fläche vs. Rest", sondern WAS geschrieben wird: das Board
BEDIENEN bleibt `tickets.manage` (alle 20 anderen Routen inklusive
`settings.get`), die Instanz UMSTELLEN ist `system.manage`. Damit ein Moderator
den 403 nicht erst nach dem Klick sieht, liefert `settings.get` ein
`canEditModel`; das Modal blendet Speichern/Zurücksetzen aus und erklärt, warum.
Beweis: `packages/tickets/tests/route-guards.test.ts` (26/26) — die Ausnahme
steht als benannte Aufzählung `OPERATOR_ONLY` statt als Sonderfall im Code, und
ein zusätzlicher Test verlangt für JEDE Route, die `app_config` anfasst, den
Betreiber-Gate. Gegenprobe: alte Capability zurückgesetzt ⇒ Test rot.

**Der Bauplan hatte als einziger Layer keinen Wächter.** `packages/blueprint`
darf mehrere Produkt-Layer kennen — das ist sein Zweck. Verboten ist nicht das
Kennen, sondern das BESITZEN (kein `server/`, keine Tabellen, keine
Produkt-Logik). Nachgestellt: eine `blueprint/server/api/probe.get.ts` mit rohem
`tablesDB` lief sauber durch `eslint .`. Neu greifen zwei Blöcke: kein
`appwrite`/`node-appwrite`-Import im ganzen Layer, und jede Datei unter
`blueprint/server/**`, `scripts/**`, `shared/**` bricht den Lint ab dem ersten
Zeichen (Selector `Program`) mit der Begründung im Text. Geschützt wird damit
die Zusage „Pool und Silo zeigen dasselbe": eigener Datenzugriff im Bauplan wäre
Verhalten, das es nur in Apps MIT blueprint gibt.

**Die Layer-Liste im ESLint war handgepflegt und deshalb falsch.** Sie führte
`feed` (existiert seit dem posts-Rename nicht mehr) und kannte `pages`, `media`,
`activity`, `onboarding`, `control` und `blueprint` nicht — sechs Layer ganz
ohne Import-Backstop, nachgestellt mit je einer Probe-Verletzung, die vorher
niemand meldete. Die Liste wird jetzt aus `packages/` GELESEN und in drei Töpfe
sortiert (`FOUNDATION` / `SEAM` / `PRODUCTS`); ein Layer ohne Topf bricht den
Lint sofort mit Klartext („ohne Topf: …"). Statt einer Verbotsliste steht in
jedem Block, was ERLAUBT ist (`otherLayers([…])`) — die Sperre ergibt sich
daraus. Die bestehenden Nähte sind benannt geblieben: `feedback → control`
(E10), `onboarding`/`control → control, onboarding, pages, themes`. Beweis: je
eine Probe-Verletzung pro neuem Block (blueprint-server, blueprint-appwrite,
pages, media, activity, onboarding, control, core, Topf-Drift) — alle schlugen
an, danach zurückgebaut; `pnpm -r lint` unverändert 0 Fehler / 6 bekannte
Warnungen.

**Die Produkt-Bilanz wird jetzt gerechnet statt gepflegt.**
`docs/referenz/PRODUKT-BILANZ.md` war zu 7 von 12 Zeilen falsch — ausgerechnet
das Dokument, auf dem Davids Zusage „Pool = Silo" ruht: `events`/`courses`
galten als „nicht montiert" (laufen im Pool), `tickets`/`feedback` als
„Silo-only" (sind nach `control` gezogen), `media` als „eingefroren" (ist
pool-fertig), die „strukturelle Lücke" ist geschlossen, und `packages/community`
heißt gebaut `packages/blueprint`. **Entscheidung: beides.** Das alte Dokument
hat seine Aufgabe erfüllt (es begründet, warum es den Bauplan gibt, samt der
verworfenen Alternativen) und liegt als Protokoll in
`docs/archiv/PRODUKT-BILANZ-2026-07-27.md` — mit einem Kasten obenauf, der sagt,
dass es historisch ist. Unter dem alten Pfad steht jetzt eine ERZEUGTE Bilanz:
`node scripts/produkt-bilanz.mjs` (`pnpm bilanz`) liest die Site- und
Produkt-Manifeste, zählt in `server/api/**` die Routen hinter `tenantDb`, sucht
`communityId` in den Migrationen, liest das Tarif-Gate aus
`apps/platform/app/app.config.ts` und stellt fest, welche App-Seite eine
Layer-Seite verdeckt (heute: keine). `pnpm check:bilanz` ist das Gate dazu —
Neuerzeugen darf kein Diff geben, Muster `check:themes`.

**Die Kopiervorlage startete außerhalb der Zusage.** `apps/_template` zog
`comments` ohne `blueprint`. Nachgestellt: wer als Nächstes `posts` dazunimmt —
der offensichtliche zweite Schritt —, bekommt bei GRÜNEM `check:manifests` die
nackte `posts/app/pages/feed.vue` statt der komponierten Bauplan-Seite. Die
Vorlage führt jetzt `blueprint` samt seiner `requires` (posts, comments, events,
courses); wer kleiner will, streicht Produkte UND Bauplan gemeinsam, und
`check:manifests` erzwingt genau diese bewusste Entscheidung.

**Die Demo-Seite aus Phase 2 ist weg.** `apps/comments/app/pages/theme-check.vue`
war öffentlich auf dem Silo-Host erreichbar, ohne `noindex`, mit einem
SSR-`console.log` auf jedem Aufruf, und schrieb die App-Config in die Seite.
Anders als `visual.vue` (dokumentiert, `noindex`, Ziel der Themes-Visual-Suite)
hatte sie keinen Konsumenten: ihre Aufgabe war der einmalige Phase-2-Nachweis,
dass `app.config` App > Core mergt, und der steht in `GOALS.md`. Sie wie
`visual.vue` zu behandeln hieße, eine Seite zu dokumentieren und zu
noindexen, die niemand liest — also entfernt.

**Der Seed für die Rechtsseiten war pool-blind.**
`packages/pages/scripts/seed-demo.mjs` fragte die Existenz ohne `communityId` und
schrieb ohne Stempel. Nachgestellt gegen die Platform-Instanz: dieselbe Abfrage
für `home`/`en` liefert die Zeile der Community `t-demo` — auf einer
Pool-Instanz meldet der Seed also „existiert schon" wegen einer FREMDEN Seite,
und was doch angelegt wird, ist eine Waise mit `communityId: ''`. Das Skript
verlangt jetzt genau eine Angabe: `--community <id>` oder `--single-tenant`
(die ausdrückliche Wahl von `communityId: ''`, wie `scopeRowFor` sie im Silo
stempelt). Ein Default gibt es bewusst nicht — der falsche von beiden ist auf
einer Pool-Instanz nicht zu sehen, sondern nur zu merken. Beweis: drei
Abbruch-Fälle, dann ein echter Lauf gegen die Platform mit `--community
seedprobe` (6 Zeilen angelegt, zweiter Lauf 6× übersprungen, alle 6 mit Stempel,
danach aufgeräumt).

**Der N1-Beweis erwartete ein Menü, das E9 abgeschafft hat.**
`verify-dashboard-access.mjs` stand auf 28/30, weil Abschnitt 6 die
Operator-Module `/dashboard/system` und `/dashboard/users` im Menü eines
MANDANTEN-Hosts erwartete. Genau das hat E9 beendet („das Menü hört auf zu
lügen", 81ac8a93): `scopeVisibleAt` zeigt am Ort einer fremden Community nur
community-Module — auch dem Betreiber. Überholt war die Erwartung, nicht der
Code. Der Abschnitt prüft jetzt beides GETRENNT, weil es zwei Dinge sind: das
MENÜ (Ort) und der ZUGANG (Capability auf der Route) — kein Operator-Modul im
Menü des Mandanten-Hosts, aber `/dashboard/users` und `/api/admin/users` direkt
weiterhin 200, und als Gegenprobe zum Ort stehen dieselben Module auf dem
Kontroll-Host sehr wohl im Menü (sonst hieße der Befund nur „Modul
verschwunden"). Mitgenommen: der Kopf nannte einen Port, den es nicht mehr gibt
(3141 statt `PLATFORM_PORT`), ein Prüftext nannte die Tabelle `tenants` statt
`communities`, und die 429-Falle bei zwei Läufen kurz hintereinander steht jetzt
dort, wo man sie sucht. Ergebnis: **35/35** (aus 30 Prüfungen wurden 35, weil
zwei überholte durch acht schärfere ersetzt sind).

**Beweise:** tickets 26/26 (mit Gegenprobe rot) · verify-dashboard-access
**35/35** · seed-demo-Lauf gegen die Platform inkl. Aufräumen · 9
ESLint-Probe-Verletzungen, alle schlagen an · `pnpm -r test` grün (core 541,
gesamt unverändert) · typecheck 0 Fehler (inkl. `_template` mit den neuen
Layern) · `pnpm -r lint` 0 Fehler / 6 bekannte Warnungen · check:manifests ·
check:bilanz · check:doc-links · check:single-copy.

**Gelernt:** Ein Wächter, den man von Hand pflegt, wächst nicht mit — er
vergisst immer den zuletzt gebauten Fall. Das galt hier dreimal am selben Tag,
in drei Verkleidungen: die ESLint-Layer-Liste kannte die sechs jüngsten Layer
nicht und führte einen, den es nicht mehr gibt; die Produkt-Bilanz war fünf
Wochen nach ihrer Erstellung mehrheitlich falsch; der N1-Beweis hielt an einer
Menü-Regel fest, die zwei Tage vorher abgeschafft worden war. In allen drei
Fällen sah der Zustand GRÜN aus — die Liste lief durch, das Dokument las sich
schlüssig, das Skript meldete 28 Häkchen. Die Konsequenz ist überall dieselbe:
**die Wahrheit aus dem Code lesen statt sie danebenzuschreiben** (Layer aus
`packages/`, Bilanz aus den Manifesten, Erwartung aus der geltenden Regel) und
**Drift zum Fehler machen statt zur Fußnote** (unklassifizierter Layer bricht
den Lint, `check:bilanz` bricht bei jedem Diff). Zweite Lektion, kleiner, aber
teurer: eine Vorlage ist eine Entscheidung, die man n-mal trifft, ohne sie noch
einmal zu prüfen — `apps/_template` ohne Bauplan hätte jede künftige App still
neben die Zusage „Pool = Silo" gesetzt, und die Falle schnappte erst beim
ZWEITEN Produkt zu, wo niemand mehr an die Vorlage denkt.

### F38 — Storage-Rechte im Pool, media/activity in Produktion ✅ 2026-08-03

Über die Appwrite-Console erledigt (David hatte den Browser-Weg ausdrücklich
freigegeben). Befund beim Nachsehen: der **Migrations**-Schlüssel hatte
`buckets.read/write` bereits, es fehlten nur `files.read/write` — ergänzt
(12 → 14 Scopes). Der **Laufzeit**-Schlüssel hatte `files.read/write` schon
und bewusst KEINE Bucket-Rechte; dort wurde nichts geändert. Die frühere
Fehlermeldung „missing buckets.read" kam daher, dass die Migration
versuchsweise mit dem Laufzeit-Schlüssel lief — kein Rechte-Loch, ein
falscher Schlüssel.

Danach in Produktion gefahren: `events-009` + `events-010` (pool und
comments, je 0 Zeilen — beide Instanzen haben keine Termine mit Bild) und
`media-001…005` auf pool (Tabelle, Bucket mit fileSecurity, Indizes,
communityId, Alt-Spalte weg). Live gegengeprüft: `/api/media` 200 auf der
pro-Community, `/api/activity` 401 (Produkt enthalten, Session fehlt).

**Gelernt:** Bevor man Rechte erweitert, erst nachsehen, welche schon da
sind — die Hälfte der angeforderten Scopes existierte, und der eine
„fehlende" war in Wahrheit der falsche Schlüssel im Aufruf. Ein
Laufzeit-Schlüssel bekommt keine Bucket-Rechte, auch nicht „der
Einfachheit halber".

### E1 — tote Schlüsseldatei gelöscht ✅ 2026-08-03

`apps/control/.env.production` zeigte auf das gelöschte Projekt `studio`
(nachgeprüft: `NUXT_PUBLIC_APPWRITE_PROJECT_ID=studio`), lag nur auf Davids
Rechner und war nie im Repo. Auf Davids Zuruf gelöscht.

**Reihenfolge, die zählt:** vorher die zwei noch LEBENDEN Verweise korrigiert
— der Kopf von `packages/pages/scripts/seed-demo.mjs` nannte die Datei als
Aufruf-Beispiel, und `docs/runbooks/DEPLOYMENT.md` warnte zwar davor, nannte
sie aber weiter. Wer eine Datei löscht, ohne die Wegweiser umzustellen,
verschiebt das Problem nur von „falsche Datei" zu „Datei fehlt".

**Gelernt:** Vor dem Löschen greppen, wer noch darauf zeigt — und die
Warnung im Runbook in eine Feststellung umschreiben („ist gelöscht; taucht
sie wieder auf, ist sie falsch"), statt sie stehen zu lassen. Eine Warnung
vor etwas Nicht-mehr-Existierendem verwirrt beim nächsten Lesen.

### E4 · B1 · E3 — drei Zeilen geschlossen, eine davon war längst erledigt ✅ 2026-08-03

**E4 (Nur-Lese-Schlüssel im Projekt `control`) war bereits gebaut** — die Zeile
war veraltet, wie heute schon mehrere. In der Console liegt „platform read-only
(tenants/site_members)" mit genau EINEM Lese-Scope, zuletzt vor einer Stunde
benutzt; im Code hängt er als `NUXT_PLATFORM_CONTROL_KEY` am
Mandanten-Resolver (`apps/platform/server/plugins/tenant-resolver.ts:33`).
Ich habe deshalb KEINEN zweiten angelegt. **Gelernt:** vor dem Anlegen
nachsehen, ob es das Ding schon gibt — ein zweiter Schlüssel mit demselben
Zweck ist kein erledigter Punkt, sondern eine zusätzliche Angriffsfläche.
Beim Nachsehen fiel ein 84-Scope-Schlüssel auf (→ F42).

**B1 (neun Referenzbilder) gesichtet.** Kein DevTools-Abzeichen mehr, echte
Texte statt roher Schlüssel, Themes greifen sichtbar (default neutral-schwarz,
midnight blau-violett). Die Sachaussage im Bild („9 Neutral-Töne") gegen die
Registry geprüft: stimmt exakt (NEUTRAL_REGISTRY hat neun Einträge). Keine
Auffälligkeit, die einen Neu-Bake rechtfertigt.

**E3 (Server-Größe) geschlossen** mit dem Messergebnis vom 2026-08-02 als
Entscheidung: kein Rescale. 1,0 von 3,7 GB belegt, Swap unberührt, Last 0,00,
Platte 29 %, null OOM in 30 Tagen. Die Maschine ist ein CX22, nicht der
angenommene CX33 — und die CI baut auf dem Runner, nicht auf dem Server.

### F41 — der Layer-Wächter greift jetzt wirklich ✅ 2026-08-02

**Der Befund.** `eslint.config.mjs` verbot Cross-Layer-Importe über
`no-restricted-imports` — aber `no-restricted-imports` vergleicht den
SPEZIFIZIERER-TEXT, und alle Muster lauteten `@pukalani/<layer>`. Im gesamten
Repo gibt es **null** solcher Importe. Sämtliche 244 realen Cross-Layer-Importe
sind relativ. Der Backstop schützte also ausschließlich hypothetische Fälle,
und zwar seit es ihn gibt.

**DIE LANDKARTE, die bisher niemand hatte** (244 relative Cross-Layer-Importe,
aufgelöst statt gegriffen — Quelle: Resolver-Skript über `packages/**`):

*Echte Layer-zu-Layer-Kanten (50) — alles außer core und Repo-Wurzel:*

| Kante | Anz. | Beispiel | Urteil |
| --- | --- | --- | --- |
| feedback → control | 20 | `control/shared/customerFeedback` (16), `control/schemas/customerFeedback` (4) | Naht 1, gesegnet (E10) |
| onboarding → control | 20 | `control/shared/onboarding` (6), `myCommunities` (4), `communityTeam` (3), `abuseReports` (2), `schemas/tenant` (2), `schemas/onboarding` (2) | Naht 2, gesegnet |
| onboarding → pages | 2 | `pages/server/utils/seedHomePage`, `…/seedLegalPages` | Naht 2, gesegnet |
| onboarding → themes | 1 | `themes/shared/builtinThemes` | Naht 2, gesegnet |
| control → themes | 2 | `themes/shared/builtinThemes`, `themes/app/utils/themeRegistry.gen` | Naht 3, gesegnet |
| control → pages | 1 | `scripts/backfill-legal-templates.mjs` → `pages/shared/legalTemplates.ts` | **war nicht in der Liste**, aber von der Regel längst erlaubt |
| control → events | 1 | `scripts/verify-audience-flip.mjs` → `events/shared/coverAudience.ts` | **FUND** — nirgends gesegnet |
| blueprint → events | 1 | `events/shared/types/event` | Naht 4, gesegnet |
| blueprint → pages | 1 | `pages/shared/types/page` | Naht 4, gesegnet |
| admin → system | 1 | Test → `system/server/utils/userDataContributor` | Fundament↔Fundament, erlaubt |

*Die anderen 194, bewusst nicht „Cross-Layer" im Sinne von A14:* **121 × → core**
(alle 17 Layer; jeder zieht mindestens `core/shared/types/manifest` als Typ —
Spitzenreiter control 38, admin 26) und **73 × → Repo-Wurzel**, davon 71 auf
`scripts/migrations-lib/indexRetry.mts` und 2 auf `functions/changelog-draft`.
Letztere fallen gar nicht erst in den Geltungsbereich: das ist geteiltes
Werkzeug, kein Layer.

**Die vier gesegneten Nähte am Code nachgeprüft:** alle vier existieren und
stimmen. Zwei Korrekturen an der Liste — `control → pages` fehlte darin
(Backfill-Skript; die Regel erlaubte es ohnehin schon, die Liste war
unvollständig, nicht die Regel), und `control → events` ist eine fünfte Kante,
die in keiner Segnung steht.

**Die Regelform — und warum Regex hier beweisbar falsch ist.** Naheliegend wäre
gewesen, die relativen Pfade textlich zu prüfen. In diesem Repo geht das nicht:
**jeder Layer-Name existiert auch als Unterordner.** `app/pages` gibt es in
allen 18 Layern, dazu `server/api/admin`, `server/api/comments`,
`app/components/core`, `public/themes`. Ein Muster auf das Segment `pages` kann
nicht unterscheiden, ob `../../pages/x` den LAYER `pages` meint oder den Ordner
`app/pages` derselben Datei — die Zahl der `../` hängt an der Tiefe der
Quelldatei und ist im Selektor nicht bekannt. Gebaut wurde deshalb eine eigene
Regel `pukalani/no-cross-layer-relative` (Inline-Plugin in `eslint.config.mjs`),
die den Pfad mit `path.resolve` WIRKLICH auflöst. Nebenwirkung, die man sonst
von Hand hätte bauen müssen: der Selbst-Import eines Layers ist automatisch
erlaubt, egal wie tief verschachtelt, und die Repo-Wurzel fällt von selbst raus.
Die Erlaubnislisten stehen in denselben Blöcken wie ihre
`@pukalani/*`-Gegenstücke — eine Grenze ist an EINER Stelle beschrieben, nicht
an zweien.

**Beweismatrix** (Probe-Dateien, danach zurückgebaut). Angeschlagen: posts →
comments · themes → core als WERT · moderation → comments (Fundament nach
unten) · blueprint → control. Durchgegangen: posts → core · Selbst-Import über
`../../../shared/…` · `comments/app/__x.ts` → `../pages/…` (die
Ordner-Namenskollision, an der ein Regex gescheitert wäre) · themes → core als
TYP · blueprint → posts. Dass die „muss durchgehen"-Proben nicht bloß
übersprungen wurden, ist eigens belegt: mit einem `debugger` darin meldete
ESLint jedes Mal `no-debugger` — die Dateien wurden also gelintet und die
Layer-Regel schwieg bewusst.

**Zwei bestehende Importe wurden rot — beide blieben rot und stehen jetzt als
begründete Einzelausnahme IM CODE**, statt die Regel aufzuweichen (das Muster,
das CLAUDE.md für eventlose Sweeps schon vorschreibt): `control/scripts/
verify-audience-flip.mjs` (Beweis-Skript, das die ECHTE Regel beider Seiten
importieren MUSS — eine Nachbildung liefe still auseinander und der Beweis wäre
wertlos) und `themes/tests/themeSelection.test.ts` (Testnaht auf den echten
`mirrorRowToBranding`). Der dritte Fall, `themes/product.manifest.ts`, ist keine
Ausnahme, sondern eine Option: `allowTypeFrom: ['core']`. CLAUDE.md verlangt von
JEDEM Layer ein Manifest mit `import type { ProductManifest }` — auch von
`themes`, das sonst gar nichts aus core kennen darf. Werte aus core bleiben dort
verboten.

**Gelernt:** Ein Wächter, der nie anschlägt, sieht genauso grün aus wie einer,
der funktioniert — und beide Zustände sind aus dem Lint-Ergebnis nicht zu
unterscheiden. Der einzige Beleg ist die **Probe-Verletzung**: eine Datei, die
kaputt sein MUSS. Diese Regel gehört ab jetzt zu jedem neuen Backstop, sonst
schreibt man Konfiguration, die niemand je ausgelöst hat. Zweitens: bevor man
Importe textlich prüft, erst nachsehen, ob die Layer-Namen auch als Ordnernamen
vorkommen — hier taten es ALLE 18, ein Regex wäre entweder löchrig oder voller
Fehlalarme geworden. Drittens: das Inventar zuerst zu ziehen war das eigentlich
Wertvolle. Ohne die aufgelöste Landkarte hätte niemand gemerkt, dass die
„vier gesegneten Nähte" in Wahrheit fünf Kanten sind.

### Zwei Kleinigkeiten — eine gefixt, eine nachgemessen ✅ 2026-08-03

**Mediathek: die Bremse log den Kunden an.** Der Upload fing jeden Fehler mit
einem nackten `catch` und zeigte immer „JPEG, PNG und WebP bis 15 MB — größere
Bilder vorher verkleinern". Seit den Kontingent-Zahlen von heute gibt es einen
ZWEITEN Grund, und der Kunde bekam den Rat zu verkleinern, während in Wahrheit
sein Tarif voll war — ein Rat, der beliebig oft scheitert. Die Anzeige liest
jetzt den `reason` aus dem Envelope (den der Server seit heute mitschickt) und
unterscheidet „Tarif voll" von „für heute erreicht", je mit dem passenden Weg.

**Zahlungswarnung: der Verdacht war richtig und die Lage schlimmer.** Gemeldet
war „die Glocke bleibt vermutlich leer". Nachgemessen (Pool-Nutzer-Id gegen das
control-Projekt: 404 `user_not_found`) gilt: `metadata.userId` eines
Community-Abos ist eine Pool-Id, der Webhook läuft auf control. Die
Glocken-Zeile bekommt dort `read(user:<pool-id>)` — unlesbar für jeden. UND
`maybeSendInstantEmail` schlägt denselben Nutzer nach, bekommt 404 und bricht
still ab. Es kommt also über KEINEN Kanal etwas an, während der M13-Sweep nach
14 Tagen die Community auf nur-lesend setzt.

Nicht repariert, sondern LAUT gemacht: fehlt der Empfänger, schreibt der
Webhook jetzt `billing.notify_recipient_missing` als Fehler. Die Zustellung
selbst war eine Entscheidung (Kontobereich oder Community-Glocke — C15/C17) und
lag als **F43** bei David — sie ist am 2026-08-03 gefallen und gebaut: die
Warnung eines COMMUNITY-Abos landet in der Community-Glocke, geschrieben vom
Pool (siehe den F43-Eintrag oben).

**Gelernt:** „vermutlich leer" ist keine Diagnose. Der zweite Kanal (E-Mail) war
in der ursprünglichen Meldung gar nicht geprüft — und genau er hätte den Fall
harmlos gemacht. Und: zwei ineinandergreifende `.catch(() => null)` können aus
einem Ausfall im GELDPFAD ein Ereignis machen, das nirgends auftaucht.

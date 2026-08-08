# Runbook: erste echte Kundendomain freischalten

**Wozu.** Eigene Domains sind vollständig gebaut und lokal bis `active`
bewiesen — für POOL-Communities (control-035) und für SILO-Sites
(control-036). Lokal nicht herstellbar ist genau eine Sache: **ploi legt den
vHost/Alias an und Let's Encrypt stellt das Zertifikat aus.** Dieses Runbook
ist der eine Durchlauf, der das nachholt. Danach ist der Weg Selbstbedienung
und braucht kein Runbook mehr.

> **Der ERSTE echte Fall ist ein SILO**, nicht eine Community:
> `portfolio.pukalani.app` → `www.pukalani.studio` (www kanonisch, der Apex
> leitet dorthin um). Dafür ist **Teil B** unten da. Teil A beschreibt den
> Pool-Fall und bleibt für die erste Kunden-Community stehen.
>
> Der Unterschied ist nicht kosmetisch: ein Silo bekommt einen **Alias an
> seiner eigenen ploi-Site** und **ein Zertifikat über alle Namen der Site**,
> eine Pool-Community einen **ploi-Tenant** an `platform.pukalani.app`.

> ## ⚠️ Der Erstlauf IST GELAUFEN — 2026-08-08
>
> `www.pukalani.studio` liegt, das Zertifikat trägt alle drei Namen, die
> Origin-Proben antworten 401. Teil B unten ist deshalb keine Vorschau mehr,
> sondern das **Ist-Protokoll** — mit vier echten Fehlern, von denen keiner
> lokal sichtbar war. Die Häkchen sind entsprechend nachgezogen.
>
> | # | Was schiefging | Fix |
> | --- | --- | --- |
> | 1 | Die Projects-API verlangt einen Scope, den die Produktions-Keys nicht haben (`401 general_unauthorized_scope`) — der letzte Schritt scheiterte in Produktion **immer**. Lokal lief er mit einem Dev-Key mit allen Scopes. | Erfolg wird über die **schlüssellose Origin-Probe** gemessen; eintragen wird nur noch versucht. |
> | 2 | Nach einem Fehlschlag wurde das Zertifikat nicht mehr nachbestellt — Silo- und Tenant-Pfad lasen die ploi-Liste unterschiedlich. | **Eine** Regel (`certificateOrderDecision`): kein deckender Eintrag ⇒ bestellen, bei jedem Prüf-Klick. |
> | 3 | **ploi's Alias-API pflegt den Port-80-Block nicht.** Der neue Name fällt dort in den 444-Catch-all, HTTP-01 kann nicht ankommen. | **Preflight** vor jeder Bestellung; ohne Antwort auf Port 80 wird nichts bestellt, dafür steht der Handgriff im Status. |
> | 4 | **Ein gescheiterter Antrag LÖSCHT die bestehende Zertifikats-Linie der Site.** `portfolio.pukalani.app` lief danach nur noch aus dem nginx-Arbeitsspeicher; jeder Reload scheiterte still, ein Neustart hätte die Site vom Netz genommen. | Der Preflight aus (3) ist die Absicherung. Wiederherstellung: **B7**. |
>
> Offen ist nur noch der Abschluss: Status steht auf `pending_platform`, die
> kanonischen Umleitungen sind deshalb aus. Was zu klicken ist, steht in **B4**.

Die Häkchen hier sind ECHT und werden pro Durchlauf abgehakt.

---

# Teil A — Pool-Community (control-035)

---

## 0. Was vorher stimmen muss

- [ ] **Migration `control-035` ist auf der Control-Plane-Instanz gefahren.**
      `pnpm migrate --app control --layer control`
      Sie muss **vor** dem Code-Deploy laufen: `createRow<TenantRow>` nennt alle
      Spalten explizit, und ohne sie bricht das Anlegen JEDER neuen Community.
- [ ] Danach `pnpm ops:schema-parity` — sie berührt nur `communities` im
      Control Plane, aber der Lauf kostet nichts und deckt Abweichungen auf.
- [ ] Code deployt (control **und** platform — beide Seiten der Naht).
- [ ] Env auf der **control**-Site gesetzt (`ops:site-env` zeigt nur Namen):
      `NUXT_PLOI_TOKEN`, `NUXT_PLOI_SERVER_ID`, `NUXT_PLOI_SITE_ID`.
      Heute: Server `app-prod` = **118713**, Site `platform.pukalani.app` =
      **391312**. `NUXT_CUSTOM_DOMAIN_DRY_RUN` bleibt **leer**.
- [ ] Die Community, die die Domain bekommt, hat Plan **pro**. Ohne ihn
      antwortet die Route 403 `plan_required` — das ist Absicht, keine Störung.

---

## 1. Der Kunde legt seine DNS-Einträge an

Er sieht sie unter `/dashboard/community/domain` auf **seiner** Community. Zum
Mitlesen (`beispiel.de` als eingetragene Form):

| Typ | Name | Wert |
| --- | --- | --- |
| TXT | `_pukalani-verify.beispiel.de` | `pukalani-domain-verify=<token>` |
| A | `beispiel.de` | `49.13.211.173` |
| CNAME | `www.beispiel.de` | `platform.pukalani.app` |

- [ ] Von einem fremden Rechner nachgemessen (nicht vom Server — dessen
      Resolver kann anders cachen):
      `dig +short TXT _pukalani-verify.beispiel.de @1.1.1.1`
      `dig +short A beispiel.de @1.1.1.1`
- [ ] Der TXT-Wert trägt **das Token dieser Community**. Ein Token einer anderen
      Community gilt nicht — genau daran hängt, dass niemand eine fremde Domain
      übernehmen kann.

> Trägt der Kunde eine Domain mit **drei** Labels ein, die trotzdem ein Apex ist
> (`beispiel.co.uk`), bildet das System kein www-Paar. Der Weg dorthin ist, die
> **www-Form** einzutragen (`www.beispiel.co.uk`) — dann kommt `beispiel.co.uk`
> als Geschwister dazu. Bewusste Grenze: ohne Public-Suffix-Liste wäre alles
> andere geraten.

---

## 2. Der Kunde drückt „Prüfen"

Der Knopf ist re-entrant — beliebig oft drückbar, kommt jedes Mal so weit wie
möglich.

- [ ] Status springt von `pending_dns` auf `pending_cert`.
- [ ] **Im ploi-Panel** (Site `platform.pukalani.app` → Tenants) stehen jetzt
      beide Formen als Tenants.
- [ ] Ein Zertifikat wurde je Form angefordert. Das dauert Sekunden bis
      Minuten; ploi arbeitet den Job asynchron ab.

**Wenn es hier hängt**, steht der Grund im Dashboard des Kunden (`customDomainError`).
Die drei realistischen Fälle:

| Text | Bedeutung | Was tun |
| --- | --- | --- |
| „ploi ist nicht konfiguriert" | Token/Ids fehlen auf der control-Site | Env setzen, control neu starten |
| `ploi 4xx: …` | ploi lehnt ab (Domain schon Tenant einer anderen Site?) | im Panel nachsehen |
| „Zertifikat noch nicht aktiv" | Let's Encrypt ist noch nicht fertig | eine Minute warten, wieder „Prüfen" |

- [ ] **NICHT** tun: ein Zertifikat auf der **Site** `pukalani.app` oder
      `platform.pukalani.app` anfordern. Das überschreibt die Wildcard-Lineage
      und legt platform + demo + jeden Mandanten lahm (schon einmal 40 min
      passiert, CLAUDE.md). Kundendomains sind **Tenants** und haben eigene
      Lineages.

---

## 3. Freischaltung

- [ ] Nächster „Prüfen"-Klick: Status geht über `pending_platform` auf `active`.
- [ ] **Appwrite-Web-Platform** (F45) ist im **Pool**-Projekt angelegt — für
      beide Formen. **Seit 2026-08-08 (Befund 1 des Silo-Erstlaufs) entscheidet
      nicht mehr, ob wir sie eintragen KONNTEN:** die Projects-API verlangt
      einen Scope, den die Produktions-Keys nicht haben. Eingetragen wird
      versucht, gemessen wird die schlüssellose Origin-Probe — geht das
      Eintragen nicht, legt man die beiden Formen in der Appwrite-Konsole des
      Pool-Projekts an und drückt erneut „Prüfen".
      Nachmessen, denn der WebSocket-Handschlag verrät nichts
      (er antwortet 101 auch für einen abgewiesenen Origin):

      curl -s -o /dev/null -w "%{http_code}\n" \
        -H "Origin: https://beispiel.de" \
        -H "X-Appwrite-Project: pool" \
        https://<appwrite>/v1/account

      **401 = Origin akzeptiert. 403 = Host unbekannt** (dann fehlt der Eintrag).
      Wer stattdessen den Socket mitlesen will, braucht `--http1.1`.

- [ ] `https://beispiel.de/` antwortet **200** (kein Zertifikats-Warnschild).
- [ ] `https://www.beispiel.de/` antwortet **301** auf die eingetragene Form.
- [ ] Die Pukalani-Subdomain antwortet **301** auf die eigene Domain, mit Pfad
      und Query.
- [ ] `node scripts/ops/verify-tls.mjs` — der Wächter darf durch den neuen
      Tenant **nicht** rot werden.

---

## 4. Was dem Kunden vorher gesagt sein muss

- [ ] **Er muss sich auf der neuen Adresse neu anmelden.** Das Session-Cookie
      hängt am Host; es gibt keinen Weg, es auf eine fremde Domain
      mitzunehmen, und den sollte es auch nicht geben.
- [ ] Suchmaschinen brauchen Tage bis Wochen, bis die neue Adresse überall
      steht. `canonical`/`og:url` zeigen ab sofort richtig (die Platform-App
      rechnet sie aus dem Request-Host, `pukalani.seo.originFromRequest`).
- [ ] Die Subdomain **bleibt** als Rückfall bestehen — sie leitet nur um.
      Die Umleitung geht mit `Cache-Control: no-store` raus, damit ein
      späteres Abgeben der Domain nicht an gemerkten 301 hängen bleibt.
      Vollständig verhindern lässt sich das nicht: manche Browser merken sich
      einen 301 trotzdem. Wenn ein Kunde nach dem Abgeben „meine Adresse geht
      nicht mehr" meldet, ist ein hart geladener Reload (bzw. das Leeren des
      Verlaufs) die erste Frage.
- [ ] **Live-Aktualisierung auf Kundendomains ist teilweise eingeschränkt, und
      das bleibt so.** Row-Streams, Presence und Live-Theme laufen (sie hängen
      am JWT-Socket). Der KONTO-Socket (`useRealtimeAccount`) ist bewusst
      cookie-nativ — daran hängt die Sofort-Abmeldung bei Session-Widerruf, und
      CLAUDE.md verbietet die Konsolidierung auf JWT ausdrücklich. Auf einer
      Kundendomain fällt er auf den 30-s-Poll zurück. Das ist eine bekannte
      Grenze, kein Fehler.

---

## 5. Zurücknehmen (falls es schiefgeht)

- [ ] Im Dashboard „Domain entfernen". Das leert die Zeile **zuerst** — danach
      löst die Adresse bei uns nicht mehr auf und die Subdomain hört sofort auf
      umzuleiten (≤30 s Resolver-Cache).
- [ ] Aufräumen läuft fail-soft hinterher: ploi-Tenants (Control Plane),
      Appwrite-Web-Platforms (Platform-App). Bleibt etwas liegen, ist es
      Hausarbeit — im ploi-Panel bzw. in der Appwrite-Konsole löschen.
- [ ] Nichts an der `communities`-Zeile von Hand reparieren. Falls doch nötig:
      `customDomain=''`, `customDomainStatus='none'`, `customDomainToken=''`.

---

---

# Teil B — SILO-Site (control-036) · **der erste echte Fall**

`portfolio.pukalani.app` → `www.pukalani.studio`.

## B0. Was vorher stimmen muss

- [ ] **Migration `control-036` ist auf der Control-Plane-Instanz gefahren.**
      `pnpm migrate --app control --layer control`
      Acht additive Spalten an `websites` + zwei Indizes. Sie ist **nicht**
      deploy-kritisch wie control-035 (`websites`-Zeilen werden mit
      `{ ...body }` angelegt, nicht mit einer expliziten Spaltenliste) — vorher
      fahren ist trotzdem richtig, sonst antwortet die Domain-Verwaltung mit
      „unknown attribute".
- [ ] Code deployt: **control** UND **portfolio** (beide Seiten der Naht).
- [x] Auf der **portfolio**-Site gesetzt (`pnpm ops:site-env` zeigt nur Namen):
      `NUXT_ONBOARDING_CONTROL_URL` = `https://control.pukalani.app`,
      `NUXT_ONBOARDING_SERVICE_SECRET` = derselbe Wert wie
      `NUXT_CONTROL_ONBOARDING_SECRET` auf control.
      **Ohne beides passiert nichts Schlimmes** — die Site läuft weiter unter
      ihrer alten Adresse, es gibt nur keine eigene Domain (fail-soft).
      **Beim Erstlauf fehlten beide** und mussten mitten im Durchlauf
      serverseitig nachgetragen werden; genau weil es fail-soft ist, fiel es
      erst am 401 des Rückrufs auf. Seit 2026-08-08 stehen sie in der
      `.env.example` beider Silo-Apps und in der Pflicht-Liste von
      `pnpm ops:site-env` — **diesen Lauf vor dem nächsten Kunden machen.**
- [ ] Auf der **control**-Site: `NUXT_PLOI_TOKEN` (wie in Teil A).
      `NUXT_PLOI_SERVER_ID`/`NUXT_PLOI_SITE_ID` sind hier **egal** — für Silos
      kommen Server und Site aus der `websites`-Zeile.

## B1. ploi-Kennungen an der Website hinterlegen

`control.pukalani.app/dashboard/websites` → Zeile *portfolio* → Menü → **Eigene
Domain** → unten „Wo diese Site bei ploi wohnt".

- [ ] Server-Id **118713**, Site-Id **390041**, speichern.
      (comments wäre 389772 — für den Fall, dass als Nächstes der drankommt.)
- [ ] Ohne diese beiden hält der Ablauf mit „ploi ist für diese Website nicht
      hinterlegt" an. Das ist Absicht und keine Störung.

## B2. DNS anlegen

| Typ | Name | Wert |
| --- | --- | --- |
| TXT | `_pukalani-verify.pukalani.studio` | `pukalani-domain-verify=<token>` |
| A | `pukalani.studio` | `49.13.211.173` |
| CNAME | `www.pukalani.studio` | `platform.pukalani.app` |

Das Token steht im selben Kasten, in dem auch die Domain eingetragen wird.

- [ ] Eingetragen wird **`www.pukalani.studio`** — die eingetragene Form ist die
      kanonische, und `www` soll es laut Entscheidung sein. Der Apex kommt als
      Geschwister automatisch dazu und leitet um.
- [ ] Von einem fremden Rechner nachgemessen:
      `dig +short TXT _pukalani-verify.pukalani.studio @1.1.1.1`
      `dig +short A pukalani.studio @1.1.1.1`

## B3. Prüfen (der Knopf, beliebig oft)

- [x] `pending_dns` → `pending_cert`: **im ploi-Panel steht die Site
      `portfolio.pukalani.app` jetzt mit beiden neuen Namen als ALIAS.**
- [x] Ein Zertifikat wurde über **alle Namen der Site** angefordert —
      `portfolio.pukalani.app`, `www.pukalani.studio`, `pukalani.studio`.
      **Nachsehen, dass der alte Name dabei ist**: certbot ersetzt die Lineage
      durch die genannten Namen; fehlte er, verlöre `portfolio.pukalani.app`
      sein TLS.
- [x] Das ist **gefahrlos für das Kunden-Wildcard**: die Lineage der
      portfolio-Site heißt `portfolio.pukalani.app` und ist eine eigene
      (am 2026-08-07 an der ploi-API nachgemessen: ein Zertifikat, `tenant:
      false`). **Trotzdem gilt weiter:** niemals ein Zertifikat auf der Site
      `pukalani.app` oder `platform.pukalani.app` anfordern.
- [x] Wiederholtes Klicken ist ungefährlich: vor jeder Anforderung wird
      geprüft, ob ein Eintrag die Namensmenge schon deckt (Let's Encrypt lässt
      fünf identische pro Woche zu). **Und umgekehrt** (Befund 2): deckt KEINER
      sie ab, wird bei jedem Klick neu bestellt — ein Fehlschlag darf nicht
      dazu führen, dass der Knopf nur noch misst.

### ⚠️ B3a. Der Port-80-Block — Befund 3 des Erstlaufs

**ploi's Alias-API pflegt ihn nicht.** Ein Alias landet im `server_name` des
:443-vHosts; die HTTP-Umleitung steht in einer eigenen, root-eigenen Datei
(`/etc/nginx/ploi/<site>/before/ssl-redirect.conf`), die die API nicht
anfasst. Der neue Name fällt damit auf Port 80 in den 444-Catch-all — und
genau dort holt Let's Encrypt seine HTTP-01-Prüfung ab.

- [x] Seit 2026-08-08 läuft **vor jeder Bestellung ein Preflight**:
      `http://<name>/.well-known/acme-challenge/…` von außen. Antwortet er
      nicht, wird **nichts** bestellt und der Status trägt den Handgriff.
      Selbst nachmessen:

      curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 \
        http://www.pukalani.studio/.well-known/acme-challenge/probe

      **Jede Zahl ist gut** (404 heißt: nginx kennt den Namen). `000` heißt:
      Port 80 antwortet nicht — dann erst den Block reparieren.
- [x] Der Handgriff (beim Erstlauf über die ploi-nginx-config-API gemacht, der
      Block steht dort als Muster): in der **nginx-Hauptconfig der Site**
      (ploi → Site → Verwalte → nginx-Konfiguration) einen eigenen
      `server`-Block auf Port 80 mit allen Namen ergänzen, der
      `/.well-known/acme-challenge/` aus dem webroot ausliefert und sonst auf
      https umleitet. **Nicht** die `before/ssl-redirect.conf` bearbeiten —
      die gehört root und ploi schreibt sie neu.

### ☠️ B3b. Wenn eine Bestellung trotzdem scheitert — Befund 4

**Ein gescheiterter Antrag löscht die BESTEHENDE Zertifikats-Linie der Site.**
certbot/ploi räumt `/etc/letsencrypt/live/<site>/` weg. Die Site läuft danach
aus dem nginx-Arbeitsspeicher weiter — sie sieht **völlig gesund** aus, aber
jeder Reload scheitert still (`[emerg] cannot load certificate`) und der
nächste Neustart nimmt sie vom Netz. Das Rezept steht in **B7**.

## B4. Freischaltung — **der offene Rest des Erstlaufs**

> **Stand 2026-08-08:** Zertifikat liegt, Proben antworten 401, Status steht
> auf `pending_platform`. Der Abschluss ist EIN Klick — aber erst **nach dem
> Deploy** von control + portfolio mit den Fixes dieses Pakets. Vorher
> scheitert er weiter am Scope (Befund 1).
>
> **Was zu tun ist, in dieser Reihenfolge:**
> 1. `control` **und** `portfolio` deployen (beide Seiten der Naht).
> 2. `control.pukalani.app/dashboard/websites` → Zeile *portfolio* → Menü →
>    **Eigene Domain** → **„Prüfen"**.
> 3. **Was herauskommen muss:** Status springt auf **`active`**, der
>    Fehlertext wird leer, `customDomainActivatedAt` bekommt einen Zeitstempel.
>    Danach antwortet `https://portfolio.pukalani.app/` mit **301** auf
>    `https://www.pukalani.studio/`.
> 4. Bleibt es bei `pending_platform`, steht jetzt der GRUND darin — und bei
>    einem fehlenden Origin auch der Handgriff („Appwrite-Konsole → Projekt … →
>    Settings → Platforms"). Ein `401 general_unauthorized_scope` allein darf
>    nicht mehr vorkommen: die Registrierung darf scheitern, solange die Probe
>    trägt.

- [x] Der letzte Schritt ist ein **Rückruf in die portfolio-App**
      (`POST /api/site/domain/settle`, Service-Secret) — sie legt die
      Appwrite-Web-Platform in IHREM Projekt an, weil das Control Plane dafür
      keinen Schlüssel hat.
- [x] **Seit 2026-08-08 misst sie dabei nicht mehr den EIGENEN Erfolg**
      (Befund 1): eingetragen wird versucht, gemessen wird die schlüssellose
      Origin-Probe. Stehen die Platforms schon — beim Portfolio von Hand
      angelegt —, ist das ein Erfolg, egal was die Projects-API sagt.
- [ ] Bleibt es bei `pending_platform`, steht der Grund im Fehlertext. Die
      häufigsten drei: der Origin fehlt wirklich (Handgriff steht in der
      Meldung), das Secret fehlt auf einer der beiden Seiten, oder die
      Site läuft noch auf altem Code („Die Site kennt den letzten Schritt
      nicht").
      **Zweiter Weg, der dasselbe tut:** im Dashboard der Site selbst
      (`/dashboard/community/domain`) auf „Prüfen" — dort hat der Betreiber ein
      Konto DIESES Projekts und die App erledigt den Schritt ohne Rückruf.
- [x] Origin-Gegenprobe (der Handschlag verrät nichts, er antwortet 101 auch
      für einen abgewiesenen Origin):

      curl -s -o /dev/null -w "%{http_code}\n" \
        -H "Origin: https://www.pukalani.studio" \
        -H "X-Appwrite-Project: portfolio-…" \
        https://<appwrite>/v1/account

      **401 = akzeptiert. 403 = Host unbekannt** (dann fehlt der Eintrag).
- [ ] `https://www.pukalani.studio/` antwortet **200**.
- [ ] `https://pukalani.studio/` antwortet **301** auf die www-Form.
- [ ] `https://portfolio.pukalani.app/` antwortet **301** auf die www-Form,
      mit Pfad und Query.
- [ ] `https://portfolio.pukalani.app/api/health` antwortet weiter **200** und
      leitet NICHT um — sonst meldet der Health-Sweep der Betreiber-Konsole
      „degraded".
- [ ] `node scripts/ops/verify-tls.mjs` — der Wächter darf nicht rot werden.

## B5. Was danach NICHT zu tun ist

- [ ] **Keine Env anfassen.** `NUXT_PUBLIC_I18N_BASE_URL` bleibt auf
      `https://portfolio.pukalani.app` stehen: die App rechnet canonical,
      hreflang und `og:url` seit control-036 aus dem REQUEST-Host
      (`pukalani.seo.originFromRequest`), aus der Env kommt nur noch das
      Schema. Das war der eine Handgriff, den es sonst gegeben hätte.
- [ ] Suchmaschinen brauchen Tage bis Wochen. `canonical` zeigt ab sofort
      richtig.
- [ ] Die alte Adresse **bleibt** als Rückfall und leitet nur um
      (`Cache-Control: no-store`; manche Browser merken sich einen 301
      trotzdem — bei „meine Adresse geht nicht mehr" ist ein harter Reload die
      erste Frage).

## B6. Zurücknehmen

- [ ] Im Dashboard der Site **oder** in der Betreiber-Konsole „Domain
      entfernen". Die Zeile wird zuerst geleert; danach leitet die alte Adresse
      in ≤30 s nicht mehr um.
- [ ] **Über die Betreiber-Konsole bleiben die Appwrite-Web-Platforms der Site
      liegen** (das Control Plane hat dort keinen Schlüssel) — in der
      Appwrite-Konsole des Site-Projekts löschen. Über das Dashboard der Site
      räumt sie die App selbst ab.
- [ ] Der ploi-Alias wird entfernt; scheitert das, steht es in der Antwort
      (`cleanupError`) **und** es ist wichtig: eine Silo-App hat keine
      Mandanten-Tür, sie würde unter der abgegebenen Adresse weiter Inhalte
      ausliefern, solange der Alias steht.

## ☠️ B7. Notfall: die Zertifikats-Linie der Site ist weg

Auslöser: eine **gescheiterte** Zertifikatsbestellung für die Site. Symptom:
die Site antwortet noch (nginx hält das alte Zertifikat im Arbeitsspeicher),
aber `/etc/letsencrypt/live/<site>/` ist leer oder fehlt und jeder
`nginx -t` / Reload meldet `[emerg] cannot load certificate`. **Der nächste
Neustart nimmt die Site vom Netz.** Nicht warten.

1. **Feststellen, ob es zutrifft** — beides auf dem Server:

       sudo ls -la /etc/letsencrypt/live/portfolio.pukalani.app/
       sudo nginx -t

   Fehlt das Verzeichnis und meldet `nginx -t` `cannot load certificate`,
   liegt der Fall vor.

2. **NICHT** noch einmal denselben Mehr-Namen-Antrag stellen. Er scheitert aus
   demselben Grund und ändert nichts zum Besseren.

3. **Erst den Grund beheben** — fast immer Port 80 (B3a). Preflight für JEDEN
   Namen, der ins Zertifikat soll:

       curl -s -o /dev/null -w "%{http_code} " --max-time 5 \
         http://<name>/.well-known/acme-challenge/probe

   Erst weiter, wenn keine `000` mehr dabei ist.

4. **Einzel-Namen-Antrag zuerst.** Ein Zertifikat NUR für die Site-Domain
   (`portfolio.pukalani.app`) über ploi anfordern. Das stellt die Lineage unter
   ihrem alten Namen wieder her und heilt den nächsten Reload — und es ist der
   Antrag mit der geringsten Chance zu scheitern, weil dieser Name auf Port 80
   sicher antwortet.

5. `sudo nginx -t && sudo systemctl reload nginx` — muss jetzt sauber sein.

6. **Danach** den vollen Antrag über alle Namen (Site-Domain zuerst) — oder
   einfach wieder „Prüfen" drücken, der Ablauf macht genau das.

**Zeitbudget beachten:** Let's Encrypt lässt fünf identische Zertifikate pro
Woche zu. Jeder gescheiterte Versuch mit derselben Namensmenge zählt. Nach dem
dritten Fehlschlag aufhören und erst die Ursache messen.

---

## Was lokal schon bewiesen ist (damit man es hier nicht wiederholt)

`packages/onboarding/scripts/verify-custom-domain.mjs` — **46/46**, gefahren am
2026-08-07 gegen zwei eigene Dev-Server (control :3014, platform :3016) im
Trockenlauf. Bewiesen: Host-Auflösung über beide Formen, 301/308 mit Pfad und
Query, keine Umleitungsschleife, Plan-Gate server-seitig (403 `plan_required`),
Ablehnung von `*.pukalani.app`, Eindeutigkeit über das Formen-PAAR (409),
DNS-Prüfung gegen echte öffentliche Records in beiden Richtungen, abuse-Sperre
auf allen Hosts, und die volle Kette bis `active` inklusive
Appwrite-Web-Platform mit Origin-Gegenprobe (403 → 401).

Der Beweis ist selbst gegengeprobt: eine Mutation am Resolver macht genau die
Abschnitte rot, die die eigene Domain messen.

`packages/control/scripts/verify-silo-domain.mjs` — **35/35**, gefahren am
2026-08-07 gegen drei eigene Dev-Server (control :3024, comments :3026,
portfolio :3027 mit ABSICHTLICH toter Naht). Bewiesen: Host-Annahme der
Silo-App, 301 mit Pfad und Query plus `no-store`, 308 für POST, keine
Umleitung für einen fremden Host, `/api/health`, `/.well-known/` und Nuxts
Fehlerseiten-Durchgang, keine Umleitung einer WARTENDEN Domain (die
HTTP-01-Bedingung), Fail-soft am zweiten Silo, die Naht-Grenze von `settle`
(404/401), die Betreiber-Konsole von „eintragen" bis „entfernen" und die volle
Kette bis `active` inklusive Rückruf und Appwrite-Web-Platform mit
Origin-Gegenprobe (403 → 401, und ein nie registrierter Host weiter 403).

Auch dieser Beweis ist gegengeprobt: lässt man `siteDomainAddress()` immer
`null` zurückgeben (also genau den Fail-soft-Fall), fällt er auf **30/35** —
rot sind exakt die fünf Prüfungen der Umleitung. Die Abschnitte „Grenzen"
und „Fail-soft" bleiben dabei grün, und das ist die ehrliche Lesart: sie
prüfen ABWESENHEIT und tragen nur zusammen mit dem Abschnitt, der die
Anwesenheit zeigt.

`packages/domains/scripts/verify-domain-settle.mjs` — **19/19**, gefahren am
2026-08-08 gegen eine echte Appwrite 1.9.6 und eine echte Silo-App (comments
:3026) mit einem **absichtlich scope-losen App-Schlüssel**, also im
Produktionsfall statt in der lokalen Idealwelt. Bewiesen: Naht-Grenze und
Zustands-Grenze von `settle`, der PORTFOLIO-FALL (`ok: true`, obwohl die
Registrierung am Schlüssel scheitert — die Origin-Probe trägt), die Gegenprobe
im selben Lauf (unbekannter Host bleibt liegen, mit Konsolen-Handgriff in der
Meldung) und dass eine einzige fehlende Form blockiert. Das Control Plane wird
dabei bewusst durch ein Doppel ersetzt; sein Weg ist oben bewiesen.

Auch dieser Beweis ist gegengeprobt: lässt man `interpretOriginProbe` die 401
nicht mehr als „akzeptiert" lesen, fällt er auf **17/19** — rot sind genau die
zwei Prüfungen, die an der Probe hängen.

**Was Let's Encrypt und ploi angeht, ist der Erstlauf gelaufen** (2026-08-08,
Protokoll oben). Offen bleibt nur der Abschluss-Klick nach dem Deploy — B4.

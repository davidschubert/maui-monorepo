# Runbook: erste echte Kundendomain freischalten

**Wozu.** Eigene Domains je Community (control-035, Davids Entscheidungen vom
2026-08-07) sind vollständig gebaut und lokal bis `active` bewiesen — mit einer
Ausnahme, die lokal nicht herstellbar ist: **ploi legt den nginx-vHost an und
Let's Encrypt stellt das Zertifikat aus.** Dieses Runbook ist der eine
Durchlauf, der das nachholt. Danach ist der Weg Selbstbedienung und braucht
kein Runbook mehr.

Die Häkchen hier sind ECHT und werden pro Durchlauf abgehakt.

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

Er sieht sie unter `/dashboard/settings/domain` auf **seiner** Community. Zum
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
      beide Formen. Nachmessen, denn der WebSocket-Handschlag verrät nichts
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

**Offen bleibt genau das, wofür dieses Runbook existiert: ploi + Let's Encrypt.**

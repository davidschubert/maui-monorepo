# SaaS-Roadmap: vom „Betriebssystem" zum verkaufbaren Produkt

> **Status:** Strategie + priorisierte Feature-Roadmap (2026-07-24), aus dem
> Ideen-Gespräch mit David. Ersetzt den verlorenen „10-Ideen"-Zettel. Querbezug:
> [PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md) ·
> [MULTI-SITE-PLATFORM-STRATEGIE.md](MULTI-SITE-PLATFORM-STRATEGIE.md) ·
> [HORIZONT-3-POOL-SILO-BLUEPRINT.md](HORIZONT-3-POOL-SILO-BLUEPRINT.md) ·
> [OPEN-ITEMS.md](../OPEN-ITEMS.md).

## Nordstern

> **Die schlanke, datenschutz-native Community-Plattform, die ein Solo-Maker
> in 60 Sekunden startet — nicht mit den Großen mithalten, sondern die
> unkomplizierte, faire, DSGVO-native Alternative sein.**

Heute: **Betriebssystem für eigene Sites ~98 %**, **verkaufbares SaaS ~75 %**.
Die Lücke ist NICHT Technik — es ist die **Selbstbedienungs-Schicht**: Fremde
müssen sich selbst registrieren, ihre Site selbst verwalten, ihren Verbrauch
sehen und selbst upgraden können. Diese Roadmap schließt genau das.

## Querschnitts-Thema (Davids Kern-Beobachtung)

> „Ich denke, wir müssen einige Bereiche neu sortieren und neu schärfen, damit
> alles aus UI-/UX-Sicht übersichtlicher und verständlicher wird."

Das Projekt ist über 40+ Phasen gewachsen; das **Dashboard braucht eine neue
Informationsarchitektur** (IA), bevor weitere Features es zumüllen. Das ist die
**Klammer** über den Ideen 2, 3, 5, 6 — sie werden NICHT einzeln angeflanscht,
sondern in eine aufgeräumte Nav eingebettet (s. §A „Dashboard-IA").

---

## §A — Dashboard-Informationsarchitektur (die Klammer, ZUERST konzipieren)

**Problem:** Nav ist über die Feature-Registry gewachsen, flach, ohne klare
Gruppen. Neue Bereiche (Usage, Analytics, Import/Export, Tenant-Mitglieder)
würden das Chaos vergrößern.

**Zielbild — Dashboard-Startseite als „Cockpit"** (Idee 3 lebt hier):
- **Oben: Usage-Zusammenfassung** — pro Site die wichtigste Zahl mit Fortschritt
  (Balken „1.240 / 5.000 Kommentare · 62 %"), Warnfarbe ab 80 %, Upgrade-Chip
  ab 90 %. Das ist das Erste, was ein Betreiber sieht.
- **Mitte: Was ist los?** — verdichteter Activity-/Analytics-Anriss (neue
  Kommentare heute, aktivste Threads, offene Meldungen) mit „Mehr →"-Links.
- **Unten: Schnellaktionen** — „Site verwalten", „Widget-Code holen", „Team
  einladen".

**Ziel-Nav-Gruppen** (RBAC-gefiltert, Feature-Registry bleibt Quelle, aber
gruppiert):
1. **Überblick** (Cockpit-Startseite)
2. **Community** — Kommentare, Moderation, Mitglieder
3. **Inhalt** — Seiten (CMS), Medien
4. **Insights** — Analytics, Usage, Activity *(zusammengeführt, Idee 5)*
5. **Einstellungen** — Branding/Themes, Import/Export, Benachrichtigungen, Plan
6. **Betreiber** (nur Studio/Plattform-Admin) — Sites, Workspaces, Tenants,
   Pläne & Preise, System

**Deliverable §A:** ein kurzes IA-Konzept (Nav-Baum + Cockpit-Wireframe-
Beschreibung) als eigener Check-in, BEVOR 2/3/5 gebaut werden. Aufwand **S–M**.

---

## Die Roadmap (priorisiert, mit Davids Entscheidungen)

Reihenfolge nach „schaltet das meiste frei zuerst". `S/M/L` = Aufwand.
Status: 🟢 beschlossen · 🔵 beschlossen, UI/UX-Konzept offen · 🟡 später.

### 1 — Self-Service-Onboarding „Community in 60 Sekunden" · L · 🟢
**Davids Wort:** „Finde ich gut, sollten wir so umsetzen."
Öffentlicher Registrierungs-Wrapper auf `pukalani.app`: Name + Plan → Subdomain
sofort live. Die Maschinerie existiert (Klick-Provisionierung, Wellen, Quota,
Stripe-Checkout) — es fehlt der öffentliche Trichter.
**Muss dazu:** E-Mail-Verifikation (existiert), Missbrauchs-Bremse (Rate-Limit +
Reservierungs-Cooldown pro IP), reservierte Subdomains-Blocklist, Free-Plan als
Default-Einstieg. **Abhängig von:** #2 (ohne Tenant-Rollen wäre Self-Service
unsicher) → **#2 kommt zuerst.** Verzahnt mit [Landingpage](PUKALANI-LANDINGPAGE.md)
(der CTA „Kostenlos starten" landet hier) und #4 (Preise/Checkout).

### 2 — Tenant-Selbstverwaltung („Admin per Tenant") · L · 🔵 (UI/UX unten)
**Davids Wort:** „Finde ich gut, müssen wir integrieren. Weißt du schon wie am
besten? Bestmögliche UI und UX bitte!" — **die letzte offene Isolationsnaht (H3
Naht 4).** Sicherheitskritisch → kommt mit eigenem Live-Isolationsbeweis.

**Technisches Konzept:**
- Neue Tabelle **`tenant_members`** (studio-Control-Plane): `tenantId`, `userId`,
  `role` (`owner`/`admin`/`moderator`), `email`, `status`. Owner = der Kunde,
  der die Site bekommen hat.
- **Tenant-gescoptes RBAC:** `requirePermission` bekommt eine tenant-bewusste
  Variante — im Pool prüft sie NICHT die globalen Labels, sondern die Rolle des
  Users in `tenant_members` für den Request-Tenant. Isolation: Kunde A ist Admin
  seiner Site, aber Gast (oder blind) bei Kunde B. **Der Härtefall im
  Isolationsbeweis:** derselbe User in zwei Tenants mit verschiedenen Rollen.
- Bestehende Admin-Routen (Moderation, Seiten, Themes) laufen im Pool durch
  diese Prüfung; im Silo/Single-Tenant bleibt das globale RBAC (kein Regressions-
  Risiko).

**UI/UX-Konzept (Davids Frage):**
- **Ein neuer Nav-Punkt „Team"** unter *Community* — bewusst simpel, wie eine
  abgespeckte Version des bestehenden Workspace-Invite-Flows (den es schon gibt!).
- **Eine Seite, eine Tabelle:** Mitglieder mit Avatar, E-Mail, Rollen-Badge,
  Status („aktiv"/„eingeladen"). Ein `+ Einladen`-Button oben rechts (E-Mail +
  Rollen-Dropdown), fertig. Keine Rechte-Matrix, keine 20 Permissions — nur 3
  klare Rollen mit Ein-Satz-Erklärung im Tooltip:
  - **Owner** — „darf alles, inkl. Abrechnung" (genau einer, übertragbar)
  - **Admin** — „verwaltet Inhalte, Design und Moderation"
  - **Moderator** — „bearbeitet Meldungen und blendet Kommentare aus"
- **Onboarding des Eingeladenen:** wiederverwendbar aus dem Workspace-Invite
  (Mail → Accept → passwortloser OTP-Login). Kein neuer Auth-Pfad.
- **Prinzip:** ein Kunde soll in < 30 Sek. einen Moderator hinzufügen, ohne ein
  Handbuch. „Einfachheit ist ein Feature."

### 3 — Usage-Dashboard + Quota-Warnungen · M · 🟢
**Davids Wort:** „Gerne integrieren. Können wir auch auf der Startseite des
Dashboards zeigen. Vielleicht müssen wir das Dashboard aufbohren."
→ **Lebt in §A (Cockpit-Startseite) + eigener „Usage"-Seite unter *Insights*.**
- Täglicher **Snapshot-Sweep** (Muster wie Health-Sweep): je Tenant + kind die
  Zählstände → kleine `usage_snapshots`-Tabelle (30–90 Tage Verlauf).
- **Panel:** aktueller Stand + Fortschrittsbalken + 30-Tage-Sparkline; Farbe ab
  80 %, Upgrade-CTA ab 90 %.
- **Mails:** bei 80 % („bald am Limit") und 100 % („Limit erreicht — jetzt
  upgraden") über den bestehenden `notify()`/Mail-Zweig. Max 1 Mail je
  Schwelle/Zeitraum (kein Spam).
- Macht die (schon scharfen, aber unsichtbaren) Limits zum **Upgrade-Motor**.

### 4 — Öffentliche Preisseite + Self-Service-Upgrade · M · 🟢
**Davids Wort:** „Das wäre etwas für die Landingpage von Idee 1."
→ Vollständig in [PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md) §V.10
verortet. Zahlen live aus dem Studio-Katalog (das Preis-Editing existiert seit
2026-07-24). „Plan wechseln" im Kundenbereich (Checkout/Portal existieren).

### 5 — Analytics: „Was passiert in meiner Community?" · M · 🔵 (Neuordnung)
**Davids Wort:** „Unbedingt integrieren. Activity ist quasi Bestandteil von
Analytics. Wir müssen einige Bereiche neu sortieren und schärfen."
**Entscheidung:** **`activity` + Analytics + Usage werden zu EINEM Bereich
„Insights"** zusammengeführt (§A Gruppe 4). Nicht drei Nav-Punkte, sondern einer
mit Tabs/Abschnitten:
- **Überblick:** Kommentare/Woche, neue vs. wiederkehrende Kommentierende,
  aktivste Threads, Peak-Zeiten.
- **Aktivität:** der bestehende Activity-Feed (chronologisch, „wer hat was").
- **Nutzung:** die Quota-Ansicht aus #3.
- **Technik:** aggregierte **Snapshots** (nie Live-Queries über Kundendaten),
  Charts über die **im Theme-Studio bereits existierende Charts-Szene** (Ramp als
  Datenpalette, Farben rein aus CSS-Variablen — passt sich dem Theme an).
- Retention-Feature: Kunden zahlen für Einsicht.

### 6 — Import / Export + Datenportabilität · M · 🔵 (Platzierung)
**Davids Wort:** „Bieten wir teils schon an. Sauber und an der richtigen Stelle
implementieren. Beste UX/UI."
**Entscheidung Platzierung:** unter *Einstellungen → „Import & Export"* (eine
Seite, zwei Karten):
- **Import:** Disqus-Export (XML/JSON) hochladen → Vorschau („1.240 Kommentare,
  87 Threads gefunden") → bestätigen → Hintergrund-Job (Muster: `provisioning_
  jobs`-Runner) mappt auf `comments` (tenant-gescopt). **Vertriebsargument:**
  Disqus-Flüchtlinge in einem Schritt abwerben — gehört auch auf die Landingpage
  (`/migrate/disqus`).
- **Export:** Voll-Export je Tenant (Kommentare + Seiten + Mitglieder) als ZIP.
  Nutzt den **bestehenden GDPR-Contributor-Vertrag** (`registerUserDataContributor`)
  — erweitert um einen Tenant-Scope. UX: ein Button, „Export wird per Mail
  geschickt, wenn fertig".

### 7 — Webhooks + öffentliche Lese-API pro Tenant · M · 🟢
**Davids Wort:** „Tolles Zusatzfeature. Dann ließen sich Analytics-Kennzahlen
auch auf anderen Seiten/Plattformen integrieren."
- **Outbound-Webhooks:** „neuer Kommentar / neue Meldung" → HTTP-POST an eine
  Kunden-URL (Slack/Zapier/n8n). **HMAC-Signatur** (Muster existiert vom
  changelog-draft-Webhook). Verwaltung: *Einstellungen → Integrationen*, Liste +
  „+ Webhook" (URL, Events, Secret-Anzeige einmalig).
- **Gescopte Lese-API:** Tenant-Token (Scope: nur diese Site, nur lesen) →
  öffentliche Endpunkte für Kommentar-Zahlen / Analytics-Kennzahlen. Damit kann
  ein Kunde seine „Insights" extern einbetten (Davids Wunsch). Rate-limited,
  read-only, tenant-isoliert.
- **Business-Plan-Feature** (typische Gate-Ebene).

### 8 — KI-Moderations-Cockpit (einfach!) · M · 🔵 (KI-Leitplanke)
**Davids Wort:** „Tolle Idee, um unser KI-Feature zu pushen. Ich will sehr
EINFACHE KI-Lösungen, leicht implementierbar und direkt verständlich. Dein
Beispiel ist super."
**Leitplanke:** KI bleibt **advisory** (Mensch entscheidet), sichtbar, einfach.
- **Eine Moderations-Queue** (im Pool: pro Tenant; für dich als Plattform-Admin
  optional tenant-übergreifend) mit Bulk-Aktionen.
- **Ein KI-Signal, klar erklärt:** optionaler Pre-Publish-Score für Gast-
  Kommentare („KI: wahrscheinlich Spam — 92 %") als **Badge**, kein Auto-Block.
  Nutzt den bestehenden `aiComplete()`-Transport + `maui.ai`-Gate. Genau der
  Punkt, an dem Gast-Kommentare (ohne Verifikation) sonst irgendwann wehtun —
  proaktiv statt reaktiv.
- **Muster-Erkennung light:** „dieser Gast-Absender (E-Mail/IP-Hash aus
  `guest_authors`) hat 3 Sites gemeldet bekommen" — ein Hinweis, keine Automatik.
- Bewusst KEIN komplexes Regel-Engine-System. „Direkt verständlich."

### 9 — Custom Domains — zuerst **Silo**, Pool später · L · 🟢 (Details unten)
**Davids Wort (wichtig, wörtlich sinngemäß):** „Unbedingt für Pro/Business =
**Silo-Kunden, NICHT Pool.** Für Pool reicht anfangs die Subdomain. Später evtl.
für Pool gegen Extra-Geld. Ich will es für mich selbst: **portfolio.pukalani.app
↔ davidschubert.com** — jeder pukalani.app-Subdomain eine eigene Domain zuordnen,
technisch einwandfrei inkl. **SSL**, möglichst **vollautomatisch über Cloudflare-
+ ploi-APIs**. Onboarding so einfach wie möglich."

**Warum Silo zuerst technisch klug ist:** eine Silo-Site (z. B. `portfolio`)
läuft als **eigene ploi-Site** mit eigenem Projekt und **ohne Tenant-Resolver** —
ihr ist der eingehende Host egal. Eine Custom Domain hinzuzufügen ist damit „nur"
Domain + Zertifikat + DNS, KEINE Änderung an der App-Logik. Für Pool müsste
zusätzlich der Tenant-Resolver fremde Hosts auf Tenants mappen + Wildcard-
Zertifikat je Fremddomain — deshalb bewusst später.

**Architektur (Silo, vollautomatisch):**
1. **Kunde/Du** trägt im Dashboard die Wunschdomain ein (z. B. `davidschubert.com`
   für die `portfolio`-Silo-Site).
2. **Verifikation:** wir zeigen einen DNS-Eintrag (TXT oder CNAME auf
   `portfolio.pukalani.app`), den der Kunde bei seinem Registrar setzt. Poll bis
   sichtbar.
3. **Automatik über APIs:**
   - **Cloudflare-API:** falls die Domain über Cloudflare läuft — DNS-Record +
     Proxy/SSL-Modus setzen (Token existiert: `~/.maui-secrets/cloudflare-dns.token`).
   - **ploi-API:** der Silo-Site die Domain als Alias hinzufügen + **Let's-
     Encrypt-Zertifikat** anfordern (ploi-API-Rezept ist etabliert, s. Memory
     [[h3-platform-live-betrieb]]).
4. **Fertig:** die Silo-App antwortet auf beiden Hosts; SSL grün.

**UX/Onboarding (Davids Priorität):** ein Assistent in 3 Schritten — „Domain
eingeben → diesen DNS-Eintrag setzen (mit Copy-Button + Provider-Anleitung) →
wir prüfen + schalten automatisch frei (Statusanzeige live)". Kein Zertifikats-
Kram sichtbar, keine Server-Begriffe.

**Erster echter Testfall (Dogfood):** `portfolio.pukalani.app` ↔
`davidschubert.com` — Davids eigene Domain. Perfekter erster Kunde (= du selbst),
risikoarm, sofort sichtbarer Nutzen.

**Pool später (optional, gegen Aufpreis):** braucht `tenants.customHost` +
Resolver-Mapping (Custom-Host → Tenant) + Zertifikats-Automatik je Fremddomain.
Erst wenn Silo stabil läuft und ein Pool-Kunde konkret zahlt.

### 10 — Status-Seite · S · 🟡 (nicht kommentiert, niedrig)
`status.pukalani.app` mit Uptime/Incidents. Health-Sweeps + Alerting existieren;
es fehlt die öffentliche Ansicht. Kleiner Trust-Baustein, kann als Warm-up
zwischendurch. (Von David nicht explizit bestätigt — bleibt Vorschlag.)

---

## Empfohlene Umsetzungs-Reihenfolge

```
§A Dashboard-IA-Konzept  (S–M, die Klammer — zuerst denken)
   └─> 2  Tenant-Selbstverwaltung   (L, Sicherheitsnaht 4 + Isolationsbeweis)
        └─> 1  Self-Service-Onboarding (L, braucht #2)
             └─> 4  Öffentliche Preise/Upgrade  (M, auf der Landingpage)
   ├─> 3  Usage-Cockpit             (M, lebt in §A)
   └─> 5  Insights/Analytics        (M, Activity+Usage zusammengeführt)
6  Import/Export     (M, Einstellungen)   ── parallel möglich
7  Webhooks/API      (M, Integrationen)   ── Business-Feature
8  KI-Moderation     (M, einfach + advisory)
9  Custom Domains    (L, Silo zuerst — Dogfood portfolio↔davidschubert.com)
10 Status-Seite      (S, optional/Warm-up)
```

**Begründung:** §A ordnet das Haus, bevor mehr Möbel reinkommen. #2 ist die
Sicherheits-Voraussetzung, ohne die Self-Service (#1) gefährlich wäre. #1→#4
schließt den Kaufpfad. #3/#5 halten Kunden. #6–#9 sind wertvolle Erweiterungen,
untereinander unabhängig; #9 ist Davids Herzensfeature mit klarem Dogfood-
Startpunkt.

## Bewusste Nicht-Ziele (Fokus halten)

- **Themes weiter aufbohren** — 26×11 ist genug; jede weitere Achse verschlechtert
  die Auswahl.
- **Homepage-Block-Baukasten** — eigenes Großprojekt; Markdown-CMS reicht fürs MVP.
- **Custom Domains für Pool** — erst nach stabilem Silo + zahlendem Bedarf.
- **Mit den Großen konkurrieren** (News-Redaktions-Workflows, 100k/Tag) — bewusst
  nicht unsere Liga. Schlank + fair + DSGVO ist die Positionierung.

## Nächster konkreter Schritt

Ich empfehle, mit **§A (Dashboard-IA-Konzept)** zu starten — ein kurzer,
billiger Denk-Schritt (Nav-Baum + Cockpit-Skizze), der die Bühne für 2/3/5
bereitet — und direkt danach **#2 (Tenant-Selbstverwaltung)** als erstes echtes
Bau-Paket, weil es die letzte Sicherheitsnaht schließt und Self-Service
freischaltet. Sag Bescheid, welchen Block ich als Erstes ausarbeiten/bauen soll.

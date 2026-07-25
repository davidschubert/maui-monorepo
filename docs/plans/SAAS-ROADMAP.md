# SaaS-Roadmap: vom „Betriebssystem" zum verkaufbaren Produkt

> **Status:** Strategie + priorisierte Delivery-Roadmap (2026-07-24, v2), aus
> dem Ideen-Gespräch mit David. Ersetzt den verlorenen „10-Ideen"-Zettel und
> trennt Zielbild, Launch-Gates und spätere Wachstumsfeatures. Querbezug:
> [PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md) ·
> [MULTI-SITE-PLATFORM-STRATEGIE.md](MULTI-SITE-PLATFORM-STRATEGIE.md) ·
> [HORIZONT-3-POOL-SILO-BLUEPRINT.md](HORIZONT-3-POOL-SILO-BLUEPRINT.md) ·
> [OPEN-ITEMS.md](../OPEN-ITEMS.md).

## Nordstern

> **Die schlanke, datenschutz-native Community-Plattform, die ein Solo-Maker
> in 60 Sekunden startet — nicht mit den Großen mithalten, sondern die
> unkomplizierte, faire, DSGVO-native Alternative zu Circle, Skool & Mighty
> Networks sein.**

## Was das Produkt IST (Positionierung — wichtig)

**Pukalani ist eine COMMUNITY-PLATTFORM, kein Kommentarsystem.** Das
Kommentar-Feature ist **Infrastruktur / Mittel zum Zweck** — das Bindegewebe,
das unter Beiträgen, Kursen, Events und Threads läuft. Deshalb der Start damit;
der Nutzen ist die ganze Plattform. Die Bausteine:

- **Feed / Beiträge** — Nutzer-Beiträge (Markdown), Umfragen, Fragen, Activity-Feed
- **Kurse** — Lektionen + Fortschritt, Bezahl-Zugang free/members/pro (Billing)
- **Events** — online/präsenz, Serien, Zusagen, Tickets (kostenlos/kostenpflichtig), einbettbar
- **Diskussionen (Kommentare)** — Realtime, Votes, @-Mentions, Präsenz, Gast-Zugriff, Embed
- **Moderation** — Meldungen, Eskalation, KI-Assist (von Content-Features mitaktiviert)
- **Branding** — eigene Themes + Schriften, eigene Startseiten, eigene Domain
- **Betrieb** — Support-Tickets, Billing (Stripe), Admin-Dashboard, mehrsprachig (DE/EN)

**Wettbewerb = Circle · Skool · Mighty Networks · Discourse.** NICHT
Disqus/Cusdis. Unsere Lücke: schlank + datenschutz-nativ + DE-Hosting +
planbarer Preis + **modular** + einbettbar. Preise sind veränderliche
Marktdaten und werden nicht als Roadmap-Invariante geführt; der redaktionelle
Snapshot mit Quellen steht in
[PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md) §2.3.

Subjektive Prozentangaben wie „98 % Betriebssystem / 75 % SaaS" sind für
Entscheidungen nicht belastbar. Der belegbare Stand ist:

| Fähigkeit | Stand 2026-07-24 | Rest bis verkaufbar |
|---|---|---|
| Pool/Silo-Grundlage | Pool live, Tenant-Scope und Quotas bewiesen | Row-Permission-Naht vollständig + Isolation dauerhaft in CI |
| Kundenzuordnung/Abrechnung | Workspaces, Owner-Invite, Checkout/Portal vorhanden | Rollen-/Identitätsvertrag bis in die Tenant-App |
| Produktangebot | Diskussionen, Seiten, Themes, Moderation in `apps/platform` | Feed, Kurse, Events und ihre Plan-Gates noch integrieren |
| Self-Service | Betreiber-Onboarding vorhanden | öffentlicher Signup, Abuse-Schutz, Recovery und End-to-End-Abnahme |
| Betrieb/Vertrauen | Monitoring, Rechtstext-Entwürfe, Backup-Prozedur vorhanden | Rechtsfreigabe, Restore-Beweis, Lifecycle/Export vor fremden GA-Daten |

Die größte Lücke ist damit nicht „nur UI", sondern die Verbindung von
**Identität, Autorisierung, Self-Service und Betriebsversprechen**.

## Querschnitts-Thema (Davids Kern-Beobachtung)

> „Ich denke, wir müssen einige Bereiche neu sortieren und neu schärfen, damit
> alles aus UI-/UX-Sicht übersichtlicher und verständlicher wird."

Das Projekt ist über 40+ Phasen gewachsen; das **Dashboard braucht eine neue
Informationsarchitektur** (IA), bevor weitere Features es zumüllen. Das ist die
**Klammer** über den Ideen 2, 3, 5, 6 — sie werden NICHT einzeln angeflanscht,
sondern in eine aufgeräumte Nav eingebettet (s. §A „Dashboard-IA").

---

## §A — Produktoberflächen und Informationsarchitektur (zuerst entscheiden)

**Problem:** Die bisherige Fassung spricht von „dem Dashboard", obwohl drei
verschiedene Zielgruppen und Vertrauensgrenzen existieren. Eine gemeinsame Nav
würde Betreiberfunktionen, Kunden-Abrechnung und tägliche Community-Arbeit
vermischen.

**Verbindliche Trennung der Oberflächen:**

1. **Kundenbereich / Control Center** (heute `/workspace` in der Studio-App;
   Zielhost/-route wird in G0 entschieden, getrennt von der Marketing-Startseite):
   Workspaces/Sites, Plan & Rechnungen, Usage, Team, Domains, Export/Kündigung.
   Zielgruppe: Owner und Kunden-Admins.
2. **Site-Dashboard** (`<tenant-host>/dashboard`): Inhalte, Moderation,
   Mitglieder, Theme, Community-Analytics und site-spezifische Einstellungen.
   Zielgruppe: Owner, Admins und Moderatoren dieser Site.
3. **Operator Studio** (`studio.pukalani.app`): Tenants, Wellen,
   Provisionierungsjobs, Plankatalog, Systemzustand. Nur Plattformbetreiber;
   niemals Bestandteil der Kundennavigation.

**Zielbild — Kundenbereich als „Cockpit"** (#3 lebt hier):
- **Oben: Usage-Zusammenfassung** — pro Site die wichtigste Zahl mit Fortschritt
  (Balken „1.240 / 5.000 Kommentare · 62 %"), Warnfarbe ab 80 %, Upgrade-Chip
  ab 90 %. Das ist das Erste, was ein Betreiber sieht.
- **Mitte: Was ist los?** — verdichteter Activity-/Analytics-Anriss (neue
  Kommentare heute, aktivste Threads, offene Meldungen) mit „Mehr →"-Links.
- **Unten: Schnellaktionen** — „Site öffnen", „Widget-Code holen", „Team
  einladen".

**Ziel-Nav im Site-Dashboard** (RBAC- und Feature-gefiltert; die
Feature-Registry bleibt Quelle):
1. **Überblick** (Cockpit-Startseite)
2. **Community** — Kommentare, Moderation, Mitglieder
3. **Inhalt** — Seiten (CMS), Medien
4. **Insights** — Analytics + Activity; Usage verlinkt in den Kundenbereich
5. **Einstellungen** — Branding/Themes, Import/Export, Benachrichtigungen,
   Integrationen

**Deliverable §A:** je Oberfläche ein Nav-Baum, ein Cockpit-Wireframe und eine
Rollenmatrix; zusätzlich die Übergänge „Site öffnen", „Plan verwalten" und
„zurück zum Kundenbereich". Abnahme mit je einem Owner-, Admin-,
Moderator- und Operator-Szenario. Aufwand **M**.

---

## §B — Angebots-Slices: Was wird wann verkauft?

Die Roadmap darf kein Self-Service für ein unklar verpacktes Produkt bauen.
Deshalb gibt es zwei ehrliche Releases:

| Slice | Lieferumfang | öffentliche Positionierung |
|---|---|---|
| **Early Access** | Seiten, Diskussionen, Moderation, Themes, Embed | „Branded Discussions / Community Early Access"; keine Kurse-/Events-/60-Sekunden-Claims |
| **Community GA** | zusätzlich Feed/Beiträge; Kurse und Events nur, wenn ihre Gates grün sind | „Modulare Community-Plattform"; jede Tarifkarte zeigt ausschließlich freigegebene Bausteine |

Für jeden neuen Baustein gilt dasselbe Gate: im `apps/platform`-Manifest und
den App-Dependencies enthalten, Pool-Migration tenant-gescopt, Row-Permissions,
Runtime-Gate/Entitlement, Quota, GDPR- und Site-Export-Contributor, EN/DE,
Pool/Silo-E2E und dokumentiertes Tariflimit. Erst danach wird er im Katalog
verkauft. Damit wird nicht „alles auf einmal" zum GA-Blocker, aber Marketing
und Lieferumfang können nie auseinanderlaufen.

---

## Die Roadmap (priorisiert, mit Davids Entscheidungen)

Die Nummern bleiben als stabile Ideen-IDs erhalten; die Delivery-Reihenfolge
steht separat weiter unten. `S/M/L` = relative Größe, keine Schätzung.
Status: 🟢 beschlossen · 🔵 beschlossen, Vertrag/UX offen · 🟡 später.

### 1 — Self-Service-Onboarding „Community in 60 Sekunden" · L · ✅ GEBAUT (2026-07-25)
> **Abnahme bestanden:** 10 unbeaufsichtigte Läufe, **Median 0,3 s** vom Signup
> bis zur erreichbaren Site (DoD ≤ 60 s), Retry idempotent (dieselbe Community,
> Code nicht doppelt verbraucht), keine zusätzliche Row bei abgelehnter Eingabe
> oder Kontingent-Stopp. Läufe reproduzierbar:
> `packages/onboarding/scripts/acceptance-onboarding.mjs`.
>
> **Gebaut in O1–O6:** Layer `packages/onboarding` (Wizard, 7 Schritte, EN/DE) ·
> `studio-016` (Vibe, Testphase, Profil, `invite_codes`) · Provisionierung im
> Control Plane mit Service-Secret **und** selbst geprüftem Appwrite-JWT ·
> Idempotenz über den Hostnamen · Kompensation statt halber Community ·
> Kontroll-Host `app.pukalani.app` als Nicht-Mandant mit fail-closed
> API-Allowlist · Branding pro Mandant · `requireSitePermission` (Site-Rolle vor
> protokolliertem Operator-Break-Glass) · Site-Label für Naht 4 · Startseite aus
> der Beschreibung · Testphasen-Sweep (bezahlte Kunden ausgenommen).
>
> **Davids Entscheidungen (2026-07-24):** Invite-Code-Gate im Early Access ·
> 14 Tage Pro ohne Zahlungsdaten · 1 Community im Trial, danach bis 3 · KI nur
> als optionaler Vorschlag. Wichtige Präzisierung beim Bau: der Code gilt fürs
> **Anlegen**, nicht fürs Registrieren — sonst könnten sich die eingeladenen
> MITGLIEDER bestehender Communities nicht mehr anmelden.
>
> **Nachgeliefert (2026-07-25), Einladungs-Betrieb:** `studio-017` —
> Warteschlange `invite_requests` (öffentliches `/anfragen` mit Honeypot +
> Rate-Limit, Betreiber-Mail + In-App-Benachrichtigung), Zuweisung per Klick im
> Dashboard (`/dashboard/requests`), an die Adresse GEBUNDENE Codes
> (weiterleiten bringt nichts), Erinnerung mit 24-h-Sperrfrist und max. 3
> Versuchen (ersetzt den Code, widerruft den alten), Einlöse-Rückschreibung
> („eingelöst am / welche Community"). Vorrat: Sammel-Anlage auf
> `/dashboard/invites` legt LEERE Plätze an — der Klartext entsteht erst beim
> Zuweisen, es liegen also nie fertige Geheimnisse herum. Statistik zeigt
> frei/zugewiesen/eingelöst/abgelaufen + Trichter (vergeben → eingelöst →
> Communities); über 1000 Codes weist sie die Kappung aus statt zu raten.
> Personenbezug wird aufgeräumt: abgelehnte Anfragen nach 30, eingelöste nach
> 90 Tagen (stündlicher Sweep, Datenschutz-Abschnitt ergänzt).
> Beweise: `packages/studio/scripts/verify-invite-requests.mjs` (17/17) und
> `verify-invite-stock.mjs` (19/19, echte Betreiber-Sitzung).
>
> **Noch offen (bewusst, kein Blocker des Trichters):** Trial-Countdown-Banner
> in der Community · Erinnerung vor Ablauf (die Fertig-Seite verspricht sie
> deshalb NICHT) · Kundenbereich-Umzug `/workspace` → `app.pukalani.app` ·
> Abuse-/Suspend-Pfad · Deploy des Hosts (ploi + Env).

**Davids Wort:** „Finde ich gut, sollten wir so umsetzen."
Öffentlicher Registrierungs-Wrapper auf `pukalani.app`: Name + Plan → Subdomain
sofort live. Die Maschinerie existiert (Klick-Provisionierung, Wellen, Quota,
Stripe-Checkout) — es fehlt der öffentliche Trichter.
**Muss dazu:** E-Mail-Verifikation (existiert), Missbrauchs-Bremse (Rate-Limit,
Reservierungs-Cooldown, Abuse-/Suspend-Pfad), reservierte Subdomains-Blocklist,
idempotente Provisionierung, verständliche Recovery und Free-Plan als
Default-Einstieg. **Abhängig von:** #2, Row-Permission-Naht, Rechts-/Restore-
Gate und #4.

**Definition of Done:** zehn unbeaufsichtigte Testläufe ohne Operator-Eingriff;
Median vom Signup bis zur live erreichbaren Site ≤ 60 Sekunden, keine verwaiste
Tenant-/Workspace-Row bei Abbruch, Retry ist idempotent. Erst dann darf die
Landingpage „in 60 Sekunden" behaupten.

### 2 — Tenant-Selbstverwaltung und Identitätsvertrag · L · 🔵
**Davids Wort:** „Finde ich gut, müssen wir integrieren. Weißt du schon wie am
besten? Bestmögliche UI und UX bitte!" Sicherheitskritisch → kommt mit eigenem
Live-Isolationsbeweis.

**Korrektur zur ersten Fassung:** „Admin per Tenant" ist **nicht** H3-Naht 4.
Naht 4 bleibt die Appwrite-Row-Permission als zweite Daten-Isolationslinie.
Dieses Paket ist die Autorisierung der Produktoberfläche. Beide müssen vor
offenem Self-Service grün sein.

**Identitätsgrenzen (vor Implementierung als ADR festhalten):**

- `workspace_members` existiert bereits und bleibt die
  **Control-Plane-Mitgliedschaft** für Abrechnung und Kundenbereich. Rollen
  werden von `owner` auf `owner/admin` erweitert.
- Runtime-User leben dagegen im jeweiligen Appwrite-Projekt. Ihre IDs sind nur
  zusammen mit `projectId` eindeutig; eine Studio-`userId` darf nie stillschweigend
  als Pool-/Silo-`userId` interpretiert werden.
- Für Site-Rechte braucht es deshalb einen expliziten Vertrag, bevorzugt
  **`site_members`** im Control Plane: `siteId`, `runtimeProjectId`,
  `runtimeUserId`, `role` (`owner`/`admin`/`moderator`), `status`. `tenants`
  referenziert die kanonische `siteId`; `sites.workspaceId` liefert den Owner-
  Kontext. Keine E-Mail als Autorisierungsschlüssel.
- Invite-Accept verknüpft nach OTP-Login bewusst beide Identitäten und schreibt
  die Runtime-Bindung idempotent. Der bestehende Workspace-Invite liefert
  UI-/Token-Muster, ist aber wegen des getrennten User-Pools **nicht unverändert
  wiederverwendbar**.
- `requireTenantPermission(event, capability)` autorisiert Site-Routen über
  `{siteId, runtimeProjectId, runtimeUserId}`. Die bestehende globale
  `requirePermission` bleibt für Single-Tenant/Operator-Routen; ein Adapter
  verhindert doppelte Fachlogik.
- Row-Permissions verwenden tenant-namespaced Rollen/Labels und werden
  unabhängig getestet. Ein Route-Guard ersetzt keine Daten-Isolation.

**UI/UX-Konzept (Davids Frage):**
- **„Team" im Kundenbereich**, mit Deep-Link aus dem Site-Dashboard. Dort ist
  klar, ob eine Rolle für alle Sites des Workspace oder nur eine Site gilt.
- **Eine Seite, eine Tabelle:** Mitglieder mit Avatar, E-Mail, Rollen-Badge,
  Status („aktiv"/„eingeladen"). Ein `+ Einladen`-Button oben rechts (E-Mail +
  Rollen-Dropdown), fertig. Keine Rechte-Matrix, keine 20 Permissions — nur 3
  klare Rollen mit Ein-Satz-Erklärung im Tooltip:
  - **Owner** — „darf alles, inkl. Abrechnung" (genau einer pro Workspace,
    Übertragung als eigener sicherheitskritischer Flow)
  - **Admin** — „verwaltet Site, Inhalte, Design und Team; keine Abrechnung"
  - **Moderator** — „bearbeitet Meldungen und blendet Kommentare aus"
- **Onboarding des Eingeladenen:** gleiches UX-Muster wie Workspace-Invite
  (Mail → Accept → passwortloser OTP-Login), aber mit expliziter Runtime-
  Identitätsverknüpfung.
- **Prinzip:** ein Kunde soll in < 30 Sek. einen Moderator hinzufügen, ohne ein
  Handbuch. „Einfachheit ist ein Feature."

**Definition of Done:** automatisierter Isolationsbeweis für denselben
Runtime-User in zwei Pool-Tenants mit unterschiedlichen Rollen; zusätzlich
Pool↔Silo-Parität, Invite-Replay, entzogener Zugriff, Owner-Transfer und
ein protokollierter Break-Glass-Operatorzugriff ohne stillen Dauer-Bypass. Kein
Admin-Endpunkt verwendet ungescopte Client-IDs.

### 3 — Usage-Dashboard + Quota-Warnungen · M · 🟢
**Davids Wort:** „Gerne integrieren. Können wir auch auf der Startseite des
Dashboards zeigen. Vielleicht müssen wir das Dashboard aufbohren."
→ **Lebt im Kundenbereich (§A) als Summary + eigene Usage-Seite.** Im
Site-Dashboard zeigt „Insights" nur Community-Kennzahlen und verlinkt für
Tariflimits dorthin.
- Täglicher **Snapshot-Sweep** (Muster wie Health-Sweep): je Tenant + kind die
  Zählstände → kleine `usage_snapshots`-Tabelle (30–90 Tage Verlauf).
- **Panel:** aktueller Stand + Fortschrittsbalken + 30-Tage-Sparkline; Farbe ab
  80 %, Upgrade-CTA ab 90 %.
- **Mails:** bei 80 % („bald am Limit") und 100 % („Limit erreicht — jetzt
  upgraden") über den bestehenden `notify()`/Mail-Zweig. Max 1 Mail je
  Schwelle/Zeitraum (kein Spam).
- Macht die (schon scharfen, aber unsichtbaren) Limits zum **Upgrade-Motor**.

**Definition of Done:** Snapshot-Zählung stimmt gegen einen vollständigen
Kontroll-Count, Schwellenbenachrichtigungen sind idempotent, Zeitzone und
Abrechnungsperiode sind definiert, und ein Tenant kann nie Usage eines anderen
Tenants abfragen.

### 4 — Öffentliche Preisseite + Self-Service-Upgrade · M · 🟢
**Davids Wort:** „Das wäre etwas für die Landingpage von Idee 1."
→ Copy und Claim-Gates in
[PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md) §4.11
verortet. Zahlen live aus dem Studio-Katalog (das Preis-Editing existiert seit
2026-07-24). „Plan wechseln" im Kundenbereich (Checkout/Portal existieren).

**Definition of Done:** sichtbarer Preis = Checkout-Preis für monatlich und
jährlich; Free→Paid, Upgrade, Downgrade, Kündigung, fehlgeschlagene Zahlung und
Webhook-Replay sind im Test-/Live-Runbook belegt. Kein Marketingpreis wird
separat hart codiert.

### 5 — Analytics: „Was passiert in meiner Community?" · M · 🔵 (Neuordnung)
**Davids Wort:** „Unbedingt integrieren. Activity ist quasi Bestandteil von
Analytics. Wir müssen einige Bereiche neu sortieren und schärfen."
**Entscheidung:** **`activity` + Community-Analytics werden zu EINEM Bereich
„Insights"** zusammengeführt (§A Gruppe 4). Tarif-/Quota-Usage bleibt im
Kundenbereich (#3), wird aber aus Insights verlinkt. **Community-weit, nicht
kommentar-zentriert** — die
Kennzahlen decken ALLE Bausteine ab:
- **Überblick:** aktive Mitglieder (neu vs. wiederkehrend), neue Beiträge/
  Kommentare/Woche, Kurs-Einschreibungen + -Abschlüsse, Event-Zusagen, aktivste
  Threads, Peak-Zeiten. Je Baustein nur, wenn er aktiviert ist.
- **Aktivität:** der bestehende Activity-Feed (chronologisch, „wer hat was").
- **Technik:** aggregierte **Snapshots** (nie Live-Queries über Kundendaten),
  Charts über die **im Theme-Studio bereits existierende Charts-Szene** (Ramp als
  Datenpalette, Farben rein aus CSS-Variablen — passt sich dem Theme an).
- Kleine Kohorten werden unterdrückt/zusammengefasst; keine personengenauen
  Aktivitätsprofile als „Analytics" ohne eigenen Zweck und Rechtsgrundlage.
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
- **Export:** Voll-Export je Site (Kommentare + Seiten + Mitglieder) als ZIP.
  Der vorhandene `registerUserDataContributor` bleibt bewusst **pro User**.
  Site-Portabilität bekommt einen parallelen expliziten Vertrag, z. B.
  `registerSiteDataContributor`, damit Feature-Layer beide Zwecke nicht
  vermischen. UX: ein Button, „Export wird per Mail geschickt, wenn fertig".

**Definition of Done:** Format und Schema-Version dokumentiert, Export ist
tenant-isoliert und wiederholbar, große Exporte laufen als resumierbarer Job,
Download ist kurzlebig autorisiert, Import besitzt Dry-Run + Fehlerbericht.

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

**Sicherheitsvertrag:** Tokens werden nur einmal im Klartext gezeigt und
serverseitig gehasht gespeichert; Rotation/Widerruf, Ablauf, Audit und getrennte
Scopes (`analytics:read`, …) sind Pflicht. Webhooks haben Event-ID,
Zeitstempel, HMAC-Signatur, Retry mit Backoff, Dead-Letter-Status und
SSRF-Schutz. Keine frei konfigurierbare URL darf interne/private Netze erreichen.

**Definition of Done:** Tenant-Isolation, Token-Revoke, Signaturprüfung,
Retry-Deduplizierung, Timeout und SSRF-Fälle sind automatisiert getestet.

### 8 — KI-Moderations-Cockpit (einfach!) · M · 🔵 (KI-Leitplanke)
**Davids Wort:** „Tolle Idee, um unser KI-Feature zu pushen. Ich will sehr
EINFACHE KI-Lösungen, leicht implementierbar und direkt verständlich. Dein
Beispiel ist super."
**Leitplanke:** KI bleibt **advisory** (Mensch entscheidet), sichtbar, einfach.
- **Eine Moderations-Queue** (im Pool: pro Tenant; für dich als Plattform-Admin
  optional tenant-übergreifend) mit Bulk-Aktionen.
- **Ein KI-Signal, klar erklärt:** optionales Pre-Publish-Signal für Gast-
  Kommentare („erhöhtes Spam-Risiko" + kurze Gründe) als **Badge**, kein
  Auto-Block. Prozentwerte gibt es erst nach Kalibrierung gegen einen
  repräsentativen, versionierten Testdatensatz.
  Nutzt den bestehenden `aiComplete()`-Transport + `maui.ai`-Gate. Genau der
  Punkt, an dem Gast-Kommentare (ohne Verifikation) sonst irgendwann wehtun —
  proaktiv statt reaktiv.
- **Muster-Erkennung light:** „dieser Gast-Absender (E-Mail/IP-Hash aus
  `guest_authors`) wurde auf dieser Site mehrfach gemeldet" — ein Hinweis,
  keine Automatik. Tenant-übergreifende Abuse-Erkennung wäre ein eigenes
  Plattform-Sicherheitsfeature mit Rechtsgrundlage, Zugriff nur für Operatoren
  und pseudonymisierter Kennung; sie gehört nicht in das Kunden-Cockpit.
- Bewusst KEIN komplexes Regel-Engine-System. „Direkt verständlich."

**Definition of Done:** KI-Ausfall blockiert keine Moderation; Score zeigt
Modell/Begründung und ist als Hinweis markiert; kein Auto-Hide/Auto-Block;
Prompts und Ausgaben leaken keine Daten zwischen Tenants. Kostenlimit und
Opt-out sind pro Site wirksam.

### 9 — Custom Domains — zuerst **Silo**, Pool später · L · 🟢 (Details unten)
**Davids Wort (wichtig, wörtlich sinngemäß):** „Unbedingt für Pro/Business =
**Silo-Kunden, NICHT Pool.** Für Pool reicht anfangs die Subdomain. Später evtl.
für Pool gegen Extra-Geld. Ich will es für mich selbst: **portfolio.pukalani.app
↔ davidschubert.com** — jeder pukalani.app-Subdomain eine eigene Domain zuordnen,
technisch einwandfrei inkl. **SSL**, möglichst **vollautomatisch über Cloudflare-
+ ploi-APIs**. Onboarding so einfach wie möglich."

**Warum Silo zuerst technisch klug ist:** eine Silo-Site (z. B. `portfolio`)
läuft als eigene ploi-Site mit eigenem Projekt. DNS/TLS und Rollback sind damit
kleiner als im Pool. Der Host ist der App-Logik aber **nicht egal**:
`appUrl`/Canonical, Locale-Links, CSRF/Origin, Session-Cookies, OAuth-Callbacks,
Realtime, E-Mail-Links und CSP müssen auf der Fremddomain bewiesen werden.
Für Pool kommt zusätzlich das Custom-Host→Tenant-Mapping hinzu.

**Architektur (Silo, vollautomatisch):**
1. **Kunde/Du** trägt im Dashboard die Wunschdomain ein (z. B. `davidschubert.com`
   für die `portfolio`-Silo-Site).
2. **Verifikation:** wir zeigen einen DNS-Eintrag (TXT oder CNAME auf
   `portfolio.pukalani.app`), den der Kunde bei seinem Registrar setzt. Poll bis
   sichtbar.
3. **Automatik über APIs:**
   - **Kundendomain außerhalb unseres Cloudflare-Accounts:** Kunde setzt den
     angezeigten CNAME/TXT selbst; bei Apex-Domains provider-spezifisch
     ALIAS/ANAME oder dokumentierte Alternative.
   - **Von uns verwaltete Cloudflare-Zone:** DNS-Record automatisiert anlegen.
     Keine Secret-Pfade oder Token-Namen im Produktplan dokumentieren.
   - **ploi-API:** Domain-Alias hinzufügen und Zertifikat anfordern; der Job ist
     idempotent und besitzt Timeout, Retry, Fehlerstatus und Rollback.
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

**Definition of Done:** Besitzprüfung vor Aktivierung, unbekannter Host bleibt
404, Zertifikat-Erneuerung und Domain-Entzug sind getestet, alte Domain
redirectet kontrolliert, Auth/OTP/OAuth/Realtime/Embed laufen auf der
Fremddomain, und ein fehlgeschlagener Job lässt die Ursprungsdomain intakt.

### 10 — Status-Seite · S · 🟡 (nicht kommentiert, niedrig)
`status.pukalani.app` mit Uptime/Incidents. Health-Sweeps + Alerting existieren;
es fehlt die öffentliche Ansicht. Kleiner Trust-Baustein, kann als Warm-up
zwischendurch. (Von David nicht explizit bestätigt — bleibt Vorschlag.)

Status-Komponenten dürfen keine internen Projekt-/Tenant-Namen leaken.
Incidents brauchen Zeitachse, Auswirkung und Abschluss; Uptime-Zahlen werden nur
gezeigt, wenn Messfenster und Berechnung transparent sind.

---

## Empfohlene Umsetzungs-Reihenfolge

| Gate | Inhalt | Exit-Kriterium |
|---|---|---|
| **G0 Produktvertrag** ✅ | §A Oberflächen/IA · §B Angebots-Slice · ADR für Identitäten/Rollen | ✅ Nav, Rollenmatrix, kanonische `siteId` (= `tenants.$id`) und Early-Access-Scope entschieden ([G0](G0-PRODUKTVERTRAG.md)) |
| **G1 Sicherheit** ✅ | H3-Naht 4 (Mechanismus) · #2 Tenant-Autorisierung | ✅ automatisierte Pool/Silo-Isolation, Rollenwechsel, Invite-Replay grün (162 core + 58 studio, lokal+prod). Rest: Naht-4-Live-Wiring hängt an Audience-Entscheidung (privat/öffentlich) |
| **G2 Betriebsreife** | Rechtsfreigabe · Restore-Test/RPO/RTO · Site-Export/Löschung · Abuse/Suspend · Stripe-Live-Runbook | erster fremder zahlender Kunde kann sicher aufgenommen und wieder sauber offboarded werden |
| **G3 Kaufpfad** | #4 Preis/Upgrade · #1 zunächst invite-only · Landingpage mit Early-Access-Claims | Signup→Site→Checkout/Portal→Kündigung als E2E grün |
| **G4 Offener Launch** | #3 Usage/Warnungen · öffentlicher Abuse-Schutz · 60-Sekunden-Messung | zehn unbeaufsichtigte Onboardings, Alerts/Recovery und Claim-Gates grün |
| **G5 Bindung/Wachstum** | Feed-Integration nach §B · #5 Analytics · #6 Import/Export · #7 API/Webhooks | pro Feature eigenes DoD; nicht als Big Bang |
| **G6 Premium** | #9 Silo-Custom-Domain · #8 KI-Cockpit · #10 Status | Dogfood und Betriebsnachweise vor Tarif-Freigabe |

**Parallelität:** §A/§B und der Identitäts-ADR können gemeinsam konzipiert
werden. Nach G1 können Landingpage-Bau und #4 parallel laufen. #5–#10 dürfen die
Launch-Gates nicht verzögern, sofern ihre Claims/Tarif-Gates aus bleiben.

## Produktmetriken

Die Roadmap wird an Ergebnissen gemessen, nicht an ausgelieferten Seiten:

- **Aktivierung:** Anteil neuer Workspaces mit live erreichbarer Site und erstem
  veröffentlichten Inhalt innerhalb von 24 Stunden.
- **Time-to-live:** Median/P95 von Signup bis live; der Marketingclaim nutzt den
  gemessenen Median, nicht die Happy-Path-Demo.
- **Self-Service-Qualität:** Anteil Provisionierungen ohne Operator-Eingriff,
  Invite-Abschlussrate und Recovery-Erfolg.
- **Sicherheit/Betrieb:** 0 Cross-Tenant-Leaks; Restore-/Export-Erfolgsrate;
  Zeit von Abuse-Meldung bis Suspend-Entscheidung.
- **Wert/Bindung:** aktive Mitglieder, Creator-Wochenaktivität und
  30-/90-Tage-Retention je Angebots-Slice; keine Vanity-Gesamtzahl ohne
  Kohortenbezug.

## Bewusste Nicht-Ziele (Fokus halten)

- **Themes weiter aufbohren** — 26×11 ist genug; jede weitere Achse verschlechtert
  die Auswahl.
- **Homepage-Block-Baukasten** — eigenes Großprojekt; Markdown-CMS reicht fürs MVP.
- **Custom Domains für Pool** — erst nach stabilem Silo + zahlendem Bedarf.
- **Native Mobile-Apps mit Push** (Skool/Mighty haben sie) — großes eigenes
  Projekt; die responsive Web-App reicht fürs MVP. Ehrlich auf der Landingpage
  benannt (§4.9) statt versteckt.
- **Mit den ganz Großen konkurrieren** (50k-Mitglieder-Communities, Enterprise-
  SSO, Redaktions-Workflows) — bewusst nicht unsere Liga. Schlank + fair + DSGVO
  für Solo-Maker und kleine Teams ist die Positionierung.

## Nächster konkreter Schritt

Ein gemeinsamer **G0-Check-in** ist der nächste Schritt:

1. drei Nav-Bäume + Kern-Wireframes aus §A,
2. Rollen-/Identitäts-ADR aus #2,
3. Early-Access-Tarifmatrix aus §B,
4. Claim-Inventar aus der Landingpage §2.4.

Erst nach dieser Entscheidung startet das erste Bau-Paket: **G1
Tenant-Autorisierung + Row-Permission-Naht + Isolationsbeweis**. Das verhindert,
dass UI, Preise und Marketing auf einem ungeklärten Sicherheitsmodell aufsetzen.

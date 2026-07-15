# Multi-Site-Platform-Strategie — „Maui Platform"

Stand: 2026-07-14 (7. Runde: finale Nachbesserungen — vom Review als
Umsetzungsstrategie freigegeben, Start mit S0) · Status:
**Konzept abgestimmt — Umsetzungs-Freigabe für abhängige Teile jeweils
erst nach den zugeordneten Decision Gates gemäß § 4**

Lesehilfe: „Entschieden" heißt KONZEPTUELL entschieden. Punkte mit ⚠️ sind
Annahmen, die erst durch einen PoC/Spike technisch bestätigt werden müssen —
vorher wird keine davon abhängige Architektur festgezurrt.

Dieses Dokument beantwortet: Wie wird aus dem maui-monorepo (heute: Baukasten
für einzelne Apps) eine Plattform, die (1) Davids eigene Sites, (2) betreute
Kundenprojekte und (3) perspektivisch Self-Service-SaaS trägt — ohne die
bewährten Kern-Entscheidungen (CONCEPT.md A1–A14) zu brechen.

Leitplanken aus der Abstimmung mit David (2026-07-14):
- Start: 3–10 eigene Sites (Portfolio, maui.photos, Community, …)
- Danach: Agentur-Modell (Kundenprojekte, David bleibt Voll-Admin)
- Ziel: echtes SaaS (Self-Service-Registrierung, Sites mit eigener URL,
  Features per Bezahlung freischalten, kein Handanlegen pro Projekt)
- Monetarisierung pro Projekt flexibel; David selbst hat einen Comp-/Premium-
  Zugang (zahlt nie)
- **Alle Sites bleiben im Monorepo** (ein Core-Fix kann über kontrollierte
  Release-Wellen auf alle Sites ausgerollt werden — L5)

**Update 2. Runde (2026-07-14):**
- **D2 (Projekt-pro-Site) und D3 (Hybrid-Dashboard): von David bestätigt ✅**
- **Onboarding-Wizard revidiert:** kein WordPress-artiger On-Site-Wizard mehr.
  Der Erstellungs-Flow lebt im Control Plane (hawaii.studio: Signup → Site
  anlegen → Basics/Theme/Features) — siehe F4 neu. Ein dünner On-Site-`/setup`
  bleibt nur als optionaler Fallback für Klasse-A-Übergaben.
- **Bausteine-Tiering:** `media` (Galerie) = optionales Feature;
  `pages`/Mini-CMS = **foundation** (jede Site braucht pflegbare Seiten + SEO).
- **Portfolio-Neuaufbau ohne Strapi** — Content kommt vollständig aus den
  eigenen Feature-Layern (Appwrite).
- **Lokal-first:** M1–M5 werden komplett lokal (OrbStack-Appwrite) gebaut;
  PHASE-17 ist erst Voraussetzung für den Live-Gang und M6+ (Provisioning
  gegen echte Infrastruktur).
- **Sprachen: EN = Default, DE = optional** — entspricht exakt der
  bestehenden i18n-Strategie (`prefix_except_default`, en ohne Prefix,
  de unter `/de/*`). Im Onboarding (F4.2) wählt der Ersteller die aktiven
  Locales seiner Site. Plattform-Regel: JEDER Feature-Layer liefert seine
  Locale-Files immer für ALLE Plattform-Sprachen (heute en+de) — eine neue
  Sprache später ist damit **für die UI-Layer-Locales** ein reiner
  Übersetzungs-Durchlauf. Für NUTZERGENERIERTE Inhalte gilt das NICHT
  pauschal (6. Runde): der pages-Layer definiert ein bewusstes
  Locale-Datenmodell (lokalisierte Inhalte, sprachabhängige Slugs,
  canonical/hreflang, Fallback-Regeln, SEO-Metadaten, ggf. Suche/Medien/
  E-Mail-Inhalte).

---

## 1. Realitäts-Check: Was der Plan trifft und wo er kollidiert

### Trägt bereits (nicht anfassen, nur ausbauen)

| Baustein | Beleg |
|---|---|
| Layer-Komposition per `extends` = Feature an/aus pro Site | `apps/_template/nuxt.config.ts` |
| Entkoppelte Verträge (Admin-Nav-Registry, `registerUserDataContributor`, Escalation-Handler) | CONCEPT A14 |
| Idempotente Migrationen + zentraler Runner `pnpm migrate --app` | `scripts/migrate.mjs` |
| Runtime-Config-Kanal existiert: `app_config`-Row + `useRuntimeFlags()` + Realtime-Push ohne Reload | `packages/core/server/utils/appConfig.ts`, `plugins/realtime-config.client.ts` |
| Laufzeit-Override-Muster existiert: `getEffectiveAiConfig()` (Build-Default < DB-Override) | `core/server/utils/aiComplete.ts` |
| Billing-Layer (Stripe Checkout/Portal/Webhook/Entitlements) fertig | GOALS Phase 23 |
| `apps/_template` + Bootstrap-Script als Scaffold | `apps/_template/scripts/bootstrap.ts` |

### Kollidiert mit dem SaaS-Ziel (bewusste Alt-Entscheidungen)

1. **„1 App = 1 eigene Appwrite-Instanz"** (A1) — für eigene Sites gut, für
   Self-Service unbezahlbar (ein Server pro Anmeldung). → Präzisierung nötig:
   Isolation auf **Projekt**-Ebene statt Instanz-Ebene (§ D2).
2. **RBAC ist bewusst single-tenant** (Label-basiert, „keine Teams") — für
   eine Site korrekt; Workspaces/Kunden brauchen aber eine Mandanten-Ebene.
   → Lösung: Mandanten leben NUR im Control Plane, Sites bleiben single-tenant.
3. **Feature-Wahl ist Buildzeit** (`extends` + `package.json`, doppelt
   gepflegt) — „im Dashboard aktivieren" ist damit strukturell unmöglich.
   → Zwei-Klassen-Modell (§ D1) + Laufzeit-Gates (§ F).
4. **Migrationen teils destruktiv** (comments-002-Erstumbau, Frische-Guard im
   Bootstrap) — nachträgliches Feature-Aktivieren auf befüllter Prod-Instanz
   ist heute riskant. → Muss „additiv-sicher" werden, bevor ein Wizard
   Migrationen anstoßen darf.
5. **In-Memory-Rate-Limit / Single-Instanz-Annahmen** (A2, PHASE-17 A.8) —
   für die Multi-Site-Platform-App Pflicht-Umbau auf Redis.
6. **Same-Root-Domain-Zwang App↔Appwrite** (A3, Cookie/Realtime) — bleibt
   gültig und diktiert das Domain-Modell (§ D4). Kein Bug, aber jede
   Custom-Domain braucht einen passenden API-Host derselben Root-Domain.
7. **Kein Setup-Wizard, kein Framework-Billing** — beides existiert schlicht
   nicht; `packages/billing` monetarisiert End-User IN einer App, nicht die
   Plattform selbst.

**Fazit:** Der Plan ist tragfähig, aber „SaaS von Anfang an" heißt nicht
„SaaS zuerst bauen". Es heißt: die vier Nahtstellen (Site-Manifest,
Laufzeit-Gates, Entitlements, Provisioning-API) so bauen, dass sie in allen
drei Horizonten identisch funktionieren. Alles davon nützt sofort den eigenen
Sites — nichts ist Wegwerf-Arbeit für hypothetische Kunden.

---

## 2. Ziel-Architektur

### D0 — Drei Horizonte, eine Architektur

```
Horizont 1 (jetzt):    Eigene Sites        → Studio-Sites + create-site + Laufzeit-Gates
Horizont 2 (danach):   Agentur/Kunden      → Control Plane + Provisioner + Workspaces
Horizont 3 (später):   Self-Service-SaaS   → Platform-App + Stripe-Entitlements + Domain-Automation
```

### D1 — Zwei Site-Klassen (löst den Konflikt Monorepo ⟷ Self-Service)

**Klasse A: Studio-Site** — eine dünne App im Monorepo (`apps/portfolio`,
`apps/photos`, `apps/community`, Kundenprojekte mit Custom-Design).
Benennungs-Entscheidung (David, 2026-07-14): die eigenen Sites heißen
`apps/portfolio` und `apps/photos`.
- Feature-Wahl per `extends` (Buildzeit) + Laufzeit-Gates für Feinheiten.
- Volle gestalterische Freiheit (eigene Pages/Components/Overrides).
- Deploy: eigene ploi-Site + Deploy-Webhook (bestehendes PHASE-17-Modell).
- Neue Studio-Site anlegen = Scaffold-Script (§ P1), kein Self-Service.

**Klasse B: Platform-Site** — EINE generische App `apps/platform`, die
**alle** Feature-Layer einkompiliert hat und pro Hostname zur Laufzeit
entscheidet, welche Site sie rendert und welche Features aktiv sind.
- Ein Deployment bedient N Sites (Wildcard-Hostname `*.hawaii.studio`).
- Site-Erzeugung = DB-Eintrag + Appwrite-Projekt, KEIN Build, KEIN Deploy
  → der einzige uns bekannte Weg, wie Fremde sich selbst eine Site
  erstellen können, während alles im Monorepo bleibt. ⚠️ Trägt nur, wenn
  Spike S3 (pro-Request-Projekt-Auflösung) besteht.
- Gestaltung über Custom Themes/Fonts (existiert!) statt Code-Overrides.
- Braucht: Redis-Rate-Limit, hostname→Site-Auflösung, per-Request-Appwrite-
  Projekt-Auswahl.

**Pilot-Rolle der Studio-Sites (bestätigt 2026-07-14):** Neue Features
werden als Feature-LAYER (`packages/*`) gebaut und in einer Studio-Site
pilotiert (z. B. media-Layer in `apps/photos`). Da `apps/platform`
schlicht alle Layer einkompiliert, ist ein gereifter Layer dort automatisch
verfügbar — es wird nichts aus der App „herüberkopiert"; die App ist das
Testgelände, der Layer das Produkt.

**Upgrade-Pfad B→A (Warum):** Das ist der natürliche Upsell-/Wachstumspfad
des Agentur-Modells — ein Kunde startet günstig self-service (B), wächst und
bucht später Custom-Design/Sonderfunktionen, die nur eine eigene App kann.
Die Architektur (Daten im Appwrite-Projekt, Frontend austauschbar) macht den
Pfad MÖGLICH — er ist aber ein geplanter, getesteter Cutover-Prozess, kein
kostenloser Schalter (4. Runde präzisiert).

**Upgrade-Pfad B→A (Wie):** Alle Daten einer Site (User, Inhalte, Theme,
Config) leben in IHREM Appwrite-Projekt — nie in der Platform-App. Es ist
also **keine Inhaltsmigration** erforderlich; der Cutover selbst braucht
trotzdem einen definierten Prozess:
1. **Kompatibilitätsprüfung:** die neue Klasse-A-App muss mindestens das
   Feature-Set der B-Site einkompilieren; Theme-/Config-Daten der
   Platform-Site müssen von der Studio-App identisch interpretiert werden
   (gleiche Layer ⇒ strukturell gegeben, per Checkliste verifizieren).
2. **Staging-Probelauf** gegen eine Projekt-Kopie (Restore-Script aus L1).
3. **Cutover:** App deployen → Domain-Routing umstellen → Web-Platform-
   Einträge, OAuth-Callbacks, CORS und Realtime-Endpoint nachziehen.
4. **Session-Test statt Session-Versprechen:** Cookie-Kontinuität hängt an
   Host-only-vs.-Domain-Cookies und daran, ob die Domain identisch bleibt
   (Custom Domain bleibt gleich → gute Chancen; Wechsel Subdomain→Custom
   Domain → Re-Login einplanen). Wird im Cutover-Prozess explizit getestet.
5. **Rollback:** Routing zurück auf `apps/platform` (Daten unberührt).

**Reihenfolge:** Klasse A sofort (eigene Sites). Klasse B erst in Horizont 3
bauen — aber alle Verträge (Manifest, Gates, Entitlements) von Anfang an so
schneiden, dass Klasse B sie unverändert konsumieren kann.

### D2 — Appwrite: ein Server, ein PROJEKT pro Site

Präzisierung von A1: Die Isolations-Einheit ist das **Appwrite-Projekt**
als eigenes LOGISCHES Projekt (eigene Database, eigene User, eigene
Buckets, eigener Cookie `a_session_<PROJECT_ID>`), nicht zwingend der
Server — zur physischen Realität siehe den Präzisions-Absatz unten.

- **Ein gemeinsamer self-hosted Appwrite-Server** (Hetzner, das bestehende
  PHASE-17-Setup) hostet die Projekte aller eigenen + Platform-Sites.
- Pro Site: eigenes logisches Projekt mit eigener Database/Buckets +
  eigenen Keys. Präzision (4. Runde): das ist **logische Mandantentrennung** — Appwrite erzwingt sie
  über projectId-Scoping aller APIs, per-Projekt-Keys und getrennte
  Databases/Buckets. **Physisch** liegen alle Projekte in derselben MariaDB
  und denselben Volumes (vgl. L1). Vertraglich wird logische Trennung
  zugesichert, nicht physische; ein Appwrite-Bug oder fehlkonfigurierter
  Key kann prinzipiell projektübergreifend wirken → Mitigation:
  Least-Scope-Keys, zeitnahe Security-Updates, Audit-Log. Physische
  Trennung ist die Eskalationsstufe (nächster Punkt).
- Eskalations-Stufen bleiben möglich: sensibler Kunde → dedizierte Instanz
  (heutiges A1-Modell); Kunde will Datenhoheit → Appwrite Cloud auf
  Kundenaccount. Das Manifest (§ F1) trägt dafür ein `appwrite.endpoint`.
- Skalierung: ab ~X Sites zweiter Appwrite-Server; das Sites-Register im
  Control Plane kennt pro Site ihren Endpoint → späteres Sharding ist
  strukturell vorbereitet (kein Architektur-Umbau — aber realer
  Betriebsaufwand: Projekt-Umzüge, Backups und Monitoring pro Server).
- Eskalationskriterien zur dedizierten Instanz (im Vertrag/Plan benennbar):
  Compliance-Anforderung des Kunden, Lastprofil (>X % Server-Ressourcen),
  Datenhoheit (eigener Account), SLA-Stufe.

⚠️ MariaDB/Ressourcen: viele Projekte auf einer Instanz teilen sich Worker
und DB — Health-Monitoring pro Projekt (Control Plane) einplanen; der
bekannte Realtime-Container-Watchdog (PHASE-17) gilt dann für alle Sites
gleichzeitig → Single Point of Failure bewusst akzeptieren + überwachen.

### D3 — Dashboard: **Hybrid** (Empfehlung)

- **Jede Site behält ihr eigenes `/dashboard`** (Inhalte, Kommentare,
  Moderation, Themes, Mitglieder). Gründe: (a) Kunden-/Site-Admins arbeiten
  in IHRER Domain mit IHRER Session — kein Cross-Instance-Auth-Bruch des
  Cookie-Modells; (b) Sites bleiben funktionsfähig, auch wenn das Control
  Plane down ist; (c) das gesamte bestehende Admin-Paket wird unverändert
  weiterverwendet.
- **hawaii.studio = Control Plane** („Mission Control", eigene Maui-App
  `apps/studio` mit eigenem Appwrite-Projekt): Workspace-/Site-Register,
  Provisionierung, Feature-Entitlements + Plan/Abo je Site, Health/Status
  aller Sites, Abrechnungen. Linear-artiger Workspace-Switcher, der zu den
  Site-Dashboards **verlinkt** (später optional SSO-Handoff via kurzlebigem
  Token — bewusst NICHT Teil des MVP).
- Eine „zentrale Schaltzentrale", die fremde Site-Inhalte direkt editiert,
  wird **abgelehnt**: sie müsste das Session-Cookie-Modell (A3) umgehen,
  Admin-Keys aller Sites zentral halten und macht hawaii.studio zum
  Totalausfall-Risiko und Angriffsziel Nr. 1.

Warum das trotzdem Davids „Schaltzentrale"-Bedürfnis erfüllt: ALLES, was
site-übergreifend ist (welche Site hat welche Features, welcher Kunde zahlt
was, welche Site ist unhealthy, neue Site anlegen) lebt zentral. Nur die
site-INTERNE Arbeit bleibt in der Site — wo sie ohnehin kontextuell hingehört.

### D4 — Domain-Modell

Constraint (A3, unverändert): Site-Frontend und Appwrite-Endpoint müssen auf
derselben **Root-Domain** liegen (Session-Cookie + authentifiziertes Realtime).

- **Default:** jede neue Site startet als `<slug>.hawaii.studio`;
  Appwrite-API zentral unter `api.hawaii.studio` → gleiche Root-Domain;
  ⚠️ das konkrete Cookie-/Session-Verhalten wird durch den S3-Browser-PoC
  bestätigt, nicht angenommen.
  Ploi/Cloudflare: Wildcard-DNS `*.hawaii.studio` + Wildcard-Cert einmalig.
- **Custom Domain, Frontend-TLS (Klasse B):** Empfehlung **Caddy (oder
  Traefik) mit On-Demand-TLS** vor `apps/platform`: erster Request auf einen
  unbekannten Hostname → Caddy fragt einen `ask`-Endpoint des Control Plane
  („gehört diese Domain einer Site?") → Let's-Encrypt-Cert wird on the fly
  ausgestellt. Null Per-Domain-Konfiguration; das Standard-Muster für
  SaaS-Custom-Domains. Alternative: Cloudflare for SaaS (Custom Hostnames,
  100 frei) — weniger Eigenbetrieb, mehr Vendor-Bindung.
- **Custom Domain, Appwrite-API — zwei Optionen:**
  - *Option 1 (volle Parität, Studio-Sites):* `api.<kundendomain>` als
    **Appwrite Custom Domain pro Projekt** (offiziell unterstützt: CNAME auf
    den Appwrite-Host, Zertifikat automatisch; self-hosted via
    `_APP_DOMAIN_TARGET` + certificates-worker). Eigene Sites:
    10-Minuten-Handgriff; automatisierbar — Spike S2.
  - *Option 2 (pragmatisch, Platform-Sites):* zentraler Endpoint
    `api.hawaii.studio` für ALLE Platform-Sites, auch unter Custom Domains.
    Trägt, weil die Architektur SSR-first ist (CRUD server-seitig, Cookie ist
    First-Party auf der Site-Domain) und die geteilte Realtime **JWT-
    authentifiziert** ist (kein Cookie zum Appwrite-Host nötig). Einschränkung:
    cookie-native Browser-Pfade (useRealtimeAccount-Instant-Revoke,
    Presences-Cookie-GET) degradieren cross-root → brauchen JWT-/Server-Proxy-
    Varianten oder Polling-Fallback. Option 1 später als „White-Label-API"-
    Premium-Feature anbieten. ⚠️ Option 2 ist eine UNVERIFIZIERTE ANNAHME
    und im Zweifel eine eigene Auth-/Realtime-Architektur — sie wird erst
    nach bestandenem S3-Browser-PoC (Checkliste bei den Spikes) festgelegt.
- OAuth-Callbacks, `NUXT_PUBLIC_I18N_BASE_URL`, Web-Platform-Registrierung
  hängen an der Domain → gehören ins Provisioning-Script, nicht in Doku.

---

### D5 — Rollenmodell (entschieden 2026-07-14)

Rollen leben auf ZWEI getrennten Ebenen — bewusst nicht vermischt:

**Plattform-Ebene (hawaii.studio, eigener User-Pool):**
- `superadmin` (David): alles im Control Plane — Sites/Workspaces anlegen,
  suspendieren, löschen, Features/Entitlements schalten, Pläne, Health.
- `owner` (Kunde): sieht/verwaltet NUR den eigenen Workspace (seine Sites,
  sein Abo, seine Domains, Feature-Buchung).
- Später bei Bedarf: `member` (Kunde lädt Kollegen in seinen Workspace ein)
  — Datenmodell (Workspace↔User-Relation) von Anfang an so anlegen, Rolle
  aber erst bauen, wenn gebraucht.

**Site-Ebene (pro Appwrite-Projekt, bestehendes Label-RBAC + eine neue Rolle):**
- `admin` (der Kunde auf seiner Site): Inhalte, Einstellungen, Nutzer
  verwalten, Moderatoren/Editoren ernennen.
- `editor` (**aufgenommen, David 2026-07-14**): reine Inhalts-Rolle —
  Inhalte **anlegen, bearbeiten, deaktivieren (unveröffentlichen), löschen**
  über alle aktivierten Content-Features (pages, posts, media, events,
  courses, changelog-Einträge …). KEIN Zugriff auf: Site-Settings,
  Feature-Toggles, Nutzer-/Rollenverwaltung, Moderation, Billing.
  Umsetzung als neues Label in der bestehenden Capability-Matrix
  (Capability-Familie `content.*`, die Content-Layer deklarieren ihre
  Routen dagegen); wird konkret gebaut, sobald der pages-Layer kommt.
- `moderator`: Moderations-Capabilities (bestehende Matrix, unverändert).
- User ohne Label = normales Mitglied/End-User der Site.

**Davids „Superadmin überall" — präzisiert (von David bestätigt ✅):**
- Klasse A / Agentur-Sites: der Provisioner legt Davids Admin-Account im
  Site-Projekt automatisch mit an („David bleibt Voll-Admin" — vertraglich
  so vereinbart, Teil des Agentur-Modells).
- Klasse B / Self-Service-Sites: KEIN stiller Dauer-Admin-Account in
  fremden Sites. Superadmin-Macht wirkt über das Control Plane (Lifecycle:
  suspendieren/löschen/Features) — Inhalts-Zugriff nur als **transparenter
  Support-Zugang**: zeitlich begrenzt, geloggt (Audit), idealerweise vom
  Owner ausgelöst („Support-Zugriff gewähren"). Das ist DSGVO-/Vertrauens-
  Hygiene und gehört in ToS/AVV (L7).

## 3. Das Feature-System (Herzstück, nützt allen Horizonten)

### F1 — Feature-Manifest pro Layer

Heute doppelt gepflegt (`extends` + `package.json`) und nirgends maschinen-
lesbar, WAS ein Layer braucht. Neu: jeder Feature-Layer exportiert ein
Manifest (Konvention `packages/<layer>/feature.manifest.ts`):

```ts
export default defineFeatureManifest({
  key: 'comments',
  tier: 'optional',              // 'foundation' | 'optional'
  entitlementKey: 'comments',    // Abgleich mit Control-Plane-Plan
  requires: ['moderation'],      // Layer-Abhängigkeiten
  migrations: 'scripts/migrations',
  adminModules: [...],           // wandert aus app.config hierher (Referenz)
  runtimeGate: 'maui.comments.enabled',
})
```

- Ein Site-Manifest pro App (`apps/<site>/site.manifest.ts`) listet die
  gewählten Features; ein Codegen-/Check-Script hält `extends` +
  `package.json` synchron (Single Source of Truth, CI-geprüft).
- **Katalog-Artefakt (4./5. Runde):** Die Manifeste liegen im Monorepo — das
  Control Plane rendert den Katalog (F7) aber zur Laufzeit. Deshalb
  generiert der Build ein validiertes, VERSIONIERTES Katalog-Artefakt
  (JSON aus allen Manifesten). Veröffentlichungsrichtung: das Artefakt wird
  beim **Release ins Control Plane publiziert** (API/Storage des
  Studio-Projekts, nicht einkompiliert) — so kann `apps/studio` unabhängig
  von der Platform-App deployen. Drei getrennte Versionen:
  `catalogVersion` (Stand des Artefakts) · `platformReleaseVersion`
  (was die laufende Platform-App tatsächlich enthält) · und statt eines
  einzelnen `siteSchemaVersion` eine **per-Feature-Matrix** im
  Sites-Register (6. Runde — ein Skalarwert wird bei optionalen Features
  mehrdeutig):
  ```
  installedSchema:
    core: 7
    comments: 3
    moderation: 2
  ```
  Jedes Platform-Release deklariert pro Feature einen **unterstützten
  Schema-BEREICH** (7. Runde — auch nach oben begrenzt, weil ein zu neues
  Schema für älteren Code ebenso inkompatibel sein kann):
  ```
  supportedSchema:
    comments: { min: 3, max: 4 }
  ```
  **Maschinell präzise Regel:** ein Feature ist aktivierbar/deploybar ⇔
  es ist im Katalog vorhanden ∧ die laufende `platformReleaseVersion`
  enthält es ∧ `min ≤ installedSchema[feature] ≤ max` (liegt es darunter:
  zuerst Migration via Statusmaschine). Konsequenz für L5-Rollbacks:
  Schema migriert nur vorwärts — ein CODE-Rollback ist nur erlaubt, wenn
  die ältere Version das aktuelle Schema laut ihrem `supportedSchema`
  ausdrücklich einschließt. Insbesondere wird KEIN Entitlement für ein
  Feature ausgestellt, das die laufende Platform-Version nicht enthält.
- Grundgerüst laut David = foundation-tier: core, system, auth/profile
  (core), billing, themes, admin, audit (system), changelog. Optional:
  comments, courses, events, feedback, activity, posts, tickets, moderation
  (auto-required von comments/posts).

### F2 — Laufzeit-Gates verallgemeinern (`getEffectiveConfig`)

Das AI-Override-Muster (`app_config.aiModel > maui.ai`) wird generalisiert:

- `app_config` bekommt ein `features`-JSON (system-Migration): pro
  Feature-Key `enabled` + optionale Settings-Overrides.
- `getEffectiveFeature(key)` (server) = Entitlement (§ F3) ∧
  `app_config.features[key]` ∧ `maui.<key>`-Build-Default.
- Client: `useFeature(key)` — reaktiv über den EXISTIERENDEN
  realtime-config-Kanal (Toggle im Dashboard wirkt live, ohne Reload).
- Enforcement bleibt server-seitig an den Routen (wie heute
  `commentsEnabled`); UI blendet nur aus.
- **Aktivierung ist eine verteilte Transaktion** (4. Runde): Entitlement,
  Migration und Runtime-Flag können einzeln fehlschlagen. Pro Site×Feature
  gilt eine explizite Statusmaschine:
  `inactive → provisioning → active → disabling → inactive`, plus `error`
  (mit Retry + markierter manueller Recovery). Das Gate wird erst NACH
  erfolgreicher Migration aktiv — nie „sichtbar, aber Schema fehlt".
  Schritte idempotent (Idempotency-Key), auditiert. Abhängigkeitsketten
  (comments→moderation) sind für NUTZER atomar — technisch gibt es über
  mehrere API-/Schema-Operationen keine echte Transaktion und bewusst
  keinen Schema-Rollback (5. Runde): schlägt `comments` nach erfolgreichem
  `moderation` fehl, bleiben vorbereitete, aber INAKTIVE Schemaanteile
  zurück; Recovery läuft vorwärts per Retry; der Status bleibt
  `provisioning`/`error` und ALLE Gates der Kette bleiben geschlossen.
- Wichtig: Für Studio-Sites ist das Gate ein **Aus-Schalter innerhalb der
  einkompilierten Features** (Feature deaktivieren ohne Deploy). Für
  Platform-Sites ist es der EINZIGE Schalter.

### F3 — Entitlements (Monetarisierung, David = comp)

- Control Plane besitzt `workspaces`, `sites`, `plans`, `entitlements`
  (eigene Tables im Studio-Appwrite-Projekt) + Stripe via vorhandenem
  `packages/billing`-Muster (Abo pro Workspace/Site statt pro End-User).
- Jede Site erhält ihr Entitlement-Set als **signiertes Dokument** (JWT o.
  signierte JSON, Public Key in der Site-Env): Site cached es in
  `app_config`, prüft Signatur+Ablauf, refresht periodisch. Vorteile:
  Site bleibt bei Control-Plane-Ausfall funktionsfähig (Grace-Period),
  kein Live-Call pro Request, nicht fälschbar.
- Davids Workspace: Plan `studio-unlimited` (alles frei) — Monetarisierung
  ist damit von Tag 1 modelliert, ohne dass irgendwer zahlen muss.
- **Technische Gültigkeit ≠ kaufmännischer Zustand** (4. Runde): getrennte
  Felder `validUntil` (Signatur-Ablauf) und `graceUntil`. Läuft ein Dokument
  wegen technischer Störung ab (Control Plane/Netz/Worker down), nutzt die
  Site das zuletzt gültige Entitlement weiter (last-known-good bis
  `graceUntil`). Wichtig (6. Runde): die SIGNATUR wird auch in der
  Grace-Period immer geprüft — toleriert wird nur der fachliche Ablauf
  (`validUntil`), nie ein ungültiges oder gefälschtes Dokument.
  GESPERRT wird nur über ein explizites `suspended`-Flag
  (echte Kündigung/Zahlungsausfall). Dazu: Key-Rotation über `kid`,
  Clock-Skew-Toleranz (±5 min).
- **Zustellung von Suspension — zwei getrennte Mechanismen (5. Runde):**
  *(a) Normale kaufmännische Änderungen:* `suspended` ist Teil des
  signierten Dokuments; die Site MUSS mindestens alle 15 min pullen
  (Push/Realtime nur als Beschleunigung, nie als einziger Kanal) —
  Wirksamkeit ≤ Poll-Intervall. War der letzte gültige Zustand „aktiv" und
  die Site erreicht das Control Plane dauerhaft nicht, läuft sie bis
  `graceUntil` weiter und degradiert dann (bewusst: Control-Plane-Ausfall
  sperrt keine zahlenden Kunden). *(b) Dringende Abuse-/Security-Sperre:*
  Push-Revocation allein ist als Kill-Switch zu schwach — zusätzlich wird
  am Edge/Reverse-Proxy (Host aus dem Routing nehmen) und/oder am
  Appwrite-Projekt (Platform/Keys deaktivieren) geblockt; Ziel-Wirkzeit
  Minuten, unabhängig von der Kooperation der Site.
- Kill-Switch bleibt nie destruktiv: Feature fällt auf `disabled`,
  Daten bleiben.

### F4 — Onboarding-Flow im Control Plane (revidiert 2026-07-14)

Der „Wizard" ist der **Site-Erstellungs-Flow in `apps/studio`**, nicht eine
On-Site-Seite:

1. **Signup/Login auf hawaii.studio** (Studio hat ein eigenes Appwrite-Projekt
   mit eigenem User-Pool — das sind die Plattform-Kunden, getrennt von den
   End-Usern der einzelnen Sites).
2. **„Neue Site":** Name + Slug (`<slug>.hawaii.studio`) → Basics (Sprache) →
   Theme aus der Galerie → Feature-Auswahl (aus den Manifesten, mit
   Plan-/Preis-Hinweis) → Anlegen.
3. **Provisioner** (§ P2) erzeugt Appwrite-Projekt, fährt Migrationen
   (foundation + gewählte Features), schreibt `app_config` inkl. Theme,
   legt den Ersteller als **Site-Admin im Site-Projekt** an (gleiche E-Mail,
   Passwort-Set-Link) und stellt Entitlements aus. **Identity-Mapping
   (4. Runde):** das Control Plane führt eine Mapping-Table
   (platformUser ↔ siteProject/siteUser) mit Lifecycle-Regeln: existiert die
   E-Mail im Site-Projekt schon → verknüpfen statt anlegen (mit Verify);
   E-Mail-Änderungen werden NICHT automatisch synchronisiert (dokumentiert);
   Owner-Transfer und Zugriffs-Widerruf (Kündigung/Mitarbeiterwechsel) sind
   definierte Operationen über dieses Mapping.
4. **Ergebnis:** `<slug>.hawaii.studio` ist live; Site-internes Arbeiten unter
   `<slug>.hawaii.studio/dashboard` (eigene Session der Site); Plan/Features/
   Domains/Billing weiter auf hawaii.studio (D3-Hybrid).
5. **Custom Domain nachträglich** über hawaii.studio → „Domain verbinden":
   DNS-Anleitung (CNAME/A) → Verifikation → Zertifikat automatisch (D4).
6. **Feature-Aktivierung nachträglich** (Reihenfolge 6. Runde korrigiert —
   konsistent zur F2-Statusmaschine): Toggle in hawaii.studio (oder
   Site-Dashboard, das ans Control Plane delegiert) →
   `provisioning` setzen → Abhängigkeiten prüfen → **Migrationen ausführen
   (Provisioner-Worker — NIE der Nuxt-Web-Prozess, der hat bewusst keinen
   Migrations-Key)** → erst DANACH Entitlement ausstellen/aktualisieren →
   Runtime-Gate (`app_config.features`) aktivieren → `active`. Bei einem
   Fehler bleiben Entitlement und Gate unverändert geschlossen
   (Status `error`, Vorwärts-Recovery per Retry). Bei Studio-Sites führt
   die Migration alternativ der Betreiber per
   `pnpm migrate --app <site> --layer <l>` aus — gleiche Reihenfolge.
7. **On-Site-`/setup` (optionaler Fallback, de-priorisiert):** dünner
   Claim-Schritt mit Setup-Token für Klasse-A-Übergaben ohne Control Plane.
8. **Voraussetzung bleibt:** Migrationen aller optionalen Layer müssen
   „additiv-sicher auf befüllter Instanz" auditiert sein (comments-002-
   Erstumbau!), bevor irgendein automatischer Pfad Migrationen anstößt.

---

### F5 — Plattform-Changelog (Idee David, 2026-07-14)

Für Platform-Sites (Klasse B) gibt es EINEN Plattform-Changelog („was ist im
Hotel neu"): Einträge werden mit Feature-Keys getaggt (`comments`, `media`,
`core`, …), jede Site zeigt ihren Gästen/Admins nur Einträge zu Features, die
sie aktiviert hat (+ `core`/foundation immer). Quelle kann der bestehende
Changelog-Track bleiben (Conventional Commits → Layer-Scope = Feature-Key).
Klasse-A-Sites behalten optional zusätzlich ihren eigenen Site-Changelog
(bestehender changelog-Baustein, unverändert).

### F6 — Schema- & Namens-Governance (Anforderung David, 2026-07-14)

Die Datenstruktur in Appwrite muss über alle SaaS-Ebenen hinweg identisch,
clean und selbsterklärend sein — sie ist bei hunderten Projekten das einzige,
was Ordnung hält. Verbindliche Konventionen (bestehende fortgeschrieben):

- **Unveränderliche Projekt-ID + veränderlicher Slug** (4. Runde): Projekt-ID
  = `<slug>-<shortid>` bei Erstellung (lesbar UND dauerhaft kollisionsfrei) —
  Umbenennen ändert nur Anzeige-Slug/Subdomain, NIE die Projekt-ID (Cookie,
  Keys, Logs bleiben stabil). Slugs: global eindeutig, Reserved-Liste
  (`api`, `www`, `studio`, `admin`, `mail`, …), gelöschte Slugs mit
  Quarantäne-Frist vor Wiedervergabe.
- **Database-ID immer `main`** (bestehende Konvention) — jede Site strukturell
  identisch; ein Blick in ein beliebiges Projekt genügt, um alle zu verstehen.
- **Tables:** snake_case, Owner-Layer laut A14-Matrix; JEDE Table gehört genau
  einem Layer und entsteht NUR durch dessen nummerierte Migrationen
  (`NNN-*.ts`) — die Migrationshistorie IST die Schema-Doku.
- **Buckets:** feste Namen pro Zweck (`avatars`, `fonts`, künftig `media`).
- **Keys:** pro Projekt exakt zwei (Runtime + Migrations, bestehende Regel);
  Benennung `<projectId>-runtime` / `<projectId>-migrations`.
- **Feature-Keys** (Manifest F1) = Layer-Name = Entitlement-Key = Changelog-
  Tag = `maui.<key>`-Gate — EIN Begriff pro Feature durch alle Ebenen.
- **Drift-Check:** ein Script vergleicht Ist-Schema einer Instanz gegen die
  Migrations-Definitionen (Teil der Health-Checks im Control Plane) — Sites
  dürfen strukturell nie voneinander abweichen, nur im Feature-SET.

### F7 — Feature-Katalog: Aktivieren wie WordPress-Plugins (David, 3. Runde)

Die Feature-Auswahl (Onboarding F4.2 + nachträglich im Dashboard) ist kein
nackter Schalter-Stapel, sondern ein **kuratierter Katalog** — UX-Vorbild
WordPress-Plugin-Seite, aber ausschließlich First-Party:

- Jedes Feature = eine Karte: Anzeigename, Kurzbeschreibung + „Was kann
  ich damit?"-Detailtext (i18n en+de), Icon, 1–2 Screenshots,
  Preis-/Plan-Badge (aus Entitlements), Abhängigkeits-Hinweis („aktiviert
  automatisch: Moderation").
- Quelle ist das Feature-Manifest (F1) — es bekommt dafür die Felder
  `title`/`description` (i18n-Keys), `icon`, `screenshots[]`. KEINE zweite
  Datenquelle; der Katalog rendert die Manifeste der verfügbaren Layer.
- Zustände pro Karte: `aktiv` / `inaktiv` / `im Plan enthalten` /
  `Upgrade nötig` (→ Checkout) / `bald verfügbar`.
- Deaktivieren ist immer verlustfrei (F2/F3-Grundsatz: Feature aus =
  unsichtbar, Daten bleiben) — das gehört als Hinweis auf jede Karte
  („Deine Daten bleiben erhalten").
- Bewusst NICHT: Third-Party-Plugins/Marketplace. Der Katalog listet nur
  eigene, gewartete Layer — Qualität ist das Verkaufsargument gegenüber
  dem WordPress-Plugin-Wildwuchs.

## 4. Provisionierung

### P1 — Horizont 1: `pnpm create-site` (Scaffold-Script)

Ein Kommando statt 5–10 manueller Schritte: kopiert `_template`, patcht
Name/Port/Env, legt per **Appwrite-Console-API/CLI** Projekt + Keys + Platform
an (Spike S1), führt `bootstrap` aus, generiert Setup-Token, druckt die
ploi/Cloudflare-Restschritte als Checkliste. Danach: Domain aufrufen →
optionaler `/setup`-Claim (F4.7, dünner Fallback für Klasse-A-Übergaben —
der On-Site-Wizard bleibt verworfen).

### P2 — Horizont 2/3: Provisioner-Worker im Control Plane

Eigener Node-Daemon (nicht die Nuxt-App; er hält die mächtigen Keys):
Site-Antrag → Appwrite-Projekt anlegen → Migrationen (foundation + gewählte
Features) → DNS (Cloudflare-API: `<slug>.hawaii.studio`) → bei Klasse A
zusätzlich ploi-API (Site + Env + Deploy-Webhook) → Entitlements ausstellen →
Setup-Link an den Ersteller. Robustheit (4. Runde): jeder SCHRITT wird
einzeln persistiert (`project`, `keys`, `migrations`, `dns`, `tls`,
`admin-invite`, `entitlements` — je `pending/done/failed`), nicht nur ein
Gesamtstatus. Dazu: idempotente Wiederaufnahme nach Crash, kompensierende
Aktion oder markierte manuelle Reparatur, Timeout → Dead-Letter-Zustand,
definierte Löschung teilweise angelegter Sites; Keys/Setup-Tokens
erscheinen NIE in Logs und liegen verschlüsselt (at rest) im Register.

### Spikes = Architecture Decision Gates (4. Runde verschärft)

Ohne bestandenen Spike wird keine davon abhängige Architektur endgültig
festgelegt — und kein davon abhängiges Milestone begonnen. Zeitlich
vorgezogen: **S2 + ein Minimal-S3** („2 Projekte × 2 Domains × Auth ×
Realtime") laufen VOR M6 (also bevor die Verträge/Schnittstellen des
Control Plane festgezurrt werden), nicht erst in M9.

S3-Browser-PoC-Checkliste (vollständig, nicht nur Happy Path):
SameSite-/Secure-/Host-only-Verhalten aller Session-Cookies · Login,
Logout, Instant-Session-Revoke · Realtime-Reconnect + JWT-Erneuerung ·
zwei Sites gleichzeitig eingeloggt im selben Browser · Wechsel Default- ↔
Custom-Domain · CSRF-/Origin-/Host-Header-Prüfung · OAuth, Passwort-Reset-
und E-Mail-Links auf beiden Domains.

- **S1:** Appwrite-Projekt-Erstellung self-hosted automatisieren.
  Empfehlung: **offizielle Appwrite CLI** (`appwrite projects create` etc.,
  Console-Account-Login, non-interaktiver CI-Modus) bzw. Console-SDK
  `@appwrite.io/console` im Provisioner. Risiko „inoffizielle API" wird
  neutralisiert durch: (a) wir kontrollieren die Server-Version selbst
  (self-hosted, Upgrades nur bewusst), (b) **CI-Smoke-Test** gegen die
  vorhandene Wegwerf-CI-Appwrite (Projekt anlegen → Key → Platform → löschen)
  — bricht ein Upgrade die API, wird es sofort rot, (c) Fallback-Muster
  **Projekt-Pool**: N Projekte auf Vorrat anlegen, bei Signup nur zuweisen.
  Explizit KEINE „KI klickt die Console"-Automatik — Provisioning muss
  deterministisch sein.
- **S2:** Custom-Domain + Zertifikat pro Projekt self-hosted end-to-end
  (CNAME → Verify → Cert), manuell und dann per API; plus Caddy-On-Demand-TLS-
  PoC für Frontend-Domains (D4).
- **S3:** `apps/platform`-Machbarkeit: pro-Request-Projekt-Auflösung.
  Lösungsskizze: Nitro-Middleware löst `Host` → Site-Record (LRU/Redis-Cache
  über dem Sites-Register, Realtime-Invalidierung) → `event.context.site =
  {projectId, endpoint}` — **bewusst OHNE Runtime-Key im Request-Kontext
  (7. Runde):** liegt der Key in jedem Request, steigt das Risiko
  versehentlicher Nutzung/Offenlegung. Systeminterne Operationen fordern
  ihn gezielt über einen separaten server-internen Secret-Resolver an
  (`getSystemClient(siteId, scope)`), der Aufrufe auditiert — so wird die
  Autorisierungs-Invariante STRUKTURELL erzwungen, nicht nur dokumentiert.
  **Sicherheits-Invarianten der Mandantenauflösung (5. Runde — dem
  `Host`-Header wird nie blind vertraut):** nur normalisierte, im
  Sites-Register VERIFIZIERTE Hostnamen akzeptieren · `X-Forwarded-Host`
  nur von bekannten Reverse Proxies übernehmen · unbekannte/doppelte/
  mehrdeutige Hosts hart ablehnen (404, KEINE Default-Site als Fallback) ·
  Site-Kontext nach der Middleware unveränderlich (frozen) · Cache-Key
  umfasst Hostname + projectId + Endpoint (Domain-Umzug invalidiert).
  Das ist die wichtigste Schutzschicht gegen Cross-Site-Datenzugriff
  durch fehlgeleitetes Routing. Da ALLES
  CRUD durch `server/api/*` läuft, ist der Umbau auf `server/lib/appwrite.ts`
  konzentriert (Client-Factories nehmen `event` statt statischer
  runtimeConfig). Client-seitig: `useSiteConfig()` (SSR-injiziert in den
  Payload) ersetzt direkte `useRuntimeConfig().public.appwrite*`-Reads;
  Cookie-Namen (`a_session_<PROJECT_ID>`) sind bereits pro Projekt eindeutig.
  PoC: 2 Projekte, 1 Platform-App, Hostname-Switch, Login + Realtime-Isolation
  verifizieren. Bleibt der technisch riskanteste Punkt von Horizont 3.
  **Abnahmekriterien S0/S3 (6. Runde, verbindlich):** normales Site-CRUD
  läuft nachweislich über die User-Session (Row Permissions + RBAC bleiben
  wirksam; kein normaler Request nutzt einen Key, der sie umgeht) ·
  Scope-Matrix je Key liegt vor · Negativtests bestanden: User A liest NIE
  Daten von User B, Moderator ist kein Admin, anonyme Requests bleiben
  anonym — jeweils über Site-Grenzen UND innerhalb einer Site.
- **S4 (6. Runde, Gate für M9): Quota-Enforcement.** Nachweisen, WO Limits
  technisch durchgesetzt werden: welche Appwrite-Bordmittel greifen hart
  pro Projekt (Auth-User-Limit, Bucket-Dateigrößen) vs. was Metering +
  Enforcement in den Nuxt-Routen braucht; können direkte Appwrite-Zugriffe
  (Realtime, Presence, Storage-URLs) die Prüfung umgehen? Wer misst
  Realtime-Verbindungen, Bandbreite, Mail-Volumen? Verhalten bei
  Überschreitung definieren (warnen → drosseln → read-only → blockieren,
  nie destruktiv) und Race-Conditions bei parallelen Uploads abfangen
  (Reservierung/periodischer Sweep statt exakter Echtzeit-Zählung).

---

## 5. Aufräumarbeiten am Bestand (Befunde der Analyse)

1. `extends`/`package.json`-Duplikation → Site-Manifest + Check (F1). 
2. Destruktive Migrations-Pfade auditieren; Bootstrap-Frische-Guard um
   „Layer nachinstallieren"-Modus ergänzen (F4.5).
3. Rate-Limit auf Redis-Store umstellbar machen (Interface jetzt, Redis wenn
   Klasse B kommt; PHASE-17 A.8 kennt das schon).
4. RBAC unangetastet lassen (Sites bleiben single-tenant); Workspace-RBAC
   nur im Control Plane (dort ggf. Appwrite Teams — genau der in
   RBAC-CONCEPT.md vorgesehene Auslöser ist jetzt da).
5. Port-Vergabe + `.env`-Konventionen ins Scaffold-Script (P1).
6. **Fehlende Bausteine fürs Grundgerüst-Versprechen** (Tiering entschieden
   2026-07-14): `packages/pages` (Mini-CMS: pflegbare Seiten + SEO/Meta) =
   **foundation** — jede Site braucht das; `packages/media` (Galerie/Bilder —
   maui.photos braucht ihn, heute hartkodierte `photos.ts`) = **optional**es
   Feature. Beide sind Kandidaten für die nächsten Feature-Layer und laufen
   über dasselbe Manifest-System (F1).
7. Sub-Projekte: `nuxt4-saas-template` archivieren (toter Vorläufer);
   `nuxt3-davidschubert.com` als `apps/portfolio` neu aufsetzen statt
   migrieren — **ohne Strapi** (entschieden 2026-07-14): Content kommt
   vollständig aus den eigenen Feature-Layern (pages/posts/media auf
   Appwrite); `nuxt-maui-photos` Design behalten, als `apps/photos`
   einziehen sobald media-Layer existiert; `hawaiistudio` (Prismic) ist
   KEINE Basis fürs Control Plane — frisch als `apps/studio` bauen.

---

## 6. Roadmap

Gates (G*) sind eigene Meilensteine — die Roadmap ist damit konsistent zur
Gate-Regel (5. Runde; vorher stand S2 in M7 und S3 in M9, im Widerspruch
zur Regel „S2 + Minimal-S3 vor M6").

| Phase | Inhalt | Horizont | Schätzung |
|---|---|---|---|
| **S0** | ✅ **BESTANDEN (2026-07-14, 12/12 Tests — [spikes/s0-multi-project](../../spikes/s0-multi-project/README.md)):** 2 echte Projekte auf Wegwerf-Instanz, Host-Auflösung ohne Default-Fallback, Kontext ohne Key, Session-/JWT-Projektbindung inkl. Cross-Site-Negativtests. Learnings: keyId global eindeutig (Provisioner!), Login = System-Op `auth-login` (session.secret nur mit Admin-Key), Appwrite-401 zentral mappen. **M1-Verträge können wie entworfen festgeschrieben werden.** | 1 | ✅ |
| M1 | Feature-Manifest + Site-Manifest + CI-Check (Verträge S0-informiert) | 1 | 2–3 PT |
| M2 | Laufzeit-Gates generalisieren (F2, inkl. Statusmaschine) + Feature-Seite im Admin | 1 | 3–4 PT |
| M3 | Migrations-Audit „additiv-sicher" + Feature-Aktivierung nachträglich (F4.6/F4.8) | 1 | 3–5 PT |
| M4 | ✅ **BESTANDEN (2026-07-15):** `pnpm create-site` (Scaffold + Console-Provisionierung + manifest-gefilterte Migrationen) — **G1/S1 läuft dauerhaft als CI-Step** (e2e.yml provisioniert bei jedem Push ein Projekt auf der echten Wegwerf-Appwrite; erster Lauf grün). Provisioner-Learnings in [M4-CREATE-SITE.md](M4-CREATE-SITE.md) | 1 | ✅ |
| M5 | Eigene Sites einziehen: `apps/portfolio`, `apps/photos` (+ media-Layer), Community | 1 | je 3–8 PT |
| **G2** | **Gate vor M6:** Spike S2 (Custom-Domain+Cert e2e) + Minimal-S3 („2 Projekte × 2 Domains × Auth × Realtime") bestanden — sonst kein M6 | 2 | 2–4 PT |
| M6 | Control Plane MVP `apps/studio` (Register, Health, manuelle Entitlements, Site-Erstellungs-Flow = F4) | 2 | 8–12 PT |
| M7 | Provisioner-Worker + ploi/Cloudflare-APIs (S2 bereits in G2 bestanden) | 2 | 6–10 PT |
| M8 | Workspace-Billing (Stripe) + signierte Entitlements (F3 voll) | 2/3 | 5–8 PT |
| **G3** | **Gate vor M9:** volles S3 (komplette Browser-PoC-Checkliste inkl. Session-CRUD-Abnahmekriterien) + **S4 Quota-Enforcement** bestanden — sonst kein M9/Self-Service | 3 | 4–7 PT |
| M9 | `apps/platform` (Klasse B) + Redis + Self-Service-Signup | 3 | 15–25 PT |

**PHASE-17-Abhängigkeit (präzisiert 2026-07-14):** M1–M5 laufen komplett
lokal (OrbStack-Appwrite; `create-site` legt Projekte auf der lokalen Instanz
an, Sites auf localhost-Ports). PHASE-17 wird Voraussetzung, sobald etwas
LIVE geht: eigene Sites deployen (Ende M5) und alles ab M6/M7 (Provisioning,
DNS/TLS, Health gegen echte Infrastruktur).

**Schätz-Disclaimer (4. Runde):** Die PT-Angaben sind **Happy-Path-
Prototyp**-Schätzungen. „Produktionsreif" (Tests, Observability, Security-
Hardening, Doku, Betriebsautomatisierung, Failure-Handling) ist vor allem
für M6–M9 separat zu budgetieren — realistisch Faktor 1,5–2,5 obendrauf.
**Gate-Regel:** G1 (S1) in M4 · G2 (S2 + Minimal-S3) zwingend vor M6 ·
G3 (volles S3 + S4) zwingend vor M9 — als eigene Roadmap-Zeilen (5. Runde).
Dazu S0 vor M1: die frühen Config-/Factory-Verträge, die Klasse B später
„unverändert" konsumieren soll, werden per Mini-Spike abgesichert, damit
S3 sie nicht nachträglich kippt.
**Verbindliche Gate-Kriterien (6. Runde, nicht verhandelbar):**
(1) Normales Site-CRUD erhält die User-Berechtigungen — es läuft über die
Session des Site-Users, nie pauschal über privilegierte Runtime-Keys
(S0/S3-Abnahmekriterien). (2) Quota-Enforcement ist vor jedem
Self-Service-Launch technisch nachgewiesen (S4).

## 7. Identifizierte Lücken (2. Review) — **alle bestätigt ✅ (3. Runde, 2026-07-14)**

Von David einzeln abgenickt („Machen wir so"), inkl. dreier Ergänzungen
(siehe L3/L6/L8). Nach Horizont sortiert: wann die Lücke BLOCKIEREND wird.

### L1 — Backup & Restore PRO SITE (blockiert: erste fremden Daten, H2)
Der geteilte Appwrite-Server bündelt alle Sites in EINER MariaDB + einem
Volume-Satz. Instanz-Backup (Dump + Volumes) ist einfach — aber das
Kundenversprechen wird als **definierte Wiederherstellungs-Garantie**
formuliert (RPO/RTO, z. B. „Stand höchstens 24 h alt, wiederhergestellt
innerhalb von X h"), nicht als absolutes „Daten gehen nie verloren"
(5. Runde). Dafür braucht es **Restore pro Site**: eine einzelne Site auf
einen definierten Stand zurückholen, ohne die anderen anzufassen.
Appwrite kann das nicht nativ → zwei sich ergänzende Ebenen (4. Runde):
**(a) Daten-Takeout per API** (Rows/Files via Admin-Key) — gut für
Export/L2, aber KEIN vollständiges Betriebs-Backup: Users samt
Passwort-Hashes, OAuth-Identities, Memberships/Labels, Row-/File-
Permissions, Table-/Bucket-Konfiguration, Datei-Metadaten, Prefs und
Platforms/Keys sind per API teils nicht (verlustfrei) exportierbar.
**(b) Infrastruktur-Ebene für echten Restore:** MariaDB-Dumps/PITR +
Volume-Snapshots mit konsistentem Zeitpunkt zwischen DB und Storage;
Per-Site-Restore = selektives Wiederherstellen EINES Projekts daraus
(eigenes Konzept + Script). **Vor dem ersten Kunden: echter DR-Test** mit
dokumentiertem Ergebnis, WAS exakt wiederherstellbar ist — ein
ungetestetes Backup ist keins.

### L2 — Site-Lifecycle-Ende: Kündigung, Export, Löschung (H2/H3)
Heute existiert GDPR pro USER (`registerUserDataContributor`). Es fehlt die
SITE-Ebene: Kündigung → Grace-Period (Site read-only/offline, Daten bleiben)
→ Daten-Takeout (Export-Format = derselbe Per-Projekt-Export aus L1) →
endgültige Projekt-Löschung mit Frist. Auch für Agentur-Kunden relevant
(„ich will mit meinen Daten woanders hin"). Status-Maschine im Sites-Register
(6. Runde erweitert):
`active → suspended → exporting → deletion_scheduled → deleted`, dazu
`deletion_failed` (Retry/manuelle Reparatur, nie stilles Halb-Löschen) und
`legal_hold` (friert die LÖSCHUNG ein, z. B. bei Rechtsstreit; ob auch
Export/Auskunft pausiert, ist juristisch als Policy zu klären —
gesetzliche Auskunfts-/Datenzugangsrechte können daneben fortbestehen).

### L3 — Quotas & Missbrauch (blockiert: Self-Service, H3)
Nirgends begrenzt heute, was eine Site verbrauchen darf. Pro Plan nötig:
Storage-Quota (media!), Upload-Größen, User-/Row-Zahlen, Mail-Volumen,
Rate-Limits. Dazu Plattform-Missbrauch: Fremde publizieren unter
`*.hawaii.studio` → Phishing/Spam-Sites treffen DEINE Domain-Reputation und
Haftung (DSA). Braucht: Melde-Mechanismus, Suspend-Knopf im Control Plane
(existiert als Status in L2), Signup-Schutz (E-Mail-Verify + Rate-Limit,
ggf. manuelle Freigabe am Anfang).
**Ergänzung David:** Quota-Defaults kommen aus den Superadmin-Settings
(pro Plan), sind aber PRO SITE individuell überschreibbar (z. B. User-Limit
für einen einzelnen Kunden anheben) — Auflösung analog F2:
Site-Override > Plan-Default > Plattform-Default.
**Ergänzung 6. Runde:** WO die Limits technisch durchgesetzt werden, ist
ungeklärt und braucht einen Machbarkeitsnachweis → **Spike S4, Blocker für
M9/G3** (Details bei den Spikes).

### L4 — Transaktions-E-Mail pro Site (H2)
`sendMail()` existiert, aber: VON welcher Adresse mailt lisas-bakery.com?
Entscheidung: Stufe 1 = zentraler Absender (`no-reply@mail.hawaii.studio`,
„im Auftrag von <Site>", Reply-To Site-Owner) — eine Domain, deren
SPF/DKIM/Reputation wir pflegen. Stufe 2 (Premium/Klasse A) = eigene
Absender-Domain des Kunden (er setzt SPF/DKIM-Records, wir verifizieren —
analog Custom-Domain-Flow). Mail-Volumen zählt in die Quota (L3).

### L5 — Deploy- & Migrations-Orchestrierung über N Sites (H1, ab M5!)
Monorepo heißt: EIN Push aktualisiert alle Klasse-A-Sites — aber jede hat ihr
EIGENES Appwrite-Projekt, dessen Schema mitziehen muss. Nötig: Deploy-Pipeline
pro Site führt VOR dem Code-Switch `pnpm migrate --app <site>` aus (Migrationen
sind idempotent + additiv-sicher nach M3 — Code n-1 muss mit Schema n laufen,
d. h. Migrationen immer abwärtskompatibel schreiben). Plus **Canary-Reihenfolge**:
eigene Sites zuerst, Kunden-Sites danach (einfach über die ploi-Webhook-
Reihenfolge). Gleiches Prinzip für Appwrite-SERVER-Upgrades: Staging-Instanz
zuerst, dann der geteilte Server (betrifft ALLE Sites gleichzeitig!).
**Ergänzung (4. Runde) — Release-Wellen statt Auto-Rollout:** „ein Push
aktualisiert alle Sites" ist auch ein Blast-Radius. Releases laufen in
Wellen `internal → canary → stable`; Kundensites folgen nicht jedem Commit
automatisch, sondern der stable-Welle; optionaler temporärer Site-Pin +
definierter Rollback (Code zurück ist einfach, Schema nur vorwärts —
deshalb Migrationen abwärtskompatibel, s. o.).

### L6 — Zentrales Monitoring & Alerting (H2)
`maui.observability` existiert pro App; es fehlt die Plattform-Sicht: Uptime-
Checks pro Site, Error-Raten, Realtime-Container-Watchdog (bekannter
Swoole-Crash trifft künftig ALLE Sites), Quota-Verbrauch, Cert-Abläufe.
Gehört ins Control Plane (M6-Health-Teil), Alerting an David (E-Mail reicht
anfangs). Der geteilte Server ist ein akzeptierter SPOF — akzeptiert heißt:
überwacht + Restore-Plan (L1) + dokumentierte Wiederanlauf-Zeit.
**Ergänzung David:** Getrennt vom Plattform-Monitoring wird
**Site-Analytics** (Besucherstatistiken fürs eigene Dashboard des Kunden)
ein eigenes, KOSTENPFLICHTIGES Feature (Layer-Kandidat `analytics`, läuft
über das normale Manifest-/Entitlement-System; datenschutzfreundlich,
cookielos — passt zu maui.consent).

### L7 — Rechtsrahmen der Plattform (H2 vor erstem Kunden)
Sobald Kunden-Sites laufen, ist David im **Standardmodell
Auftragsverarbeiter** (6. Runde präzisiert: je nach Einfluss auf Zwecke und
Mittel im Einzelfall zu prüfen — ggf. gemeinsame Verantwortlichkeit;
rechtliche Beratung einholen): AVV/DPA-Vorlage,
ToS der Plattform, Subprozessoren-Liste (Hetzner, Stripe, Cloudflare, ggf.
Mail-Provider), Preis-/Plan-Blatt. Kein Code — aber ohne das kein seriöser
zahlender Kunde. Impressum/Datenschutz PRO SITE liefert der pages-Layer
(Standardseiten als Templates beim Onboarding vorbefüllen — passt zu Davids
Punkt „Impressum, Datenschutz, Kontakt gibt es fast immer").

### L8 — OAuth auf Custom Domains (Fußnote, H3)
Social-Login (`maui.auth.providers`) braucht pro OAuth-App registrierte
Redirect-Domains. Für hunderte Platform-Sites mit Custom Domains ist „ein
Google-Client pro Site" nicht wartbar. Pragmatik: OAuth-Buttons auf
Platform-Sites zunächst nur unter `*.hawaii.studio` (eine registrierte
Domain-Familie) bzw. E-Mail/OTP-Login als Default; volle OAuth-Freiheit
ist **kostenpflichtiges Premium-Feature** (bestätigt David). Später prüfen:
zentraler Auth-Broker.

## 8. Invarianten & Vertrauensgrenzen (4. Runde)

- **Control Plane** (`apps/studio`): kennt alle Sites + Entitlements; besitzt
  KEINE Site-Inhalte und keine Site-Sessions. Diese Grenze gilt nur, wenn
  sie ERZWUNGEN wird (5. Runde) — sonst ist das Control Plane über den
  Provisioner mittelbar allmächtig: der Provisioner akzeptiert nur eng
  typisierte, validierte Job-Typen (keine beliebigen Befehle, keine
  frei parametrisierten Keys/Accounts); Support-Zugang (D5) braucht
  Owner-Zustimmung oder einen separat auditierten Break-glass-Prozess;
  besonders riskante Aktionen (Löschen, Owner-Transfer, Break-glass)
  erfordern Re-Authentifizierung, später Vier-Augen-Freigabe; Audit-Log
  ist append-only und nicht allein vom Control Plane veränderbar
  (separater Store/WORM).
- **Provisioner-Worker:** einziger Ort mit Console-/Migrations-Rechten;
  läuft getrennt von jeder Web-App; Secrets verschlüsselt, nie in Logs;
  Job-Schnittstelle = geschlossene Typ-Liste (s. o.).
- **Platform-App** (`apps/platform`) — zwei Fehlerklassen (5. Runde):
  *(a) Logischer Zuordnungsfehler* (Request landet im falschen Site-Kontext):
  soll durch Host-Allowlist, unveränderlichen Site-Kontext und Negativtests
  verhindert und abgesichert werden (Invarianten in S3).
  *(b) Prozesskompromittierung* (RCE, bösartige Dependency,
  Secret-Store-Zugriff): betrifft potenziell ALLE vom Prozess erreichbaren
  Site-Keys — nicht verhinderbar, nur begrenzbar: Session-basiertes CRUD
  (Invariante unten), minimale Key-Scopes, Secret-Isolation, Rotation,
  Dependency-Hardening, Egress-Beschränkung, Alarmierung.
  **Autorisierungs-Invariante (6. Runde, ENTSCHIEDEN statt offener
  Designfrage):** Normales Site-CRUD läuft über die SESSION des jeweiligen
  Site-Users (`createSessionClient` — exakt das heutige Zwei-Client-Muster
  des Monorepos), sodass Appwrite Row Permissions und das Label-RBAC
  wirksam BLEIBEN. **Kein normaler Request verwendet einen Key, der Row
  Permissions umgeht.** Der Runtime-Key ist auf eine enumerierte Liste
  systeminterner Operationen beschränkt (Kandidaten: Presence-Heartbeat,
  Notifications, Digest — jede einzeln zu prüfen, nicht jede braucht
  zwingend einen privilegierten Key) mit dokumentierter Scope-Matrix pro
  Key. Der Key liegt NIE im Request-Kontext, sondern nur hinter dem
  server-internen Secret-Resolver (s. S3). Autorisierung wird NICHT in
  Nuxt nachgebaut.
- **Site-Projekt:** Vertrauensanker der Kundendaten; nur eigene Keys +
  eigene User; Zugriff Dritter (auch Davids) nur nach D5-Regeln.
- **Appwrite-Server:** logische Trennung (D2) — physischer SPOF; überwacht
  (L6), wiederherstellbar (L1).
- **Extern (ploi, Cloudflare, Stripe, Mail):** Ausfall darf DEGRADIEREN,
  nie Daten verlieren oder fälschlich sperren; Entitlement-Grace (F3) ist
  das Muster dafür.

## 9. Risiko-Übersicht (Top-Risiken)

| Risiko | W'keit | Impact | Gegenmaßnahme | Horizont |
|---|---|---|---|---|
| S3 scheitert (Multi-Projekt pro Request) | mittel | hoch — Klasse B neu denken | früher Minimal-PoC; Fallback: Klasse B als Projekt-Pool + Batch-Builds | H3 |
| Platform-Prozess kompromittiert (RCE/Dependency/Secret-Store) | niedrig–mittel | sehr hoch — alle erreichbaren Site-Keys | Session-basiertes CRUD (Invariante), minimale Key-Scopes, Secret-Isolation, Rotation, Dependency-Hardening, Egress-Beschränkung, Alarmierung | H3 |
| Quota-Enforcement technisch nicht durchsetzbar | mittel | hoch — Self-Service unhaltbar | Spike S4 vor G3; Fallback nur für kontrolliert freigeschaltete Kunden (manuelle Freigabe, weiche Limits + Abrechnung) — kein offener anonymer Self-Service | H3 |
| Custom-Domain-Auth bricht im Browser | mittel | hoch | S3-Checkliste komplett fahren; Fallback Option 1 (API-Domain pro Projekt) | H3 |
| Per-Site-Restore unvollständig | mittel | sehr hoch (Datenversprechen) | L1 zweigleisig (Takeout + Infra) + DR-Test vor Kunde 1 | H2 |
| Console-API bricht bei Appwrite-Upgrade | niedrig | mittel | Version gepinnt + CI-Smoke-Test + Projekt-Pool-Fallback | H2/H3 |
| Verteilte Feature-Aktivierung inkonsistent | mittel | mittel | Statusmaschine (F2), Gate erst nach Migration | H1 |
| Deploy-Welle bricht Kundensites | mittel | hoch | Release-Wellen + Canary + abwärtskompatible Migrationen (L5) | H2 |
| Geteilter Server fällt aus (SPOF) | niedrig–mittel | hoch | Monitoring (L6) + dokumentierte Wiederanlauf-Zeit + Backups (L1) | H2 |

## 10. Bewusste Ablehnungen

- **Ein zentrales Dashboard, das Site-Inhalte fremder Instanzen editiert** —
  bricht das Cookie-/Session-Modell (A3), zentralisiert alle Admin-Keys.
- **Echte Multi-Tenancy in EINER Database (tenantId-Spalten)** — verwirft
  die komplette Row-Permission-/DSGVO-Architektur; Appwrite-Projekt pro
  Site ist die richtige Isolations-Einheit.
- **Getrennte Repos / versionierte Packages jetzt** — Monorepo-first bleibt
  (A8); Auslagerung erst, wenn ein Kunde Code-Übergabe verlangt.
- **Appwrite Sites als Hosting für die Nuxt-Apps** — Deploy-Rezept existiert
  zwar (Memory), aber ploi-Modell aus PHASE-17 ist erprobt und wird nicht
  parallel ersetzt. Neu bewerten, wenn der Provisioner steht.
- **SSO zwischen Control Plane und Site-Dashboards im MVP** — erst Links,
  Token-Handoff später (Sicherheits-Review nötig).
- **SaaS-First bauen** — Klasse B (`apps/platform`) kommt zuletzt; bis dahin
  zahlen die Verträge (Manifest/Gates/Entitlements) auf eigene Sites ein.

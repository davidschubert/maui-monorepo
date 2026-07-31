# G0 — Produktvertrag (Entscheidungsvorlage für den Check-in)

> **Status:** Entwurf (2026-07-24) für den gemeinsamen G0-Check-in aus
> [SAAS-ROADMAP.md](../archiv/SAAS-ROADMAP.md). **Kein Bau** — reine Entscheidungen.
> Nach Abnahme startet G1 (Tenant-Autorisierung + Row-Permission-Naht +
> Isolationsbeweis). Querbezug: [PUKALANI-LANDINGPAGE.md](../archiv/PUKALANI-LANDINGPAGE.md)
> §2.4 (Claim-Gates), [HORIZONT-3-POOL-SILO-BLUEPRINT.md](HORIZONT-3-POOL-SILO-BLUEPRINT.md).
>
> Dieses Dokument liefert die vier G0-Artefakte als **Vorschlag mit Empfehlung**.
> Jede offene Entscheidung ist am Ende (§5) gesammelt.
>
> **✅ Check-in-Entscheidungen (David, 2026-07-24):**
> 1. **Kundenbereich-Host:** eigener Host **`app.pukalani.app`** (Marketing =
>    `pukalani.app`, Produkt = `app.*`, Operator = `studio.*`).
> 2. **`site_members`:** im **Control Plane**, Cross-Projekt-Read gecacht,
>    **Revoke wirkt ≤ 60 s**.
> 3. **Rollen:** **FÜNF** Site-Rollen — Owner, Admin, Moderator, **Editor**,
>    **Viewer** (Abstufung s. §2.4).
> 4. **Early-Access-Scope:** **belegter Scope** (Diskussionen, Moderation,
>    Seiten, Themes, Embed), invite-only; Feed/Kurse/Events erst mit grünem
>    Baustein-Gate.
> 5. **Offen (kein Blocker für G1):** Tarif-Zuordnung §3.3 (Baustein×Plan) +
>    kanonische `siteId`-Referenz — s. §5.

---

## 1. Drei Oberflächen (Nav-Bäume + Cockpit)

Verbindliche Trennung nach Zielgruppe + Vertrauensgrenze (Roadmap §A). Drei
Oberflächen, nie vermischt:

### 1.1 Kundenbereich / Control Center
*Zielgruppe:* Owner + Kunden-Admins. *Wo:* **`app.pukalani.app`** (✅ entschieden;
Migration von heute `/workspace` in der Studio-App als G-Schritt). *Zweck:* das
Geschäftliche — Sites, Abrechnung, Team, Nutzung.

```
Kundenbereich (Control Center)
├── Überblick            ← Cockpit (s. 1.4)
├── Sites                ← Sites des Workspace: Status, „Site öffnen →", „+ Neue Site"
├── Plan & Rechnungen    ← aktueller Plan, Upgrade/Downgrade, Stripe-Portal, Belege
├── Nutzung              ← Usage je Site + Verlauf (#3), Limit-Warnungen
├── Team                 ← Mitglieder + Rollen (#2), Einladungen
├── Domains              ← Custom Domains (#9, Silo zuerst)
└── Konto & Daten        ← Profil, Export/Kündigung (#6), DSGVO
```

### 1.2 Site-Dashboard
*Zielgruppe:* Owner, Admins, Moderatoren **dieser** Site. *Wo:*
`<tenant-host>/dashboard`. *Zweck:* die tägliche Community-Arbeit.

```
Site-Dashboard  (RBAC- + Feature-gefiltert; Feature-Registry bleibt Quelle)
├── Überblick            ← Cockpit dieser Site (was ist los + Schnellaktionen)
├── Community
│   ├── Diskussionen     ← Kommentare/Threads
│   ├── Beiträge (Feed)  ← nur wenn Baustein aktiv (§B)
│   ├── Events           ← nur wenn Baustein aktiv (§B)
│   ├── Kurse            ← nur wenn Baustein aktiv (§B)
│   ├── Moderation       ← Meldungen, KI-Assist (#8)
│   └── Mitglieder       ← Community-Mitglieder dieser Site
├── Inhalt
│   ├── Seiten (CMS)     ← pages-Layer
│   └── Medien           ← Galerie/Storage
├── Insights            ← Analytics + Activity (#5); Tariflimits → Kundenbereich
└── Einstellungen
    ├── Branding/Themes  ← Customize theme
    ├── Import & Export  ← (#6)
    ├── Integrationen    ← Webhooks/API (#7)
    └── Benachrichtigungen
```

### 1.3 Operator Studio
*Zielgruppe:* NUR Plattformbetreiber (du). *Wo:* `control.pukalani.app`. *Zweck:*
die Plattform selbst. **Niemals Teil der Kundennavigation.**

```
Operator Studio
├── Sites                ← alle Sites, Health, Provisionierungsjobs
├── Tenants              ← Host→Mandant-Register, Wellen, Status
├── Workspaces           ← Kunden-Workspaces, Owner-Zuordnung
├── Pläne & Limits       ← Quota-Katalog + Stripe-Preise (existiert)
├── Jobs                 ← Provisionierungs-Queue
└── System               ← App-Config, Audit, Changelog, Health
```

### 1.4 Cockpit (Startseite Kundenbereich) — Wireframe (Text)

```
┌───────────────────────────────────────────────────────────┐
│  Willkommen zurück, {Name}                    [+ Neue Site]│
├───────────────────────────────────────────────────────────┤
│  NUTZUNG (pro Site, wichtigste Zahl)                        │
│  demo.pukalani.app   Kommentare  1.240 / 5.000  ▓▓▓▓▓░░ 62%│
│  kurs.pukalani.app   Kommentare    120 / 5.000  ▓░░░░░░  2%│
│         (ab 80% Warnfarbe · ab 90% [Upgrade]-Chip)         │
├───────────────────────────────────────────────────────────┤
│  WAS IST LOS?                          │ SCHNELLAKTIONEN    │
│  • 14 neue Kommentare heute            │ [Site öffnen]      │
│  • Thread „Onboarding" aktiv (8)       │ [Widget-Code]      │
│  • 2 offene Meldungen  → Moderation    │ [Team einladen]    │
│  • 1 Kurs-Einschreibung                │ [Plan verwalten]   │
└───────────────────────────────────────────────────────────┘
```

*Regel:* Nutzung zuerst (das Erste, was ein Betreiber sieht) → dann Aktivität →
dann Schnellaktionen. Kein Feature-Wühltisch.

---

## 2. ADR: Identitäten, Rollen, Autorisierung

> **Architecture Decision Record.** Grundlage: der reale Ist-Zustand
> (`packages/core/shared/authz.ts`, `requirePermission.ts`,
> `workspace_members`, `sites`, `tenants`).

### 2.1 Kontext / Problem

- Heute autorisiert **`requirePermission(event, capability)`** über die
  **globalen Appwrite-Labels** (`admin`/`moderator`) des Users im jeweiligen
  Projekt (`ROLE_CAPABILITIES` in `authz.ts`). Das ist ein **globales
  Single-Tenant-Modell pro Appwrite-Projekt.**
- **Folge im Pool:** alle Tenants teilen EIN Appwrite-Projekt (`pool`). Ein
  `admin`-Label gilt damit **pool-weit** — Kunde A wäre Admin auch bei Kunde B.
  Das ist die zentrale Sicherheitslücke vor offenem Self-Service.
- **Zwei getrennte Identitäts-Welten**, die NIE gleichgesetzt werden dürfen:
  - **Control-Plane-Identität** (Control-Projekt): `workspace_members.userId` —
    für Abrechnung/Kundenbereich. Existiert.
  - **Runtime-Identität** (Pool-/Silo-Projekt): der User, der auf der Site
    kommentiert/moderiert. Seine `userId` ist **nur zusammen mit `projectId`
    eindeutig**. Eine Studio-`userId` ≠ eine Pool-`userId`.

### 2.2 Zwei getrennte Sicherheitsaufgaben (nicht verwechseln!)

1. **Route-Autorisierung** (dieses ADR / #2): darf dieser Request diese
   Aktion auf DIESER Site? → neuer `requireCommunityPermission`.
2. **Daten-Isolation / Row-Permissions** (H3-Naht 4, separates Paket): selbst
   wenn eine Route falsch autorisiert, dürfen Appwrite-Rows fremder Tenants
   nicht lesbar/schreibbar sein → tenant-namespaced Row-Permissions.

**Beide müssen vor offenem Self-Service grün sein.** Ein Route-Guard ersetzt
keine Daten-Isolation und umgekehrt.

### 2.3 Entscheidung: `site_members` (Control Plane) + `requireCommunityPermission`

> **✅ Kanonische Site = der Tenant (David, 2026-07-24).** Die `sites`-Tabelle
> bleibt das **Operator-/Infra-Register** (deployte Plattform-Apps: comments,
> portfolio, studio, platform). Eine **Kunden-Community-Site = eine `tenants`-
> Zeile** (Pool: Zeilen-Scope im geteilten Projekt; Silo: eigenes Projekt,
> `mode='silo'`). **Rollen UND Abrechnung hängen am Tenant.** Damit ist die
> kanonische **`siteId` = `tenants.$id`** — kein Zwang zu Doppel-Zeilen in
> `sites`, keine gespaltene Wahrheit. (Korrigiert einen früheren Entwurf, der
> fälschlich auf `sites.$id` zeigte — die Prod-Daten zeigten: Pool-Tenants
> haben gar keine `sites`-Zeile.)

**Neue Tabelle `site_members`** (Control Plane / Control-Projekt):

| Spalte | Zweck |
|---|---|
| `siteId` | kanonische Site-Identität = **`tenants.$id`** |
| `runtimeProjectId` | Appwrite-Projekt, in dem der User lebt (Pool = geteilt, Silo = eigenes) |
| `runtimeUserId` | die Appwrite-User-ID IN diesem Projekt |
| `role` | `owner` \| `admin` \| `moderator` \| `editor` \| `viewer` (Site-Rollen, s. 2.4) |
| `status` | `active` \| `invited` \| `suspended` |

- Der Tenant trägt künftig `tenants.workspaceId` (Billing-/Owner-Kontext) —
  ersetzt die Rolle, die früher `sites.workspaceId` spielen sollte. Billing-
  Verdrahtung an den Tenant kommt in G2/G3; in G1 wird nur die Spalte angelegt.
- **Keine E-Mail als Autorisierungsschlüssel** — E-Mail ist nur fürs Einladen.
- **`requireCommunityPermission(event, capability)`** autorisiert Site-Routen über
  `{siteId, runtimeProjectId, runtimeUserId}` → Rolle aus `site_members` →
  Capability aus `COMMUNITY_ROLE_CAPABILITIES`. Die globale `requirePermission`
  bleibt für Operator-/Single-Tenant-Routen; ein dünner Adapter verhindert
  doppelte Fachlogik.
- **Lookup-Pfad:** `site_members` liegt im Control Plane, die Site-Route läuft
  im Runtime-Projekt → **Cross-Projekt-Read** (wie der Tenant-Resolver, mit
  dem read-only-Key). Gecacht ~30–60 s, keyed auf `{siteId, runtimeUserId}`.
  Revoke wirkt binnen Cache-TTL (in §5 zu bestätigen).

### 2.4 Site-Rollen → Capabilities (✅ 5 Rollen, David 2026-07-24)

`COMMUNITY_ROLES = ['owner','admin','moderator','editor','viewer']` — eigener
Tenant-Map (getrennt von der Operator-`ROLE_CAPABILITIES`), wiederverwendet aber
das bestehende `Capability`-Vokabular. **Monoton gestuft** (jede Rolle ⊇ der
schwächeren, außer wo bewusst getrennt):

| Site-Rolle | Bedeutung (Ein-Satz, fürs Tooltip) | Capabilities |
|---|---|---|
| **owner** | „darf alles auf der Site, inkl. Team & Übergabe" | wie admin **+** Owner-Transfer, Site löschen |
| **admin** | „verwaltet Site, Inhalte, Design & Team; keine Abrechnung" | `dashboard.access`, `pages.manage`, `media.manage`, `events.manage`, `courses.manage`, `activity.manage`, `comments.moderate`, `reports.moderate`, `posts.moderate` **+ Team** (Mitglieder einladen/blockieren, Rollen bis `admin` vergeben), **+ Branding/Themes** |
| **moderator** | „bearbeitet Meldungen & blendet Kommentare/Beiträge aus" | `dashboard.access`, `comments.moderate`, `reports.moderate`, `posts.moderate` |
| **editor** | „schreibt & pflegt Seiten und Beiträge; keine Moderation, kein Design" | `dashboard.access`, `pages.manage`, `posts.write`\*, `events.manage`\*, `media.manage` — **kein** `*.moderate`, **kein** Branding, **kein** Team |
| **viewer** | „sieht Inhalte und darf kommentieren" | `dashboard.access` (nur lesend) + normales Kommentieren als eingeloggtes Mitglied — **keine** Verwaltungs-Caps |

\* **Neue Capabilities nötig:** das heutige `authz.ts` kennt nur `*.manage`/
`*.moderate`. Für „Editor darf schreiben, aber nicht moderieren/veröffentlichen-
freigeben" braucht es feinere Caps, z. B. `posts.write`, `events.write` (oder
ein `content.author`-Bündel). **Ableitung in G1** — im ADR bewusst als Erweiterung
des Capability-Sets markiert, damit die Rolle nicht heimlich zu viel darf.

**Grenzen & Regeln:**
- **Abrechnung** (`billing.manage`) bleibt an der **Workspace-Owner-Rolle**
  (`workspace_members`), NIE an Site-Rollen — Geld ist Workspace-Sache.
- **Rollen-Vergabe-Schranke:** ein Admin darf **nicht** Owner-Rechte vergeben
  und niemanden über die eigene Stufe heben (keine Rechte-Eskalation).
- **Owner** = genau einer je Site; **Owner-Transfer** ist ein eigener,
  sicherheitskritischer Flow (nicht nur ein Dropdown; Bestätigung + Audit).
- **Viewer** ist die Standard-Rolle für „eingeladenes Mitglied ohne
  Verwaltungsrechte" — sie ersetzt kein Gast-Lesen (das bleibt öffentlich),
  sondern ist der niedrigste **verwaltete** Mitglieds-Rang.
- Alle fünf Rollen sind im G1-Isolationsbeweis abzudecken (jede Rolle sieht/darf
  genau ihr Set — und nichts von fremden Tenants).

### 2.5 Invite-Flow (Runtime-Identität explizit binden)

- UI-/Token-Muster vom bestehenden Workspace-Invite (Mail → Accept → OTP-Login).
- **Aber:** nach dem OTP-Login im Runtime-Projekt wird die `site_members`-Row
  **idempotent** mit `{runtimeProjectId, runtimeUserId}` verknüpft. Der
  Workspace-Invite ist wegen des getrennten User-Pools **nicht unverändert**
  wiederverwendbar — die Runtime-Bindung ist neu.

### 2.6 Folgen / Nicht-Ziele des ADR

- Silo-Sites (eigenes Projekt) können weiter das globale Modell nutzen ODER
  `site_members` mit einem einzigen `runtimeProjectId` — Parität ist Teil des
  Isolationsbeweises (G1).
- Row-Permissions (Naht 4) sind **nicht** Teil dieses ADR, laufen aber parallel
  in G1.

---

## 3. Angebots-Slices (Early Access vs. GA) — konkret

Roadmap §B, hier mit konkreter Tarif-Zuordnung als **Vorschlag**:

### 3.1 Early Access (invite-only, sofort ehrlich verkaufbar)
Nur **belegte** Bausteine (Landingpage §2.4 = „belegt"):
**Diskussionen · Moderation · Seiten (CMS) · Themes/Branding · Embed.**
- Positionierung: „Branded Discussions / Community Early Access".
- **Keine** Kurse-/Events-/Feed-/„60-Sekunden"-Claims.

### 3.2 Community GA (öffentlich, modular)
Zusätzlich **Feed/Beiträge**; **Kurse** und **Events** erst, wenn ihr Baustein-
Gate grün ist (§B: Manifest + Pool-Migration + Row-Permissions + Runtime-Gate +
Quota + GDPR-/Site-Export-Contributor + EN/DE + Pool/Silo-E2E + Tariflimit).

### 3.3 Tarifmatrix (✅ David 2026-07-24)

**Leitlinie:** Free = echte Kern-Community (adoptionsstark), Pro =
Community-Ausbau, Business = das „Geld-verdienen"-Paket. Kurse rechtfertigen
Business. Community-Mitglieder (Viewer) sind in **allen** Plänen unbegrenzt —
begrenzt werden nur **Verwaltungs-Sitze** (Rollen ab Moderator).

| Baustein / Grenze | Free | Pro | Business | Gate-Status |
|---|---|---|---|---|
| Diskussionen | ✓ | ✓ | ✓ | belegt |
| Moderation (+KI-Assist) | ✓ | ✓ | ✓ | belegt (KI advisory, #8) |
| Seiten (CMS) | ✓ | ✓ | ✓ | belegt |
| Themes/Branding | Basis | ✓ | ✓ | belegt |
| Embed (Widget/Web-Component) | ✓ | ✓ | ✓ | belegt |
| **Feed / Beiträge** | – | ✓ | ✓ | GA-Gate (Integration offen) |
| **Events** | – | ✓ | ✓ | GA-Gate |
| **Kurse (Bezahl-Zugang)** | – | – | ✓ | GA-Gate |
| Import / Export | – | ✓ | ✓ | #6 |
| Analytics / Insights | Basis | ✓ | ✓ | #5 |
| **Webhooks / API** | – | – | ✓ | #7 |
| **Eigene Domain** | – | – | ✓ (Silo) | #9 |
| Community-Mitglieder (Viewer) | ∞ | ∞ | ∞ | — |
| **Verwaltungs-Sitze** (Mod/Editor/Admin) | 0 (nur Owner) | klein (z. B. 3) | ∞ (inkl. mehrere Admins) | #2 |
| Usage-Limits (Quota) | niedrig | mittel | hoch | Studio-Katalog (existiert) |

**Konkrete Zahlen** (Verwaltungs-Sitze-Grenze Pro, Quota-Limits) kommen aus dem
editierbaren Studio-Katalog — die Baustein↔Plan-Zuordnung ist damit **fixiert**.
Die genaue Pro-Sitze-Zahl (Vorschlag 3) und die Limit-Werte werden beim Bau von
#2/G3 gesetzt (nicht mehr strategisch offen).

---

## 4. Claim-Inventar (aus Landingpage §2.4, als Prüfliste)

Jeder öffentliche Claim → sein Gate. Vor Veröffentlichung abhaken.

| # | Claim | Darf raus, wenn | heute |
|---|---|---|---|
| C1 | „Diskussionen, Moderation, Seiten, Themes" | Demo + Prod-Smoke grün | ✅ belegt |
| C2 | „Feed, Kurse, Events" | Baustein-Gate (§B) grün je Layer | ⛔ Layer da, nicht im Angebot |
| C3 | „In 60 Sekunden startklar" | 10 unbeaufsichtigte Onboardings, Median ≤ 60 s | ⛔ Ziel |
| C4 | „Free/Pro/Business + Self-Service-Upgrade" | Signup + Checkout/Portal + Planwechsel live getestet | 🟡 teilweise |
| C5 | „Eigene Domain" | DNS-Verifikation + TLS + Rollback + Dogfood bewiesen | ⛔ geplant (Silo) |
| C6 | „Import/Export, Analytics, Usage" | jeweiliges Roadmap-DoD | ⛔ geplant |
| C7 | „kein Cookie-Banner nötig" | konkrete Seite + aktive Dienste rechtlich/technisch geprüft | ⛔ nicht pauschal |
| C8 | „Backup/Restore-Versprechen" | dokumentierter Restore-Test + RPO/RTO veröffentlicht | ⛔ nicht freigegeben |
| C9 | „Testimonials/Sterne/Zahlen" | Einwilligung/Quelle dokumentiert + reproduzierbar | ⛔ nur echt |

**Copy-Regel:** öffentliche Produktclaims nutzen nur ✅. Geplantes kommt in eine
klar markierte Roadmap-Sektion, nie als Tarifbestandteil getarnt.

---

## 5. Entscheidungen — Stand

**✅ Entschieden (David, 2026-07-24):**
1. **Kundenbereich-Host:** eigener Host **`app.pukalani.app`** (Marketing
   `pukalani.app` · Produkt `app.*` · Operator `studio.*`).
2. **`site_members`:** **Control Plane**, Cross-Projekt-Read gecacht, **Revoke
   ≤ 60 s** (Cache-TTL 30–60 s, keyed `{siteId, runtimeUserId}`).
3. **Rollen:** **FÜNF** — Owner / Admin / Moderator / Editor / Viewer (§2.4).
   *Konsequenz:* Capability-Set wird um Autoren-Caps (`posts.write`/`events.write`
   o. ä.) erweitert — in G1 ableiten.
5. **Early-Access-Scope:** **belegter Scope** (Diskussionen, Moderation, Seiten,
   Themes, Embed), invite-only; Feed/Kurse/Events erst mit grünem Baustein-Gate.

4. **Tarif-Zuordnung (§3.3):** ✅ **entschieden** — Free = Diskussionen/
   Moderation/Seiten/Themes/Embed (solo); Pro = + Feed/Events/Import-Export/
   Analytics + kleines Team; Business = + Kurse/Webhooks-API/eigene Domain +
   unbegrenzt Sitze. Nur noch die konkreten Zahlen (Pro-Sitze, Limits) werden
   beim Bau gesetzt.
6. **Kanonische `siteId`:** ✅ **= `tenants.$id`** (der Tenant IST die
   Kunden-Site; `sites` bleibt Infra-Register). `tenants` bekommt in G1 nur
   `workspaceId` (Billing-Anker); keine `sites`-Doppelzeilen.
7. **Lese-Publikum je Site (Naht 4):** ✅ **privat als Default, öffentlich
   opt-in** (David, 2026-07-24). Jede Community-Site startet mitglieder-only
   (`read(Role.label(siteId))` — harte Appwrite-Grenze); „öffentlich lesbar"
   ist ein bewusster Schalter pro Site (`read(any)`). Der Naht-4-Mechanismus
   (`tenantRowPermissionsFor`, Default `'members'`) setzt das bereits um; das
   Live-Wiring in den Schreibpfad + die Session-Label-Vergabe je Site folgen
   mit dem Onboarding (G3-Nähe).

**Damit ist G0 vollständig abgeschlossen.**

---

## Nächster Schritt

§5 ist bis auf die zwei nicht-blockierenden Punkte (Tarif-Zuordnung, `siteId` —
letzterer läuft als erster G1-Migrationsschritt) **entschieden**. Damit ist G0
im Kern abgeschlossen und **G1 kann starten**:

1. `tenants` → kanonische **`siteId`**-Referenz (Migration).
2. **`site_members`** (Control Plane) + 5-Rollen-`COMMUNITY_ROLE_CAPABILITIES`
   (inkl. neuer Autoren-Caps für Editor).
3. **`requireCommunityPermission(event, capability)`** über
   `{siteId, runtimeProjectId, runtimeUserId}`, gecacht (Revoke ≤ 60 s);
   `requirePermission` bleibt für Operator-/Single-Tenant-Routen.
4. **Row-Permissions (Naht 4)** tenant-namespaced — unabhängig getestet.
5. **Automatisierter Isolationsbeweis:** derselbe Runtime-User in zwei
   Pool-Tenants mit verschiedenen Rollen; jede der 5 Rollen sieht/darf genau
   ihr Set; Pool↔Silo-Parität; Invite-Replay; Revoke ≤ 60 s; Owner-Transfer;
   protokollierter Break-Glass-Operatorzugriff ohne stillen Dauer-Bypass.

Der Kundenbereich-Umzug nach `app.pukalani.app` ist ein eigener Infra-Schritt
(neuer ploi-Host + Route), der parallel zu G1 vorbereitet, aber erst mit dem
Kaufpfad (G3) scharf geschaltet wird.

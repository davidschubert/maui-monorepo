# G0 — Produktvertrag (Entscheidungsvorlage für den Check-in)

> **Status:** Entwurf (2026-07-24) für den gemeinsamen G0-Check-in aus
> [SAAS-ROADMAP.md](SAAS-ROADMAP.md). **Kein Bau** — reine Entscheidungen.
> Nach Abnahme startet G1 (Tenant-Autorisierung + Row-Permission-Naht +
> Isolationsbeweis). Querbezug: [PUKALANI-LANDINGPAGE.md](PUKALANI-LANDINGPAGE.md)
> §2.4 (Claim-Gates), [HORIZONT-3-POOL-SILO-BLUEPRINT.md](HORIZONT-3-POOL-SILO-BLUEPRINT.md).
>
> Dieses Dokument liefert die vier G0-Artefakte als **Vorschlag mit Empfehlung**.
> Jede offene Entscheidung ist am Ende (§5) gesammelt. Nichts hier ist final,
> bevor David abnickt.

---

## 1. Drei Oberflächen (Nav-Bäume + Cockpit)

Verbindliche Trennung nach Zielgruppe + Vertrauensgrenze (Roadmap §A). Drei
Oberflächen, nie vermischt:

### 1.1 Kundenbereich / Control Center
*Zielgruppe:* Owner + Kunden-Admins. *Wo:* heute `/workspace` (Studio-App);
Zielhost in §5 zu entscheiden. *Zweck:* das Geschäftliche — Sites, Abrechnung,
Team, Nutzung.

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
    ├── Branding/Themes  ← Theme-Studio
    ├── Import & Export  ← (#6)
    ├── Integrationen    ← Webhooks/API (#7)
    └── Benachrichtigungen
```

### 1.3 Operator Studio
*Zielgruppe:* NUR Plattformbetreiber (du). *Wo:* `studio.pukalani.app`. *Zweck:*
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
  - **Control-Plane-Identität** (Studio-Projekt): `workspace_members.userId` —
    für Abrechnung/Kundenbereich. Existiert.
  - **Runtime-Identität** (Pool-/Silo-Projekt): der User, der auf der Site
    kommentiert/moderiert. Seine `userId` ist **nur zusammen mit `projectId`
    eindeutig**. Eine Studio-`userId` ≠ eine Pool-`userId`.

### 2.2 Zwei getrennte Sicherheitsaufgaben (nicht verwechseln!)

1. **Route-Autorisierung** (dieses ADR / #2): darf dieser Request diese
   Aktion auf DIESER Site? → neuer `requireTenantPermission`.
2. **Daten-Isolation / Row-Permissions** (H3-Naht 4, separates Paket): selbst
   wenn eine Route falsch autorisiert, dürfen Appwrite-Rows fremder Tenants
   nicht lesbar/schreibbar sein → tenant-namespaced Row-Permissions.

**Beide müssen vor offenem Self-Service grün sein.** Ein Route-Guard ersetzt
keine Daten-Isolation und umgekehrt.

### 2.3 Entscheidung: `site_members` (Control Plane) + `requireTenantPermission`

**Neue Tabelle `site_members`** (Control Plane / Studio-Projekt):

| Spalte | Zweck |
|---|---|
| `siteId` | kanonische, unveränderliche Site-Identität (= `sites.$id`) |
| `runtimeProjectId` | Appwrite-Projekt, in dem der User lebt (Pool = geteilt, Silo = eigenes) |
| `runtimeUserId` | die Appwrite-User-ID IN diesem Projekt |
| `role` | `owner` \| `admin` \| `moderator` (Site-Rollen, s. 2.4) |
| `status` | `active` \| `invited` \| `suspended` |

- `tenants` referenziert künftig die kanonische **`siteId`** (heute nur
  `projectId`/`tenantId`); `sites.workspaceId` liefert den Owner-Kontext.
- **Keine E-Mail als Autorisierungsschlüssel** — E-Mail ist nur fürs Einladen.
- **`requireTenantPermission(event, capability)`** autorisiert Site-Routen über
  `{siteId, runtimeProjectId, runtimeUserId}` → Rolle aus `site_members` →
  Capability aus `TENANT_ROLE_CAPABILITIES`. Die globale `requirePermission`
  bleibt für Operator-/Single-Tenant-Routen; ein dünner Adapter verhindert
  doppelte Fachlogik.
- **Lookup-Pfad:** `site_members` liegt im Control Plane, die Site-Route läuft
  im Runtime-Projekt → **Cross-Projekt-Read** (wie der Tenant-Resolver, mit
  dem read-only-Key). Gecacht ~30–60 s, keyed auf `{siteId, runtimeUserId}`.
  Revoke wirkt binnen Cache-TTL (in §5 zu bestätigen).

### 2.4 Site-Rollen → Capabilities (Vorschlag)

Wiederverwendung des bestehenden `Capability`-Vokabulars, aber als **eigener**
Tenant-Map (getrennt von der Operator-`ROLE_CAPABILITIES`):

| Site-Rolle | Bedeutung (Ein-Satz) | Capabilities (Vorschlag) |
|---|---|---|
| **owner** | „darf alles auf der Site, inkl. Team" | alle Site-Caps + Team-Verwaltung; **Abrechnung NICHT hier** (Workspace-Ebene) |
| **admin** | „verwaltet Site, Inhalte, Design, Team; keine Abrechnung" | `dashboard.access`, `comments.moderate`, `reports.moderate`, `posts.moderate`, `pages.manage`, `media.manage`, `events.manage`, `courses.manage`, `activity.manage` + Team |
| **moderator** | „bearbeitet Meldungen, blendet Kommentare aus" | `dashboard.access`, `comments.moderate`, `reports.moderate`, `posts.moderate` |

- **Abrechnung** (`billing.manage`) bleibt an der **Workspace-Owner-Rolle**
  (`workspace_members`), NICHT an Site-Rollen — Geld ist Workspace-Sache.
- **Owner-Transfer** ist ein eigener, sicherheitskritischer Flow (nicht einfach
  ein Rollen-Dropdown).

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

### 3.3 Tarifmatrix (Vorschlag — Zahlen offen, s. §5)

| Baustein | Free | Pro | Business | Gate-Status |
|---|---|---|---|---|
| Diskussionen | ✓ | ✓ | ✓ | belegt |
| Moderation (+KI-Assist) | ✓ | ✓ | ✓ | belegt (KI advisory, #8) |
| Seiten (CMS) | ✓ | ✓ | ✓ | belegt |
| Themes/Branding | Basis | ✓ | ✓ | belegt |
| Embed (Widget/Web-Component) | ✓ | ✓ | ✓ | belegt |
| Feed/Beiträge | – | ✓ | ✓ | GA-Gate (Integration offen) |
| Events | – | ✓ | ✓ | GA-Gate |
| Kurse (Bezahl-Zugang) | – | – | ✓ | GA-Gate |
| Import/Export | – | ✓ | ✓ | #6 |
| Webhooks/API | – | – | ✓ | #7 (Business) |
| Eigene Domain | – | – | ✓ (Silo) | #9 |
| Analytics/Insights | Basis | ✓ | ✓ | #5 |
| Usage-Limits | niedrig | mittel | hoch | Quota-Katalog (existiert) |

> Die konkreten Limit-Zahlen kommen aus dem editierbaren Studio-Katalog
> (existiert); die Baustein↔Plan-Zuordnung ist der offene Teil (§5).

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

## 5. Offene Entscheidungen für den Check-in

Diese Punkte braucht G0 von David — danach ist G0 abgeschlossen und G1 startet:

1. **Kundenbereich-Host:** bleibt der Kundenbereich unter `studio.pukalani.app/
   workspace`, oder bekommt er einen eigenen Host (z. B. `app.pukalani.app`),
   getrennt von der Marketing-Startseite `pukalani.app`? *(Empfehlung: eigener
   Host `app.pukalani.app` — saubere Trennung Marketing ↔ Produkt.)*
2. **`site_members`-Speicherort:** Control Plane (Empfehlung, konsistent mit
   tenants/plans, Cross-Projekt-Read gecacht) ODER Runtime-Projekt (lokaler
   Read, aber gespaltene Sicht)? Und die **Cache-TTL für Revoke** (Vorschlag
   30–60 s).
3. **Site-Rollen-Set:** genügen `owner/admin/moderator` (Empfehlung), oder wird
   eine „editor"-Rolle (Inhalte, keine Moderation) gebraucht?
4. **Tarif-Zuordnung (§3.3):** welche Bausteine in Free/Pro/Business? Vor allem:
   Feed ab Pro? Kurse nur Business? *(Vorschlag steht, Zahlen/Grenzen offen.)*
5. **Early-Access-Scope (§3.1):** startet EA wirklich ohne Feed/Kurse/Events —
   also als „Branded Discussions"? *(Empfehlung: ja, ehrlich zum belegten Stand.)*
6. **Kanonische `siteId`:** `tenants` bekommt eine `siteId`-Referenz auf
   `sites.$id` — bestätigen (kleiner, aber grundlegender Datenmodell-Schritt für
   G1).

---

## Nächster Schritt

Check-in zu §5 (6 Entscheidungen). Nach Abnahme: **G1 bauen** — `site_members`
+ `requireTenantPermission` + tenant-namespaced Row-Permissions (Naht 4) + der
automatisierte Isolationsbeweis (derselbe Runtime-User in zwei Pool-Tenants,
verschiedene Rollen; Pool↔Silo-Parität; Invite-Replay; Revoke; Owner-Transfer;
protokollierter Break-Glass-Operatorzugriff).

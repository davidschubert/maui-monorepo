# Horizont 3 — Pool + Silo: Zwei-Tier-Mandantentrennung (Blueprint)

Stand: 2026-07-20. **Entscheidung getroffen (David):** Maui fährt Horizont 3 als
**zweistufiges Mandanten-Modell** — nicht „entweder/oder", sondern beides:

- **Pool** (Standard-SaaS): die Masse der Kunden lebt gepoolt in *einer*
  geteilten Appwrite-DB, jede Zeile trägt `tenantId`. Billig, *eine* Migration
  für alle, standardisiertes Feature-Menü (buchbar über die bestehenden
  Feature-Gates + Entitlements). Neue Kundin = ein DB-Eintrag, kein Deploy.
- **Silo** (Spezial/Enterprise): Kunden mit individuellen Anforderungen bekommen
  ein **eigenes Appwrite-Projekt** (eigene DB `main`, eigene User/Buckets) —
  hart isoliert, DSGVO-sauber, pro-Kunde löschen/exportieren trivial. Das ist
  praktisch das Modell, das comments/portfolio/studio **heute schon** sind.

Das ist das anerkannte SaaS-Standardmuster „**Pool + Silo**" (AWS SaaS Lens:
silo/pool/bridge). Es widerspricht der früheren M10-Weiche nicht, sondern
konkretisiert sie: [M10-HORIZONT-3-SKALIERUNG.md](M10-HORIZONT-3-SKALIERUNG.md)
hatte A (Projekt-pro-Kunde) vs. B (shared-DB) als Entweder/oder gestellt —
David wählt **A für Spezialkunden + B für die Masse**, mit *einer* Codebase,
die beides bedient.

---

## 1. Warum das trägt — und der eine Trick, der es zusammenhält

Davids Ziel: „Spezialprojekte bauen und Features in das SaaS-System *fließen*
lassen." Damit ein Feature, das für einen Silo-Kunden entsteht, unverändert im
Pool läuft (und umgekehrt), darf der Feature-Code **nichts** über die
Mandanten-Ablage wissen. Das gelingt über **eine mandanten-agnostische
Datenzugriffs-Schicht** — und die Architektur ist dafür bereits optimal
vorbereitet:

> **Die gesamte Tenancy-Auflösung passt in ~4 Nähte**, weil *aller* CRUD schon
> durch zwei Client-Factories läuft (`packages/core/server/lib/appwrite.ts:64`
> `createAdminClient` / `:89` `createSessionClient`) — CLAUDE.md-Regel „CRUD NUR
> über server/api/\*". Kein Feature spricht Appwrite direkt an. Ändert man die
> Factories, ändert man die Mandantentrennung global.

Heute binden beide Factories das Projekt **statisch**:
```ts
.setEndpoint(config.public.appwriteEndpoint)
.setProject(config.public.appwriteProjectId)   // ← aus .env, ein Projekt pro Deployment
```
Das ist der einzige Punkt, der sich ändert.

## 2. Die vier Nähte

### Naht 1 — Tenant-Auflösung (Nitro-Middleware, neu)
`server/middleware/00.tenant.ts` löst pro Request `Host` → Tenant-Record auf und
legt `event.context.tenant` ab:
```ts
type TenantContext =
  | { mode: 'silo'; projectId: string }                 // eigenes Projekt
  | { mode: 'pool'; projectId: string; tenantId: string } // geteilt + Scope
```
Quelle der Auflösung: eine kleine `tenants`-Tabelle im **Control-Plane-Projekt**
(Studio) — Host → {mode, projectId, tenantId}. Gecacht (Microcache, der
Mechanismus existiert: `createMicrocache()`), invalidiert bei Tenant-Änderung.

### Naht 2 — Client-Factories lesen den Tenant statt der .env
```ts
// createSessionClient / createAdminClient
const t = event.context.tenant
client.setProject(t?.projectId ?? config.public.appwriteProjectId)  // Fallback = heutiges Verhalten
```
Rückwärtskompatibel: ohne `tenant`-Context (eigene Sites, Tests) bleibt alles
wie heute. Der Session-Cookie-Name (`a_session_<projectId>`, `appwrite.ts:9`)
zieht automatisch nach, weil er `projectId` schon aus dem Context ziehen kann.

### Naht 3 — Tenant-Scope-Helper für den Pool (neu, nur Pool-Modus)
Ein dünner Wrapper um die TablesDB-Aufrufe, der im **Pool-Modus** `tenantId`
erzwingt und im **Silo-Modus** ein No-Op ist:
```ts
// scopeQuery(event, queries) → hängt Query.equal('tenantId', t.tenantId) an (nur pool)
// scopeRow(event, data)      → setzt data.tenantId = t.tenantId (nur pool, beim Create)
```
Feature-Code ruft `listRows(scopeQuery(event, [...]))`. Im Silo fällt der Scope
weg (Isolation liegt am Projekt), im Pool ist er das Sicherheitsnetz. **Das ist
die einzige Zeile, die Feature-Autoren zusätzlich schreiben** — und sie ist
mechanisch, kein Tenancy-Wissen.

### Naht 4 — Row-Permissions als zweite Verteidigungslinie (Pool)
Der `tenantId`-Filter ist Anwendungslogik; die **harte** Grenze im Pool sind
Appwrite-Row-Permissions. Muster wie bereits im comments-Layer
([[comments-row-level-read-permissions]]): jede Pool-Zeile bekommt
`read(Role.label(tenantId))` / `write(...)`, und der User-Session-Client trägt
das Tenant-Label. Ein vergessener `scopeQuery` leakt dann *trotzdem* nichts,
weil Appwrite die Zeile gar nicht erst herausgibt. Genau das ist das
Argument, warum Maui bei Row-Permissions bleibt statt shared-DB „nackt".

## 3. Was das für die bestehenden M1–M9 bedeutet

| Frage | Antwort |
|---|---|
| Müssen alle Features umgeschrieben werden? | Nein. Sie greifen schon über die Factories zu. Der `scopeQuery`-Wrapper wird additiv eingezogen. |
| Was ist der echte Aufwand? | (a) jede Pool-fähige Tabelle bekommt eine `tenantId`-Spalte + Index + Row-Permission-Muster; (b) die CRUD-Routen wickeln ihre Queries in `scopeQuery`. Mechanisch, aber flächig. |
| Was bleibt unverändert? | Feature-Gates, Entitlements (signierte Dokumente), Auth, Realtime-Multiplexing, i18n. Diese Verträge sind schon mandanten-neutral. |
| Silo = Rückbau? | Nein — Silo ist das heutige Modell. Nur die statische `.env`-Bindung wird durch die Context-Auflösung ersetzt (Naht 2). |

## 4. Sequenzierung (risikoärmster Baustein zuerst)

1. **S3-PoC (Auflösung + Silo dynamisch)** — Naht 1+2 an einer Wegwerf-Instanz:
   `apps/platform` mit Wildcard-Host, `Host`→Projekt, ein Silo-Tenant. Klärt die
   größte Unbekannte (Custom-Domain-Auth, Cookie-Modell, Realtime-JWT auf 1.9.5).
   → **Spike zuerst** (siehe `spikes/s5-pool-silo/`, dieser Block liefert den Kern).
2. **Pool-Datenpfad** — Naht 3+4 an *einer* Tabelle (z. B. comments) end-to-end:
   `tenantId`-Spalte, `scopeQuery`, Row-Permission-Label, Isolationsbeweis
   (Tenant A sieht Tenant B nicht — automatisiert getestet).
3. **L5 — Migrations-Orchestrierung** (der riskanteste Punkt, unverändert aus
   M10): Pool-Migrationen laufen *einmal*; Silo-Migrationen als **Wellen**
   (`internal → canary → stable`), abwärtskompatibel (Code n-1 ⇆ Schema n).
   Weil die Masse im Pool sitzt, sinkt die Wellen-Last drastisch vs. „N Projekte".
4. **S4 — Quota-Enforcement** — Blocker für echten Self-Service (Pool-Kunde darf
   den geteilten Server nicht erschöpfen). Vor GA lösen.
5. **Onboarding-Flow** — „neue Pool-Site" = `tenants`-Row + Entitlement-Grant,
   kein Build. „Upgrade zu Silo" = Projekt anlegen + Daten aus Pool exportieren
   (die GDPR-Export-Contributor liefern das Gerüst schon).

## 5. Der eigentliche Gewinn von „beides"

- **Pool** macht die Masse **billig** (1 Deploy, 1 Migration, Self-Service).
- **Silo** macht Enterprise **verkaufbar** (Isolation, DSGVO, Custom).
- **Upgrade-Pfad Pool→Silo** ist ein Produkt-Feature, kein Umbau: derselbe
  Feature-Code läuft in beiden, nur die Ablage wechselt. Genau Davids „langsam
  integrieren": ein Feature für einen Silo-Kunden bauen → `scopeQuery` macht es
  Pool-tauglich → ins Standard-Menü heben.

## 6. Offene Risiken (ehrlich)

- **Realtime im Pool**: der geteilte SDK-Socket ([[realtime-shared-sdk-socket]])
  muss im Pool nach `tenantId` filtern (Channel + serverseitige Query + `where`
  als Netz). Machbar, aber im S3-PoC zu verifizieren.
- **Custom-Domain-TLS pro Silo**: auf 1.9.5 über den certificates-worker /
  proxy-rules (wie changelog.pukalani.app). Für Pool-Kunden unter *einer*
  Wildcard-Domain trivial; eigene Kundendomains sind der Aufwand.
- **Row-Permission-Skalierung im Pool**: Label-basierte Permissions pro Tenant —
  bei sehr vielen Tenants Performance im Auge behalten (Index auf `tenantId`).
- **Kein Big-Bang**: Pool wird *neben* den bestehenden Silo-Sites hochgezogen;
  comments/portfolio/studio bleiben Silos und müssen nichts sofort ändern.

---

**Nichts davon drängt** — das ist die Landkarte für Horizont 3, nicht der
Startschuss. Der begleitende Spike (`spikes/s5-pool-silo/`) beweist den Kern
(Naht 3+4: `tenantId`-Scope + Isolation) an Wegwerf-Code, damit die Entscheidung
auf Fakten steht, bevor Produktions-Umbau beginnt.

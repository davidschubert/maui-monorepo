# M10 — Horizont-3-Skalierung: Standort & Entscheidung

Stand: 2026-07-20. Ausgelöst durch Davids Frage: *„Was ist, wenn ich 50 Kunden
habe, die alle eigene Projekte anlegen, und ich ändere etwas am Core — müssen
dann alle 50 deployt werden? Nacheinander, um den Server nicht zu belasten?
Ist das im Betrieb nicht total hinderlich? Wie lösen das Circle/Mighty?"*

Dieses Dokument ordnet die Frage präzise ein (mit Ist-Zustand aus dem Code),
korrigiert eine frühere Ungenauigkeit und benennt die EINE Entscheidung, die
vor dem Bau von Horizont 3 fällt. Es ergänzt
[MULTI-SITE-PLATFORM-STRATEGIE.md](MULTI-SITE-PLATFORM-STRATEGIE.md) (D0
Horizonte, §10 Ablehnungen), widerspricht ihr NICHT.

---

## 1. Ehrliche Korrektur vorweg

In der Live-Diskussion hatte ich gesagt, die „Multi-Projekt-Auflösung pro
Request (S0-Gate)" sei *schon gebaut* und damit sei die Tenant-Auflösung
vorhanden. **Das stimmt so nicht.** Der Code sagt:

- S0 ist ein **bestandener Spike** (`spikes/s0-multi-project/`, 12/12 Tests
  2026-07-14) — er hat die FORM der Verträge validiert, ist aber
  ausdrücklich „Kein Produkt-Code" (`spikes/s0-multi-project/README.md:4`).
- Produktiv läuft **reines Single-Tenant-per-Deployment**: die Appwrite-
  Client-Factories binden das Projekt **statisch** aus der `.env`
  (`packages/core/server/lib/appwrite.ts:64-105`,
  `.setProject(config.public.appwriteProjectId)`), auch der Session-Cookie
  (`a_session_<PROJECT_ID>`). Eine hostname-/request-basierte Auflösung
  (`event.context.site`, `useSiteConfig`) existiert **nirgends in packages/**.

Heißt: Jede unserer Sites (comments, portfolio, studio, photos) ist heute ein
**eigenes Deployment mit eigener fester Projekt-Bindung**. Das ist „Klasse A"
der Strategie — der bewusste Startzustand für wenige eigene Sites.

## 2. Davids Frage, sauber zerlegt

Die Sorge vermischt zwei Dinge, die die Strategie trennt:

| | Klasse A (heute gebaut) | Klasse B (Horizont 3, NICHT gebaut) |
|---|---|---|
| Was | wenige *eigene* Sites, je eigenes Deployment | *eine* generische `apps/platform`, bedient N Kundensites |
| Site-Anlage | Scaffold-Script + ploi-Site + Build + Deploy | **DB-Eintrag + Appwrite-Projekt, KEIN Build/Deploy** |
| Core-Update | jede Site einzeln deployen | **EIN Deploy für alle** (Wildcard-Hostname) |
| Auflösung | statische `.env` | Hostname → Projekt pro Request (Nitro-Middleware, S3) |

**Antwort auf „50× deployen bei Core-Änderung":** Im Zielbild (Klasse B)
**nein** — das App-Deployment ist dann *eine* Instanz, ein Deploy trifft alle
Kunden. Genau so machen es Circle/Mighty. Deine Sorge ist berechtigt für das
*heutige* Klasse-A-Modell, das aber bewusst nur für die Handvoll eigener Sites
gedacht ist. Das „Webhook pro Site", das wir gerade eingerichtet haben, ist
**kein** Vorbote von Chaos bei 50 Kunden — Kundensites laufen später über
Klasse B, nicht über je ein eigenes ploi-Deployment.

## 3. Wie Circle/Mighty es lösen — und wo die Maui-Architektur bewusst abweicht

Solche Plattformen nutzen **Multi-Tenancy**: eine Codebase, wenige identische
Server, Tenant-Auflösung pro Request, **eine geteilte Datenbank mit
`tenant_id`-Spalte** auf jeder Zeile. Ein Deploy = alle Kunden. Eine neue
Community = ein DB-Eintrag.

**Genau das `tenant_id`-in-einer-DB-Modell hat die Maui-Strategie bewusst
VERWORFEN** (`MULTI-SITE-PLATFORM-STRATEGIE.md:874-876`): Begründung — es
„verwirft die komplette Row-Permission-/DSGVO-Architektur; Appwrite-Projekt
pro Site ist die richtige Isolations-Einheit." Maui macht Multi-Tenancy also
über **ein Appwrite-Projekt pro Kunde** (eigene DB `main`, eigene User, eigene
Buckets) — physisch auf demselben Server, logisch hart getrennt.

**Das ist die zentrale Weichenstellung — und sie ist bereits getroffen.** Der
Trade-off, den du kennen musst:

| | Circle-Stil: shared DB + `tenant_id` | Maui heute: Projekt pro Kunde (F6) |
|---|---|---|
| App-Deployment | 1 Instanz, 1 Deploy | 1 Instanz, 1 Deploy (Klasse B) — **gleich** |
| Schema-Migration | **1 Migration für alle** | **N Migrationen** (pro Kunden-DB) ← der Preis |
| Isolation | schwächer (App muss sauber filtern) | stärker (DSGVO, pro-Kunde-Backup/Löschen trivial) |
| Kunde exportieren/löschen | Query mit `tenant_id` | ganzes Projekt — sauber |
| Betriebsaufwand pro Kunde | minimal | ein Appwrite-Projekt mehr |

**Das App-Deployment ist in BEIDEN Modellen kein Problem.** Der Unterschied
liegt allein bei der **Migration**: Maui verlagert die Skalierungs-Arbeit vom
Deployment (gelöst) auf die **Migrations-Welle über N Projekte**. Das benennt
die Strategie selbst als „L5" und als *„technisch riskantesten Punkt von
Horizont 3"*.

## 4. Was für Horizont 3 wirklich fehlt (drei Bausteine)

1. **S3 — Klasse-B-Auflösung produktiv** (`MULTI-SITE-PLATFORM-STRATEGIE.md:587-611`):
   Nitro-Middleware `Host` → Site-Record → `event.context.site`;
   `useSiteConfig()` ersetzt die statische `useRuntimeConfig().public.appwrite*`
   in den Client-Factories; `apps/platform` mit allen Layern einkompiliert +
   Wildcard-Domain. Der S0-Spike hat die Form validiert, der Produktions-Umbau
   steht aus. **Riskantester Punkt** (Custom-Domain-Auth, Cookie-Modell,
   Realtime-JWT auf 1.9.5 noch offen).
2. **L5 — Migrations-Orchestrierung über N Sites** (`:762-776`): Deploy-Pipeline
   führt pro Site `pnpm migrate --app <site>` VOR dem Code-Switch aus;
   Migrationen **abwärtskompatibel** (Code n-1 muss mit Schema n laufen);
   **Release-Wellen** `internal → canary → stable` statt Auto-Rollout; Rollback:
   Code zurück leicht, Schema nur vorwärts. Das ist die direkte Antwort auf
   „müssen alle 50 migriert werden": ja — aber orchestriert, gestaffelt,
   abwärtskompatibel, nicht als Big-Bang.
3. **S4 — Quota-Enforcement** (`:618-626`): ungeklärter Machbarkeitsnachweis
   und **Blocker für M9-Self-Service** — ohne Quota kann sich kein Kunde
   selbst bedienen (Ressourcen-Missbrauch). Muss vor echtem SaaS gelöst sein.

Bereits gebaut und tragfähig (zahlt auf Horizont 3 ein): das **Feature-System**
(`featureGates.ts` — Registry ∧ Laufzeit-Gate ∧ Entitlement) und die
**signierten Entitlement-Dokumente** (Studio stellt aus, Sites pullen,
pro Projekt isoliert). Diese Verträge funktionieren über alle drei Horizonte
identisch — das war der Sinn, sie zuerst zu bauen.

## 5. Die eine Entscheidung — jetzt ist der richtige Moment

Die `tenant_id`-vs-Projekt-pro-Kunde-Weiche ist getroffen (zugunsten Projekt-
pro-Kunde). Aber **bevor** Klasse B gebaut wird, lohnt eine bewusste
Bestätigung, weil sie die teuerste Konsequenz (N-fache Migrations-Wellen)
festschreibt:

- **A — Bei Projekt-pro-Kunde bleiben (Empfehlung).** Stärkste Isolation,
  DSGVO-sauber, pro-Kunde-Löschen trivial — das ist bei einer Community-/
  Content-Plattform mit personenbezogenen Daten ein echter Vorteil. Preis:
  L5-Migrations-Orchestrierung muss solide gebaut werden (Canary + Wellen +
  abwärtskompatible Migrationen). Machbar, aber die anspruchsvollste
  Ingenieursarbeit von Horizont 3.
- **B — Doch auf shared-DB + `tenant_id` schwenken (Circle-Stil).** Billiger
  im Betrieb, EINE Migration für alle. Preis: Row-Level-Isolation muss die App
  bulletproof selbst leisten (ein Filter-Bug leakt Kundendaten), DSGVO-Löschen/
  -Export wird zur Query-Disziplin, und es verwirft die bestehende
  Appwrite-Row-Permission-Architektur (großer Rückbau von M1–M9).

**Meine Empfehlung: A.** Der Grund, warum die Strategie es so entschieden hat
(Isolation/DSGVO), wiegt bei eurer Datenlage schwer, und der Preis (L5) ist
Ingenieursarbeit, kein Architektur-Risiko. Circle kann sich shared-DB leisten,
weil deren Isolations-Anforderung anders liegt; euer „Projekt pro Kunde" ist
für DSGVO-sensible Communities die konservativere, sauberere Wahl. Ich würde
B nur wählen, wenn ihr in Richtung *sehr viele, sehr kleine, wenig sensible*
Tenants (Tausende) skaliert — dann kippt die Betriebskosten-Rechnung.

## 6. Konkreter nächster Schritt (wenn Horizont 3 drankommt)

Reihenfolge, risikoärmster Baustein zuerst:
1. **S3-Browser-PoC** (Custom-Domain + Cookie-Modell für Klasse B verifizieren)
   — die größte Unbekannte, klärt ob Klasse B überhaupt trägt.
2. **L5-Pipeline** (Migrations-Orchestrierung: Canary „eigene Sites zuerst",
   abwärtskompatible Migrationen, Release-Wellen) — an den vorhandenen 3+ Sites
   sofort übbar.
3. **S4-Quota-PoC** — Blocker für Self-Service, vor M9-SaaS lösen.
4. Erst dann **`apps/platform`** (Klasse B) bauen.

Bis dahin bleibt Klasse A (eigene Sites, je Deployment) völlig richtig — es
gibt keinen Grund, vor echten Kunden umzubauen. **Nichts an Horizont 3 drängt;
dieses Dokument ist die Landkarte, nicht ein Startschuss.**

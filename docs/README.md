# Doku-Karte

Wo steht was — und was ist die **eine** Datei, in die offene Arbeit gehört.
Stand: 2026-07-28.

## Die vier Sorten

Jedes Dokument gehört zu genau einer Sorte. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte — sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.

| Sorte | Ordner | Frage, die sie beantwortet | Veraltet sie? |
| --- | --- | --- | --- |
| **Steuerung** | `docs/` | Was tun wir als Nächstes? | ständig gepflegt |
| **Referenz** | `docs/referenz/` | Wie ist X gebaut, und warum so? | lebt mit dem Code |
| **Runbooks** | `docs/runbooks/` | Wie führe ich Y im Betrieb aus? | pro Durchlauf abgehakt |
| **Archiv** | `docs/archiv/` | Warum ist es so geworden? | nie mehr angefasst |

## ⭐ Steuerung — hier steht die Arbeit

| Datei | Inhalt |
| --- | --- |
| **[OPEN-ITEMS.md](OPEN-ITEMS.md)** | **DIE EINE offene-Punkte-Liste — und zwar NUR Offenes** (Regel von David, 2026-07-30). Eine Tabelle „Jetzt dran — in dieser Reihenfolge" mit Prio, Aufwand und „Braucht David?", darunter „Geparkt / wartet". Max. 3 Zeilen je Eintrag; Einzelheiten leben im verlinkten Plan. Neue offene Punkte kommen HIERHER — nie in ein Plan-Dokument. |
| **[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)** | **Finales Archiv der erledigten Punkte = unser Lern-Gedächtnis.** Jeder Eintrag vollständig, mit Datum und einer Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging. Ausdrücklich KEINE Arbeitsliste — hier wird nachgelesen, nicht abgearbeitet. |
| [GOALS.md](GOALS.md) | Phasen-Ziele des Projekts (Chronik der Ausbaustufen) |
| [DECISION-LOG.md](DECISION-LOG.md) | Beschluss-Protokoll: welche Entscheidung wann, mit Begründung |
| [CONCEPT.md](CONCEPT.md) | Architektur-Bibel A1–A14 (Layer-Grenzen, Verträge, Invarianten) |

Dazu im Repo-Wurzelverzeichnis: [../README.md](../README.md) (Einstieg +
Phasen-Statustabelle), [../CLAUDE.md](../CLAUDE.md) (die Regeln für
KI-Agenten — **die eine Quelle**, `AGENTS.md` zeigt nur darauf),
[../CHANGELOG.md](../CHANGELOG.md) (Release-Historie, von release-please
gepflegt).

## Referenz — wie ist es gebaut

| Datei | Thema |
| --- | --- |
| [referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md](referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md) | Pool vs. Silo — das Mandanten-Modell |
| [referenz/MULTI-SITE-PLATFORM-STRATEGIE.md](referenz/MULTI-SITE-PLATFORM-STRATEGIE.md) | Feature-Manifeste, Layer/App-Komposition |
| [referenz/PRODUKT-BILANZ.md](referenz/PRODUKT-BILANZ.md) | „Ein Konzept pro Produkt" — welche App welches Produkt montiert, wer durch die Datentür geht (ERZEUGT: `node scripts/produkt-bilanz.mjs`) |
| [referenz/G0-PRODUKTVERTRAG.md](referenz/G0-PRODUKTVERTRAG.md) | Produktvertrag: Rollen, Tarif, Umfang |
| [referenz/RBAC-CONCEPT.md](referenz/RBAC-CONCEPT.md) | Operator-Labels + Capability-Matrix |
| [referenz/MODERATION-AND-LAYER-BOUNDARIES.md](referenz/MODERATION-AND-LAYER-BOUNDARIES.md) | Moderations-Verträge über Layer-Grenzen |
| [referenz/THEMES-CONCEPT-V2.md](referenz/THEMES-CONCEPT-V2.md) | Theme-System + bewusste Ablehnungen |
| [referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md) | Warum Login/Register eigene UForms sind |
| [referenz/EMBED.md](referenz/EMBED.md) | Embed-Widget: Gates, CSP, Cookie-Verhalten |
| [referenz/CHANGELOG-WORKFLOW.md](referenz/CHANGELOG-WORKFLOW.md) | Release-Please + Kunden-Changelog |

## Runbooks — Schritt für Schritt im Betrieb

| Datei | Wofür |
| --- | --- |
| [runbooks/DEPLOYMENT.md](runbooks/DEPLOYMENT.md) | Neue App/Site aufsetzen, Envs, Migrationen, ploi-Felder |
| [runbooks/STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) | Stripe vom Testmodus auf echtes Geld |
| [runbooks/STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) | Die 6 Testmodus-Proben davor |
| [runbooks/CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md) | Control-Host-Umzug (+ die drei Restkrümel) |
| [runbooks/PLATFORM-CONTROL-KEY-SWAP.md](runbooks/PLATFORM-CONTROL-KEY-SWAP.md) | Appwrite-Key rotieren |

Die Häkchen in Runbooks sind **echt** — sie werden pro Durchlauf abgehakt und
gehören dort hin.

## Pläne — noch nicht gebaut

| Datei | Zustand |
| --- | --- |
| [plans/DISCUSSIONS-KONZEPT.md](plans/DISCUSSIONS-KONZEPT.md) | fertig spezifiziert, wartet auf Bau-Go |
| [plans/CHANGELOG-3.0.0-ENTWURF.md](plans/CHANGELOG-3.0.0-ENTWURF.md) | fertiger Kundentext, wartet aufs Einfügen |

**Regel:** Sobald ein Plan ausgeführt ist, wandert er nach `archiv/` und seine
Reste nach `OPEN-ITEMS.md`. Ein Plan-Dokument ist nie eine To-do-Liste.

## Archiv — ausgeführt, nur noch Historie

`archiv/` enthält 23 abgearbeitete Pläne (M1–M10, Phase 17, Themes-Vollausbau,
Embed-Widget, Landingpage, SaaS-Roadmap, …) und `archiv/audits/` die drei
Audits (Gesamtaudit 05.07., Pool-Audit 27.07., Dashboard-Audit 28.07.).

Sie sind wertvoll als **Begründung** („warum liegt das so?") und als **Rezept**
(der nächste Server folgt Phase 17 wieder) — aber niemand muss sie lesen, um zu
wissen, was zu tun ist. Ihre offenen Kästchen sind bewusst zu Aufzählungen
entschärft, damit sie nicht als Arbeit gelesen werden.

## Doku-Site (`docs/content/`)

`content/` ist **Produkt**, kein Planungsdokument: die interne, durchsuchbare
Doku-Site (Nuxt UI + Nuxt Content nach dem Vorbild des
[Nuxt-Docs-Templates](https://docs-template.nuxt.dev/)), live hinter
Operator-Login auf `control.pukalani.app/docs`.

Bewusst **kein** Pukalani-Layer und keine App unter `apps/` — der Manifest-Check
verlangt dort Site-Manifest + Appwrite-Setup, und die Docs brauchen beides
nicht.

```bash
pnpm dev:docs      # → http://localhost:4000
```

- Neue Seite: Markdown unter `content/<n>.<kapitel>/` mit Frontmatter
  (`title`, `description`, `navigation.icon`) — Navigation und Suche entstehen
  automatisch.
- Neues Kapitel: Ordner mit `.navigation.yml` (`title`, `icon: false`).
- Statischer Export: `pnpm --filter @pukalani/docs generate`.
- Änderungen unter `content/` lösen einen Deploy aus (der control-Build bettet
  sie ein).

Die **kundenseitige** Hilfe ist etwas anderes: `apps/help/content/` →
`help.pukalani.app`.

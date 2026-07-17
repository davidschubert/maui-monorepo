# Changelog-Workflow

Zwei getrennte Spuren — bewusst **release-basiert**, nicht pro Push (jeder Push
wäre WIP-Rauschen für Endnutzer).

## Track 1 — Entwickler-`CHANGELOG.md` (voll automatisch)

Aus den Conventional Commits via **release-please**
([`.github/workflows/release-please.yml`](../.github/workflows/release-please.yml)).

- Bei Push auf `main` pflegt release-please einen **Release-PR**: sammelt
  `feat`/`fix`/`perf`/`refactor`, schreibt `CHANGELOG.md` fort, schlägt die
  nächste SemVer-Version vor.
- **Merge des PRs** erzeugt Git-Tag + GitHub-Release.
- Kein DB-Zugriff, keine Secrets — nutzt den eingebauten `GITHUB_TOKEN`.
- Konfiguration: [`release-please-config.json`](../release-please-config.json),
  Stand der Versionen: [`.release-please-manifest.json`](../.release-please-manifest.json)
  (gestartet bei `1.4.0`, passend zum bisherigen Produkt-Changelog → nächstes
  `feat` ⇒ `1.5.0`).
- `bootstrap-sha` begrenzt den ersten Lauf auf Commits **nach** dem
  Backfill-Commit (`466be65e…`, volle SHA nötig — als Kurz-SHA wirkungslos),
  damit die History nicht doppelt in `CHANGELOG.md` landet.
- Voraussetzung (Repo-Setting, 2026-07-08 aktiviert): *Settings → Actions →
  General → „Allow GitHub Actions to create and approve pull requests"* —
  ohne das schlägt jeder Lauf mit „GitHub Actions is not permitted to create
  or approve pull requests" fehl und es entsteht nie ein Release-PR.

## Track 2 — Produkt-„Was ist neu" (kuratiert, assistiert)

Die nutzerseitigen Release-Notes leben in der Appwrite-Tabelle `changelog`
(Dashboard → Changelog, öffentlich via „Was ist neu"-Popover). Sie sind
**kuratiert** — gruppierte, verständliche Notes, kein Commit-Log.

### 2A — Lokaler Draft-Generator (aktiv)

[`packages/admin/scripts/changelog-draft.mjs`](../packages/admin/scripts/changelog-draft.mjs)
liest die Commits seit dem letzten Tag, mappt Typen auf Kategorien
(`feat`→Feature, `fix`→Fix, `perf`/`refactor`→Verbesserung) und legt **einen
Entwurf** (`published:false`) mit gruppierter Stichpunktliste an. Den arbeitest
du im Dashboard zur fertigen Release-Note aus und veröffentlichst ihn.

```bash
pnpm changelog:draft                   # seit letztem Tag → Entwurf
pnpm changelog:draft -- --dry          # nur Vorschau
pnpm changelog:draft -- --since=v1.4.0 # ab bestimmtem Tag/SHA
pnpm changelog:draft -- --version=v1.5 # Version ins Entwurfs-Feld
```

Läuft **lokal**, weil das self-hosted Appwrite unter `localhost` für GitHub CI
nicht erreichbar ist. Der Runtime-Key kommt via `--env-file` aus
`apps/comments/.env`.

### 2B — Appwrite Function (späterer Ausbau, optional)

Voll hands-off: GitHub-**Release-Webhook** → Appwrite Function parst die Commits
und legt den Draft direkt an. Eine Function läuft *innerhalb* von Appwrite,
erreicht die DB also direkt (löst das `localhost`-Problem). Sinnvoll erst, wenn
Prod mit öffentlicher Domain steht — die Parsing-Logik aus 2A wird dabei
wiederverwendet.

## Warum getrennt?

- **Granularität:** Dev-Changelog = jeder Commit; Produkt-Changelog = pro
  Release, kuratiert.
- **Erreichbarkeit:** GitHub CI kann das self-hosted Appwrite (`localhost`)
  nicht beschreiben → DB-Writes laufen lokal (2A) oder serverseitig (2B), nie in
  der CI.

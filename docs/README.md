# Maui Docs

Die durchsuchbare Doku-Site des Monorepos — Nuxt UI + Nuxt Content nach dem
Vorbild des [Nuxt-Docs-Templates](https://docs-template.nuxt.dev/). Die
Inhalte liegen unter `content/` (Nuxt-Content-Kollektionen), die klassischen
Arbeits-Dokumente (`CONCEPT.md`, `GOALS.md`, …) bleiben unverändert daneben.

**Bewusst KEIN Maui-Layer und keine App unter `apps/`:** der Manifest-Check
verlangt dort Site-Manifest + Appwrite-Setup — die Docs brauchen beides nicht.

```bash
pnpm dev:docs      # → http://localhost:4000
```

- Neue Seite: Markdown-Datei unter `content/<n>.<kapitel>/` mit Frontmatter
  (`title`, `description`, `navigation.icon`) — Navigation und Suche entstehen
  automatisch.
- Neues Kapitel: Ordner mit `.navigation.yml` (`title`, `icon: false`).
- Statischer Export: `pnpm --filter @maui/docs generate`.

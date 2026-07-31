# apps/_template — Kopiervorlage für neue Maui-Apps

Dünne App-Hülle, die alle Layer komponiert (`themes`, `admin`, `comments`,
`moderation`, `core`, `system`). Der Unterstrich-Prefix hält sie aus dem
Migrations-Runner heraus (`scripts/migrate.mjs` ignoriert `_*`).

## Neue App erstellen

1. **Kopieren + benennen**
   ```bash
   cp -R apps/_template apps/<name>
   ```
   - `package.json`: `"name": "<name>"` setzen
   - `nuxt.config.ts`: `devServer.port` eindeutig vergeben (3002+, siehe CLAUDE.md)
   - `.env.example` → `NUXT_PUBLIC_APP_URL` an den Port anpassen
   - Nicht benötigte Produkt-Layer aus `extends` UND `package.json` entfernen
     (`core` + `system` bleiben immer)

2. **Appwrite-Instanz vorbereiten** (jede App hat ihre EIGENE Instanz)
   - Instanz starten, in der Console: Account + Projekt + zwei API-Keys anlegen
     (Runtime-Key + Migrations-Key, Scopes siehe `.env.example`)
   - `cp apps/<name>/.env.example apps/<name>/.env` und ausfüllen

3. **Installieren + Bootstrap**
   ```bash
   pnpm install
   pnpm --filter <name> bootstrap   # DB + Bucket + Platform + alle Migrationen
   ```
   Migrationen später einzeln: `pnpm migrate --app <name>`
   (nie ohne `--app`, sobald mehrere Apps existieren — der Runner erzwingt das).

4. **Starten**
   ```bash
   pnpm --filter <name> dev
   ```

5. **Anpassen**
   - `app/app.config.ts`: Config-Gates (`pukalani.analytics`, `pukalani.auth.*`, …)
   - `i18n/locales/*.json`: App-Texte (Core-Keys werden gemergt)
   - `app/pages/`: eigene Seiten; Layout-Overrides optional unter `app/layouts/`
     (Core bringt `default` + `auth` mit)

## Interne Projekt-Doku unter `/docs`

`control.pukalani.app/docs` rendert **dieselben Markdown-Quellen** wie die
eigenständige Docs-App (`pnpm dev:docs`, Port 4000): `docs/content/**`. Es wird
nichts kopiert und nichts synchronisiert — `content.config.ts` zeigt per `cwd`
direkt dorthin (Collection `internalDocs`, `prefix: '/docs'`).

- **Auth:** der ganze Bereich hängt an der Betreiber-Session. Seiten UND die
  Content-API (`/__nuxt_content/**` — `sql_dump.txt` ist die komplette Doku!)
  laufen fail-closed durch `server/middleware/docs-guard.ts`. Gast → Login
  bzw. 401, niemals Inhalt.
- **Prerender ist bewusst AUS** (`nuxt.config.ts`): sonst läge der SQL-Dump als
  statische Datei in `.output/public/` und würde am Guard vorbei ausgeliefert.
- **Build:** die Inhalte werden beim Build eingebettet (`.output/server/chunks/
  build/database.compressed.mjs`) — der Deploy braucht `docs/content` zur
  Laufzeit NICHT, wohl aber beim Bauen.
- **Beweis:**
  ```bash
  node --env-file=apps/control/.env apps/control/scripts/verify-docs-access.mjs
  ```
  (Dev-Server muss laufen; `PROBE_BASE=…` für einen anderen Port.)

## Konventionen (Kurzfassung)

- CRUD nur über `server/api/*` der Layer — nie Web-SDK-CRUD im Client
- `app.config.ts` gehört in `app/` (im Package-Root wird sie ignoriert)
- Domain-Types in `shared/types/`, Zod-Schemas als Factories, i18n-Keys statt
  hartcodierter Strings — Details in CLAUDE.md und docs/CONCEPT.md

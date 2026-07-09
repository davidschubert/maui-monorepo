# Embed-Widget — Kommentare auf Drittseiten einbetten

> Stand: 2026-07-09 · Status: **E0+E1 (Read-only-MVP) live** · Plan/Architektur:
> [plans/EMBED-WIDGET.md](plans/EMBED-WIDGET.md) · Schreiben im Embed (Login-
> Popup + CHIPS-Session) folgt mit Phase E2.

Beliebige Drittseiten (Blog, Docs, statisches HTML — Stack egal) binden das
Kommentar-Widget per `<script>`-Tag ein. Es lädt als iframe von der
Widget-Domain: kein CORS, kein Tracking, keine Third-Party-Requests außer zum
selbst gehosteten Widget — DSGVO-freundlich by design.

## Integration

```html
<div id="maui-comments"></div>
<script async src="https://<widget-domain>/embed.js"
  data-target-id="mein-blogpost-42"
  data-target-type="blog"></script>
```

### Attribute-Referenz

| Attribut | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `data-target-id` | ja | — | Stabiler Thread-Schlüssel (≤ 255 Zeichen). **Empfehlung: freie, unveränderliche ID** (z. B. Slug oder CMS-ID) statt der URL — übersteht URL-Umzüge. |
| `data-target-type` | nein | `page` | Namensraum des Integrators (≤ 64 Zeichen), z. B. `blog`, `docs`. |
| `data-theme` | nein | `auto` | `light` · `dark` · `auto` (= `prefers-color-scheme`; nur bei `auto` ist der Widget-Hintergrund transparent). |
| `data-locale` | nein | `en` | `de` · `en` — Sprache der Widget-UI. |
| `data-primary` | nein | App-Default | Akzentfarbe aus der Whitelist (`red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`). |
| `data-container` | nein | `maui-comments` | ID des Ziel-Elements; fehlt es, erzeugt der Loader ein `<div>` vor dem Script-Tag. Mehrere Widgets pro Seite: je Script-Tag ein eigener Container. |

### Theme zur Laufzeit nachsteuern

```js
document.querySelector('#maui-comments iframe').contentWindow
  .postMessage({ type: 'maui:set-theme', theme: 'dark' }, 'https://<widget-domain>')
```

## Betreiber-Seite (App-Konfiguration)

```ts
// app/app.config.ts der servierenden App
maui: {
  comments: {
    embed: {
      enabled: true,
      // Einbetter-Origins für frame-ancestors; ['*'] = jede Seite darf
      // einbetten (bewusste Entscheidung), sonst explizite Origins:
      allowedOrigins: ['https://blog.example.com'],
    },
  },
},
```

- `/embed` liefert 404, solange das Gate aus ist; alle übrigen Routen tragen
  `frame-ancestors 'self'` (Clickjacking-Schutz für Login/Dashboard).
- `GET /api/comments` ist rate-limitiert (~120/min/IP) — das Widget selbst
  bleibt davon im Normalbetrieb weit entfernt.

## Verhalten & Grenzen

- **Gäste lesen + live**: Kommentare erscheinen ohne Reload (Realtime hinter
  der „Neue Kommentare anzeigen"-Pille). **Schreiben erfordert Login** — im
  MVP heißt das: auf der Widget-Domain anmelden (Popup-Flow kommt mit E2).
- **SEO**: Kommentare leben im iframe unter der Widget-Origin — Crawler der
  Drittseite sehen sie nicht (wie bei Disqus). `/embed` selbst ist `noindex`.
  Wer Kommentar-Inhalte fürs eigene SEO braucht, wartet auf die
  SSI-/JSON-Variante (Plan-Ausbau).
- **Datenschutz**: self-hosted, kein Tracking, keine Werbe-/Analytics-Requests;
  Lesen funktioniert ohne jeden Cookie-/Storage-Zugriff — auch mit hartem
  Tracking-Schutz im Browser.
- **`targetId`-Konvention**: eine stabile, frei gewählte ID verwenden.
  URL-basierte IDs verwaisen den Thread bei jedem URL-Umzug.

## Lokal ausprobieren

```bash
# App mit aktiviertem Gate starten (reddit-comments: bereits aktiv), dann:
cd packages/comments/.embed-test && python3 -m http.server 4999
# → http://localhost:4999/?widget=http://localhost:3001
#   (&theme=dark, &primary=rose, &locale=de werden durchgereicht)
```

E2E-Smoke: `pnpm --filter reddit-comments exec playwright test e2e/embed.spec.ts`

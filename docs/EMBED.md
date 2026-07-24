# Embed-Widget — Kommentare auf Drittseiten einbetten

> Stand: 2026-07-23 · Status: **E0–E3 live + E4-Gast-Kommentare** · Plan/
> Architektur: [plans/EMBED-WIDGET.md](plans/EMBED-WIDGET.md). Schreiben im
> Embed läuft für eingeloggte User (Login-Popup + CHIPS-Session, E2) UND für
> Gäste ohne Account (Name+E-Mail, ohne Verifikation, E4 — Gate
> `maui.comments.embed.guests`, Default aus; die E-Mail landet nur in der
> operator-lesbaren Tabelle `guest_authors`, nie auf der öffentlichen Row).

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
      // Statische Zusatz-Origins für frame-ancestors. Seit E3 kommen die
      // Prod-Domains aus der SITE-REGISTRY (s. u.) — hier stehen nur noch
      // Dev-/Sonderfälle. ['*'] bleibt die bewusste „offen wie Disqus"-Option.
      allowedOrigins: ['http://localhost:*'],
      // Gast-Kommentare (E4): ohne Account kommentieren (Name+E-Mail, keine
      // Verifikation). Default aus; greift nur zusätzlich zu `enabled`.
      guests: true,
    },
  },
},
```

- **Gast-Kommentare (E4, `guests`):** ist das Gate an, zeigt das Widget
  Nicht-Eingeloggten ein Formular mit Name + E-Mail + Text (POST
  `/api/comments/guest`). Guardrails: enger Rate-Limit-Bucket (5/min/IP),
  zählt gegen das Tenant-Quota, kein `operatorTargets`-Thread. **Datenschutz:**
  die E-Mail steht NIE auf der öffentlichen (read(any)) Kommentar-Row — nur
  der frei gewählte Anzeigename. Name/E-Mail/IP-Hash liegen getrennt in der
  Tabelle `guest_authors` (nur admin/moderator lesbar) für Moderation + DSGVO.
  Gast-Rows tragen `authorKind: 'guest'`, `authorId: ''` und keine
  Edit-/Vote-Rechte.

- **Site-Registry (E3, empfohlen):** registrierte Einbetter-Domains verwaltest
  du im Dashboard unter **„Embed-Sites"** (`/dashboard/embed`, `system.manage`).
  Nur diese Domains dürfen das Widget einbetten (frame-ancestors-CSP);
  optional je Domain die erlaubten `targetTypes` begrenzen. Änderungen greifen
  sofort (Cache write-invalidiert). Unregistrierte Einbetter sehen eine
  freundliche Meldung statt eines leeren Rahmens.
- `/embed` liefert 404, solange das Gate aus ist; alle übrigen Routen tragen
  `frame-ancestors 'self'` (Clickjacking-Schutz für Login/Dashboard).
- `GET /api/comments` (+ `/api/comments/count`) ist rate-limitiert
  (~120/min/IP) — das Widget selbst bleibt davon im Normalbetrieb weit entfernt.

### Kommentar-Zähler auf der Hostseite

`embed.js` befüllt jedes Element mit `data-maui-count` (CORS-read-only,
keine Cookies) — z. B. für „N Kommentare"-Links in einer Artikelliste:

```html
<a href="/blog/post-42#kommentare">
  <span data-maui-count data-target-id="post-42" data-target-type="blog">…</span>
</a>
<script async src="https://<widget-domain>/embed.js"></script>
```

`data-target-type` ist optional (Default `page`). Der Zähler funktioniert
auch ohne Widget-iframe auf der Seite (das Script allein genügt).

## Verhalten & Grenzen

- **Gäste lesen + live**: Kommentare erscheinen ohne Reload (Realtime hinter
  der „Neue Kommentare anzeigen"-Pille).
- **Schreiben im Widget (seit E2, 2026-07-23)**: der „Anmelden"-Button im
  Widget öffnet ein **Popup** auf der Widget-Domain (voller normaler Login
  inkl. Code-Login). Nach dem Login übernimmt das iframe die Session über ein
  kurzlebiges Handoff-Token und ein **CHIPS-partitioniertes** Session-Cookie
  (`SameSite=None; Secure; Partitioned`) — kommentieren, antworten, voten,
  melden funktionieren dann direkt im Widget. Konsequenz der Partitionierung
  (Industrie-Standard, wie Disqus): die Anmeldung gilt **pro Einbetter-Domain**.
  Browser, die das partitionierte Cookie verwerfen, bleiben read-only und
  zeigen einen Hinweis mit Deep-Link zur Widget-Domain.
  Sicherheit: die Schreib-Routen sind zusätzlich durch den
  CSRF-Origin-Check geschützt (`maui.security.csrfOriginCheck` — PFLICHT,
  sobald `maui.auth.embedSession` an ist); das Handoff-Token ist
  verschlüsselt, 60 s gültig und wird vor dem Cookie-Setzen gegen Appwrite
  validiert.
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
# App mit aktiviertem Gate starten (comments: bereits aktiv), dann:
cd packages/comments/.embed-test && python3 -m http.server 4999
# → http://localhost:4999/?widget=http://localhost:3001
#   (&theme=dark, &primary=rose, &locale=de werden durchgereicht)
```

E2E-Smoke: `pnpm --filter comments exec playwright test e2e/embed.spec.ts`

# Embed-Widget — Einbettbares Kommentarsystem (Disqus-Alternative)

> **Status:** E0 ✅ + E1 ✅ (Read-only-MVP live, 2026-07-09) · **E2 ✅
> (2026-07-23: Schreiben via Login-Popup + CHIPS — Tasks 9–12 umgesetzt,
> Playwright-E2E `embed-write.spec.ts` grün; Cross-Site-Testseite:
> https://davidschubert.com/maui-embed-test.html)** · E3 teilweise (Task 16
> Redis-Rate-Limit ✅ 2026-07-23) · Integrations-Doku: [docs/EMBED.md](../EMBED.md)
> **Herkunft:** OPEN-ITEMS.md, Idee 9 — „targetId/targetType-Architektur ist dafür
> gebaut (Disqus-Nische, self-hosted)". Aufwand-Gesamtschätzung: L.
> **Bezug:** [CONCEPT.md](../CONCEPT.md) (A2/A3/A14), [OPEN-ITEMS.md](../OPEN-ITEMS.md),
> `packages/comments`, `packages/core`.

---

## 1. Ziel + Nische

Drittseiten (Blogs, Docs-Sites, statische Seiten — beliebiger Stack) binden per
`<script>`-Tag ein Kommentar-Widget ein, das Threads zu einem `targetId`/`targetType`
anzeigt. Self-hosted, DSGVO-freundlich, ohne Tracking — die Lücke, die Disqus
(Ads/Tracking), Facebook Comments (Plattform-Lock-in) und Utterances/Giscus
(GitHub-Account-Zwang, nur Dev-Publikum) offen lassen.

**Warum das Projekt dafür gebaut ist:**

- Das Datenmodell ist bereits target-generisch: `comments` hängt an
  `targetId` (max 255) + `targetType` (max 64) mit Compound-Index
  ([Migration 002](../../packages/comments/scripts/migrations/002-target-architecture.ts)),
  `targetUrl` existiert seit Migration 006 für Notification-Links.
- Die Lese-Route [`GET /api/comments`](../../packages/comments/server/api/comments/index.get.ts)
  funktioniert **heute schon für Gäste** (SessionClient ohne Cookie = Gast; die
  Table ist `read(any)`), inkl. Threading, Sortierung, Soft-Delete-Blanking.
- Realtime für Gäste läuft ebenfalls schon: `useRealtimeRows` über die geteilte
  SDK-Realtime ([useRealtimeClient.ts](../../packages/core/app/composables/useRealtimeClient.ts))
  verbindet ohne JWT als Gast-WS und empfängt `read(any)`-Row-Events.
- Moderation (moderation-Layer + Admin-Queue), Rate-Limiting
  ([rate-limit.ts](../../packages/core/server/middleware/rate-limit.ts)),
  Config-Gates (`maui.*`) und der Wartungs-/Disable-Schalter
  ([commentPolicy.ts](../../packages/comments/server/utils/commentPolicy.ts)) existieren.

**Das Delta ist also nicht „Kommentarsystem bauen", sondern: Auslieferung auf
fremde Origins + Auth cross-origin + Abuse-Härtung öffentlicher Endpoints.**

---

## 2. Architektur-Empfehlung

### Empfehlung: iframe-Embed mit Loader-Script (Disqus-Modell)

Ein winziges, dependency-freies `embed.js` (Vanilla-JS, ~2 KB, aus `public/`
der App ausgeliefert) erzeugt ein `<iframe src="https://<app-domain>/embed?...">`
und übernimmt Resize/Theme-Handshake per `postMessage`. Im iframe läuft eine
dedizierte Nuxt-Route der bestehenden App, die `CommentSection` mit minimalem
Layout rendert.

```html
<!-- Integration auf der Drittseite -->
<div id="maui-comments"></div>
<script async src="https://comments.example.com/embed.js"
  data-target-id="mein-blogpost-42"
  data-target-type="blog"></script>
```

### Begründung (vs. Alternativen)

| Kriterium | **iframe (empfohlen)** | Web Component / Script-Inject | Reine CORS-API + eigenes Frontend |
|---|---|---|---|
| Auth | Cookie ist im iframe **first-party zur Widget-Domain** → bestehender SSR-Auth-Stack (`a_session_*`, Server Routes) funktioniert unverändert weiter¹ | Session-Cookie `sameSite:'strict'` ([appwrite.ts](../../packages/core/server/lib/appwrite.ts)) wird cross-site **nie** mitgesendet → kompletter Token-Auth-Parallelstack nötig | dito, plus Auth beim Integrator |
| CORS/CSRF | **Kein CORS nötig** — alle `/api/*`-Calls sind iframe-intern same-origin. CSRF-Schutz durch `sameSite` bleibt intakt | CORS auf allen `server/api/*`-Routen öffnen + CSRF-Ersatz (Origin-Check/Token) bauen | dito |
| Style-Isolation | Geschenkt (eigener Browsing-Context) — Tailwind/Nuxt UI kollidieren nie mit der Hostseite | Shadow DOM nötig; Tailwind 4 + Nuxt UI in Shadow DOM = erheblicher Sonderweg | Integrator-Problem |
| Bundle | Hostseite lädt nur ~2 KB Loader; das schwere Bundle (Nuxt/Vue/Nuxt UI) lädt **im iframe** und ist nach dem ersten Widget gecacht | Gesamtes Vue+Nuxt-UI-Bundle direkt in die Hostseite (Größen-/Versions-/Konflikt-Risiko) | — |
| Realtime/SSR | SSR im iframe (schneller First Paint der Kommentare), geteilte Realtime-WS wie gehabt | Kein SSR (reines CSR-Mount) | — |
| Nachteile | Resize-Kommunikation nötig; Kommentare für Crawler der Hostseite unsichtbar (§ 3g); partitionierte Cookies (§ 3a) | — | — |

¹ Mit einer Einschränkung: moderne Browser partitionieren Third-Party-Storage —
Details und Lösung (CHIPS + Login-Popup) in § 3a.

Disqus, Giscus, Utterances, Commento — praktisch jede erfolgreiche
Embed-Kommentarlösung nutzt genau dieses Muster. Es ist zugleich der Weg mit dem
kleinsten Delta zum Bestandscode: `CommentSection.vue` nimmt bereits
`targetId`/`targetType`/`targetUrl` als Props und wird 1:1 wiederverwendet.

**Web Component bleibt bewusster Nicht-MVP** (siehe § 5): sinnvoll erst, falls
Integratoren nahtloses Inline-Styling verlangen — dann als separates,
schlankes Vite-Build ohne Nuxt UI.

### Wo lebt der Code? (Layer-Zuordnung, A14)

- **`packages/comments`** besitzt das Embed-Feature: `app/pages/embed.vue`
  (bzw. `embed/[targetType]/[targetId].vue`), das Loader-Script, den
  Site-/Origin-Registry-Endpoint und ggf. eine `embed_sites`-Table. Es ist
  Comment-Domäne — kein Core-Kandidat (Regel 3: eigene Tables → nie Core).
- **`packages/core`** liefert nur generische Bausteine, falls nötig
  (z. B. Security-Header-Helper). Keine neue Kopplung core→comments.
- **Konsumierende App** (comments bzw. später eine dedizierte
  Embed-App auf Port 3002+) aktiviert das Feature per Config-Gate
  `maui.comments.embed` (Core-Default-Muster: aus; App schaltet explizit an —
  analog `maui.analytics`).

---

## 3. Die harten Probleme — konkret am bestehenden Code

### (a) Auth cross-origin

**Ist-Zustand:** Das Session-Cookie `a_session_<PROJECT_ID>` wird mit
`httpOnly + secure + sameSite:'strict'` gesetzt
([core/server/lib/appwrite.ts](../../packages/core/server/lib/appwrite.ts), Z. 18–26).
`sameSite:'strict'` heißt: In einem iframe auf `fremdeseite.de` sendet der
Browser das Cookie **nicht** mit — selbst an unsere eigene Domain. Zusätzlich
partitionieren Safari (ITP) und Chrome (3P-Cookie-Phase-out) Third-Party-Cookies
unabhängig vom SameSite-Attribut.

**Optionen:**

1. **iframe auf eigener Domain mit eigener (partitionierter) Session — EMPFOHLEN.**
   Das Embed bekommt einen eigenen Cookie-Modus: für die `/embed`-Route wird das
   Session-Cookie mit `SameSite=None; Secure; Partitioned` (CHIPS) gesetzt.
   Login-Flow: Klick auf „Anmelden" im iframe öffnet ein **Popup** (Top-Level auf
   unsere Domain → dort funktioniert der komplette bestehende Login inkl. OAuth
   unverändert first-party). Nach Erfolg signalisiert das Popup per
   `postMessage`/`BroadcastChannel` das iframe, das seine Session über einen
   dedizierten Endpoint (Cookie mit `Partitioned`-Attribut nachsetzen) übernimmt
   und neu lädt. Konsequenz von CHIPS: die Embed-Session ist **pro
   Einbetter-Domain partitioniert** — der User meldet sich je Hostseite einmal
   an. Das ist der akzeptierte Industrie-Standard (Disqus verhält sich identisch).
   Fallback für Browser ohne CHIPS: Storage Access API (`document.requestStorageAccess()`
   nach User-Geste) — progressive enhancement, Read-only bleibt immer.
2. **OAuth-Popup-Flow ohne iframe-Cookie** (Token statt Cookie im iframe):
   verworfen als Primärweg — bräuchte einen zweiten Auth-Pfad (JWT im
   iframe-Speicher statt httpOnly-Cookie), verliert den XSS-Schutz des
   httpOnly-Cookies und dupliziert die Session-Logik. Das Popup selbst wird
   aber Teil von Option 1 (Top-Level-Login).
3. **Anonyme Gäste read-only:** kein Ersatz, sondern die **Basisstufe** — sie
   funktioniert heute schon ohne jede Änderung und ist das MVP (§ 5). Schreiben
   erfordert Login (bestehende 401-Guards in
   [index.post.ts](../../packages/comments/server/api/comments/index.post.ts) etc.).

**Architektur-Entscheid:** Option 1 (+ 3 als Basisstufe). Wichtig: der
`Partitioned`/`SameSite=None`-Modus gilt **nur für die Embed-Session-Übernahme**,
niemals für die Haupt-App (dort bleibt `strict`) — sonst reißt man den
CSRF-Schutz der ganzen App ein (→ b).

### (b) CORS/CSRF auf den server/api-Routen

**Ist-Zustand:** Es gibt **keinerlei CORS-Konfiguration** (kein Handler, keine
routeRules) — Nitro sendet keine `Access-Control-Allow-Origin`-Header, die API
ist faktisch same-origin. CSRF-Schutz beruht vollständig auf
`sameSite:'strict'`; es gibt kein CSRF-Token und keinen Origin-Check.

**Mit der iframe-Architektur bleibt das fast vollständig so:**

- Alle `/api/comments`-, Vote-, Report-, Auth-Calls laufen **im iframe
  same-origin** → CORS wird **nicht** geöffnet. Das ist der größte
  Sicherheitsgewinn der iframe-Entscheidung.
- **Neue Lücke durch (a):** Sobald das Embed-Cookie `SameSite=None` trägt,
  senden es Browser bei cross-site Requests mit → die Write-Routen wären per
  CSRF angreifbar (Form-POST von einer Angreiferseite). Gegenmaßnahme:
  Nitro-Middleware, die für **unsichere Methoden** (POST/PATCH/PUT/DELETE) den
  `Origin`-/`Sec-Fetch-Site`-Header gegen die eigene App-Origin prüft
  (Requests aus dem iframe tragen unsere Origin, Form-POSTs des Angreifers
  dessen Origin). Sitz: `packages/core/server/middleware/csrf-origin.ts`
  (generisch, neben rate-limit.ts) — greift nur, wenn das Partitioned-Cookie-
  Feature aktiv ist; ansonsten no-op.
- **Framing erlauben/verbieten:** Aktuell wird kein `X-Frame-Options`/CSP
  gesetzt (jede Seite dürfte alles framen). Neu: `/embed*` bekommt explizit
  `Content-Security-Policy: frame-ancestors <allowlist bzw. *>`, alle übrigen
  Routen (Login! Dashboard!) bekommen `frame-ancestors 'self'` — verhindert
  Clickjacking auf dem Haupt-Login, während das Embed framebar bleibt. Die
  Allowlist kommt aus der Site-Registry (→ f).
- **CORS gezielt nur fürs Loader-Script + Count-API:** `embed.js` (statisches
  Asset) und ein optionaler `GET /api/comments/count` (Kommentarzahl für
  Hostseiten-Links, JSONP-frei via CORS `*`, read-only, ohne Credentials) sind
  die einzigen bewusst cross-origin konsumierbaren Ressourcen.
- **Appwrite-seitig:** Die Drittseiten sprechen **nie** direkt mit Appwrite
  (SSR-first bleibt) — in der Appwrite Console muss also nur die Widget-Domain
  als Platform registriert sein, keine Einbetter-Domains. Einzige Ausnahme:
  die Realtime-WS des iframes läuft direkt gegen Appwrite, aber mit
  iframe-Origin = Widget-Origin → bestehende Platform-Registrierung genügt.

### (c) Realtime für Gäste

**Ist-Zustand:** Die comments-Table ist `read(any)` (Migration 002, Z. 137) —
genau damit Gast-Realtime funktioniert. `useRealtimeRows` verbindet ohne JWT als
Gast-WS und empfängt Row-Events; `ensureRealtimeJwt()` schlägt für Gäste leise
fehl und die Konsumenten fallen auf Refetch zurück
([useRealtimeClient.ts](../../packages/core/app/composables/useRealtimeClient.ts), Z. 59–64).
**Für das Embed heißt das: Gast-Livecomments funktionieren out of the box.**

**Aber — der bekannte offene Punkt wird durch das Embed schärfer**
(OPEN-ITEMS: „`hidden` via REST lesbar"): Der `status`-Filter
(`Query.notEqual('status','hidden')`, [index.get.ts](../../packages/comments/server/api/comments/index.get.ts) Z. 50)
und das Soft-Delete-Blanking (Z. 104–106) existieren **nur in der Nuxt-Route**.
Wer die Appwrite-REST-API bzw. die Realtime-Events direkt konsumiert, sieht:

1. `hidden`-Kommentare (moderierte Inhalte) im Klartext,
2. `deleted`-Kommentare mit Original-`content`/`authorName` (das Blanking ist
   Route-Kosmetik gegenüber der DB),
3. Realtime-**Update**-Events beim Verstecken/Löschen liefern den vollen
   Row-Payload an alle Gast-Subscriber.

Bisher „bewusster Trade-off" einer eigenen App — als öffentliches
Embed-Produkt, das aktiv auf fremde Seiten getragen wird, nicht mehr haltbar.

**Optionen + Entscheid:**

| Option | Wirkung | Kosten |
|---|---|---|
| **1. Realtime nur als „Signal", Daten via Route — EMPFOHLEN** | Row-Events werden im Embed (und perspektivisch in der App) nur noch als Invalidierungs-Trigger genutzt: Event → gezielter Refetch über `GET /api/comments` (der filtert/blankt server-autoritativ). Table-Read kann dann auf `read(users)` oder ganz zu → REST-Leak komplett dicht | Payload-Nutzung in `store.applyRealtime` umbauen (Refetch statt Payload-Merge, mit Debounce); minimal höhere Latenz (~1 Request) |
| 2. `read(any)` behalten, aber Rows bei hide/delete **physisch bereinigen** (Content beim Soft-Delete/Hide in der DB blanken bzw. Row-Permissions pro Row entziehen) | Leak inhaltlich dicht, Gast-Realtime bleibt payload-basiert | Moderations-Flows (`status.patch`, Cascade-Hide) müssen Rows umschreiben; „Wiederherstellen" verliert Originalinhalt → braucht Schattenkopie (neue Komplexität) |
| 3. Realtime auf `read(users)`+JWT, Gäste pollen | Leak dicht, wenig Umbau | Gast-Livecomments entfallen (fürs Embed gerade das Aushängeschild); Polling-Last |

Entscheid: **Option 1.** Sie löst den offenen Sicherheitspunkt endgültig
(statt ihn zu vererben), behält Live-Updates für Gäste und macht die
Row-Permissions wieder zur echten Autorität. Die `where`-Filterung
(`targetId`-Match) bleibt als Trigger-Filter erhalten; die 1.9.5-Server-Queries
(`options.queries` in useRealtimeRows) reduzieren die Event-Last pro Widget.
Presence (Thread-Presence, Typing, JWT-Pflicht) bleibt im Embed **deaktiviert**
(MVP) — sie ist session-gebunden und für Gäste ohnehin stumm.

### (d) Ausliefern des Widgets

**Entscheid: iframe-Seite in der App (kein separates Build).**

- **`embed.js` (Loader):** handgeschriebenes Vanilla-JS in
  `packages/comments/public/embed.js` (Nuxt liefert `public/` aus Layern aus),
  ~1–2 KB. Aufgaben: iframe erzeugen (`src` mit `targetId`, `targetType`,
  `theme`, `locale`, `url` als Query-Params), `title`-Attribut (a11y),
  `loading="lazy"`, Resize via `postMessage` (iframe meldet `scrollHeight`,
  Loader setzt `height` — `targetOrigin` beidseitig strikt prüfen).
  Kein Framework, kein Build-Schritt, versionslos stabil gehalten.
- **`/embed`-Seite:** `packages/comments/app/pages/embed.vue` — liest die
  Query-Params (Zod-validiert, `targetId`-Format wie
  [commentSchema](../../packages/comments/schemas/comment.ts)), rendert
  `CommentSection` in einem dedizierten Minimal-Layout `layouts/embed.vue`
  (kein Nav/Footer/UserMenu/NotificationBell), `definePageMeta({ layout: 'embed' })`.
  SSR bleibt an → Kommentare stehen beim First Paint.
- **Bundle-Größe:** Das iframe lädt das App-Bundle (Nuxt+Vue+Nuxt UI, grob
  100–200 KB gz). Bewertung: akzeptabel, weil (1) es NICHT das Budget der
  Hostseite belastet (eigener Context, lazy, async), (2) HTTP-Cache es über
  alle Widgets/Seiten desselben Betreibers teilt, (3) SSR den sichtbaren
  Inhalt vom JS entkoppelt. Maßnahmen trotzdem: Embed-Route ohne Presence-/
  Notification-Composables halten, `routeRules`-SWR-Cache für `/embed` prüfen.
  Ein separates Micro-Bundle (Preact/vanilla) wäre eine spätere Optimierung,
  kein MVP-Kriterium.
- **Welche App serviert?** MVP: die bestehende comments-App (Feature
  per `maui.comments.embed` angeschaltet). Der saubere Endzustand ist eine
  dedizierte dünne App `apps/embed-comments` (Port 3002+, eigene
  Appwrite-Instanz) — die hängt aber am offenen Punkt „Migrations auf
  comments gepinnt"/App-Template (OPEN-ITEMS, Idee 1) und ist deshalb
  Ausbau, nicht MVP.

### (e) Theming/Dark-Mode auf Fremdseiten

- **Grundlage:** iframe isoliert CSS vollständig — Nuxt UI/Tailwind-Töne
  kollidieren nie mit der Hostseite. Umgekehrt erbt das Widget aber auch
  nichts: es muss explizit gestylt ankommen.
- **Dark-Mode:** Drei Quellen, Priorität absteigend: (1) explizites
  `data-theme="dark|light|auto"` am Script-Tag → Query-Param → `useColorMode`
  forcieren; (2) `auto`: `prefers-color-scheme` gilt **im iframe identisch
  zur Hostseite** (gleiches OS-Setting) — funktioniert ohne Kommunikation;
  (3) dynamischer Wechsel: Hostseite kann per `postMessage`
  (`maui:set-theme`) nachsteuern (dokumentierte Loader-API).
- **Branding:** Query-Params für die Nuxt-UI-Token, die `app.config`
  überschreibt (`primary`-Farbe, `radius`, Font optional). Whitelist statt
  freiem CSS (kein CSS-Injection-Vektor). Transparenter iframe-Hintergrund
  (`allowtransparency` + `background: transparent` im Embed-Layout), damit
  das Widget auf jeder Seitenfarbe sitzt.
- **i18n:** `data-locale` → Query-Param → `de`/`en` (Strategie
  `prefix_except_default` beachten: `/embed` vs. `/de/embed`, Links im Widget
  via `localePath()` wie gehabt).
- Das 26-Themes-System (`packages/themes`) bleibt außen vor — das Embed nutzt
  nur die Core-Token (Layer-Grenze, themes ist optional).

### (f) Rate-Limiting/Abuse auf öffentlichen Endpoints

**Ist-Zustand ([rate-limit.ts](../../packages/core/server/middleware/rate-limit.ts)):**
in-memory, pro IP; Write-Buckets für `POST/PATCH /api/comments`, Vote, Reports
(60/min), Auth eng (5/min), JWT-Mint 10/min. **GET ist grundsätzlich frei.**
`unknown`-IP-Bucket und `xForwardedFor`-Trust sind dokumentierte Kanten.

**Was das Embed ändert:** Die Endpoints waren bisher „öffentlich, aber nur von
der eigenen App verlinkt". Ein Embed macht sie zu beworbener, permanenter
Angriffsfläche auf fremden Seiten mit unbekanntem Traffic.

Maßnahmen:

1. **Read-Limit:** `GET /api/comments` (+ `count`) in `WRITE_LIMITED`-Manier
   mit eigenem, großzügigem Bucket (z. B. 120/min/IP) aufnehmen — heute
   erzeugt jeder Request bis zu 4 Appwrite-Queries (top-level, replies,
   total, avatars) → billiger DoS-Hebel.
2. **Site-Registry als zentrales Gate:** neue Table `embed_sites`
   (comments-Layer): registrierte Einbetter-Domain(s) je `targetType`,
   verwaltet im Admin-Dashboard (Modul-Registry `maui.admin.modules` — Muster
   existiert, siehe [comments/app.config.ts](../../packages/comments/app/app.config.ts)).
   `/embed` prüft `Referer`/`Origin` bzw. den `url`-Param gegen die Registry
   und setzt daraus die `frame-ancestors`-CSP (→ b). Verhindert (best effort),
   dass beliebige Seiten das Widget kapern, und begrenzt gleichzeitig die
   `targetType`-Kardinalität.
3. **targetId-Hygiene:** Ohne Registry kann jeder Query-Param beliebige
   `targetId`s erzeugen (leere Threads kosten nichts, aber Kommentar-Spam
   verteilt sich unauffindbar). Regel: `targetType` muss registriert sein;
   `targetId`-Format per Zod (bereits Längen-begrenzt) + optional
   Canonical-URL-Ableitung dokumentieren.
4. **Write-Schutz bleibt Session-gebunden** (401-Guards vorhanden), plus
   bestehende Buckets. Ergänzend fürs Embed: Honeypot-Feld im Formular und
   Mindest-Zeit-bis-Submit (billige Bot-Bremsen ohne Captcha-Tracking);
   Auto-Hide-Threshold aus OPEN-ITEMS Idee 10 passt hier als Verstärkung.
5. **Betriebsvoraussetzung Multi-Instanz:** der in-memory-Store ist
   Single-Instanz (dokumentiert). Fürs Embed-Produkt vor Skalierung: Redis
   via Nitro Storage (bestehendes TODO, wird hier zur Voraussetzung).
6. **Presence-/JWT-Routen:** bleiben Session-gebunden und im Embed ungenutzt
   (MVP) — keine neue Fläche.

### (g) SEO — dokumentierte Grenze

Kommentare leben im iframe unter unserer Origin → Crawler der **Drittseite**
sehen sie nicht; sie zahlen nicht auf deren Content/Keywords ein. Das ist bei
Disqus identisch und wird **bewusst akzeptiert + dokumentiert** (Integrations-
Doku, eigener Abschnitt „SEO-Verhalten"):

- `/embed` selbst bekommt `robots: noindex` (sonst indexiert Google nackte
  Widget-Seiten unter unserer Domain — Duplicate-/Thin-Content).
- Kein `SameSite`-/Storage-Zugriff nötig fürs Lesen → Widget funktioniert auch
  mit hartem Tracking-Schutz (Verkaufsargument, in die Doku).
- **Ausbau-Option (nicht MVP):** `GET /api/comments/count` (CORS `*`) für
  „N Kommentare"-Links auf der Hostseite; später eine dokumentierte
  Server-Side-Include-Variante (Hostseite rendert Kommentare selbst via
  JSON-API in ihrem SSR) für SEO-sensible Integratoren — das wäre dann der
  einzige legitime CORS-Read-Endpoint mit Registry-Allowlist.

---

## 4. MVP-Abgrenzung vs. Ausbau

### MVP („einbettbar + sicher lesbar, schreiben nach Login im Popup")

- iframe-Embed via `embed.js` + `/embed`-Seite in comments,
  Config-Gate `maui.comments.embed` (Default aus)
- Gäste: lesen + live (Realtime als Invalidierungs-Signal, § 3c Option 1 —
  schließt zugleich den offenen `hidden`-REST-Punkt)
- Schreiben: Login/Registrierung im Popup (Top-Level, bestehender Auth-Stack),
  Embed-Session via CHIPS-partitioniertem Cookie; Browser ohne CHIPS → read-only
- Security-Header: `frame-ancestors`-Split (App `self`, `/embed` offen bzw.
  Registry), Origin-Check-Middleware für unsichere Methoden, `noindex` auf `/embed`
- Rate-Limit auf `GET /api/comments`; Theming: `data-theme` + `auto`
  (prefers-color-scheme) + `primary`-Farbe; `data-locale`
- Integrations-Doku (Snippet, Attribute, SEO-Grenze, DSGVO-Hinweise)

### Ausbau (nach MVP, jeweils eigenständig schiffbar)

- Site-Registry `embed_sites` + Admin-UI + Registry-gespeiste CSP (im MVP:
  statische Allowlist aus app.config)
- `GET /api/comments/count` (CORS) + „N Kommentare"-Loader-Helfer
- Dedizierte `apps/embed-comments` (hängt an App-Template/Migrations-Entkopplung,
  OPEN-ITEMS Idee 1)
- Presence/Typing im Embed für eingeloggte User; Redis-Rate-Limit-Store
- Guest-Kommentare mit Name+Email (ohne Account) — Produktentscheidung, s. § 6
- Web-Component-Variante (separates Micro-Bundle) für Inline-Integration
- SEO-SSI-Variante (JSON-API mit Registry-Allowlist)
- Markdown im Embed (folgt OPEN-ITEMS Idee 3), Reaction-Emojis, etc.

**Nicht-Ziele:** Multi-Tenant auf EINER Instanz (Architektur bleibt „eigene
Appwrite-Instanz pro App", CONCEPT A1); Tracking/Analytics im Widget;
IE/Legacy-Browser.

---

## 5. Todo-Liste (nummeriert, Phasen, Aufwand S/M/L)

### Phase E0 — Fundament & Sicherheits-Vorarbeiten (Blocker fürs Embed)

1. ✅ **ERLEDIGT (2026-07-02, einfacher als geplant)** — der REST-Leak wurde
   ohne Signal-Modell-Umbau geschlossen: Lese-Sichtbarkeit liegt jetzt auf den
   ROWS (Migration comments-008: Table nur `create(users)`, nicht-hidden Rows
   tragen `read(any)`; Hide entzieht die Permission zweiphasig, Restore gibt
   sie zurück). Live verifiziert: Gast-REST sieht keine hidden-Rows, Gast-WS
   bekommt weiterhin Create-Events. Der Realtime-Payload-Merge bleibt bestehen.
2. ✅ **(2026-07-09)** `GET /api/comments` mit Read-Bucket 120/min/IP in
   [rate-limit.ts](../../packages/core/server/middleware/rate-limit.ts);
   429 wird in `fetchComments` still geschluckt (Liste bleibt stehen, kein
   Toast-/Unhandled-Rejection-Spam). Live verifiziert (Burst → 429 + Retry-After).
3. ✅ **(2026-07-09)** Umgesetzt als GENERISCHE core-Registry statt
   core→comments-Kopplung: `registerEmbeddableRoute()`
   ([frameAncestors.ts](../../packages/core/server/utils/frameAncestors.ts)) +
   Nitro-Plugin `security-headers.ts` (render:response, alle SSR-Seiten
   `frame-ancestors 'self'`); comments registriert `/embed` per
   [embed-frame.ts](../../packages/comments/server/plugins/embed-frame.ts)
   aus `maui.comments.embed.allowedOrigins`. XFO bewusst weggelassen.
4. ✅ **(2026-07-09)** [csrf-origin.ts](../../packages/core/server/middleware/csrf-origin.ts)
   — Gate `maui.security.csrfOriginCheck` (Core-Default aus; PFLICHT sobald
   E2-Partitioned-Cookies aktiv werden): `Sec-Fetch-Site: cross-site` → 403,
   sonst Origin-vs-Host; Requests ohne Origin (Webhooks, curl) passieren.

### Phase E1 — MVP: Read-only-Embed

5. ✅ **(2026-07-09)** Gate `maui.comments.embed` (enabled + allowedOrigins,
   Default aus) in [comments/app.config.ts](../../packages/comments/app/app.config.ts);
   `/embed` wirft 404 wenn deaktiviert. comments aktiviert mit
   `allowedOrigins: ['*']` (bewusste Demo-App-Entscheidung, E7).
6. ✅ **(2026-07-09)** [embed.vue](../../packages/comments/app/pages/embed.vue) +
   [layouts/embed.vue](../../packages/comments/app/layouts/embed.vue): Zod-Params
   (targetId/targetType/url/theme/primary — primary als Farb-Whitelist),
   noindex, Resize-postMessage (targetOrigin = Host-Origin aus url-Param).
   Abweichung vom Plan: transparenter Hintergrund NUR bei theme=auto —
   erzwungenes dark auf heller Hostseite war sonst kontrastlos (verifiziert).
   locale läuft über den i18n-Pfad-Präfix statt Query-Param.
7. ✅ **(2026-07-09)** [embed.js](../../packages/comments/public/embed.js):
   dependency-frei, currentScript-basiert (mehrere Widgets via data-container),
   sandbox `allow-scripts allow-same-origin allow-forms allow-popups
   allow-popups-to-escape-sandbox`, Resize mit Origin+Source-Check,
   maui:set-theme-Protokoll dokumentiert.
8. ✅ **(2026-07-09)** Test-Hostseite
   [.embed-test/index.html](../../packages/comments/.embed-test/index.html)
   (Widget-Origin/Theme per Query steuerbar) + Playwright-Smoke
   [embed.spec.ts](../../apps/comments/e2e/embed.spec.ts) (eigener
   node:http-Host-Server pro Worker): iframe lädt cross-origin, Sektion
   rendert, Resize setzt Pixel-Höhe, 400-Validierung + Header-Split. Manuell
   zusätzlich verifiziert: Realtime-Pille im Gast-iframe (neuer Kommentar
   erscheint live), dark + primary. Hinweis: localhost:PORT↔PORT ist
   same-SITE — echtes cross-SITE-Gastverhalten (kein Cookie) greift erst auf
   echten Domains; Gast-SSR wurde cookie-frei per curl verifiziert.

### Phase E2 — MVP: Auth im Embed (Schreiben)

9. **(M)** Embed-Session-Modus: Login-Button im iframe öffnet Popup auf
   `/login?embed=1` (Top-Level, voller bestehender Auth-Stack inkl. OAuth);
   nach Erfolg `postMessage`/`BroadcastChannel` → iframe ruft
   `POST /api/auth/embed-session` auf, der das Session-Cookie mit
   `SameSite=None; Secure; Partitioned` (CHIPS) für den iframe-Kontext setzt
   (Erweiterung von `setSessionCookie` um einen `partitioned`-Modus,
   [core/server/lib/appwrite.ts](../../packages/core/server/lib/appwrite.ts)) —
   NUR für Embed-Kontexte, Haupt-App bleibt `strict` (§ 3a).
10. **(S)** Feature-Detection + Fallback: ohne CHIPS-Support (alte Browser)
    Storage Access API versuchen, sonst read-only bleiben mit Hinweis-Text
    (i18n-Keys de+en); ausgeloggt-Zustand im iframe sauber (Popup-Flow statt
    Redirect auf `/login`, `localePath` beachten).
11. **(M)** Verifikation Schreib-Flows im Embed (manuell + Playwright soweit
    möglich): kommentieren, antworten, voten, melden, eigene löschen — inkl.
    Realtime-Sync zurück in einen zweiten Browser/Gast-Tab; CSRF-Check
    (Origin-Middleware) greift; Rate-Limits greifen.
12. **(S)** Logout/Session-Ablauf im iframe: 401-Handling im Store → zurück in
    den Gast-Modus statt Fehlerkaskade (Embed-Variante des bestehenden
    Auth-Fehlerpfads).

### Phase E3 — Produktisierung

13. **(S)** Integrations-Doku `docs/plans/EMBED-WIDGET.md` → `docs/EMBED.md`
    bzw. öffentliche Doku-Seite: Snippet, Attribute-Referenz, Theming,
    SEO-Grenze (§ 3g), DSGVO-Argumentation (self-hosted, keine Third-Party-
    Requests, partitionierte Cookies), Browser-Matrix (CHIPS).
14. **(M)** Site-Registry: Migration `embed_sites` (domain, targetTypes,
    aktiv), Admin-Modul (Registry-Eintrag in `maui.admin.modules` nach
    bestehendem Muster), `/embed` + CSP + optional Loader gegen Registry
    prüfen; unregistrierte Domain → freundliche Fehlerseite im iframe.
15. **(S)** `GET /api/comments/count` mit CORS `*` (read-only, ohne
    Credentials, eigener Rate-Bucket) + Loader-Helfer
    `data-maui-count`-Elemente zu befüllen.
16. **(M)** Rate-Limit-Store auf Nitro Storage/Redis umstellbar machen
    (Multi-Instanz-Betrieb, bestehendes TODO aus A2 — hier Voraussetzung).
17. **(L)** Dedizierte `apps/embed-comments` (Port 3002+, eigene Instanz)
    sobald App-Template + entkoppelte Migrations existieren (OPEN-ITEMS
    Idee 1 ist Vorbedingung); comments-Embed-Gate dann wieder aus.

### Phase E4 — Ausbau (optional, je nach Traktion)

18. **(M)** Presence/Typing für eingeloggte Embed-User (JWT-Pfad im iframe
    aktivieren — funktioniert mit partitionierter Session, braucht aber
    Bundle-/Traffic-Abwägung).
19. **(L)** Web-Component-Variante als separates Micro-Bundle (Vite-Lib-Build,
    Shadow DOM, ohne Nuxt UI) für Inline-Integration + CORS-API mit
    Registry-Allowlist.
20. **(M)** ✅ UMGESETZT (2026-07-23) — Guest-Kommentare (Name+Email ohne
    Account, OHNE Double-Opt-In/Verifikation, bewusste Produktentscheidung).
    POST `/api/comments/guest` (Gate `embed.guests`, Rate-Limit 5/min/IP,
    Tenant-Quota, kein operatorTarget), comments-013 (`authorKind` +
    operator-lesbare `guest_authors`-Tabelle; E-Mail nie auf der read(any)-
    Row), GuestCommentForm im Widget + „Gast"-Badge. Live verifiziert.

---

## 6. Offene Entscheidungen

1. **Gast-Schreibrechte:** Disqus' größter Adoptions-Hebel ist Kommentieren
   ohne Account (Name+Email). Unser Modell ist account-basiert (Appwrite-User,
   Votes/Notifications hängen an userId). Anonyme Writes wären ein eigener
   Pfad (Admin-Client-Write + Spam-Risiko + DSGVO-Fragen). **Vorschlag:** MVP
   ohne; Entscheidung nach erstem echten Integrator-Feedback.
2. **Ein Login pro Einbetter-Domain (CHIPS-Partitionierung) akzeptabel?**
   Technisch unvermeidbar ohne Third-Party-Cookies. Alternative wäre ein
   sichtbarer „Auf comments.example.com kommentieren"-Deep-Link statt
   Inline-Schreiben. **Vorschlag:** CHIPS-Weg, Deep-Link als Zusatz-Button.
3. **Registry im MVP oder statische Allowlist?** Plan sagt: statische
   Allowlist (`maui.comments.embed.allowedOrigins`) im MVP, Registry-Table in
   E3. Bestätigen, sobald klar ist, ob der erste Einsatz eigene oder fremde
   Seiten sind (eigene Seiten → Allowlist reicht lange).
4. **Wo läuft das erste produktive Embed?** comments-App mitbenutzen
   (schnell, aber vermischt Produkt + Demo) vs. auf `apps/embed-comments`
   warten (sauber, aber von OPEN-ITEMS Idee 1 blockiert).
5. **`targetId`-Konvention für Drittseiten:** freie ID (Integrator wählt,
   stabil gegen URL-Umzüge — empfohlen) vs. Canonical-URL-Ableitung
   (Zero-Config, aber URL-Änderung verwaist Threads). Doku muss genau eine
   Empfehlung geben.
6. **Realtime-Refetch-Granularität (E0-Todo 1):** kompletter Target-Refetch
   mit Debounce (einfach, empfohlen) vs. Einzel-Row-Nachladen über eine neue
   `GET /api/comments/[id]`-Route (sparsamer, mehr Fläche). Beim Umbau messen.
7. **CSP `frame-ancestors *` vs. Allowlist-Pflicht:** offenes `*` senkt die
   Integrations-Hürde (Disqus-artig), Allowlist verhindert Widget-Hijacking
   und Kommentar-Kontext-Fälschung. **Vorschlag:** Default Allowlist, `*` als
   bewusste Betreiber-Option im Gate.

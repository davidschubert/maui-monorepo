# Maui Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo (maui-monorepo) mit zentralem Core Layer + Feature Layers.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.4.x (Composition API, SSR), Nuxt UI 4.8.x, Pinia, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime) — Appwrite self-hosted 1.9.6
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Feature Layers (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [features..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- Feature-Manifeste (Plattform-Strategie F1): JEDER Layer hat
  feature.manifest.ts (key/tier/requires/Katalog-Texte, nur `import type`!),
  JEDE App site.manifest.ts = Single Source der Feature-Wahl.
  `pnpm check:manifests` (CI/lint) erzwingt Konsistenz mit extends +
  package.json + migrate.mjs-LAYER_ORDER — neue Layer/Apps immer mit
  Manifest anlegen. Strategie: docs/referenz/MULTI-SITE-PLATFORM-STRATEGIE.md
- packages/blueprint = KOMPOSITIONS-Layer („Bauplan", seit 2026-07-27): der
  EINZIGE Layer, der mehrere Produkt-Layer kennen darf — Produkt-
  Kompositionen (Feed+Kommentare, …) existieren GENAU EINMAL hier, nie je
  App (Pool und Silo müssen identisches Produktverhalten zeigen —
  docs/referenz/PRODUKT-BILANZ.md). In extends VOR den Produkt-Layern listen.
  Keine Produkt-Logik, keine Tables, kein server/ in blueprint.
- Layer-Grenzen-Matrix (wer darf was besitzen) + Durchsetzung: CONCEPT.md A14.
  Neue Cross-Layer-Abhängigkeiten als EXPLIZITE Verträge (kein impliziter
  Auto-Import/String-Coupling); ESLint no-restricted-imports als Backstop.
  Fundament-Layer (core, geplant: moderation/system) hängen NIE von Features ab.

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key) + createSessionClient
  (pro Request, NIE teilen!) in server/lib/appwrite.ts; Feature Layer nutzen
  sie via Auto-Import (Core re-exportiert in server/utils/appwrite.ts)
- Zwei Keys pro Instanz: Runtime-Key (sessions/users/rows/health, in .env) +
  Migrations-Key (databases/tables/columns/indexes, nur für Scripts)
- CRUD NUR über server/api/* (Session enforced, Validierung zentral),
  NIE Web SDK CRUD aus <script setup>
- Realtime (seit P1, 2026-07-01): EINE geteilte, JWT-authentifizierte SDK-
  Realtime in core/app/composables/useRealtimeClient.ts (sharedRealtime,
  realtimeCookieClient, ensureRealtimeJwt) — useRealtimeRows, Presence und
  Config-Flags multiplexen über denselben Socket (Channel.tablesdb().table()
  .row(), optional server-seitige queries; where-Filter bleibt Sicherheitsnetz).
  JWT via GET /api/auth/realtime-token (15 min, Client refresht; Cookie-Client
  NIE mit JWT mischen → Appwrite-403). AUSNAHME: useRealtimeAccount bleibt
  bewusst cookie-nativer WS (Instant-Session-Revoke hängt am Cookie-Close) —
  NICHT konsolidieren. Realtime braucht einen gesunden appwrite-realtime-
  Container (Swoole-Crash → `docker compose up -d --no-deps appwrite-realtime`).
- Session-Cookie: a_session_<PROJECT_ID>, httpOnly+secure+sameSite,
  Appwrite-Endpoint als Subdomain derselben Root-Domain
- Jede App: EIGENE Appwrite-Instanz, Config aus .env
  (NUXT_APPWRITE_KEY server-only, NUXT_PUBLIC_* für Endpoint/Project)
- Immer explizites Query.limit() (Default 25)
- SDK-Generics nutzen: tablesDB.listRows<T>()
- Migrations: idempotent (409 → skip), IMMER über den zentralen Runner
  `pnpm migrate --app <app>` (scripts/migrate.mjs; bei mehreren Apps ist
  --app Pflicht — nie die falsche Instanz), nach Column-Anlage auf
  'available' pollen bevor Indizes
- Presences API (self-hostbar seit 1.9.5): GESAMTE Presence vereinheitlicht auf
  EINE Presence pro User (presenceId=userId; metadata trägt scope/action/typing).
  WICHTIG (SSR-Cookie-Architektur): der Browser kann seine Presence NICHT selbst
  schreiben — der Web-SDK-Client hat keine Session, daher wird realtime.
  upsertPresence() über einen Guest-WS verworfen und PUT /presences → 401. Der
  WRITE läuft daher server-seitig: POST /api/presence/heartbeat upsertet mit dem
  Admin-Client (expiresAt 90s). usePresenceState() = einzige
  Heartbeat-Autorität pro Tab (ruft die Route bei Login/metadata-Änderung + alle
  20s + bei visibilitychange/focus). usePresence(predicate) = Reader — liest
  direkt über die Presences-API (presences.list() per Cookie-GET funktioniert +
  Channel.presences()-Trigger), „online jetzt" via updatedAt-Recency 60s. Server:
  listOnlinePresences() in core/server/utils/presence.ts. KEINE presence-Table mehr.
  metadata-Felder (je eigener Zweck, kollidieren nicht): scope (Thread), action
  (reviewing:/editing:), typing, page (Dashboard-Seite), replyingTo (commentId),
  near (commentId, Lese-Position). Use-Cases: useThreadPresence (scope + typing +
  replyingTo + near), useModerationPresence (action reviewing:*), useEditAwareness
  (action editing:*), useViewingPresence (page → DashboardViewers „N sehen diese
  Seite"). PresenceAvatar (core): Avatar + Icon-Badge in der Ecke (tippt/antwortet)
- PRESENCE-GRENZE (A4, seit 2026-07-29 — vorher `read("users")`, also im Pool
  JEDER eingeloggte User ALLER Communities): die Presence trägt jetzt dieselben
  Rechte wie jede andere Zeile — `tenantRowPermissionsFor` ⇒ Pool
  `read("label:<siteId>")`, Silo/Single-Tenant unverändert `read("users")`.
  Geschrieben wird sie an ZWEI Stellen (heartbeat.post.ts UND der WS-Upsert in
  usePresenceState, der die Permissions ERSETZT) — beide bauen sie aus
  core/shared/presencePermissions.ts, per Test an tenantRowPermissionsFor
  genagelt. Der tenantId-Filter (presenceFilter.ts/usePresence.ts) BLEIBT als
  Netz (Mehrfach-Mitgliedschaft). Beweis beidseitig:
  `packages/core/scripts/verify-presence-boundary.mjs`; Analyse + Rest-Falle
  (Label-Änderung berechnet die Rollen OFFENER WS nicht neu):
  docs/archiv/PRESENCE-GRENZE.md Abschnitt 8.

## Themes (Layer themes; Tables besitzt system, Admin-Routen admin — A14)
- Built-in-Katalog 26×11 (seit 2026-07-24): theme.catalog.ts ist der EINZIGE
  Input — `pnpm --filter @maui/themes generate -- --write` erzeugt
  public/themes/*.css + themeRegistry.gen.ts (committet; CI-Gate
  `check:themes` in lint.yml: Regenerieren darf kein Diff erzeugen). Ramps
  ankern die Basisfarbe fest auf Stufe 500; Kontrast-Gate verschiebt
  --ui-primary-Stufen selbst. Öffentlicher Picker = ThemePickerModal
  (Grid + sticky Varianten-Reihe), NIE CSS/Registry von Hand editieren.
  AUSNAHME `default`: steht bewusst NICHT im Katalog, sondern handgepflegt in
  app/utils/themeRegistry.ts. Sein Anzeige-Label ist seit 2026-07-29
  „**Aloha**" (davor „Sunrise" — klang neben der Katalog-Welt „Sunset"
  verwandt, B3; davor „Maui" — interner Produktname vor Kunden, N6). Label
  ≠ Key: die Id bleibt `default` (tenants.theme, data-theme, CSS-Dateinamen,
  gespeicherte Configs) — Theme-Namen nie über die Id umbenennen. Theme-Namen
  sind Eigennamen und laufen NICHT über i18n (de = en).
- Theme-Studio: /dashboard/themes (Galerie, Zweispalten), Editor als Vollseite
  (/new, /:id — Dock: Boxen „Farben"+„Schriften", je EIN „Erweitert"),
  Schriften-Verwaltung /dashboard/themes/fonts. Konzept + bewusste
  Ablehnungen: docs/referenz/THEMES-CONCEPT-V2.md — Einfachheit ist Leitprinzip
  (Standardansicht = wenige Entscheidungen, kein Slot-/Regler-Zoo)
- Custom Themes: Table custom_themes (system-Migrationen 009–013), Ramp zur
  Laufzeit aus EINER Basisfarbe (themes/shared/ramp.ts, OKLCH + Tests).
  config-JSON NUR ADDITIV erweitern (kein version-Feld): neutral 'tinted',
  font/fontHeading, darkAlias, headingWeight/Tracking/Uppercase, radius
- <html>-Attribute (SSR-Head via theme-Plugin, flash-frei; Draft-Vorschau
  im Editor setzt sie direkt und stellt beim Verlassen den LIVE-Zustand aus
  useTheme() wieder her): data-theme ('c-<rowId>'), data-variant,
  data-neutral, data-font, data-font-heading
- WESSEN FARBWELT GILT? (B5, seit 2026-07-29 — Davids Entscheidung): auf einem
  MANDANTEN-Host gewinnt die Community, nicht der Besucher. EINE pure Regel in
  `themes/shared/themeSelection.ts` (`resolveThemeSelection`, 11 Fälle
  getestet), `useTheme()` legt nur Cookies + Registry-Validierung darum:
  Mandanten-Host ⇒ `tenants.theme/variant` (useTenantBranding), ohne eigene
  Wahl ('') die Instanz-Einstellung — das Theme-Cookie wird dort GAR NICHT
  gelesen; sonst (Silo, Kontroll-Host, Playground) weiter Cookie ⇒ Instanz ⇒
  Core-Default. Flash-frei, weil `branding` aus dem SSR-Payload kommt und der
  Server schon das richtige data-theme + die richtige CSS-Datei stempelt.
  Der Theme-WÄHLER verschwindet auf Mandanten-Hosts (`canChooseTheme` aus
  useTheme() — öffentliches DisplaySettingsMenu, Dashboard-Kontomenü, Hinweis
  im Theme-Studio): ein Wähler ohne Wirkung wäre eine Lüge, und die
  Community-Farbe setzt der Owner unter /dashboard/settings/community.
  NICHT betroffen: Hell/Dunkel (useColorMode) und die Neutral-Palette bleiben
  Besucher-Wahl — es geht nur um data-theme/data-variant.
- Schriften, 2 Rollen (Text + Überschriften, + fixe Mono — nie mehr als 3):
  Registry-Einzelfamilien in app/assets/css/fonts.css (build-prozessiert →
  @nuxt/fonts self-hostet; NIE nach public/) + WOFF2-Uploads (Bucket 'fonts',
  Magic-Bytes-Check, 'cf-<rowId>', @font-face zur Laufzeit im Head).
  Legacy-Paar-Ids (editorial …) mappt resolveThemeFonts()
- Live-Propagation: custom_themes/custom_fonts/app_config sind Table-read(any)
  → realtime-themes-Plugin refetcht debounct, Head reagiert — offene Fenster
  (auch Gäste) morphen ohne Reload
- Injizierte Theme-Styles sind unlayered und schlagen Tailwind-@layer-
  Utilities BEWUSST (z. B. headingWeight vs. font-bold)
- Admin-Nav-Registry (maui.admin.modules) kann children (Unterpunkte,
  RBAC-gefiltert, exact für Index-Einträge)

## Hosts (Umbenennung 2026-07-25, Cutover 2026-07-26 — Davids Entscheidung)
- `control.pukalani.app` = Betreiber-Oberfläche, seit dem Cutover VOLLSTÄNDIG:
  eigene ploi-Site 392163 (nginx → Port 3003, eigenes LE-Zertifikat für
  control+studio), Release-Slot `releases/control`, Appwrite-Projekt
  `control` (Session-Cookie a_session_control). `studio.pukalani.app` ist
  nur noch ALIAS dieser Site — der Stripe-Webhook zeigt weiter auf ihn
  (bei Stripe-Live auf control umstellen, dann kann der Alias weg).
  Die control-Site hat BEWUSST kein Repository: die CI rsynct .output UND
  ops/-Configs; ploi-Fallback-Deploy gibt es für control nicht (Fallback =
  Runbook docs/runbooks/CONTROL-CUTOVER.md).
- `my.pukalani.app` = Kundenbereich, `start.pukalani.app` = Kurz-Link in den
  Wizard. BEIDE sind Kontroll-Hosts derselben Platform-App und brauchen weder
  DNS noch eigene Site (Wildcard `*.pukalani.app` zeigt schon dorthin).
  `app.pukalani.app` (Altname) ist am 2026-07-27 ENTFERNT — nie beworben, kein
  DNS-Eintrag, stand nur in controlHosts; antwortet jetzt 404. Der Name bleibt
  in RESERVED_SUBDOMAINS gesperrt (Phishing).
- TLS-Fallen (beide live erwischt): (1) Port 80 antwortet nur für explizit
  konfigurierte Hosts — die HTTP-Prüfung von Let's Encrypt scheitert für
  Aliase/Wildcards, deshalb IMMER DNS-01 über Cloudflare. (2) ploi leitet den
  certbot-Lineage-Namen aus der BASIS-Domain ab: die ganze Zone teilt
  `/etc/letsencrypt/live/pukalani.app/`, jede Anforderung ÜBERSCHREIBT sie.
  Ein gemeinsames Apex+Wildcard-Zertifikat ist über ploi NICHT herstellbar
  (ploi fordert nur die Domains DER SITE an und filtert Fremdnamen raus).
  Deshalb seit 2026-07-27: `pukalani.app` läuft als EINZIGER Host der Zone
  **proxied** über Cloudflare (Zonen-Modus fest „Full", Automatik AUS) und
  braucht am Ursprung KEIN Zertifikat; alle anderen Hosts leben vom Wildcard
  `*.pukalani.app`. VERBOTEN: „Add certificate"/„Force-renew" auf der
  ploi-Site `pukalani.app` — das überschreibt das Kunden-Wildcard. Neu
  anfordern nur auf der Site `platform.pukalani.app` mit `*.pukalani.app`.
  Wächter `node scripts/ops/verify-tls.mjs` (alle 30 min + nach jedem Deploy).
  Details: docs/content/2.architektur/6.hosts-und-ports.md
- Neue Namen IMMER in RESERVED_SUBDOMAINS (packages/control/schemas/tenant.ts),
  sonst kann ein Selbstbedienungs-Kunde sie beantragen.

## Self-Service-Onboarding (Layer onboarding, seit 2026-07-25)
- Trichter auf den Kontroll-Hosts der Platform-App: bewusst KEIN Mandant
  (`maui.tenancy.controlHosts`, Env-Override
  NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). Weil dort NICHTS gescopt ist, lässt
  `01.control-center.ts` nur `maui.tenancy.controlApiPrefixes` zu — alles
  andere 404. Neuer Endpunkt im Kundenbereich ⇒ Präfix bewusst eintragen.
- Einladungs-Link: `start.pukalani.app?code=…` → Auth-Guard hängt das Ziel als
  `?redirect=` an (safeRedirectTarget, core/shared — NUR Pfade auf diesem
  Host), nach der Anmeldung geht es zurück, der Wizard liest `?code=` und
  prüft ohne Klick. Post-Auth-Ziel IMMER über useAuthRedirect().
- Anlegen gehört dem Control Plane: `POST /api/control/onboarding/site` verlangt
  Service-Secret (NUXT_CONTROL_ONBOARDING_SECRET ⇔ NUXT_ONBOARDING_SERVICE_SECRET)
  UND ein Appwrite-JWT, das das Control Plane SELBST gegen das Pool-Projekt
  prüft. Idempotenz über den Hostnamen (kein Idempotency-Key); Owner-Mitgliedschaft
  scheitert ⇒ Tenant wird zurückgerollt.
- Vertrag (Kataloge, 6 Vibes, Testphase, Kontingent):
  `packages/control/shared/onboarding.ts` — der Wizard-Layer konsumiert ihn.
- Branding gehört dem MANDANTEN (`tenants.theme/variant`), nicht dem Projekt:
  `app_config.themeSettings` ist EINE Row pro Projekt.
- Site-Routen autorisieren über `requireSitePermission` (Site-Rolle, dann
  protokollierter Operator-Break-Glass) — NIE `requirePermission` erweitern:
  die ist synchron und wird ohne await gerufen.
- MITGLIEDER-VERWALTUNG (seit 2026-07-29, Audit-Befund S9 „tote Capability"):
  `/dashboard/members` liegt im ONBOARDING-Layer, nicht in admin — die Seite kann
  nur so weit reichen wie ihre Routen (`/api/site/members/*`), und die brauchen
  die Service-Naht. Silo-Apps ohne onboarding bekommen so keinen Menüpunkt ins
  Leere. Einladen = EIN Feld + Rolle → `site_invites` (Token-HASH, 7 Tage,
  M9-Muster aus `workspace_invites`; Mail zuerst, Row danach — keine Einladung
  ohne Zustellung), Annahme über `/join?token=…` ODER ohne Token über die eigene
  geprüfte Adresse. ENTFERNEN LÖSCHT NICHT: `site_members.status='removed'`
  (Migration studio-019), Inhalte + Namen bleiben. Besitz übertragen läuft über
  `site.transfer` (Owner), NIE über die Rollen-Route — sonst wäre eine
  Owner-Capability per Admin-Capability erreichbar. `site.delete` ist bewusst
  NICHT gebaut (Davids Entscheidung 3). Schutzregeln PURE + unit-getestet in
  `packages/control/shared/siteTeam.ts` (kein Selbst-Degradieren, nie der letzte
  Owner) — die UI kennt sie, das Control Plane setzt sie durch.
- „Ehemaliges Mitglied": GEBÜNDELTER Vertrag `core/server/utils/siteMembership.ts`
  (`registerFormerSiteMembersResolver`, Implementierung
  `createFormerSiteMembersResolver` im control-Layer) — viele userIds, EINE
  Abfrage, Cache pro NUTZER 60 s, fail-soft. Der Einzel-Lookup
  (`SiteRoleResolver`) darf dafür NIE in einer Schleife laufen: eine
  Kommentarliste hat 25 Autoren. Die Frage ist bewusst NEGATIV gestellt —
  „ehemalig" ist eine POSITIVE Tatsache (Row mit status 'removed'); die
  ABWESENHEIT einer Row heißt „gewöhnlicher Nutzer", weil `site_members` im Pool
  nur das Team trägt (A4). Zeichen erscheint heute in der Kommentarliste
  (Gäste eingeschlossen).
- Beweise: `packages/onboarding/scripts/{verify-control-host,verify-site-authz,
  acceptance-onboarding}.mjs` + `packages/control/scripts/verify-onboarding.mjs`.
  Lokal testen: `seed-local-tester.mjs` (Konto+Code, `--clean` räumt auf).
  Node's `fetch` verwirft einen eigenen Host-Header, und Nitro hört auf `[::1]`
  (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http über ::1.

## KI, E-Mail, Embed, Moderation (Core-Bausteine seit 2026-07-09/10)
- KI: aiComplete()/aiCompleteJson() (core/server/utils/aiComplete.ts) = EIN
  Transport für OpenAI-kompatible APIs (Default OpenRouter). Gate maui.ai
  (enabled/model/baseUrl, Core-Default aus) + server-only NUXT_AI_KEY;
  Transport ist policy-frei — Gates + Antwort-Klemmung beim Konsumenten.
  Laufzeit-Override-Kette: app_config.ticketsAiModel > app_config.aiModel
  (system-016, Admin-Config-Seite, getEffectiveAiConfig) > maui.tickets.ai >
  maui.ai. Konsumenten: Ticket-Triage, Moderations-Assist (Kommentare
  /api/admin/comments/:id/assist + Posts /api/posts/:id/assist — advisory,
  Mensch entscheidet; UI-Flag isAiAvailable()).
- E-Mail: sendMail() (core mailer.ts, nodemailer, NUXT_SMTP_* — leerer Host =
  aus, lokal Mailpit localhost:1025). notify() hat einen Opt-in-E-Mail-Zweig:
  prefs.emailNotifications off|instant|digest (Default off, Settings →
  Benachrichtigungen; Mail-Sprache = prefs.emailLocale). Digest-Sweep:
  Kandidaten aus UNGELESENEN notifications-Rows (kein User-Scan), max 1
  Mail/Tag (prefs.emailDigestLastAt, merge!), Intervall-Plugin 30 min +
  POST /api/notifications/run-digest (system.manage).
- Embed (Read-only-MVP, docs/referenz/EMBED.md): Gate maui.comments.embed
  (enabled/allowedOrigins, Default aus) → /embed-Seite + public/embed.js.
  frame-ancestors via core-Registry registerEmbeddableRoute (Default 'self'
  auf ALLEN SSR-Seiten); csrf-origin.ts-Middleware (maui.security.
  csrfOriginCheck) wird PFLICHT, sobald E2-Partitioned-Cookies kommen.
  Transparenter Hintergrund NUR bei theme=auto. localhost:PORT↔PORT ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
- Moderation: Zweiphasen-Hide + Cascade gehören dem comments-Layer
  (commentModeration.ts) — admin-Routen + Auto-Hide teilen sie. Eskalation:
  registerReportEscalationHandler (moderation zählt, Owner reagiert);
  comments blendet ab maui.comments.autoHideReports offenen Meldungen aus
  (0 = aus; Meldungen bleiben offen). resolveReportsForTarget/
  openReportsForTarget sind die moderation-Verträge für Resolve/Assist/Bulk.
- Microcache: createMicrocache() (core) NUR für user-agnostische GETs —
  Gast-Kommentare Seite 1 (10s), öffentlicher Changelog (Write-invalidiert),
  App-/api/stats (60s). NIE Antworten mit Session-Daten cachen; kein
  SSR-Seiten-SWR (Session-State steckt im HTML).

## Config-Gates (app.config.ts, Namespace maui.*)
- maui.analytics / maui.consent: Core-Default false, App aktiviert explizit
- maui.observability: strukturierte JSON-5xx-Logs am zentralen server/error.ts
  + Client-Error-Inbox (POST /api/telemetry/error, rate-limited); Core-Default
  aus, Sentry-Andockpunkt in core/server/utils/logEvent.ts
- maui.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- maui.admin.modules: Modul-Registry der Dashboard-Nav — Feature-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: registerUserDataContributor (core/server/utils/userData.ts) — Feature-
  Layer registrieren Export/Löschung ihrer User-Daten per Nitro-Plugin
  (server/plugins/user-data.ts); core orchestriert (deleteUserCompletely:
  Snapshot → Sperren → Contributors → users.delete nur bei Voll-Erfolg).
  Neue Layer mit User-Daten MÜSSEN einen Contributor registrieren.
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Pläne & Produkte (P4-Rename 2026-07-26, Davids Pricing-Entscheid)
- Pool-Pläne heißen **basic / personal / pro** (vorher free/pro/business —
  normalizeTenantPlan() mappt Altwerte; Daten sind migriert). Enterprise ist
  KEIN Plan-Key: das ist das Silo-/Pukalani-Studio-Angebot. Preise: Personal
  29 €, Pro 149 €, jährlich −25 % (scripts/stripe/ensure-prices.mjs — zieht
  lookup_keys bei Betragsänderung auf neue Prices um).
- Kundensprache: „**Produkte**" statt Features/Bausteine (Landing, UI,
  Pricing). Im CODE bleibt das Vokabular `features` (Manifeste, Gates).
- Produkt-Gating im Pool: maui.tenancy.products (Produkt-Key → Mindest-Plan,
  Plan-Ordnung = Reihenfolge der quota.plans-Keys) + requirePlanProduct(event,
  key) an den API-Einstiegen (posts = personal, ai = pro; 404 wie Datentür).
  UI-Sichtbarkeit via useTenantPlan().planAllows(); Demo-Hosts zeigen
  PlatformPlanBadge („Ab Personal/Pro") an den Produkten.

## Mandanten-Isolation: EINE Datentür (seit 2026-07-26)
- In `server/api/**` mandantenfähiger Layer geht Datenzugriff über
  `tenantDb(event)` (core/server/utils/tenantDb.ts) — NICHT über
  `createAdminClient().tablesDB` / `createSessionClient().tablesDB` direkt.
  `list/find/count` scopen immer, `get/update/remove` belegen die Zugehörigkeit
  VOR der Aktion, `create` stempelt tenantId + Row-Permissions. `as:'operator'`
  = Admin-Client (Moderation) — dort ist die Tür die EINZIGE Grenze, weil der
  Admin-Client die Row-Permissions bewusst umgeht.
- Warum: Isolation hing an drei Dingen, an die man sich erinnern musste
  (scopeQuery/scopeRow/ID-Prüfung). Am 2026-07-26 hat genau das versagt (drei
  Moderations-Routen lasen fremde Zeilen per ID, commit 1cc4855).
- AUSSERHALB der Tür erlaubt (per Definition mandantenübergreifend):
  Migrationen, Sweeps/Intervall-Plugins, GDPR-Orchestrierung, Control Plane.
- `tenantId` kommt NIE vom Aufrufer (stripTenantKey) — sonst schreibt ein
  durchgereichter Body in einen fremden Mandanten.
- BACKSTOP (seit 2026-07-27): ESLint verbietet rohes `.tablesDB` in
  `server/api/**` UND `server/plugins/**` der gepoolten Layer (comments, posts,
  pages, moderation, events, courses — eslint.config.mjs, no-restricted-syntax).
  `server/plugins/**` kam am 2026-07-28 dazu (Dashboard-Audit B2): der
  Stats-Contributor von comments liegt dort und zählte deshalb ungebremst
  pool-weit in eine Kunden-Ansicht. Wer einen H3Event bekommt, bedient einen
  REQUEST und gehört hinter dieselbe Tür wie eine Route; eventlose Sweeps
  brauchen eine begründete eslint-disable-Zeile statt einer Aufweichung.
  Neue Pool-Layer in die Liste aufnehmen, sobald ihre Tabellen tenantId
  tragen. Pool-Unique-
  Regel gilt weiter, ABER nur für tenant-RELATIVE Schlüssel: Host/Slug brauchen
  tenantId (comments-015 uq_tenant_host, pages-004, courses-002 uq_tenant_slug),
  Row-Id-basierte NICHT (events/courses (courseId,userId) — eine Row-Id ist
  global eindeutig, da kann kein Mandant kollidieren).
- SITE-LABEL = „hat den Host eingeloggt benutzt" (A4, seit 2026-07-29):
  `core/server/middleware/site-label.ts` vergibt `Role.label(siteId)` an JEDEN
  eingeloggten Nutzer eines Pool-Mandanten (idempotent, additiv — mehrere
  Communities = mehrere Labels; `grantSiteLabel` in core/server/utils). Das ist
  die Mitgliedschaftsdefinition, die zum heutigen Produkt passt: `site_members`
  liegt im Control Plane und trägt produktiv NUR den Gründer. Ohne diese
  Vergabe wäre jede `read('members')`-Zeile faktisch owner-only (genau das war
  der Activity-Feed bis dahin). Ein Label ist ein LESE-Publikum, KEINE Rolle —
  Autorisierung läuft über requireSitePermission/Site-Rollen, `hasCapability`
  kennt nur 'admin'/'moderator' (grantSiteLabel verweigert solche Labels).
  Kommen geschlossene Communities, wandert der Aufruf an die Beitrittsstelle.
- BENACHRICHTIGUNGEN sind ABLAGE, nicht Zugriff (C15, seit 2026-07-29):
  `notifications.tenantId` (system-022) entscheidet, in WELCHER Glocke eine
  Meldung erscheint — wer sie lesen darf, bleiben die Row-Permissions (nur
  `recipientId`). `notify()` verlangt daher ein PFLICHTFELD
  `scope: 'tenant' | 'account'`: 'account' = bewusst mandantenlos (Stripe-
  Zahlungsproblem, Control-Anfragen — die betreffen den Vertrag, nicht die
  Community). Kein Default, weil ein geratener Stempel eine Zahlungswarnung in
  fremde Glocken legt; der Typfehler ersetzt hier den ESLint-Backstop, der in
  `server/utils/**` nicht greift. EINE pure Regel für Schreiben, Leseroute UND
  Realtime-`where`: `core/shared/notificationScope.ts`. Drei Spaltenwerte:
  `<tenantId>` · `_account` (kollisionsfrei — Row-Ids beginnen nie mit `_`) ·
  `''` = unbekannt. `''` ist hier FAIL-OPEN und damit die BEGRÜNDETE AUSNAHME
  von `rowBelongsToTenant` — ohne Backfill würde fail-closed jedem Nutzer im
  Deploy-Moment die Glocke leeren. Nicht „korrigieren". Der Digest-Sweep bleibt
  mandantenübergreifend (eine Mail/Tag, nicht eine je Community); Mail-LINKS
  sind noch nicht mandantenrichtig (OPEN-ITEMS D5).
- BETREIBER-Inhalt gehört nicht auf Mandanten-Hosts (N7, seit 2026-07-28):
  der öffentliche Changelog (admin-Layer) antwortet dort 404 — Seite via
  `useIsTenantHost()` (core, pure Ausschluss-Rechnung in shared/controlCenter.ts:
  Tenant-Gate an UND kein Kontroll-Host ⇒ Mandant), API via `useTenant(event)`.
  Die Chrome-Registry (`maui.chrome.changelogLink/whatsNew: false`) versteckt
  nur — jede neue Betreiber-Seite braucht BEIDE Sperren, Seite und Route.
  Kontroll-Hosts und Silo-Apps (comments) bleiben unberührt.

## Coding Rules
- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen. Auth-Formulare:
  UAuthForm ist die VORLAGE (Optik/Struktur) — Login/Register/OTP sind bewusst
  eigene UForm-Implementierungen (2-Schritt-OTP, Security-Phrase, geteilter
  E-Mail-State, AGB-Gate); Details in docs/referenz/AUTH-FORMS.md
- Pinia defineStore Composition Style; Layer-stores via imports.dirs registrieren
  (werden nicht auto-gescannt)
- Relative Pfade im Layer (kein ~/ oder @/)
- app.config.ts liegt in app/ — im Package-Root wird sie stillschweigend ignoriert
- error.vue wird nicht aus Layern aufgelöst: Markup in CoreErrorPage,
  jede App hat eine dünne app/error.vue als Wrapper
- Domain-Types in shared/types/ (nie app/types/ — Server sieht sie sonst nicht)
- Zod für alle Formulare (Schemas als create*Schema(t)-Factories),
  i18n keys für User-facing Strings (keine hartcodierten Strings im Markup/Toasts);
  '@' in Locale-Messages als {'@'} escapen
- i18n-Strategie 'prefix_except_default' (en Default ohne Prefix unter /...,
  de unter /de/*, detectBrowserLanguage redirectOn: 'all' → jede Seite folgt dem
  i18n_redirected-Cookie, nicht nur '/'; BEWUSST ohne fallbackLocale — signal-
  lose Requests wie Crawler behalten die URL-Locale, sonst EN-Content unter
  /de/*): interne Links/Redirects IMMER über localePath() — auch in Middleware
  (useLocalePath()('/...')), sonst geht der Locale-Prefix verloren. SEO:
  useLocaleSeoHead() (core) ist der EINZIGE Aufruf in jeder app.vue und liefert
  hreflang/canonical/og:url/og:locale + lang/dir; absolute URLs via
  NUXT_PUBLIC_I18N_BASE_URL (i18n.baseUrl-Skeleton in core). MEHR-HOST-Apps
  (Pool) setzen zusätzlich maui.seo.originFromRequest: dann kommt Host+Port aus
  dem Request und nur das SCHEMA aus der Env (core/shared/seoOrigin.ts) — mit
  der einen Env-Basis zeigten canonical/hreflang/og:url auf ALLEN Mandanten-
  Hosts auf platform.pukalani.app (Audit-Befund B1)
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken. FACHLICHE Ablehnungsgründe
  reisen als `data: { code: 'last_owner' }` → der zentrale Handler
  (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins Envelope
  (`{ok,code,message,reason}`), der Client liest `error.data.reason`. Die rohe
  `data` bleibt draußen. Vor dem 2026-07-29 gab es das Feld nicht — Routen
  setzten `data.code`, es kam NIE an (der `last_admin`-Zweig der
  Nutzerverwaltung war deshalb toter Code).
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · comments: 3001 · weitere: 3002+ ·
Docs-Site: 4000 (docs/, `pnpm dev:docs` — eigenständige Nuxt-Content-App,
KEIN Layer/keine apps/*-App, Inhalte in docs/content/)

## Tests
pnpm -r test (Unit) · Playwright-E2E in apps/comments (Base-URL per
PW_BASE_URL überschreibbar — parallele Dev-Sessions) · themes-visual zielt
auf die deterministische /visual-Seite (NIE Live-Daten screenshotten) ·
CI e2e.yml fährt eine echte Wegwerf-Appwrite (ci/appwrite +
scripts/ci/appwrite-setup.mjs → bootstrap --seed → volle Suite inkl. Realtime).
E2E läuft gegen den DEV-Server (auch in CI) — drei Fallen, alle 2026-07-28
live erwischt: (1) Ein Test darf nicht an einem CONTAINER-Haken hängen, wenn
ein Config-Gate den Zweig austauscht (`data-embed-login` vs. Gast-Composer bei
`maui.comments.embed.guests`) — Haken ans handelnde Element. (2) KALTSTART:
der Dev-Server kompiliert jede Route beim ersten Zugriff (`/` ~25 s, `/embed`
mit Client-Bundle >30 s, dazu jede /api/auth-Route beim ersten Aufruf).
Deshalb Test-Budget 90 s statt der 30 s Standard, Lebendigkeits-Wartezeiten
60 s, und die Embed-Specs rufen `/embed` einmal IM BROWSER auf und warten dort
bis zur HYDRATION, bevor die Hostseite lädt — ein SSR-Abruf (oder ein `goto`
nur bis 'load') wärmt das Client-Bundle NICHT. Grund: `embed.js`
versteckt das iframe nach 10 s ohne Höhen-Meldung ENDGÜLTIG (display:none),
und die Höhe kommt erst aus onMounted. Ein zu knappes Budget meldet eine
Zeitüberschreitung an beliebiger Stelle statt der echten Ursache; `retries: 1`
kaschiert das zu „flaky" — grün, aber wertlos. (3) Der bekannte
Teardown-Hang ist KEIN kosmetisches Warten: Playwright force-killt jeden
Worker nach 300 s und zählt das als Fehler AUSSERHALB jedes Tests → Exit 1
trotz grüner Suite. Er tritt NUR lokal (macOS) auf, in CI nie — dort läuft die
Suite in ~1,6 min sauber durch. Test-eigene `node:http`-Server rufen deshalb
`closeAllConnections()` vor `close()` (richtige Hygiene, `close()` wartet sonst
auf Keep-alive-Sockets), das allein behebt den lokalen Hang aber NICHT: er
trifft auch Worker ohne eigenen Server. Ursache lokal weiter offen.

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten

## Doku-Ordnung (seit 2026-07-28) — Karte: docs/README.md
Vier Sorten, jede mit genau EINEM Zuhause. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte; sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.
- **Steuerung** `docs/` — **docs/OPEN-ITEMS.md ist DIE EINE offene-Punkte-
  Liste** (gewichteter Master + feinkörnige Arbeitsliste A–F). Offene Punkte
  gehören AUSSCHLIESSLICH dorthin, NIE in ein Plan-Dokument und NIE in eine
  zweite Liste (am 2026-07-28 gab es kurz `OFFENE-TASKS.md` daneben — genau
  die Doppelpflege, die das verhindert). Dazu CONCEPT.md (Architektur A1–A14),
  GOALS.md, DECISION-LOG.md.
- **Referenz** `docs/referenz/` — wie ist X gebaut (RBAC, Themes, Embed,
  Auth-Forms, Moderation, Pool/Silo-Blueprint, Produkt-Bilanz, Manifest-
  Strategie, Produktvertrag, Changelog-Workflow). Lebt mit dem Code.
- **Runbooks** `docs/runbooks/` — Betriebs-Anleitungen (Deployment, Stripe
  Go-Live + Testmodus, Control-Cutover, Key-Swap). Die Häkchen dort sind ECHT
  und werden pro Durchlauf abgehakt.
- **Archiv** `docs/archiv/` (+ `archiv/audits/`) — ausgeführte Pläne und
  Audits. Wertvoll als Begründung und Rezept, aber KEINE Arbeitsliste:
  offene Kästchen sind bewusst zu Aufzählungen entschärft.
- `docs/plans/` enthält nur, was NOCH NICHT gebaut ist. Sobald ein Plan
  ausgeführt ist: Datei nach `archiv/`, Reste nach OPEN-ITEMS.md.
- `docs/content/` = interne Doku-SITE (control.pukalani.app/docs),
  `apps/help/content/` = Kunden-Hilfe (help.pukalani.app) — beides Produkt,
  kein Planungsdokument.
- Regelwerk für Agenten: NUR CLAUDE.md. `AGENTS.md` ist ein Zeiger darauf —
  Inhalt dort NIE duplizieren (die alte Kopie war 144 Zeilen veraltet).

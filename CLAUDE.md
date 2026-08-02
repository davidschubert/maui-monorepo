# Pukalani Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo — Marke **Pukalani** (der lokale Ordner heißt weiterhin
`maui-monorepo`, ebenso das GitHub-Repo) — mit zentralem Core Layer + Produkt-Layern.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.5.x (Composition API, SSR), Nuxt UI 4.10.x, Pinia 4, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime) — Appwrite self-hosted 1.9.6
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Produkt-Layer (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [produkt-layer..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- Produkt-Manifeste (Plattform-Strategie F1): JEDER Layer hat
  product.manifest.ts (key/tier/requires/Katalog-Texte, nur `import type`!),
  JEDE App site.manifest.ts = Single Source der Produkt-Wahl.
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
  Fundament-Layer (core, geplant: moderation/system) hängen NIE von Produkten ab.

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key) + createSessionClient
  (pro Request, NIE teilen!) in server/lib/appwrite.ts; Produkt-Layer nutzen
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
  'available' pollen bevor Indizes. Das Pollen allein reicht NICHT:
  der Index-Endpunkt liest die Spaltenliste aus Appwrites Metadaten-Cache
  (Collection-Dokument), der dem Spalten-Status hinterherhinkt — CI-E2E
  zweimal live erwischt (400/column_not_available trotz 'available').
  Index-Anlage deshalb immer über `indexStep`/`withIndexRetry` aus
  `scripts/migrations-lib/indexRetry.mts` (Retry genau für diesen 400er;
  Seeds/createRow sind NICHT betroffen — die physische Spalte existiert
  vor dem Status). Es gibt KEIN Migrations-Register in der
  DB — die Labels (`control-019`, `system-021`, …) sind reine Anzeige, die
  Idempotenz kommt vom 409. Die Migrationen des Control Plane heißen seit
  2026-07-29 `control-NNN`; Dokumente von VOR dem Cutover (docs/archiv/**,
  CHANGELOG) nennen dieselben Migrationen `studio-NNN` — bewusst nicht
  umgeschrieben, das ist ein Protokoll und kein Nachschlagewerk. Die
  DATEINAMEN bleiben immer (`019-site-team.ts`).
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
  Input — `pnpm --filter @pukalani/themes generate -- --write` erzeugt
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
- Customize theme: /dashboard/themes (Galerie, Zweispalten), Editor als Vollseite
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
  im Customize theme): ein Wähler ohne Wirkung wäre eine Lüge, und die
  Community-Farbe setzt der Owner unter /dashboard/settings/community.
  DIE NEUTRAL-PALETTE FOLGT MIT (B5-Rest, 2026-07-29 — Davids Entscheidung):
  `data-neutral` ist eine EIGENE Achse und blieb nur Besucher-Wahl, weil es
  dafür keine Community-Einstellung gab. Jetzt: `tenants.neutral` (Migration
  **control-020**, additiv, '' = keine eigene Wahl). Zweite pure Funktion
  `resolveNeutralSelection` + `visitorMayChooseNeutral` NEBEN
  resolveThemeSelection — kein viertes Feld im Theme-Ergebnis, weil die Herkunft
  abweichen DARF (Kontroll-Host: Theme aus der Instanz, Palette vom Besucher).
  Eine Instanz-Einstellung für die Palette gibt es BEWUSST NICHT; Default ist die
  Registry-Voreinstellung. Gesetzt als EINE Zeile „Grundton" unter
  /dashboard/settings/community (Chips, weil '' nicht in ein USelectItem darf),
  geprüft gegen NEUTRAL_REGISTRY. `neutral` im PATCH-Body ist OPTIONAL, und das
  ist Betrieb statt Geschmack: platform und control sind zwei Deployments —
  Pflichtfeld hieße 400 auf jedes Umfärben, solange eine neue control neben
  einer alten platform läuft; fehlendes Feld heißt „nicht angefasst", nie ''.
  Der Wähler verschwindet auf Mandanten-Hosts überall (`canChooseNeutral`).
  NICHT betroffen und Besucher-Wahl bleibend: Hell/Dunkel (useColorMode),
  Seitenleiste, Sprache. Beweis: verify-site-branding.mjs (40/40).
- LIVE-PROPAGATION für Community-Branding läuft über einen SPIEGEL (D6, seit
  2026-08-01). Die Wahrheit bleibt `communities.theme/variant/neutral` im
  Control-Plane-PROJEKT — dort hat der Browser weder Session noch Leserecht.
  Deshalb schreibt `PATCH /api/community/branding` den BESTÄTIGTEN Zustand
  zusätzlich in `community_branding` (system-028, EINE Row je Community,
  rowId = `communities.$id`, read(any), kein Index) — `mirrorCommunityBranding()`
  in core/server/utils, NACH dem Control Plane und FAIL-SOFT. Der Client
  abonniert GENAU seine Row (core/app/plugins/realtime-branding.client.ts,
  `useSiteId()` + `mirrorBelongsToCommunity` als Netz) und schreibt sie in
  `useTenantBranding()`; ab da rechnen resolveThemeSelection/
  resolveNeutralSelection (B5) und der Head-Getter wie immer. Ohne Community-Id
  (Kontroll-Host, Silo, Playground) abonniert das Plugin GAR NICHTS.
  DREI REGELN, die man nicht „vereinfachen" darf: (1) **kein `upsertRow`** —
  Appwrite 1.9.6 schreibt damit korrekt, publiziert aber KEIN Realtime-Event
  (2026-08-01 live erwischt; der Spiegel wäre eine Attrappe): `updateRow`, bei
  404 `createRow`. (2) Der Spiegel wird NIE gelesen, um zu rendern — SSR fragt
  weiter den Resolver (≤30 s Cache), ein fehlgeschlagenes Spiegeln heilt der
  nächste Seitenaufbau. (3) `themeSettings.defaultThemeId` (Tab-Farbe, Favicon,
  og:image) morpht BEWUSST nicht mit: das Nachziehen würde die
  Instanz-Voreinstellung überschreiben und wäre beim Zurücksetzen auf '' nicht
  mehr rückrechenbar. custom_themes/custom_fonts/app_config morphen weiter über
  das realtime-themes-Plugin (Refetch), weil sie im Runtime-Projekt liegen.
  LOKAL TESTEN: die Dev-Appwrite kennt nur `localhost` als Web-Platform — auf
  `kunde-a.localhost` & Co. bricht der WS-Handshake mit „Invalid Origin" ab
  (Client loggt nur „Realtime disconnected"). Sieht wie ein Code-Fehler aus, ist
  die Testumgebung.
- `createRow<TenantRow>` verlangt ALLE Spalten explizit (bewusst) — eine neue
  tenants-Spalte erzwingt eine Entscheidung an BEIDEN Anlegestellen
  (tenants/index.post.ts + onboardingProvision.ts). Folge: die Migration MUSS
  vor dem Code-Deploy laufen, sonst bricht das Anlegen einer Community.
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
- Admin-Nav-Registry (pukalani.admin.modules) kann children (Unterpunkte,
  RBAC-gefiltert, exact für Index-Einträge)

## Hosts (Umbenennung 2026-07-25, Cutover 2026-07-26 — Davids Entscheidung)
- `control.pukalani.app` = Betreiber-Oberfläche, seit dem Cutover VOLLSTÄNDIG:
  eigene ploi-Site 392163 (nginx → Port 3003, eigenes LE-Zertifikat für
  control+studio), Release-Slot `releases/control`, Appwrite-Projekt
  `control` (Session-Cookie a_session_control). Der Alias
  `studio.pukalani.app` ist am 2026-07-30 ENTFERNT (ploi → Site → Verwalte →
  Domain aliases; ploi pflegt `server_name` selbst und lädt nginx neu). Grund:
  der Stripe-Webhook zeigt seither auf `control`, damit hatte der Alias keine
  Aufgabe mehr — und „Studio" meint seit Davids Namensentscheidung das
  KUNDENANGEBOT, ein Kunde hätte sonst die Betreiber-Konsole vor sich. Der Host
  fällt jetzt in die Wildcard-Site `platform` und antwortet 404, wie
  `app.pukalani.app`. Zwei Dinge zum Nachlesen: control behält den
  überzähligen SAN `studio` bis zur nächsten Erneuerung (harmlos, es wurde
  BEWUSST kein Zertifikat neu angefordert), und `pm2 jlist` war vorher auf ein
  cwd unter `/home/ploi/studio.pukalani.app` zu prüfen — genau daran starb
  portfolio beim Cutover-Aufräumen (ops/pm2-heal.sh); hier hing nichts.
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
  Aliase/Wildcards, deshalb IMMER DNS-01 über Cloudflare. (2) ploi benennt die
  certbot-Lineage nach der Root-Domain DER SITE — es gibt also mehrere
  (am 2026-07-30 nachgemessen: `comments.pukalani.app`, `control.pukalani.app`,
  `portfolio.pukalani.app` je eigen). GETEILT ist nur `pukalani.app`, und darin
  liegt das **Wildcard** `*.pukalani.app`: die Sites `pukalani.app` UND
  `platform.pukalani.app` binden dieselbe Lineage ein, und daran hängen platform,
  demo, help und JEDER Mandanten-Host. Eine Anforderung dort überschreibt sie
  für alle — das ist der Vorfall, der platform+demo 40 min lahmlegte, nicht eine
  zonenweite Regel. Ein gemeinsames Apex+Wildcard-Zertifikat ist über ploi NICHT herstellbar
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
  (`pukalani.tenancy.controlHosts`, Env-Override
  NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). Weil dort NICHTS gescopt ist, lässt
  `01.control-center.ts` nur `pukalani.tenancy.controlApiPrefixes` zu — alles
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
- Site-Routen autorisieren über `requireCommunityPermission` (Site-Rolle, dann
  protokollierter Operator-Break-Glass) — NIE `requirePermission` erweitern:
  die ist synchron und wird ohne await gerufen.
- MITGLIEDER-VERWALTUNG (seit 2026-07-29, Audit-Befund S9 „tote Capability"):
  `/dashboard/members` liegt im ONBOARDING-Layer, nicht in admin — die Seite kann
  nur so weit reichen wie ihre Routen (`/api/community/members/*`), und die brauchen
  die Service-Naht. Silo-Apps ohne onboarding bekommen so keinen Menüpunkt ins
  Leere. Einladen = EIN Feld + Rolle → `community_invites` (Token-HASH, 7 Tage,
  M9-Muster aus `workspace_invites`; Mail zuerst, Row danach — keine Einladung
  ohne Zustellung), Annahme über `/join?token=…` ODER ohne Token über die eigene
  geprüfte Adresse. ENTFERNEN LÖSCHT NICHT: `community_members.status='removed'`
  (Migration control-019), Inhalte + Namen bleiben. Es nimmt aber BEIDES —
  Rolle UND Lese-Publikum: die Runtime-Route zieht danach `revokeCommunityLabel`
  (Labels gehören dem Pool-Projekt, das Control Plane hat dafür keinen
  Schlüssel) und merkt den Entzug kurz (`rememberCommunityAccessRevoked`), damit der
  30-s-Rollen-Cache das Label nicht sofort wieder vergibt. Besitz übertragen
  läuft über `community.transfer` (Owner), NIE über die Rollen-Route — sonst wäre eine
  Owner-Capability per Admin-Capability erreichbar. `community.delete` ist bewusst
  NICHT gebaut (Davids Entscheidung 3). Schutzregeln PURE + unit-getestet in
  `packages/control/shared/communityTeam.ts` (kein Selbst-Degradieren, nie der letzte
  Owner, `decideJoin`) — die UI kennt sie, das Control Plane setzt sie durch.
  Die Mitgliederliste zeigt ALLE (Standardansicht filtert aufs Team
  owner/admin/moderator/editor, ein Klick zeigt alle) — seit A5 steht dort jedes
  beigetretene Mitglied, nicht mehr nur das Team.
- „Ehemaliges Mitglied": GEBÜNDELTER Vertrag `core/server/utils/communityMembership.ts`
  (`registerFormerCommunityMembersResolver`, Implementierung
  `createFormerCommunityMembersResolver` im control-Layer) — viele userIds, EINE
  Abfrage, Cache pro NUTZER 60 s, fail-soft. Der Einzel-Lookup
  (`CommunityRoleResolver`) darf dafür NIE in einer Schleife laufen: eine
  Kommentarliste hat 25 Autoren. Die Frage ist bewusst NEGATIV gestellt —
  „ehemalig" ist eine POSITIVE Tatsache (Row mit status 'removed'); die
  ABWESENHEIT einer Row heißt „gewöhnlicher Nutzer" — seit A5 trägt
  `community_members` zwar jedes BEIGETRETENE Mitglied, aber Gäste, Autoren von vor
  A5 und Konten, die hier nie mitgemacht haben, haben trotzdem keine Zeile.
  Zeichen erscheint heute in der Kommentarliste (Gäste eingeschlossen).
- Beweise: `packages/onboarding/scripts/{verify-control-host,verify-site-authz,
  acceptance-onboarding}.mjs` + `packages/control/scripts/verify-onboarding.mjs`.
  Lokal testen: `seed-local-tester.mjs` (Konto+Code, `--clean` räumt auf).
  Node's `fetch` verwirft einen eigenen Host-Header, und Nitro hört auf `[::1]`
  (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http über ::1.

## KI, E-Mail, Embed, Moderation (Core-Bausteine seit 2026-07-09/10)
- KI: aiComplete()/aiCompleteJson() (core/server/utils/aiComplete.ts) = EIN
  Transport für OpenAI-kompatible APIs (Default OpenRouter). Gate pukalani.ai
  (enabled/model/baseUrl, Core-Default aus) + server-only NUXT_AI_KEY;
  Transport ist policy-frei — Gates + Antwort-Klemmung beim Konsumenten.
  Laufzeit-Override-Kette: app_config.ticketsAiModel > app_config.aiModel
  (system-016, Admin-Config-Seite, getEffectiveAiConfig) > pukalani.tickets.ai >
  pukalani.ai. Konsumenten: Ticket-Triage, Moderations-Assist (Kommentare
  /api/admin/comments/:id/assist + Posts /api/posts/:id/assist — advisory,
  Mensch entscheidet; UI-Flag isAiAvailable()).
- E-Mail: sendMail() (core mailer.ts, nodemailer, NUXT_SMTP_* — leerer Host =
  aus, lokal Mailpit localhost:1025). notify() hat einen Opt-in-E-Mail-Zweig:
  prefs.emailNotifications off|instant|digest (Default off, Settings →
  Benachrichtigungen; Mail-Sprache = prefs.emailLocale). Digest-Sweep:
  Kandidaten aus UNGELESENEN notifications-Rows (kein User-Scan), max 1
  Mail/Tag (prefs.emailDigestLastAt, merge!), Intervall-Plugin 30 min +
  POST /api/notifications/run-digest (system.manage).
- Embed (Read-only-MVP, docs/referenz/EMBED.md): Gate pukalani.comments.embed
  (enabled/allowedOrigins, Default aus) → /embed-Seite + public/embed.js.
  frame-ancestors via core-Registry registerEmbeddableRoute (Default 'self'
  auf ALLEN SSR-Seiten); csrf-origin.ts-Middleware (pukalani.security.
  csrfOriginCheck) wird PFLICHT, sobald E2-Partitioned-Cookies kommen.
  Transparenter Hintergrund NUR bei theme=auto. localhost:PORT↔PORT ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
- Moderation: Zweiphasen-Hide + Cascade gehören dem comments-Layer
  (commentModeration.ts) — admin-Routen + Auto-Hide teilen sie. Eskalation:
  registerReportEscalationHandler (moderation zählt, Owner reagiert);
  comments blendet ab pukalani.comments.autoHideReports offenen Meldungen aus
  (0 = aus; Meldungen bleiben offen). resolveReportsForTarget/
  openReportsForTarget sind die moderation-Verträge für Resolve/Assist/Bulk.
- Microcache: createMicrocache() (core) NUR für user-agnostische GETs —
  Gast-Kommentare Seite 1 (10s), öffentlicher Changelog (Write-invalidiert),
  App-/api/stats (60s). NIE Antworten mit Session-Daten cachen; kein
  SSR-Seiten-SWR (Session-State steckt im HTML).

## Config-Gates (app.config.ts, Namespace pukalani.*)
- pukalani.analytics / pukalani.consent: Core-Default false, App aktiviert explizit
- pukalani.observability: strukturierte JSON-5xx-Logs am zentralen server/error.ts
  + Client-Error-Inbox (POST /api/telemetry/error, rate-limited); Core-Default
  aus, Sentry-Andockpunkt in core/server/utils/logEvent.ts
- pukalani.realtime.enabled (F14, seit 2026-08-01): der EINE Schalter für alle
  Realtime-Einstiege des Core — Row-Streams (useRealtimeRows), Presence
  (usePresence/-State) und den Account-WS (useRealtimeAccount). AUS heißt: kein
  Web-SDK nachgeladen, kein Socket, kein /api/auth/realtime-token. **Core-Default
  AN** — die begründete Ausnahme von „Core-Default ist IMMER aus": Realtime ist
  kein Zusatz, sondern das bestehende Verhalten jeder Produkt-App, und ein
  Default AUS entkoppelte sie stillschweigend (die Seite sieht richtig aus, sie
  aktualisiert sich nur nicht mehr). AUS in `marketing` + `help` (öffentlich,
  kontenlos, ohne themes-Layer — sie abonnierten `app_config` über den geerbten
  core-Layer, ohne die Flags je zu lesen). EINE pure Regel in
  core/shared/realtimeGate.ts (`realtimeAllowed(enabled, ...ids)` — Gate UND
  Datenebene; der `!databaseId`-Guard aus dem Live-Vorfall 2026-07-29 geht darin
  auf), gelesen an EINER Stelle (`realtimeEnabled()` in useRealtimeClient.ts,
  memoisiert). `ensureRealtimeClients`/`sharedRealtime`/`realtimeCookieClient`
  geben bewusst `… | null` zurück: der strict-Modus zwingt so JEDEN künftigen
  Konsumenten, „diese App hat keine Realtime" zu behandeln.
- pukalani.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- pukalani.admin.modules: Modul-Registry der Dashboard-Nav — Produkt-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: registerUserDataContributor (core/server/utils/userData.ts) — Produkt-
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
- EIN Wort: „**Produkte**"/`products` — Kundensprache UND Code (E11, 2026-07-30;
  hebt die P4-Zeile „im CODE bleibt features" bewusst auf). product.manifest.ts,
  productKey, productGates, app_config.products, product_catalog,
  /api/platform/products. Das ZUSAMMENZIEHEN ist DURCH (control-025 inkl.
  idx_site_product, system-024, courses-004): alte Spalten/Tabellen und alle
  Übergangs-Spiegel/Aliasse sind entfernt — es gibt nur noch die
  product-Namen. AUSNAHMEN (bleiben `feature`): `featured` („hervorgehoben"),
  UPageFeature (Nuxt UI), Changelog-Kategorie `feature` (= „Neuerung",
  Daten-Wert), Migrations-Dateien (Protokoll).
- Produkt-Gating im Pool: pukalani.tenancy.products (Produkt-Key → Mindest-Plan,
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
- ZWEI FRAGEN, ZWEI FELDER (seit 2026-08-02, Audit-Befund C1c): `as` sagt, WELCHER
  CLIENT zugreift (Technik: Row-Permissions setzen, rowSecurity-Rows schreiben),
  `actor` sagt, WER HANDELT (Fachlichkeit: `'member' | 'guest' | 'operator'`,
  Default = `as`). Daran hängen die M13-Sperre (`actorFacesContentLock`) und der
  A5-Beitritt (`actorJoinsByWriting`). WARUM getrennt: viele Routen wählen
  `'operator'` NUR wegen der Label-Permissions — gehandelt hat trotzdem ein
  Mitglied. Solange die Sperre an der Klinke hing, meldeten sich diese Routen
  still von ihr ab: von den fünf Inhaltsarten, die M13 namentlich zusagt, war
  genau EINE tatsächlich zu (Umfrage-Stimme, Beitrags-Löschung, RSVP,
  Einschreibung, Lektions-Abschluss liefen vorbei). Drei Actor-Werte, weil ein
  GAST-Kommentar Inhalt ist (Sperre gilt) und trotzdem niemanden zum Mitglied
  macht (kein Konto) — ein Ja/Nein-Flag kann beides nicht gleichzeitig sagen.
  Neue Route mit Operator-Klinke: IMMER prüfen, ob `actor` gesetzt gehört.
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
- DIE SPERRE FRIERT NUR INHALTE EIN (M13, seit 2026-08-02 — Davids
  Entscheidung, festgehalten 2026-08-03): `communities.suspension` hat zwei
  Stufen (`core/shared/communitySuspension.ts`). `'abuse'` nimmt der Resolver
  vom Netz (⇒ 404 wie ein unbekannter Host, Seite UND API); `'billing'` macht
  die Community NUR-LESEND — und zwar AN DER DATENTÜR, nur an der Türklinke
  `member`. Zu ist damit jeder INHALT (Kommentare, Beiträge, Umfragen,
  Zu-/Absagen, Kursfortschritt). OFFEN bleiben bewusst alle Owner-Einstellungen
  (Branding, Team/Rollen, Publikum, Registrierung) und die Moderation
  (Klinke `operator`) — die laufen über die Service-Naht ins Control Plane, nicht
  durch die Tür. Grund: die Sperre soll zum ZAHLEN bewegen, nicht den Owner aus
  seiner Community aussperren; eine gesperrte Community, die niemand mehr
  moderieren kann, wird zum Problem des Betreibers. Eine neue Owner-Einstellung
  gehört also NICHT hinter die Sperre, eine neue Inhalts-Route braucht nichts zu
  tun. Der Abgewiesene erfährt den GRUND nicht (`community.billing`), wohl aber
  die TATSACHE: das 403 trägt `reason: community_suspended`, den EINEN Leser
  dafür stellt `core/app/plugins/community-suspended-notice.client.ts`
  ($fetch-Interceptor, ein Toast für alle Layer). Dieselbe Trennung auf der
  `my.*`-Karte: `readOnly` (DASS) für jede Rolle, `suspension` (WARUM) nur mit
  `community.billing`.
- SITE-LABEL = „ist Mitglied dieser Community" (A5, seit 2026-07-29 — ersetzt
  die A4-Regel „hat den Host eingeloggt benutzt", die noch am selben Tag zur
  Lüge wurde: „Zugang entziehen" nahm nur die Rolle, das Label kam beim nächsten
  Besuch zurück, die entfernte Person las weiter mit).
  `core/server/middleware/06.community-label.ts` vergibt `Role.label(siteId)` genau dem,
  der eine `community_members`-Zeile MIT ZUGANG hat (idempotent, additiv — mehrere
  Communities = mehrere Labels; `grantCommunityLabel`/`revokeCommunityLabel` in
  core/server/utils/communityLabel.ts). Ein Label ist ein LESE-Publikum, KEINE Rolle —
  Autorisierung läuft über requireCommunityPermission/Site-Rollen, `hasCapability`
  kennt nur 'admin'/'moderator' (grantCommunityLabel verweigert solche Labels).
- MITGLIEDSCHAFT IST EIN EREIGNIS (A5): Vertrag `core/shared/communityJoin.ts` +
  Registry `core/server/utils/communityJoin.ts` (`registerCommunityJoinHandler` — die
  Naht zum Control Plane besitzt der onboarding-Layer, A14), Regel `decideJoin`
  in `packages/control/shared/communityTeam.ts`, Route
  `POST /api/control/community/members/join`. Gesteuert vom BESTEHENDEN Schalter
  `tenants.openRegistration`: OFFEN ⇒ Beitritt (Rolle `viewer`), GESCHLOSSEN ⇒
  nur per Einladung. ZWEI Auslöser, mehr nicht: (1) `registration` — Kontoanlage
  auf dem Mandanten-Host (signup.post.ts + otp/verify.post.ts, dort wo der Feed
  schon „user.joined" sagt); (2) `contribution` — der erste eigene
  Schreibvorgang, abgefangen in der DATENTÜR (`tenantDb().create`, nur Türklinke
  'member') statt in zwanzig Routen. Ein SEITENAUFRUF löst bewusst NICHTS aus
  (sonst wäre jeder Vorbeisurfer Mitglied und „Zugang entziehen" wieder
  wirkungslos). Preis: bei `contribution` steht das Label erst mitten in der
  Sitzung — der offene Realtime-WS behält seine Rollen, die Anwesenheit kommt
  über Heartbeat + den 20-s-Leser-Poll (usePresence POLL_MS) an. ENTZOGEN
  schlägt jeden Auslöser (Rückkehr nur per Einladung); BESTAND aus der A4-Zeit
  (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst
  (`trigger: 'legacy'`, umgeht den Schalter — kein Backfill-Skript, weil die
  Wahrheit im Runtime-Projekt und die Zeile im Control Plane liegt). Beweis:
  Abschnitt 10 in `packages/onboarding/scripts/verify-site-authz.mjs`.
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
  mandantenübergreifend (eine Mail/Tag, nicht eine je Community).
- MAIL-LINKS FOLGEN DERSELBEN ABLAGE (D5, seit 2026-08-01): eine Benachrichtigungs-
  MAIL verlinkt auf den Host DER COMMUNITY, nicht mehr auf `public.appUrl`. Pure
  Regel `core/shared/notificationLinks.ts` (dieselben drei Spaltenwerte:
  `<communityId>` ⇒ Community-Host · `_account` ⇒ App-Host · `''` ⇒ App-Host).
  Aufgelöst über den Registry-Vertrag `registerCommunityHostResolver`
  (core/server/utils/communityHost.ts; Implementierung
  `packages/control/server/utils/communityHostResolver.ts`, verdrahtet in
  apps/platform) — zwei Eigenheiten mit Grund: OHNE `H3Event`, weil der
  Digest-Sweep ohne Request läuft, und GEBÜNDELT, weil der Sweep sonst N+1 über
  Projektgrenzen liefe. Nachgeschlagen wird `communities.tenantId`, NICHT `$id`
  (E8-3 hat die Spalte umbenannt, nicht den Wert). FAIL-SOFT: kein Host ⇒
  App-Basis, eine Mail wird NIE verworfen — deshalb muss jeder Test hier eine
  Gegenprobe haben, sonst ist er immer grün. JEDER EINTRAG einer Digest-Mail
  trägt seinen eigenen Host (die Sammel-Mail ist bewusst mandantenübergreifend).
  Beweise: `packages/core/tests/notificationLinks.test.ts`,
  `packages/control/tests/communityHostResolver.test.ts` und der Mailpit-Beweis
  `packages/core/scripts/verify-notification-mail-links.mjs` (11/11).
- WO HÄNGT DIE GLOCKE? (C17, seit 2026-07-29): sie wird NUR aus
  `pukalani.chrome.utilities` gerendert, und dessen einziger Konsument ist das
  blueprint-Layout — eine App OHNE blueprint hat also keine. Genau das traf
  `apps/control`, wo BEIDE `scope:'account'`-Absender leben (Stripe-Webhook,
  Early-Access-Anfragen) und wo auch ihre Empfänger Konten sind: Absender,
  Empfänger und Leser liegen alle im control-Projekt — `my.pukalani.app` (Pool)
  war nie der Leser, dort entsteht heute keine `_account`-Zeile. Schalter
  `pukalani.chrome.accountBell` (Core-Default AUS, apps/control an) hängt sie ins
  core-default-Layout und in die Dashboard-Shell, dort in die SEITENLEISTE neben
  die Suche (oben rechts sitzen die Aktionen der Seiten-Kopfzeilen — eine
  schwebende Glocke verdeckte sie). Der Schalter sagt nur, OB sie hängt; WAS sie
  zeigt, bleibt das Publikum ihres Hosts. Jeder neue notify()-TYP braucht einen
  Zweig in messageKey() + Text in de/en — der Rückfall auf 'replied' macht ein
  Loch unsichtbar; Netz: `packages/core/tests/notificationBellTexts.test.ts`.
- BETREIBER-Inhalt gehört nicht auf Mandanten-Hosts (N7, seit 2026-07-28):
  der öffentliche Changelog (admin-Layer) antwortet dort 404 — Seite via
  `useIsTenantHost()` (core, pure Ausschluss-Rechnung in shared/controlCenter.ts:
  Tenant-Gate an UND kein Kontroll-Host ⇒ Mandant), API via `useTenant(event)`.
  Die Chrome-Registry (`pukalani.chrome.changelogLink/whatsNew: false`) versteckt
  nur — jede neue Betreiber-Seite braucht BEIDE Sperren, Seite und Route.
  Kontroll-Hosts und Silo-Apps (comments) bleiben unberührt.

## Coding Rules
- DATENLISTEN im Dashboard: `UTable` ist der Standard (Davids Entscheidung B6,
  2026-07-30) — Sortierung, Auswahl und Paginierung kommen mitgeliefert und
  verhalten sich überall gleich. Handgebaute Listen nur mit Grund, und der
  gehört an die Stelle geschrieben. Leerer Zustand über `CoreEmptyState`.
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
  (Pool) setzen zusätzlich pukalani.seo.originFromRequest: dann kommt Host+Port aus
  dem Request und nur das SCHEMA aus der Env (core/shared/seoOrigin.ts) — mit
  der einen Env-Basis zeigten canonical/hreflang/og:url auf ALLEN Mandanten-
  Hosts auf platform.pukalani.app (Audit-Befund B1). og:image gehört EBENFALLS
  dorthin (nie in eine Seite): Produkt-Layer tragen den Pfad in
  useBrandOgImage() ein, useLocaleSeoHead() macht die absolute URL + Maße/Typ/
  twitter:card. Je Community `/og/<key>.png` (1200×630, Gate
  pukalani.seo.tenantOgImage) — **PNG, nicht SVG**: Facebook/WhatsApp/LinkedIn
  zeigen SVG als og:image nicht. Gerastert OHNE Laufzeit-Renderer: Chrome hat
  die Zeichen EINMAL in ein Atlas gebacken (packages/themes/scripts/
  generate-brand-card-font.mjs → shared/brandCardFont.gen.ts, committet,
  server-only, BEWUSST NICHT im check:themes-Gate — das Ergebnis hängt an den
  Schriften der backenden Maschine). Der Schlüssel in der URL ist NIE Eingabe
  (sonst füllt ein Bot mit erfundenen Schlüsseln die Platte), sondern nur
  Cache-Brecher; Ablage in tmpdir(), nie in .output (Release-Slots wechseln
  den Pfad)
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken. FACHLICHE Ablehnungsgründe
  reisen als `data: { code: 'last_owner' }` → der zentrale Handler
  (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins Envelope
  (`{ok,code,message,reason}`), der Client liest `error.data.reason`. Die rohe
  `data` bleibt draußen. Vor dem 2026-07-29 gab es das Feld nicht — Routen
  setzten `data.code`, es kam NIE an (der `last_admin`-Zweig der
  Nutzerverwaltung war deshalb toter Code).
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- EINE Version je Kernabhängigkeit — `pnpm check:single-copy` (CI-Gate) ist der
  Wächter. Zwei Kopien brechen Typen oder Build, und WELCHE gewinnt, entscheidet
  pnpms HOISTING, nicht das Lockfile: derselbe Lockfile ist damit auf einer
  Maschine grün und auf der anderen rot. `nuxi prepare` schreibt die gehoistete
  Version in die `paths` der generierten tsconfigs — passt sie nicht zu Nitros
  Typen, ist jedes an einen Helfer weitergereichte H3Event ein Fehler. Zweimal
  live erwischt (2026-07-30): vue doppelt ⇒ Prod-Build stirbt an ENAMETOOLONG,
  h3 doppelt ⇒ 1102/944/1261 Typfehler. Doppelungen werden BESEITIGT, nicht
  durch Kür eines Gewinners kaschiert; begründete Ausnahmen stehen im Skript.
- Eine Caret-Range im Katalog PINNT NICHTS (`^4.4.8` erlaubt 4.5.1) — ein
  „Rückbau" per Range-Bearbeitung wirkt nicht. Beweis ist immer
  `node -p "require('./apps/<app>/node_modules/<pkg>/package.json').version"`;
  Zurücksetzen nur per `git checkout -- pnpm-lock.yaml pnpm-workspace.yaml` +
  `pnpm install --frozen-lockfile`. Nach jedem Bump `git diff --stat
  pnpm-lock.yaml` lesen: steht dort viel mehr als erwartet, gehört es nicht so
  in den Commit.
- `@nuxtjs/i18n` gehört zur NUXT-GENERATION und wird mit Nuxt zusammen gezogen
  (10.4↔4.4, 10.6↔4.5). Ein Nuxt-Bump ohne i18n-Bump lässt unhead, vue-router
  und pinia doppelt im Baum stehen. `pinia` und `@pinia/nuxt` sind ebenso fest
  gekoppelt (0.11.x↔pinia 3, 1.0.x↔pinia 4) — nur gemeinsam bumpen.
- KOPF-EINTRÄGE sind seit unhead 3 über `rel` bzw. `name`/`property`
  DISKRIMINIERTE Unions — ein `rel: string` wird zu `never`. In `useHead`-Aufrufen
  `rel` literal halten (`as const`); bedingte Spreads nehmen dem Array-Literal
  sonst den Kontext-Typ.
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · comments: 3001 · weitere: 3002+ ·
Docs-Site: 4000 (docs/, `pnpm dev:docs` — eigenständige Nuxt-Content-App,
KEIN Layer/keine apps/*-App, Inhalte in docs/content/)

## Tests
WORKTREE-BEWEISE (2026-07-29 live erwischt, gleich zweimal): ein Dev-Server aus
`.claude/launch.json` startet mit cwd = HAUPT-Repo, nicht im Worktree — ein
„Beweis" misst dann unveränderten Code und sieht wie ein Fehlschlag der neuen
Arbeit aus. Ebenso belegen fremde Worktrees Ports und der eigene Server fällt
still auf einen anderen zurück. Vor jedem Beweis: `lsof -nP -iTCP -sTCP:LISTEN`
und den Pfad in der ersten Dev-Log-Zeile prüfen. Dev-Server IMMER über
`pnpm --filter <app> dev` starten — ein direkter
`node ./node_modules/nuxt/bin/nuxt.mjs dev` findet `tailwindcss` nicht
(liegt nur in `node_modules/.pnpm/node_modules/`, das pnpm erst beim
Script-Lauf in den NODE_PATH legt) und liefert auf JEDER SSR-Seite 500 —
sieht aus wie ein Regressionsschaden, ist aber nur der falsche Start
(2026-07-31 live erwischt). EIGENER PORT im Worktree: `pnpm --filter <app> dev
-- --port N` wirkt NICHT — das `dev`-Skript hat `--port` fest verdrahtet, das
zweite landet als Positionsargument, und Nuxt weicht bei belegtem Port STILL
auf einen anderen aus (2026-08-01: 3007 → 3000, also fast auf den Port des
core-Playgrounds). Richtig ist `pnpm --filter <app> exec nuxi dev --port N`
(läuft ebenfalls über pnpm, NODE_PATH stimmt). Und: der ERSTE Seitenaufruf
nach einem Dev-Server-Start beweist nichts über NACHGELADENE Abhängigkeiten —
Vite bündelt sie beim ersten Import erst („dependency optimized") und lädt die
Seite dabei neu; immer die zweite Messung nehmen. Ebenso puffert
`performance.getEntriesByType('resource')` nur 250 Einträge: im Dev-Modus
fallen nachgeladene Chunks hinten raus und „nicht geladen" ist dann ein
Messfehler — für solche Beweise das Netzwerkprotokoll des Browsers nehmen.
ES REICHT NICHT, DEN EIGENEN SERVER AUS DEM
WORKTREE ZU FAHREN — jeder Dienst HINTER EINER SERVICE-NAHT gehört mit
(2026-08-01 live erwischt): der F12-Beweis lief gegen einen Worktree-Platform-
Server, sprach über `NUXT_ONBOARDING_CONTROL_URL` aber das Control Plane auf
:3004 aus dem HAUPT-Repo an — und maß dort den halbfertigen Arbeitsstand einer
fremden Sitzung (ein zusätzliches Feld im Umschlag ⇒ 26/27). Fremden Servern
weicht man AUS, statt sie neu zu starten: zweiten Dienst im Worktree auf einem
freien Port hochfahren (Port-Regel oben) und die Naht per Env dorthin zeigen
(`NUXT_ONBOARDING_CONTROL_URL=http://localhost:3014 pnpm --filter platform exec
nuxi dev --port 3016`) — danach 27/27. Ein Beweis, der über Prozessgrenzen
läuft, ist nur so ehrlich wie sein ENTFERNTESTER Dienst; ein Worktree hat
außerdem weder `node_modules` noch `.env` (installieren, `.env` aus dem
Haupt-Checkout kopieren, danach wieder löschen).

pnpm -r test (Unit) · Playwright-E2E in apps/comments (Base-URL per
PW_BASE_URL überschreibbar — parallele Dev-Sessions) · themes-visual zielt
auf die deterministische /visual-Seite (NIE Live-Daten screenshotten) ·
CI e2e.yml fährt eine echte Wegwerf-Appwrite (ci/appwrite +
scripts/ci/appwrite-setup.mjs → bootstrap --seed → volle Suite inkl. Realtime).
E2E läuft gegen den DEV-Server (auch in CI) — drei Fallen, alle 2026-07-28
live erwischt: (1) Ein Test darf nicht an einem CONTAINER-Haken hängen, wenn
ein Config-Gate den Zweig austauscht (`data-embed-login` vs. Gast-Composer bei
`pukalani.comments.embed.guests`) — Haken ans handelnde Element. (2) KALTSTART:
der Dev-Server kompiliert jede SEITE beim ersten Zugriff (`/` ~25 s, `/embed`
mit Client-Bundle >30 s). API-Routen NICHT: Nitro bündelt sie beim Start,
kalt gemessen 0,05 s (2026-08-01 — die alte Behauptung „jede /api/auth-Route
beim ersten Aufruf" hat eine F10-Diagnose auf eine falsche Fährte geschickt).
Deshalb Test-Budget 90 s statt der 30 s Standard, Lebendigkeits-Wartezeiten
60 s, und die Embed-Specs rufen `/embed` einmal IM BROWSER auf und warten dort
bis zur HYDRATION, bevor die Hostseite lädt — ein SSR-Abruf (oder ein `goto`
nur bis 'load') wärmt das Client-Bundle NICHT. Grund: `embed.js`
versteckt das iframe nach 10 s ohne Höhen-Meldung ENDGÜLTIG (display:none),
und die Höhe kommt erst aus onMounted. Ein zu knappes Budget meldet eine
Zeitüberschreitung an beliebiger Stelle statt der echten Ursache; `retries: 1`
kaschiert das zu „flaky" — grün, aber wertlos. (3) Der Teardown-Hang ist
BEHOBEN (2026-08-01). Ursache: `channel: 'chrome'` — ein Start von
System-Chrome weckt auf macOS den `GoogleUpdater`, dessen crash-handler die
stdout/stderr-Sockets des Workers ERBEN, zu launchd reparenten und nie
schließen; ohne EOF endete der Worker nie (Force-Kill nach 300 s ⇒ Exit 1
trotz grüner Suite, und nach einem ROTEN Test stand die ganze Suite, weil der
Worker-Neustart darauf wartet). Startflags helfen nicht. Kur: **Playwrights
gebündeltes Chromium** (kein `channel` in playwright.config.ts) — einmalig
`npx playwright install chromium`, in CI ein eigener Install-Schritt, weil
ubuntu-latest Chrome mitbringt, aber kein Playwright-Chromium. Volle Suite
seither 24/24 in ~25 s, Exit 0. Test-eigene `node:http`-Server rufen weiterhin
`closeAllConnections()` vor `close()` (richtige Hygiene — `close()` wartet
sonst auf Keep-alive-Sockets), das war nie die Hang-Ursache. NICHT auf
`channel: 'chrome'` zurückwechseln.

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten

## Doku-Ordnung (seit 2026-07-28) — Karte: docs/README.md
Vier Sorten, jede mit genau EINEM Zuhause. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte; sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.
- **Steuerung** `docs/` — **docs/OPEN-ITEMS.md ist DIE EINE offene-Punkte-
  Liste** und enthält seit 2026-07-30 (Davids Regel) **NUR noch Offenes**:
  EINE Tabelle „Jetzt dran — in dieser Reihenfolge" mit den Spalten
  # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details,
  darunter „Geparkt / wartet" und ein Anhang „Notizen". Jeder Eintrag max.
  3 gerenderte Zeilen; die Tiefe lebt im verlinkten Plan, nicht in der Liste.
  **Erledigtes zieht SOFORT und FINAL nach `docs/OPEN-ITEMS-COMPLETE.md`** —
  das ist das Lern-Gedächtnis (vollständiger Eintrag + Datum + eine fette
  Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging), ausdrücklich KEINE
  Arbeitsliste. Offene Punkte gehören AUSSCHLIESSLICH in OPEN-ITEMS.md, NIE in
  ein Plan-Dokument und NIE in eine zweite Liste (am 2026-07-28 gab es kurz
  `OFFENE-TASKS.md` daneben — genau die Doppelpflege, die das verhindert).
  Dazu CONCEPT.md (Architektur A1–A14), GOALS.md, DECISION-LOG.md.
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

# Analytics v2 — Plan (Pakete 1–4 GEBAUT, aus 5 nur noch Mail-Reports offen)

Stand: 2026-08-07. Die v1 UND die Pakete 1–4 sind live; aus Paket 5 sind
Adblock-Proxy und vordefinierte Ereignisse am 2026-08-07 gebaut — Einträge
mit Beweisen in [OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md).
Offen geführt wird nur noch der Rest (Plausible-Mail-Reports) als **F47** in
[OPEN-ITEMS.md](../OPEN-ITEMS.md).

**Architektur-Pivot bei Paket 1 (Davids Entscheidung 2026-08-04):** die
Sites-API ist in der Plausible CE NICHT enthalten (Enterprise-only, am
Quellcode von v3.2.1 verifiziert — `on_ee`-Block im Router). Statt
Site-Automatik per API: **Sammel-Site + Hostname-Filter** — alle
Pool-Communities tracken in EINE Site `communities.pukalani.app`
(Script-Id `pa-nw6c94JiRWqzOc-zDcn1a`), „Aktivieren" ist ein Schalter in
`analytics_settings.enabled` (Migration analytics-002), und die Stats-Route
filtert je Community nach `event:hostname`. Eine eigene Plausible-Site (BYO,
das v1-Feld) bleibt als „Erweitert"-Option und gewinnt über den Schalter.
Stats-API-Key „pukalani-stats" liegt server-only als
`NUXT_ANALYTICS_STATS_API_KEY` in den drei Site-Envs (ops:site-env-Pflicht).

## Ehrliche Lücken der v1 (warum es eine v2 braucht)

1. **Der Weg zur Script-Id ist nicht wirklich Self-Service.** Die Registrierung
   auf plausible.hawaii.studio ist zu (richtig so) — heute legt David die Site
   an und gibt dem Kunden die Id. Das Formular macht nur den Rest.
2. **Zahlen sieht der Owner nur in Plausible** — wo er kein Konto hat. Die
   Messung läuft, ihren Wert sieht der Kunde nicht.
3. **Kein Status-Feedback** auf `/dashboard/analytics`: kein „misst seit …" /
   „noch keine Daten" — ein Tippfehler in der Id fällt nicht auf.
4. Kein Adblock-Proxy, kein Hilfe-Artikel, keine Bewerbung, Datenschutztexte
   erwähnen Analytics nicht (hängt an A1, echte Rechtstexte).

## Die Pakete — in dieser Reihenfolge, jedes macht das vorige erst wertvoll

### 1. Site-Automatik (Aufwand M) — der Gamechanger
„Aktivieren"-Knopf statt Id-Feld: die Plattform legt die Plausible-Site per
Sites-/Provisioning-API selbst an (Site-Name = Community-Host) und speichert
die Script-Id automatisch. Der Owner sieht Plausible nie.
- **Vorab klären (erster Schritt):** vergibt die CE die nötigen
  API-Key-Scopes (`sites:provision:*`) ohne Konsolen-Trick? Cloud-seitig ist
  die Sites-API Enterprise — self-hosted CE muss nachgemessen werden.
- Host-Wechsel/Custom-Domain einer Community ⇒ Site-Domain mitziehen.
- Stilllegung (C16 `disabled`) braucht nichts: der Host antwortet 404,
  es kommt schlicht nichts mehr an.

### 2. Zahlen im Dashboard (Aufwand M)
Kacheln auf `/dashboard/analytics` über die Stats-API (`POST /api/v2/query`,
server-seitiger API-Key, NIE an den Client; Microcache): Besucher +
Seitenaufrufe 30 Tage, Verlaufskurve, Top-Seiten, Quellen. Löst Davids
ursprüngliche Frage („Analytics-Daten im Dashboard der jeweiligen Website")
ein. Nebenbei fällt Lücke 3 ab: „zuletzt gemessen: vor N Minuten".
- Zwischenschritt, falls schneller gewünscht: Shared-Link-iframe-Embed —
  weniger schön, ein Nachmittag.

### 3. Bewerbung (Aufwand S, Texte MIT David)
Landing-Produktseite `/products/analytics` (+ `/de/produkte/analytics`),
Pricing-Highlight „Besucherstatistik ohne Cookies", Demo-Badge „Ab Personal"
(PlatformPlanBadge). Erst nach 1+2 — dann bewirbt man ein rundes Produkt.

### 4. Hilfe + Recht (Aufwand S)
Hilfe-Artikel in apps/help (de/en); ein Satz zu Plausible in den
Datenschutz-Vorlagen der Communities (gemeinsam mit A1 abarbeiten).

### 5. Optional (je nach Lust, unpriorisiert)
- **Adblock-Proxy** — ✅ GEBAUT 2026-08-07: zwei Nitro-Routen im
  analytics-Layer (`/js/pa-<id>.js` + `/api/event`), Gate
  `pukalani.analytics.proxy` (platform an), `plausible.init({ endpoint })`.
  Kein nginx nötig. Einzelheiten im COMPLETE-Eintrag.
- **Vordefinierte Ereignisse** — ✅ GEBAUT 2026-08-07: fünf Custom Events
  (Vokabular core/shared/analyticsEvents.ts, Sender `trackAnalyticsEvent`),
  Karte „Was passiert ist" im Dashboard über die `event:name`-Dimension.
  Die „per Sites-API anlegen"-Idee aus der ersten Fassung war seit dem
  CE-Pivot ohnehin tot — Goals braucht das Dashboard nicht (`event:name` ist
  frei abfragbar); Goals in der Betreiber-Konsole bleiben optionale Handarbeit.
- **Plausible-E-Mail-Reports** (weekly/monthly) je Site aktivieren —
  der letzte offene Rest (Betreiber-Konfiguration, kein Code).

## Grobe Rechnung
Pakete 1+2 zusammen ≈ ein solides Wochenpaket · 3+4 ≈ ein Nachmittag plus
Text-Abnahme · 5 nach Bedarf.

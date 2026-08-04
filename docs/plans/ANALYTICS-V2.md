# Analytics v2 — Plan (noch nicht gebaut)

Stand: 2026-08-04, nach Davids Abnahme der v1 („mir gefällt die v1 —
nehme alles an Punkten auf"). Die v1 (Selbstbedienung per Script-Id, ab
Personal, Pool + Silo) ist seit 2026-08-04 live — Eintrag mit Beweisen in
[OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md). Offen geführt wird das
Ganze als **F47** in [OPEN-ITEMS.md](../OPEN-ITEMS.md).

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
- **Adblock-Proxy**: Script + `/api/event` über den eigenen Community-Host
  proxyen (offiziell dokumentiert, „Bypass adblockers") — spürbar genauere
  Zahlen, etwas nginx-/Nitro-Arbeit.
- **Vordefinierte Events/Goals** der Plattform: „Mitglied geworden",
  „Kommentar geschrieben", … (Custom Events + Goals per Sites-API anlegen).
- **Plausible-E-Mail-Reports** (weekly/monthly) je Site aktivieren.

## Grobe Rechnung
Pakete 1+2 zusammen ≈ ein solides Wochenpaket · 3+4 ≈ ein Nachmittag plus
Text-Abnahme · 5 nach Bedarf.

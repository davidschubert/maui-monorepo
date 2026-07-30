# Dashboard-Informationsarchitektur

**Status:** Struktur entschieden, Umbau nicht ausgeführt · **Entschieden:**
2026-07-29/30 (David) · **Wartet auf:** A6 (workspaces) +
[Umbenennung auf `community`](UMBENENNUNG-AUF-COMMUNITY.md)

> Liegt in `docs/plans/`, weil der Umbau NOCH NICHT gebaut ist. Erledigte Teile
> wandern nach `docs/OPEN-ITEMS.md` bzw. beim Abschluss nach `docs/archiv/`.

## Das Prinzip: EINE Struktur, drei Ebenen

Davids Entscheidung vom 2026-07-30: es gibt **eine** Dashboard-Navigation, und
welche Einträge erscheinen, entscheidet sich nach **Ort und Rolle** — nicht nach
App. Das folgt seinem Leitprinzip „ein Konzept pro Produkt: Aufbau überall
identisch, nur die Erscheinung variabel".

Der Grund, warum das die richtige Antwort ist: Davids erste Liste enthielt
Einträge aus drei verschiedenen Welten, und zwei davon sind gar keine
Betreiber-Sache. „Moderation", „Custom domain", „Plans (Preisvergleich)" sind
die Einstellungen **einer Community** — auf `control.pukalani.app` wären es
Einstellungen für eine Community, die der Betreiber nicht hat, und der Kunde
sähe sie nie, weil er sich dort nie anmeldet. Ein Profil und Benachrichtigungen
braucht **jeder** in **jeder** App.

| Ebene | Sichtbar | Beispiele |
|---|---|---|
| **Betreiber** | nur auf Kontroll-Hosts | Communities, Websites, Early-Access-Anfragen, Einladungs-Codes, Nutzer, System-Infos |
| **Community** | auf dem Host einer Community, für ihr Team | Seiten, Themes, Moderation, Embed, Pläne, Domain, SEO |
| **Konto** | überall, für jeden Angemeldeten | Profil, Benachrichtigungen, Sitzungen, Datenexport, Löschung |

Das Fundament steht: `maui.admin.modules` filtert schon nach Capability
(`requiredCapability`), Layer registrieren ihre Seiten selbst (A14). Es kommt
eine Dimension dazu — „gilt auf welcher Ebene" —, kein neues System.

**Folge für den Betreiber:** David sieht die Community-Ebene für seine eigene
Community auf ihrem Host, nicht in control. Wer beides gleichzeitig braucht,
wechselt den Host — dieselbe Trennung, die auch der Kunde erlebt.

## Die Struktur

### Betreiber-Ebene (Kontroll-Hosts)

```
Dashboard
Plattform
  Communities · Overview
  Communities · Pläne und Limits
  Early-Access-Anfragen
  Einladungs-Codes
Studio
  Websites
```

Unten, ebenfalls Betreiber: `Nutzer` · `Dokumentation` · `Changelog` ·
`System-Infos`.

**„Websites", nicht „Instanzen"** (Davids Vorgabe) — und weil die Oberfläche
das Wort trägt, heißt die Tabelle künftig auch `websites` statt `sites`.

### Community-Ebene (Host einer Community, für ihr Team)

```
Website          Seiten · Navigation
Branding         Themes · Schriften
Settings
  Subscription   Plans
  Audience       Onboarding · Activity logs
  Community      Moderation · Bulk logs · Community AI · Embed · Single sign-on
  Payments       Taxes · Payment logs
  Website        General · Custom domain · SEO · Redirects · Defaults · Legal
  Marketing      Email settings
  Developers     Tokens
```

„Customize themes" aus Davids Liste ist dasselbe wie `Branding · Themes` —
bewusst nur EINMAL im Menü.

### Konto-Ebene (überall)

```
Profil ansehen      About · Beiträge · Kommentare · Communities
Profil bearbeiten   Profil (Bild, Name, Zeitzone, Sprache) · Mehr (Bio, Ort, Links)
Benachrichtigungen  E-Mail-Einstellungen · Community-Meldungen
Anmeldung           E-Mail & Passwort · Zwei-Faktor · Sitzungen · Verknüpfte Konten
Konto               Daten exportieren · Konto löschen
```

## Bestand gegen Wunsch (geprüft am 2026-07-30)

**Steht schon:** Dashboard · Communities (`tenants.vue`) · Anfragen · Codes ·
Websites (`sites.vue`) · Seiten · Themes · Schriften · Nutzer · Dokumentation ·
Changelog · System-Infos · Moderation (`comments.vue`) · Embed ·
Benachrichtigungen · Sitzungen · Datenexport · Kontolöschung.

**Halb da, muss umgebaut oder aufgeteilt werden:** Pläne und Limits (steckt in
der Communities-Seite) · Activity logs (`activity.vue` + `audit_logs`) ·
Community AI (`admin/config.vue`) · General (`settings/community.vue`) · Legal
(`pages.vue`) · Payment logs (`billing.vue`) · Onboarding (Codes + Wizard-Config)
· E-Mail & Passwort (`settings/security.vue`) · Verknüpfte Konten (OAuth-Provider
gibt es beim Login, nicht als Konto-Verwaltung) · Profil (Bild/Name in
`settings/index.vue`).

**Existiert nirgends:** Navigation (Editor für die Seiten-Navigation) · Bulk logs
· Single sign-on · Taxes · Custom domain · SEO · Redirects · Defaults · Email
settings · Tokens · Zwei-Faktor · Zeitzone · Bio und soziale Links ·
öffentliches Profil.

## Zwei Einträge sind keine Seiten, sondern Projekte

**Custom domain** heißt DNS + TLS pro Kunde. Da gibt es eine Narbe: ploi leitet
den certbot-Lineage-Namen aus der BASIS-Domain ab, jede Zertifikatsanforderung
überschreibt die ganze Zone — das hat platform und demo einmal 40 Minuten
gekostet (Memory `tls-zone-lineage-regel`, CLAUDE.md „TLS-Fallen"). Eine
Kundendomain braucht einen eigenen, geprüften Weg (Cloudflare-DNS-01 pro Domain,
Wächter, Rückfall), kein Formularfeld. Eigener Plan, wenn es dran ist.

**Single sign-on** (SAML/OIDC) existiert nirgends und ist ein
Enterprise-Merkmal — es gehört zur Studio-Seite und zu einem Kunden, der es
bezahlt. Bis dahin nicht bauen.

## Reihenfolge

1. **A6** — `workspaces` weg, die Community zahlt. Blockiert Stripe-Live.
2. **Umbenennung auf `community`** — danach heißt alles im Code wie im Menü.
3. **Menü-Umbau nach dieser Struktur** — reine Registry-Arbeit, sobald 1+2
   stehen: die Objekte heißen richtig und das, was in keine Gruppe passte, ist
   weg.
4. **Die neuen Seiten** einzeln, nach Bedarf priorisiert. Keine davon ist ein
   Go-Live-Blocker; „Navigation" und „SEO" wären die ersten, weil sie einer
   Community sofort etwas geben.

Die Reihenfolge ist nicht verhandelbar in Richtung „Menü zuerst": das Menü wäre
um `workspaces` und `tenants` herum gebaut — ein Objekt, das verschwindet, und
eines, das umbenannt wird.

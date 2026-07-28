# Kunden-Changelog v3.0.0 — Entwurf zum Einfügen

**Warum als Datei und nicht direkt in prod:** Die `changelog`-Table existiert
weder im Projekt `control` noch im Pool (beide geprüft: `table_not_found`) —
sie lebt auf der `comments`-Instanz. Deren Runtime-Key liegt nur auf dem
Server, und Secrets gehen Datei-zu-Datei, nicht durch den Chat. Der Text unten
ist fertig; du fügst ihn im Dashboard unter **Changelog → Neuer Eintrag** ein.

Alternativ lokal, wenn du den Prod-Key als env-Datei hast:

```bash
node --env-file=<pfad-zur-comments-prod.env> packages/admin/scripts/changelog-draft.mjs --since=v2.3.0 --version=v3.0.0
```

Das erzeugt den **technischen** Rohentwurf aus 99 Commits. Der Text unten ist
die kundenfertige Fassung davon — nimm den, der Rohentwurf ist nur die Quelle.

---

## Titel

**Deine eigene Community — jetzt in Minuten statt in Wochen**

## Kategorie

`feature`

## Text

### Neu

**Selbst loslegen.** Über `start.pukalani.app` richtest du deine Community
selbst ein: Name, Adresse, Erscheinungsbild — der Assistent führt durch sieben
Schritte, am Ende steht deine Seite unter deiner eigenen Subdomain. Kein
Warten, kein Ticket.

**Kurse und Veranstaltungen.** Beides sind jetzt vollwertige Produkte deiner
Community: Kurse mit Lektionen und Fortschritt, Veranstaltungen mit Terminen,
Anmeldung und Serien. Du schaltest sie im Dashboard an, wenn du sie brauchst.

**Dein Team.** Du kannst Menschen in deine Community holen und ihnen eine
Rolle geben — Ansehen, Schreiben, Moderieren, Verwalten, Besitzen. Jede Rolle
sieht genau die Bereiche, die sie braucht.

**Deine Farben.** Die Community wählt ihr Erscheinungsbild selbst: 26 Themes
in je 11 Tonlagen, Schriften dazu. Was du wählst, sehen deine Mitglieder — und
zwar sofort, ohne dass jemand die Seite neu laden muss.

**Eigene Seiten.** Impressum, Datenschutz, AGB und weitere Seiten schreibst du
im Dashboard, zweisprachig, mit Vorschau.

**Offene Registrierung als Schalter.** Ein Umlegen entscheidet, ob sich jede
Person anmelden darf oder nur Eingeladene.

**Hilfe zum Nachlesen.** Unter `help.pukalani.app` steht jetzt eine
Anleitung — von den ersten Schritten bis zur Abrechnung.

### Besser

- Klare Preise: **Basic**, **Personal** (29 €) und **Pro** (149 €), jährlich
  25 % günstiger. Jedes Produkt zeigt an, ab welchem Plan es dazugehört.
- Geteilte Links, Suchmaschinen und Fehlerseiten tragen jetzt überall den
  Namen und die Farben deiner Community statt eines allgemeinen Platzhalters.
- Namenskürzel in Profilbildern stimmen auch bei Namen mit Klammern,
  Bindestrichen oder Emoji.
- Das Dashboard lädt spürbar schneller und die Navigation zeigt nur noch, was
  du auch wirklich benutzen darfst.

### Behoben

- Moderations-Ansichten konnten in seltenen Fällen einen Eintrag laden, der zu
  einer anderen Community gehörte. Die Zugriffsprüfung sitzt jetzt an einer
  einzigen Stelle, durch die jeder Datenzugriff muss.
- Einladungs-Links führten nach der Anmeldung auf die Startseite statt zum
  Ziel. Jetzt landet man dort, wo der Link hinzeigt.
- Die Fehlerseite zeigte einen nackten Text statt der gestalteten Seite.
- Beim Verschieben von Karten im Ticket-Board flackerte der Platzhalter.

---

## Was BEWUSST nicht drinsteht

- Die Umbenennung `studio` → `control`, die pm2-/Deploy-Reparaturen, die
  Datentür-Umbauten und die TLS-Geschichte: alles Betreiber-Innenleben, für
  Kunden bedeutungslos.
- Die 4 formalen BREAKING CHANGES aus `CHANGELOG.md` — sie betreffen interne
  Namen, keine Kundenfläche. In der Kundenmeldung würden sie nur Angst machen.
- Alles rund um Bezahlung mit echtem Geld: Stripe läuft noch im Testmodus.

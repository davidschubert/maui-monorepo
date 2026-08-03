# Produkt-Bilanz (2026-07-27) — ARCHIV

> **Historischer Stand. Zahlen und Urteile unten sind überholt.** Dieses
> Dokument hat seine Aufgabe erfüllt: es hat begründet, warum es
> `packages/blueprint` gibt (Option b), und die Alternativen dokumentiert, die
> dabei bewusst verworfen wurden. Als Referenz taugte es danach nicht mehr —
> beim Paritäts-Audit am 2026-08-02 waren 7 von 12 Produkt-Zeilen falsch
> (events/courses laufen längst im Pool, tickets/feedback sind nach `control`
> gezogen, `media` ist pool-fertig, die „strukturelle Lücke" ist geschlossen,
> und `packages/community` heißt gebaut `packages/blueprint`).
>
> **Der aktuelle Stand wird gerechnet, nicht gepflegt:**
> [`docs/referenz/PRODUKT-BILANZ.md`](../referenz/PRODUKT-BILANZ.md),
> erzeugt von `node scripts/produkt-bilanz.mjs` aus den Manifesten und dem
> Code. Was unten steht, bleibt als Begründung stehen — nicht als Auskunft.

Anlass: Davids Kurskorrektur — „ein Produkt hat genau EIN Konzept, der Aufbau
ist überall derselbe, variabel ist nur die Erscheinung (Farben/Schriften).
Keine neuen Baustellen, bevor das Bestehende rund ist."

Drei Prüffragen je Produkt:
1. **Einmal?** Existiert das Konzept genau einmal (im Layer), oder gibt es
   App-Kopien?
2. **Pool?** Läuft es im verkaufbaren System (platform, Datentür `tenantDb`,
   Plan-Gate), oder nur in einer Silo-App?
3. **Nur Erscheinung variabel?** Steuert der Mandant nur Theme/Schrift, oder
   unterscheidet sich Verhalten/Aufbau je Site?

## Ergebnis

| Produkt | Einmal? | Pool? | Erscheinung = Variable? | Urteil |
| --- | --- | --- | --- | --- |
| **posts** | ✅ Layer-Seiten, App liefert nur 53-Zeilen-Komposition | ✅ tenantDb, Gate `personal` | ✅ | **fast rund** — Kompositions-Lücke (s. u.) |
| **comments** | ✅ | ✅ tenantDb | ✅ (+ Embed) | **rund** — aber im Pool ohne Andockstellen (s. u.) |
| **pages** | ✅ | ✅ tenantDb | ✅ | **rund** |
| **moderation** | ✅ | ✅ tenantDb | ✅ | **rund** (Admin-Fläche) |
| **themes** | ✅ Fundament | ✅ | — ist selbst das Variablen-System | **rund** |
| **events** | ✅ Konzept einmal | ❌ nur Silo (comments-App); 10 Dateien rohes `tablesDB`, kein tenantId | ✅ | **halbfertig** — im Pool-Preismodell als `pro` gelistet, aber gar nicht montiert |
| **courses** | ✅ | ❌ nur Silo; 13 Dateien rohes `tablesDB` | ✅ | **halbfertig** — wie events |
| **tickets** | ✅ | ❌ nur Silo; rohes `tablesDB` | ✅ | internes Support-Werkzeug, kein Kundenprodukt |
| **feedback** | ✅ | ❌ nur Silo | ✅ | klein, Silo-only |
| **media** | ✅ | ❌ nur Silo (photos) | ✅ | klein, Silo-only |
| **activity** | ✅ | ❌ nicht gepoolt | ✅ | Beiwerk |
| billing / admin / system / onboarding / control | ✅ | Fundament bzw. Control Plane (bewusst außerhalb der Datentür) | — | Fundament, ok |

**Wichtiger Negativ-Befund entschärft:** `events`/`courses` sind im Pool zwar
als Pro-Produkte im Gating eingetragen, aber die Layer sind in
`apps/platform` **nicht montiert** — es gibt also kein Datenleck-Risiko,
nur ein Versprechen im Preismodell, das die Plattform noch nicht einlöst.

## Die eine strukturelle Lücke: Komposition ist App-Sache

Die Produkt-Layer kennen sich bewusst nicht (A14). Der `#comments`-Slot in
PostCard/EventDetail/LessonView wird deshalb von der **App** gefüllt — und
diese 22–53-Zeilen-Kompositionen existieren heute nur in `apps/comments`.
`apps/platform` hat sie nicht ⇒ auf demo.pukalani.app hat der Feed keine
Kommentare, auf comments.pukalani.app schon. Dasselbe Produkt, zwei
Ausprägungen.

### Lösungsoptionen

- **(a) Overrides in platform kopieren** — schnell, aber dann existiert die
  Komposition n-mal und driftet (dasselbe Muster, das schon drei
  `default`-Layouts erzeugt hat). Abgelehnt.
- **(b) EIN Kompositions-Layer** (`packages/community`): darf als einziger
  mehrere Produkt-Layer kennen — sein ganzer Zweck ist die Verdrahtung
  (Feed+Kommentare, Event+Kommentare, Lektion+Kommentare, Tenant-Header).
  Produkt-Gates bleiben wirksam (Feed ohne comments-Produkt = Slot leer).
  comments-App UND platform extenden ihn ⇒ Komposition existiert einmal,
  Pool und Silo sind identisch. Nimmt im selben Zug die drei
  auseinanderlaufenden `default`-Layouts zusammen. **Empfehlung.**
- **(c) Slot-Registry über app.config** (comments registriert sich selbst in
  den Slot) — implizite String-Kopplung, genau was A14 verbietet. Abgelehnt.

## Vorschlag Reihenfolge (Feature-Stopp bleibt bestehen)

1. **Kompositions-Layer `packages/community`** — Pool = Silo, eine Wahrheit.
2. **Pool-Vier polieren** (posts, comments, pages, moderation) — Nutzersicht-
   Rundgang demo.pukalani.app, Kanten fixen statt Neues bauen.
3. **events/courses:** ENTWEDER aus `pukalani.tenancy.products` nehmen (ehrlich:
   noch kein Pool-Produkt) ODER als nächstes einzeln durch die Datentür +
   ESLint-Liste + Migration tenantId. NICHT beides parallel.
4. tickets/feedback/media/activity: **eingefroren** — keine Arbeit, bis die
   Pool-Vier rund sind.

Entscheidung über 3 und den Start von 1: David.

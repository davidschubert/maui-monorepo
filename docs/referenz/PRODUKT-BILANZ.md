<!-- ERZEUGT von scripts/produkt-bilanz.mjs — NICHT von Hand bearbeiten. -->
<!-- Neu erzeugen: node scripts/produkt-bilanz.mjs · Prüfen: --check -->

# Produkt-Bilanz

Beantwortet Davids Leitfrage „ein Produkt hat genau EIN Konzept, der Aufbau
ist überall derselbe" — **gerechnet aus dem Code**, nicht aus Erinnerung.
Quellen: `apps/*/site.manifest.ts`, `packages/*/product.manifest.ts`, die
Dateien unter `server/api/**` und `app/pages/**`, das Tarif-Gate in
`apps/platform/app/app.config.ts`.

Die ursprüngliche Bilanz vom 2026-07-27 (Begründung, warum es
`packages/blueprint` gibt, samt der verworfenen Alternativen) liegt als
Protokoll in [`docs/archiv/PRODUKT-BILANZ-2026-07-27.md`](../archiv/PRODUKT-BILANZ-2026-07-27.md).

## Produkte

| Produkt | Pool (`platform`) | Silo-Apps | Datentür (`server/api`) | Mandanten-Spalte | Tarif ab |
| --- | --- | --- | --- | --- | --- |
| **activity** | ✅ | comments | 2/2 über `tenantDb` | — | basic |
| **analytics** | ✅ | comments, portfolio | 3/3 über `tenantDb` | ✅ | personal |
| **comments** | ✅ | _template, comments | 16/17 über `tenantDb` | ✅ | — |
| **control** | — | control | 0/61 über `tenantDb` · 44 roh | ✅ | — |
| **courses** | ✅ | _template, comments | 12/13 über `tenantDb` | ✅ | pro |
| **events** | ✅ | _template, comments | 17/18 über `tenantDb` | ✅ | pro |
| **feedback** | ✅ | control | 0/8 über `tenantDb` | — | — |
| **media** | ✅ | comments, photos | 5/5 über `tenantDb` | ✅ | personal |
| **moderation** | ✅ | _template, comments | 3/4 über `tenantDb` | ✅ | — |
| **pages** | ✅ | control | 6/6 über `tenantDb` | ✅ | — |
| **posts** | ✅ | _template, comments | 22/23 über `tenantDb` | ✅ | personal |
| **tickets** | — | control | 0/21 über `tenantDb` · 18 roh | — | — |

Lesehilfe: „Datentür" zählt die Route-Dateien, die `tenantDb(event)` nutzen —
„roh" wären Dateien mit direktem `tablesDB`, die der ESLint-Backstop in
gepoolten Layern verbietet. „Mandanten-Spalte" heißt: die Migrationen des
Layers legen `communityId` an. Ein Layer ohne eigene Routen (z. B. `feedback`)
holt seine Daten über die Naht eines anderen Layers.

## Fundament (kein Kundenprodukt)

`admin` · `billing` · `blueprint` · `core` · `onboarding` · `system` · `themes`

## Welche App montiert was

| Produkt | _template | comments | control | photos | platform | portfolio |
| --- | --- | --- | --- | --- | --- | --- |
| `activity` | — | ✅ | — | — | ✅ | — |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `analytics` | — | ✅ | — | — | ✅ | ✅ |
| `billing` | — | ✅ | ✅ | — | — | — |
| `blueprint` | ✅ | ✅ | — | — | ✅ | — |
| `comments` | ✅ | ✅ | — | — | ✅ | — |
| `control` | — | — | ✅ | — | — | — |
| `courses` | ✅ | ✅ | — | — | ✅ | — |
| `events` | ✅ | ✅ | — | — | ✅ | — |
| `feedback` | — | — | ✅ | — | ✅ | — |
| `media` | — | ✅ | — | ✅ | ✅ | — |
| `moderation` | ✅ | ✅ | — | — | ✅ | — |
| `onboarding` | — | — | — | — | ✅ | — |
| `pages` | — | — | ✅ | — | ✅ | — |
| `posts` | ✅ | ✅ | — | — | ✅ | — |
| `themes` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tickets` | — | — | ✅ | — | — | — |

## Der Bauplan: wo Pool und Silo dasselbe zeigen

`packages/blueprint` ist der einzige Layer, der mehrere Produkt-Layer kennen
darf. Seine Seiten überlagern die „nackten" Produktseiten — jede App, die ihn
extended, zeigt dasselbe Produktverhalten.

| Route | überlagert Seite aus |
| --- | --- |
| `/courses/[slug]/lessons/[id]` | `courses` |
| `/events/[id]` | `events` |
| `/feed` | `posts` |

Montiert in: `_template`, `comments`, `platform`.

## App-Seiten, die eine Layer-Seite verdecken

Jeder Eintrag hier ist eine Ausprägung, die es nur in DIESER App gibt — genau
die Drift, die „ein Konzept pro Produkt" verhindern soll. Leer ist gut.

_Keine._

<script setup lang="ts">
// Szene 9 — der Moment der Entscheidung (§6.4): ehrlich, entwaffnet Zweifel.
// Regeln (§2.3/§4.9): semantische HTML-Tabelle (kein Bild), sichtbares
// „Stand: …"-Datum + Quellen, NUR belegbare Dimensionen — was wir nicht sauber
// belegen konnten, steht als „k. A." drin statt als Behauptung. Und eine echte
// Schwäche (keine native Mobile-App) wird benannt, nicht versteckt.
const { t } = useI18n()

const ROW_COUNT = 7
const rows = computed(() =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({
    label: t(`marketing.compare.rows.${i}.label`),
    us: t(`marketing.compare.rows.${i}.us`),
    circle: t(`marketing.compare.rows.${i}.circle`),
    skool: t(`marketing.compare.rows.${i}.skool`),
    mighty: t(`marketing.compare.rows.${i}.mighty`),
  })),
)

// Redaktioneller Snapshot — Quellen sichtbar, damit der Vergleich prüfbar ist.
const sources = [
  { name: 'Circle', href: 'https://circle.so/pricing' },
  { name: 'Skool', href: 'https://www.skool.com/pricing' },
  { name: 'Mighty Networks', href: 'https://www.mightynetworks.com/pricing' },
]
</script>

<template>
  <section id="vergleich" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow cmp-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.compare.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.compare.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.compare.lead') }}</p>
    </div>

    <!--
      AUDIT-AUSNAHME (Paket 4): diese Tabelle bleibt BEWUSST handgeschrieben.
      Geprüft wurde `UPricingTable` (tiers/sections/caption) — es rendert zwar
      echte Semantik (<caption>, <th scope="col">, <th scope="row">), passt aber
      an drei Stellen NICHT auf einen redaktionellen Anbietervergleich, und
      keine davon lässt sich über Slots oder `:ui` geradebiegen:

      1. Die erste Kopfzelle ist im Bauteil fest ein leeres <td>
         (PricingTable.vue, Zeile 148). Die Spaltenüberschrift „Kriterium"
         (i18n `marketing.compare.criterion`) hätte keinen Ort mehr — für eine
         Tabelle, deren erste Spalte die Zeilenköpfe trägt, ist genau das die
         Beschriftung, die eine Vorlesehilfe ansagt.
      2. `sections` ist Pflicht und erzeugt je Abschnitt eine eigene <tr>
         (Zeile 164) — das v-if hängt nur am Titel-<div> INNEN, nicht an der
         Zeile. Unsere sieben Kriterien sind bewusst ungruppiert; es bliebe eine
         leere Zeile mit Trennlinie über der Tabelle stehen.
      3. Das Bauteil rendert den Inhalt ZWEIMAL: <table> ist `hidden md:table`,
         daneben steht eine Kartenliste fürs Handy (Zeile 213). Genau die
         Semantik, um die es hier geht (Beschriftung, Zeilenköpfe), steckt dann
         nur in der auf Handys ausgeblendeten Hälfte. Unser Bestand scrollt
         stattdessen EINE Tabelle in ihrem Container — dieselben Daten, eine
         Quelle.

      `UTable` wurde ebenfalls geprüft und scheidet härter aus: es setzt im
      Körper ausschließlich <td> (Table.vue, Zeile 336), es gibt kein
      <th scope="row"> — die Zeilenköpfe wären weg. Dazu käme eine ganze
      TanStack-Table-Laufzeit für sieben statische Zeilen.

      Modernisiert ist deshalb nur die Hülle: die Kante des Scroll-Containers
      liest jetzt dasselbe `--puka-card-edge` wie der `pageCard`-Vertrag.
    -->
    <div class="cmp-wrap mkt-inner" data-reveal>
      <table class="cmp-table">
        <caption class="cmp-caption">{{ t('marketing.compare.asOf') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('marketing.compare.criterion') }}</th>
            <th scope="col" class="col-us">{{ t('marketing.compare.us') }}</th>
            <th scope="col">Circle</th>
            <th scope="col">Skool</th>
            <th scope="col">Mighty Networks</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td class="col-us">{{ row.us }}</td>
            <td>{{ row.circle }}</td>
            <td>{{ row.skool }}</td>
            <td>{{ row.mighty }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mkt-inner mkt-narrow cmp-foot" data-reveal>
      <p class="cmp-note">{{ t('marketing.compare.note') }}</p>
      <p class="cmp-sources">
        <span>{{ t('marketing.compare.sources') }}</span>
        <a v-for="src in sources" :key="src.name" :href="src.href" rel="nofollow noopener" target="_blank">{{ src.name }}</a>
      </p>
      <UAlert
        variant="subtle" color="primary"
        :description="t('marketing.compare.honest')"
        class="mt-6"
        :ui="{ description: 'text-base/relaxed opacity-100' }"
      />
    </div>
  </section>
</template>

<style scoped>
.cmp-head { text-align: center; }
.cmp-head .mkt-lead { margin-inline: auto; }

/* Breite Tabelle scrollt in ihrem eigenen Container — die Seite selbst nie. */
.cmp-wrap {
  margin-top: 2.5rem;
  overflow-x: auto;
  border-radius: 1rem;
  border: 1px solid var(--puka-card-edge);
  background: hsl(var(--puka-paper) / 0.6);
}
.cmp-table {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.cmp-caption {
  caption-side: bottom;
  padding: 0.85rem 1rem;
  font-size: 0.8rem;
  color: hsl(var(--puka-ink-soft) / 0.75);
  text-align: left;
}
.cmp-table th, .cmp-table td {
  padding: 0.8rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--puka-card-edge);
}
.cmp-table thead th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--puka-ink-soft) / 0.8);
  background: hsl(var(--puka-dawn) / 0.55);
}
.cmp-table tbody th {
  font-weight: 600;
  color: hsl(var(--puka-ink));
}
.cmp-table td { color: hsl(var(--puka-ink-soft)); }
.cmp-table .col-us {
  background: hsl(var(--puka-sun) / 0.14);
  font-weight: 700;
  color: hsl(var(--puka-ink));
}
.cmp-table thead .col-us { color: hsl(var(--puka-sun-deep)); }
.cmp-table tbody tr:last-child th,
.cmp-table tbody tr:last-child td { border-bottom: 0; }

.cmp-foot { margin-top: 1.5rem; }
.cmp-note, .cmp-sources {
  font-size: 0.88rem;
  color: hsl(var(--puka-ink-soft) / 0.85);
}
.cmp-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.85rem;
  margin-top: 0.5rem;
}
.cmp-sources a { color: hsl(var(--puka-sun-deep)); text-decoration: underline; }
</style>

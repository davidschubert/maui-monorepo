<script setup lang="ts">
// Szene 14 — Denouement (§6.4): letzte Fäden, Ruhe. Ton bleibt warm (dawn):
// das Licht-Motiv (§6.3) hellt monoton zum CTA-Peak auf.
//
// `UAccordion` statt der nativen <details> (Paket 5, Davids Entscheidung
// 2026-07-31 — Nuxt UI schlägt „kein JS"). Zwei Eigenschaften halten das
// Verhalten des Bestands:
//   `type="multiple"` — <details> lässt beliebig viele Antworten offen; die
//   Vorgabe `single` schlösse beim Öffnen der nächsten Frage die vorige.
//   `:unmount-on-hide="false"` — PFLICHT und kein Geschmack: die Antworten
//   müssen im SSR-HTML stehen. Diese Sektion ist der sichtbare Zwilling des
//   FAQPage-JSON-LD auf /faq und der Startseite; Google verlangt, dass die
//   ausgezeichnete Antwort auch im Seiteninhalt vorkommt. Mit der Vorgabe
//   (true) rendert Reka geschlossene Inhalte GAR NICHT.
const { t } = useI18n()
const items = computed(() =>
  [0, 1, 2, 3, 4, 5].map(i => ({
    label: t(`marketing.faq.items.${i}.q`),
    content: t(`marketing.faq.items.${i}.a`),
  })),
)
</script>

<template>
  <section id="faq" class="mkt-section tone-sun-hold">
    <div class="mkt-inner mkt-narrow faq-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.faq.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.faq.title') }}</h2>
    </div>

    <!-- `mkt-inner` (Breiten-Container) und die Liste sind BEWUSST zwei
         Elemente: `.mkt-inner` setzt in marketing.css `margin: 0 auto` als
         Kurzform, und diese ungeschichtete Regel schlägt jede Tailwind-Utility
         aus @layer — ein `mt-8` an derselben Stelle wäre wirkungslos. -->
    <div class="mkt-inner mkt-narrow" data-reveal>
      <UAccordion
        :items="items"
        type="multiple"
        :unmount-on-hide="false"
        trailing-icon="i-ph-plus-bold"
        :ui="{
          root: 'mt-8 flex w-full flex-col gap-3',
          // Jede Frage ist im Bestand eine eigene KARTE (dieselbe Fläche wie
          // die `pageCard`-Karten aus Paket 2), nicht eine Zeile in einer
          // Liste — deshalb die Kante rundum statt der Vorgabe `border-b`.
          item: 'rounded-[0.9rem] border-b-0 bg-white/60 px-5 ring-1 ring-[color:var(--puka-card-edge)]',
          trigger: 'py-[1.15rem] gap-4 text-[1.05rem] font-bold text-highlighted',
          // Aus dem Plus wird ein Kreuz: 45° statt der 180° der Vorgabe
          // (dieselbe Bedingungskette, damit tailwind-merge die Vorgabe wirft).
          trailingIcon: 'size-[1.2rem] text-primary-600 group-data-[state=open]:rotate-45',
          body: 'max-w-[42rem] pb-[1.2rem] pt-0 text-base/[1.6] text-toned',
        }"
      />
    </div>
  </section>
</template>

<style scoped>
.faq-head { text-align: center; }
</style>

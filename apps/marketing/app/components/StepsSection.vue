<script setup lang="ts">
// Szene 3 — der Mentor reicht die Karte (§6.4): drei Schritte, die Tür öffnet
// sich. Hoffnung/Erleichterung, der Ton klart auf (tone-sky).
const { t } = useI18n()
const items = computed(() =>
  [0, 1, 2].map(i => ({
    n: t(`marketing.steps.items.${i}.n`),
    title: t(`marketing.steps.items.${i}.title`),
    text: t(`marketing.steps.items.${i}.text`),
  })),
)
</script>

<template>
  <section id="so-gehts" class="mkt-section tone-sky">
    <div class="mkt-inner mkt-narrow steps-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.steps.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.steps.title') }}</h2>
      <UBadge
        color="primary" variant="subtle" size="lg"
        icon="i-ph-timer-bold"
        class="mt-2 rounded-full px-3.5 py-1.5 font-bold"
        :label="t('marketing.steps.badge')"
      />
    </div>

    <!--
      SCHRITT-KARTEN = `UPageGrid` + `UPageCard`, NICHT `UStepper`/`UTimeline`
      (Paket 5, beide geprüft und begründet abgelehnt):
      · `UStepper` ist ein BEDIEN-Element. Reka baut daraus Knöpfe mit
        wanderndem Fokus, `aria-current` und genau EINEM sichtbaren Inhalt.
        Diese drei Schritte sind ein Text, kein Assistent — anklickbare Knöpfe,
        die nichts tun, sind schlechter als die schlichte <ol> davor.
      · `UTimeline` (waagerecht) zeigt zwar alle Punkte, rendert aber nur
        `div`s (die Reihenfolge-Semantik von <ol>/<li> ginge verloren), zieht
        eine Verbindungslinie, die dieses Bild nicht hat, und lässt die
        KARTENFLÄCHE weg — und die ist seit Paket 2 die Sprache jeder
        Aufzählung dieser Seite; ohne sie stünde der Text nackt auf dem Verlauf.
      Geblieben ist nur die Nummern-Scheibe als Eigenteil im `#leading`-Slot;
      ihr Verlauf steht als --puka-step-fill in app/assets/css/puka-theme.css.

      `mkt-inner` und das Raster sind BEWUSST zwei Elemente — `.mkt-inner`
      setzt `margin: 0 auto` als ungeschichtete Kurzform und schlägt damit jede
      Tailwind-Utility aus @layer (ein `mt-10` hier wäre wirkungslos).
    -->
    <div class="mkt-inner" data-reveal>
      <!-- NUR BENANNTE STUFEN, und das ist eine bewusste Abweichung: der
           Bestand schaltete bei 820px auf drei Spalten. `UPageGrid` bringt
           `sm:grid-cols-2 lg:grid-cols-3` mit, und die lassen sich NUR mit
           derselben Stufe wegräumen (tailwind-merge arbeitet je Stufe). Eine
           arbiträre `min-[820px]`-Regel stünde in Tailwinds Ausgabe VOR jeder
           benannten und verlöre gegen das nötige `sm:` — live gemessen: bei
           1000px stand eine Spalte statt drei.
           Ergebnis: der Umbruch liegt bei 768 statt 820 (52px früher). Die
           Absicht des Bestands bleibt erhalten — ein iPad im Hochformat (820px)
           zeigt weiterhin drei Karten. -->
      <UPageGrid as="ol" class="mt-10 grid-cols-1 sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-3">
        <UPageCard
          v-for="step in items" :key="step.n"
          as="li"
          :title="step.title" :description="step.text"
          :ui="{ leading: 'mb-[0.9rem]' }"
        >
          <template #leading>
            <span class="inline-flex size-[2.4rem] items-center justify-center rounded-full bg-[image:var(--puka-step-fill)] text-[1.1rem] font-extrabold text-inverted">
              {{ step.n }}
            </span>
          </template>
        </UPageCard>
      </UPageGrid>
    </div>
  </section>
</template>

<style scoped>
.steps-head { text-align: center; }
</style>

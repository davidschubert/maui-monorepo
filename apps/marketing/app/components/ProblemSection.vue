<script setup lang="ts">
// Szene 2 — der Gegenspieler tritt auf (§6.4): das „bewölkte Netz". Noch
// gedämpfter Ton (tone-mist), Frustration + Wiedererkennen, dann die Brücke
// zur Erleichterung.
const { t } = useI18n()
const rows = computed(() =>
  [0, 1, 2].map(i => ({
    pain: t(`marketing.problem.rows.${i}.pain`),
    gain: t(`marketing.problem.rows.${i}.gain`),
  })),
)
</script>

<template>
  <section id="problem" class="mkt-section tone-mist">
    <div class="mkt-inner mkt-narrow" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.problem.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.problem.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.problem.lead') }}</p>
    </div>

    <!-- Container und Raster getrennt — Begründung in BlocksSection.vue. -->
    <div class="mkt-inner" data-reveal>
      <UPageGrid class="mt-10 gap-5 lg:grid-cols-3">
        <!-- Nur der RAHMEN ist die Karte; die Dramaturgie „Das nervt → So
             machen wir es" bleibt eigener Inhalt: sie ist keine Titel/Text-
             Karte. -->
        <UPageCard v-for="(row, i) in rows" :key="i">
          <div class="flex flex-col gap-2.5">
            <div class="flex items-start gap-3">
              <UIcon name="i-ph-cloud-fog-bold" class="mt-0.5 size-6 shrink-0 text-dimmed" />
              <div>
                <UBadge
                  color="neutral" variant="subtle" size="sm"
                  class="uppercase tracking-wider"
                  :label="t('marketing.problem.painLabel')"
                />
                <p class="mt-1.5 text-toned">{{ row.pain }}</p>
              </div>
            </div>

            <!-- Der Übergangspfeil ist ein Trenner zwischen beiden Hälften —
                 er gehört mittig in die Karte, nicht links unter das Icon. -->
            <UIcon name="i-ph-arrow-down-bold" class="size-4 self-center text-dimmed" />

            <div class="flex items-start gap-3">
              <UIcon name="i-ph-sun-bold" class="mt-0.5 size-6 shrink-0 text-primary" />
              <div>
                <UBadge
                  color="primary" variant="subtle" size="sm"
                  class="uppercase tracking-wider"
                  :label="t('marketing.problem.gainLabel')"
                />
                <p class="mt-1.5 font-semibold text-highlighted">{{ row.gain }}</p>
              </div>
            </div>
          </div>
        </UPageCard>
      </UPageGrid>
    </div>
  </section>
</template>

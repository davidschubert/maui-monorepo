<script setup lang="ts">
// Szene 7 — das Heiligtum ist echt (§6.4): Ruhe-Beat, Angst senken. Ehrlich,
// keine pauschalen Rechtsclaims (§4.7-Regel). Ton: aufgeklarter Himmel (sky).
const { t } = useI18n()
const points = computed(() =>
  [0, 1, 2, 3, 4].map(i => ({
    icon: t(`marketing.privacy.points.${i}.icon`),
    text: t(`marketing.privacy.points.${i}.text`),
  })),
)
</script>

<template>
  <section id="datenschutz" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner priv-grid">
      <div class="priv-copy" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.privacy.kicker') }}</p>
        <h2 class="mkt-h2">{{ t('marketing.privacy.title') }}</h2>
        <p class="mkt-lead">{{ t('marketing.privacy.lead') }}</p>
        <UAlert
          variant="subtle" color="neutral"
          :description="t('marketing.privacy.note')"
          class="mt-4 max-w-[34rem]"
        />
      </div>

      <ul class="priv-list" data-reveal style="--reveal-delay: 100ms">
        <!-- Ein Listenpunkt ist eine Zeile aus getönter Icon-Kachel + Text —
             genau die Bauform von UPageFeature. Kachel und Fläche kommen als
             ui-Override, weil sie die Marketing-Optik sind und nicht die
             Nuxt-UI-Voreinstellung (dort hat ein Feature gar keine Fläche). -->
        <UPageFeature
          v-for="point in points" :key="point.text"
          as="li" :icon="point.icon" :title="point.text"
          :ui="{
            root: 'items-center gap-3 rounded-[0.8rem] bg-white/60 px-[1.1rem] py-3.5 ring-1 ring-[color:var(--puka-card-edge)]',
            leading: 'size-[2.1rem] shrink-0 justify-center rounded-[0.6rem] bg-primary/20 p-0',
            leadingIcon: 'size-5 text-primary-600',
          }"
        />
      </ul>
    </div>
  </section>
</template>

<style scoped>
.priv-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;
}
.priv-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

@media (min-width: 860px) { .priv-grid { grid-template-columns: 1fr 1fr; } }
</style>

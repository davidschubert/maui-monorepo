<script setup lang="ts">
// Szene 13 — Call to Adventure (§6.4): tritt durch das Tor. Der erreichte Ort:
// dunkler, warmer Peak mit der puka als Lichtquelle, direkt vor dem Footer.
const { t } = useI18n()
const { start, demo } = useProductLinks()
</script>

<template>
  <section id="los-gehts" class="cta-section tone-ink">
    <div class="cta-puka puka-glow" data-parallax="0.08" aria-hidden="true" />
    <div class="mkt-inner cta-inner" data-reveal>
      <PukaMark :size="44" />
      <h2 class="cta-title">{{ t('marketing.cta.title') }}</h2>
      <p class="cta-lead">{{ t('marketing.cta.lead') }}</p>
      <div class="cta-buttons">
        <UButton :to="start" color="warning" size="xl">{{ t('marketing.cta.primary') }}</UButton>
        <UButton :to="demo" variant="ghost" color="neutral" size="xl" icon="i-ph-play-circle" class="cta-ghost">
          {{ t('marketing.cta.secondary') }}
        </UButton>
      </div>
      <p class="cta-refrain">„{{ t('marketing.cta.refrain') }}"</p>
    </div>
  </section>
</template>

<style scoped>
.cta-section {
  position: relative;
  padding: clamp(4rem, 9vw, 7rem) 1.5rem;
  overflow: clip;
  text-align: center;
}
.cta-puka {
  top: -16rem;
  left: 50%;
  transform: translateX(-50%);
  width: 40rem;
  height: 40rem;
  opacity: 0.5;
}
.cta-inner {
  position: relative;
  max-width: 42rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cta-title {
  font-size: clamp(1.9rem, 4.5vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  margin: 1rem 0 0.75rem;
  color: hsl(var(--puka-cloud));
  text-wrap: balance;
}
.cta-lead {
  font-size: 1.15rem;
  color: hsl(var(--puka-mist) / 0.85);
  line-height: 1.55;
  max-width: 34rem;
}
.cta-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: center;
  margin: 2rem 0 1.25rem;
}
.cta-ghost { color: hsl(var(--puka-cloud)); }
.cta-refrain { color: hsl(var(--puka-sun)); font-style: italic; }
</style>

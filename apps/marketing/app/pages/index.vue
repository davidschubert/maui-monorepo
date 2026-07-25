<script setup lang="ts">
// Boot-Platzhalter (L1): beweist App-Boot + i18n + Theme. Die volle
// kinematische Startseite folgt in L2–L4.
const { t } = useI18n()
</script>

<template>
  <main class="mkt-boot">
    <p class="eyebrow">{{ t('marketing.hero.eyebrow') }}</p>
    <h1>{{ t('marketing.hero.title') }}</h1>
    <p class="sub">{{ t('marketing.hero.sub') }}</p>
    <div class="cta">
      <UButton size="lg" color="primary">{{ t('marketing.hero.ctaPrimary') }}</UButton>
      <UButton size="lg" variant="soft">{{ t('marketing.hero.ctaSecondary') }}</UButton>
    </div>
  </main>
</template>

<style scoped>
.mkt-boot {
  max-width: 48rem;
  margin: 0 auto;
  padding: 6rem 1.5rem;
  text-align: center;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.8rem;
  opacity: 0.7;
}
h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  margin: 0.75rem 0;
}
.sub {
  font-size: 1.15rem;
  opacity: 0.8;
  margin-bottom: 2rem;
}
.cta {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
</style>

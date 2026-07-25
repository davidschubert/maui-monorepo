<script setup lang="ts">
// Szene 12 — Origin-Myth (§6.4): der EMOTIONALE HÖHEPUNKT. Wirkt erst, wenn der
// Besucher die ganze Reise hinter sich hat — deshalb bewusst weit unten, direkt
// vor dem Abschluss-CTA. Volles warmes Licht (tone-sun), die puka als Motiv.
// Copy 1:1 aus dem Konzept §4.12 (DE+EN), inkl. der vier Bedeutungs-Stränge.
const { t } = useI18n()
const strands = computed(() =>
  [0, 1, 2, 3].map(i => ({
    title: t(`marketing.story.strands.${i}.title`),
    text: t(`marketing.story.strands.${i}.text`),
  })),
)
</script>

<template>
  <section id="geschichte" class="story-section tone-sun">
    <div class="story-puka puka-glow" data-parallax="0.06" aria-hidden="true" />

    <div class="mkt-inner story-inner">
      <header class="story-head" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.story.kicker') }}</p>
        <h2 class="story-title">{{ t('marketing.story.title') }}</h2>
        <p class="story-intro">{{ t('marketing.story.intro') }}</p>
      </header>

      <ol class="story-strands">
        <li
          v-for="(strand, i) in strands" :key="strand.title"
          class="strand" data-reveal :style="`--reveal-delay: ${i * 90}ms`"
        >
          <span class="strand-mark" aria-hidden="true"><PukaMark :size="20" /></span>
          <div>
            <h3 class="strand-title">{{ strand.title }}</h3>
            <p class="strand-text">{{ strand.text }}</p>
          </div>
        </li>
      </ol>

      <p class="story-outro" data-reveal>{{ t('marketing.story.outro') }}</p>
    </div>
  </section>
</template>

<style scoped>
.story-section {
  position: relative;
  padding: clamp(4rem, 9vw, 8rem) 1.5rem;
  overflow: clip;
}
.story-puka {
  top: -20rem;
  right: -14rem;
  width: 46rem;
  height: 46rem;
  opacity: 0.45;
}
.story-inner {
  position: relative;
  max-width: 46rem;
}
.story-head { text-align: center; }
.story-title {
  font-size: clamp(1.9rem, 4.4vw, 3rem);
  font-weight: 850;
  letter-spacing: -0.02em;
  margin: 0.6rem 0 1.1rem;
  text-wrap: balance;
}
.story-intro {
  font-size: clamp(1.1rem, 1.7vw, 1.3rem);
  line-height: 1.6;
  color: hsl(var(--puka-ink) / 0.86);
}
.story-strands {
  list-style: none;
  padding: 0;
  margin: 3rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.strand {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.strand-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: hsl(0 0% 100% / 0.65);
  box-shadow: 0 8px 22px -12px hsl(var(--puka-sun-deep) / 0.7);
}
.strand-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin-bottom: 0.3rem;
  color: hsl(var(--puka-ink));
}
.strand-text {
  line-height: 1.65;
  color: hsl(var(--puka-ink) / 0.78);
}
.story-outro {
  margin-top: 2.75rem;
  padding-top: 1.75rem;
  border-top: 1px solid hsl(var(--puka-ink) / 0.12);
  font-size: 1.05rem;
  line-height: 1.65;
  font-style: italic;
  color: hsl(var(--puka-ink) / 0.82);
}
</style>

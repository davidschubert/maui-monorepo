<script setup lang="ts">
// Szene 1 — Cold Open (§6.4): starkes Bild + Versprechen, bevor erklärt wird.
// Der Gegenspieler-Raum ist noch „bewölkt" (kühles Grau), aber die puka bricht
// oben rechts bereits durch — das Leitmotiv setzt sofort ein.
const { t } = useI18n()
const { start, demo } = useProductLinks()

const trust = computed(() => [
  { icon: 'i-ph-flag-bold', label: t('marketing.hero.trust.hosting') },
  { icon: 'i-ph-shield-check-bold', label: t('marketing.hero.trust.tracking') },
  { icon: 'i-ph-lock-key-bold', label: t('marketing.hero.trust.privacy') },
  { icon: 'i-ph-puzzle-piece-bold', label: t('marketing.hero.trust.modular') },
])
</script>

<template>
  <section class="hero tone-cloud">
    <!-- die puka: warmes Licht bricht durch die Wolken (leichter Parallax) -->
    <div class="hero-puka puka-glow" data-parallax="0.12" aria-hidden="true" />

    <div class="hero-inner mkt-inner">
      <div class="hero-copy" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.hero.eyebrow') }}</p>
        <h1 class="hero-title">{{ t('marketing.hero.title') }}</h1>
        <p class="hero-sub mkt-lead">{{ t('marketing.hero.sub') }}</p>

        <div class="hero-cta">
          <UButton :to="start" color="warning" size="xl" class="cta-primary">
            {{ t('marketing.hero.ctaPrimary') }}
          </UButton>
          <UButton :to="demo" variant="ghost" size="xl" class="cta-secondary" icon="i-ph-play-circle">
            {{ t('marketing.hero.ctaSecondary') }}
          </UButton>
        </div>

        <ul class="hero-trust">
          <li v-for="item in trust" :key="item.label">
            <UIcon :name="item.icon" class="trust-icon" />
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </div>

      <!-- Produkt-Visual: eine abstrahierte Community-Heimat (Feed · Kurs ·
           Event) — bewusst KEIN erfundener Screenshot, sondern eine ruhige
           Andeutung der Bausteine. -->
      <div class="hero-visual" data-reveal style="--reveal-delay: 160ms" aria-hidden="true">
        <div class="mock">
          <div class="mock-bar">
            <PukaMark :size="18" />
            <span class="mock-name">deine-community</span>
          </div>
          <div class="mock-body">
            <div class="mock-card mock-post">
              <div class="mock-avatar" />
              <div class="mock-lines"><span /><span class="short" /></div>
            </div>
            <div class="mock-card mock-course">
              <div class="mock-thumb" />
              <div class="mock-lines"><span class="mid" /><span class="short" /></div>
            </div>
            <div class="mock-card mock-event">
              <div class="mock-date"><b>24</b><small>JUL</small></div>
              <div class="mock-lines"><span class="mid" /><span class="short" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="hero-refrain" data-reveal>{{ t('marketing.hero.refrain') }}</p>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  padding: clamp(4rem, 8vw, 7rem) 1.5rem clamp(3rem, 6vw, 5rem);
  overflow: clip;
}
.hero-puka {
  top: -14rem;
  right: -10rem;
  width: 38rem;
  height: 38rem;
  opacity: 0.75;
}
.hero-inner {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;
  align-items: center;
}
.hero-title {
  font-size: clamp(2.4rem, 6vw, 4.2rem);
  font-weight: 850;
  line-height: 1.03;
  letter-spacing: -0.025em;
  margin: 0.6rem 0 1.1rem;
  text-wrap: balance;
}
.hero-sub { font-size: clamp(1.1rem, 1.7vw, 1.35rem); }
.hero-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin: 2rem 0 1.75rem;
}
.hero-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.4rem;
  padding: 0;
  margin: 0;
  list-style: none;
}
.hero-trust li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: hsl(var(--puka-ink-soft));
}
.trust-icon {
  color: hsl(var(--puka-sun-deep));
  width: 1.05rem;
  height: 1.05rem;
}
.hero-refrain {
  position: relative;
  text-align: center;
  margin: 3.5rem auto 0;
  font-style: italic;
  color: hsl(var(--puka-sun-deep));
  font-size: 1.05rem;
}

/* Produkt-Mock (abstrakt, on-brand) */
.hero-visual { display: flex; justify-content: center; }
.mock {
  width: min(100%, 26rem);
  border-radius: 1.1rem;
  background: hsl(0 0% 100% / 0.7);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  box-shadow: 0 24px 60px -28px hsl(var(--puka-ink) / 0.4);
  overflow: hidden;
  backdrop-filter: blur(4px);
}
.mock-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid hsl(var(--puka-ink) / 0.07);
  background: hsl(var(--puka-cloud) / 0.6);
}
.mock-name { font-size: 0.85rem; font-weight: 600; color: hsl(var(--puka-ink-soft)); }
.mock-body { display: flex; flex-direction: column; gap: 0.7rem; padding: 0.9rem; }
.mock-card {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.7rem;
  border-radius: 0.7rem;
  background: hsl(var(--puka-cloud) / 0.75);
}
.mock-avatar {
  width: 2rem; height: 2rem; border-radius: 50%;
  background: linear-gradient(135deg, hsl(var(--puka-sun)), hsl(var(--puka-sun-deep)));
  flex: none;
}
.mock-thumb {
  width: 3rem; height: 2.1rem; border-radius: 0.4rem;
  background: linear-gradient(135deg, hsl(202 60% 70%), hsl(var(--puka-sky)));
  flex: none;
}
.mock-date {
  width: 2.3rem; height: 2.3rem; border-radius: 0.5rem; flex: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: hsl(var(--puka-dawn)); color: hsl(var(--puka-sun-deep));
  line-height: 1;
}
.mock-date b { font-size: 0.95rem; }
.mock-date small { font-size: 0.55rem; letter-spacing: 0.05em; }
.mock-lines { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
.mock-lines span {
  height: 0.5rem; border-radius: 0.25rem;
  background: hsl(var(--puka-ink) / 0.13);
}
.mock-lines span.mid { width: 80%; }
.mock-lines span.short { width: 52%; }

@media (min-width: 900px) {
  .hero-inner { grid-template-columns: 1.05fr 0.95fr; gap: 3.5rem; }
}
</style>

<script setup lang="ts">
// Szene 4 — Gear-up-Montage (§6.4): der Held bekommt seine Werkzeuge. Ton
// wärmt weiter (tone-dawn). Claim-Gate §2.4: belegte Bausteine = „Verfügbar",
// Feed/Kurse/Events ehrlich als „Early Access" (nie wie aktueller Tarif).
const { t } = useI18n()
const items = computed(() =>
  [0, 1, 2, 3, 4, 5].map(i => ({
    icon: t(`marketing.blocks.items.${i}.icon`),
    title: t(`marketing.blocks.items.${i}.title`),
    text: t(`marketing.blocks.items.${i}.text`),
    status: t(`marketing.blocks.items.${i}.status`),
  })),
)
</script>

<template>
  <section id="bausteine" class="mkt-section tone-sky-hold">
    <div class="mkt-inner mkt-narrow blocks-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.blocks.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.blocks.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.blocks.lead') }}</p>
    </div>

    <div class="blocks-grid mkt-inner" data-reveal>
      <article v-for="block in items" :key="block.title" class="block-card">
        <div class="block-top">
          <UIcon :name="block.icon" class="block-icon" />
          <span
            class="block-badge"
            :class="block.status === 'available' ? 'badge-available' : 'badge-ea'"
          >
            {{ block.status === 'available' ? t('marketing.blocks.available') : t('marketing.blocks.earlyAccess') }}
          </span>
        </div>
        <h3 class="block-title">{{ block.title }}</h3>
        <p class="block-text">{{ block.text }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.blocks-head { text-align: center; }
.blocks-head .mkt-lead { margin-inline: auto; }
.blocks-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
  margin-top: 2.5rem;
}
.block-card {
  background: hsl(0 0% 100% / 0.65);
  border: 1px solid hsl(var(--puka-ink) / 0.07);
  border-radius: 1rem;
  padding: 1.4rem;
}
.block-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.8rem;
}
.block-icon { width: 1.9rem; height: 1.9rem; color: hsl(var(--puka-sun-deep)); }
.block-badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}
.badge-available { background: hsl(145 60% 90%); color: hsl(150 70% 26%); }
.badge-ea { background: hsl(var(--puka-sun) / 0.22); color: hsl(var(--puka-sun-deep)); }
.block-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.35rem; }
.block-text { color: hsl(var(--puka-ink-soft)); line-height: 1.55; }

@media (min-width: 700px) { .blocks-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1000px) { .blocks-grid { grid-template-columns: repeat(3, 1fr); } }
</style>

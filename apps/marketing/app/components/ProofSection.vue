<script setup lang="ts">
// Szene 10 — der Beweis (§6.4/§4.10): „die Welt ist bewohnt".
//
// Ehrlichkeits-Regel (§5): KEINE erfundenen Testimonials, Sterne oder
// Kundenlogos. Solange es keine echten Kundenstimmen gibt, ist der Beweis das
// Dogfooding: vier Sites, die tatsächlich live laufen und die man anklicken
// kann. Der Schluss-Satz sagt ausdrücklich, was passiert, wenn es echte
// Stimmen gibt — damit die Lücke eine Haltung ist und kein Versehen.
const PROOF_COUNT = 4
const { t } = useI18n()

const items = computed(() =>
  Array.from({ length: PROOF_COUNT }, (_, i) => ({
    name: t(`marketing.proof.items.${i}.name`),
    what: t(`marketing.proof.items.${i}.what`),
    url: t(`marketing.proof.items.${i}.url`),
  })),
)
</script>

<template>
  <section id="beweis" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow proof-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.proof.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.proof.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.proof.lead') }}</p>
    </div>

    <ul class="proof-grid mkt-inner" data-reveal>
      <li v-for="item in items" :key="item.name" class="proof-card">
        <div class="proof-top">
          <PukaMark :size="20" />
          <span class="proof-name">{{ item.name }}</span>
        </div>
        <p class="proof-what">{{ item.what }}</p>
        <a :href="item.url" class="proof-link" target="_blank" rel="noopener">
          {{ t('marketing.proof.visit') }} <UIcon name="i-ph-arrow-up-right-bold" />
        </a>
      </li>
    </ul>

    <p class="proof-honest mkt-inner mkt-narrow" data-reveal>{{ t('marketing.proof.honest') }}</p>
  </section>
</template>

<style scoped>
.proof-head { text-align: center; }
.proof-head .mkt-lead { margin-inline: auto; }
.proof-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
  margin-top: 2.5rem;
  padding: 0;
  list-style: none;
}
.proof-card {
  padding: 1.4rem;
  border-radius: 1rem;
  background: hsl(0 0% 100% / 0.65);
  border: 1px solid hsl(var(--puka-ink) / 0.08);
  display: flex;
  flex-direction: column;
}
.proof-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}
.proof-name {
  font-weight: 800;
  font-size: 0.98rem;
  color: hsl(var(--puka-ink));
  word-break: break-word;
}
.proof-what {
  color: hsl(var(--puka-ink-soft));
  line-height: 1.55;
  flex: 1;
}
.proof-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.9rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: hsl(var(--puka-sun-deep));
  text-decoration: none;
}
.proof-link:hover { text-decoration: underline; }
.proof-link :deep(svg) { width: 0.9rem; height: 0.9rem; }
.proof-honest {
  margin-top: 1.75rem;
  padding-left: 0.9rem;
  border-left: 3px solid hsl(var(--puka-sun) / 0.6);
  color: hsl(var(--puka-ink-soft));
  line-height: 1.6;
  font-style: italic;
}

@media (min-width: 640px) { .proof-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1060px) { .proof-grid { grid-template-columns: repeat(4, 1fr); } }
</style>

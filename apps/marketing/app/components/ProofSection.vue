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

    <!-- Container und Raster getrennt — Begründung in BlocksSection.vue. -->
    <div class="mkt-inner" data-reveal>
      <UPageGrid as="ul" class="mt-10 lg:grid-cols-4">
        <UPageCard
          v-for="item in items" :key="item.name"
          as="li" :description="item.what"
          :ui="{ leading: 'gap-2' }"
        >
          <template #leading>
            <PukaMark :size="20" />
            <span class="font-extrabold break-words text-highlighted">{{ item.name }}</span>
          </template>
          <template #footer>
            <UButton
              :to="item.url" target="_blank" rel="noopener"
              variant="link" color="primary" size="sm"
              trailing-icon="i-ph-arrow-up-right-bold"
              class="px-0 font-bold hover:underline"
              :label="t('marketing.proof.visit')"
            />
          </template>
        </UPageCard>
      </UPageGrid>
    </div>

    <div class="mkt-inner mkt-narrow" data-reveal>
      <UAlert
        variant="subtle" color="neutral"
        :description="t('marketing.proof.honest')"
        class="mt-7"
        :ui="{ description: 'italic text-toned text-base/relaxed opacity-100' }"
      />
    </div>
  </section>
</template>

<style scoped>
.proof-head { text-align: center; }
.proof-head .mkt-lead { margin-inline: auto; }
</style>

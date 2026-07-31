<script setup lang="ts">
// Szene 10 — der Beweis (§6.4/§4.10): „die Welt ist bewohnt".
//
// Ehrlichkeits-Regel (§5): KEINE erfundenen Testimonials, Sterne oder
// Kundenlogos. Solange es keine echten Kundenstimmen gibt, ist der Beweis das
// Dogfooding: vier Sites, die tatsächlich live laufen und die man anklicken
// kann. Der Schluss-Satz sagt ausdrücklich, was passiert, wenn es echte
// Stimmen gibt — damit die Lücke eine Haltung ist und kein Versehen.
//
// DIE VIER ADRESSEN STEHEN IM CODE, NICHT IN DEN SPRACHDATEIEN. Eine URL ist
// keine Übersetzung: sie stand bis 2026-07-30 zweimal identisch in de.json und
// en.json — zwei Stellen, die beim nächsten Umzug einer Site auseinanderlaufen
// können, ohne dass es jemandem auffällt. Namen und Beschreibungen bleiben
// i18n (marketing.proof.items.<slug>.name/.what).
//
// Die Demo kommt aus `useProductLinks()` und NICHT als feste Zeichenkette:
// dieselbe Adresse steckt in jedem Demo-CTA der Seite und ist per
// NUXT_PUBLIC_MARKETING_DEMO_URL überschreibbar (lokal/Staging). Eine
// zweite, hart notierte Kopie hätte den Schalter genau hier ins Leere laufen
// lassen.
const { t } = useI18n()
const { demo } = useProductLinks()

const PROOF_ITEMS = [
  { slug: 'comments', url: 'https://comments.pukalani.app' },
  { slug: 'demo', url: demo },
  { slug: 'portfolio', url: 'https://portfolio.pukalani.app' },
  { slug: 'changelog', url: 'https://changelog.pukalani.app' },
] as const

const items = computed(() =>
  PROOF_ITEMS.map(item => ({
    name: t(`marketing.proof.items.${item.slug}.name`),
    what: t(`marketing.proof.items.${item.slug}.what`),
    url: item.url,
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

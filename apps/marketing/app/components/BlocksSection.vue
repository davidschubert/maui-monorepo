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

    <!-- `mkt-inner` (Breiten-Container) und das Raster sind BEWUSST zwei
         Elemente: `.mkt-inner` setzt in marketing.css `margin: 0 auto` als
         Kurzform, und diese ungeschichtete Regel schlägt jede Tailwind-
         Utility aus @layer — ein `mt-10` an derselben Stelle wäre wirkungslos
         (live gemessen: 0px). -->
    <div class="mkt-inner" data-reveal>
      <UPageGrid class="mt-10">
        <UPageCard
          v-for="block in items" :key="block.title"
          :title="block.title" :description="block.text"
          :ui="{ leading: 'flex w-full items-center justify-between' }"
        >
          <!-- Icon und Statuspille teilen sich EINE Zeile (Bestand). Der
               leading-Slot ist dafür da; er wird nur von `inline-flex` auf
               `flex w-full justify-between` gestellt. -->
          <template #leading>
            <UIcon :name="block.icon" class="size-8 text-primary-600" />
            <UBadge
              :color="block.status === 'available' ? 'success' : 'primary'"
              variant="subtle" size="sm"
              class="rounded-full uppercase tracking-wider"
              :label="block.status === 'available' ? t('marketing.blocks.available') : t('marketing.blocks.earlyAccess')"
            />
          </template>
        </UPageCard>
      </UPageGrid>
    </div>
  </section>
</template>

<style scoped>
.blocks-head { text-align: center; }
.blocks-head .mkt-lead { margin-inline: auto; }
</style>

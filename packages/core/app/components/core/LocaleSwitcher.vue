<script setup lang="ts">
// Sprachwechsler (P3): schlichter Umschalter über die konfigurierten
// i18n-Locales. Links statt setLocale — switchLocalePath erhält die
// aktuelle Route (Strategie prefix_except_default) und setzt das
// i18n_redirected-Cookie über den normalen Navigationsweg.
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const items = computed(() => locales.value.map(entry => ({
  code: entry.code,
  label: entry.code.toUpperCase(),
  to: switchLocalePath(entry.code),
  active: entry.code === locale.value,
})))
</script>

<template>
  <nav :aria-label="$t('ui.language')" class="flex items-center gap-0.5 text-sm">
    <template v-for="(item, index) in items" :key="item.code">
      <span v-if="index > 0" class="text-muted" aria-hidden="true">/</span>
      <NuxtLink
        :to="item.to"
        class="rounded px-1.5 py-0.5"
        :class="item.active ? 'font-semibold text-default' : 'text-muted hover:text-default'"
        :aria-current="item.active ? 'true' : undefined"
      >
        {{ item.label }}
      </NuxtLink>
    </template>
  </nav>
</template>

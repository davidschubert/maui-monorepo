<script setup lang="ts">
// Kopfzeile: Marke, Abschnitts-Umschalter (die zwei Sammlungen), Suche.
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const fallback = ref<DocsNavigation | null>(null)
const navigation = inject(docsNavigationKey, fallback)
const activeSection = computed(() => resolveDocsSection(route.path))
const sidebarItems = computed(() => docsSectionItems(navigation.value, activeSection.value))

const sections = computed(() => DOCS_SECTIONS.map(section => ({
  label: t(section.labelKey),
  icon: section.icon,
  to: localePath(section.prefix),
  active: activeSection.value === section.key && route.path !== '/',
})))
</script>

<template>
  <UHeader :to="localePath('/')">
    <template #title>
      <span class="font-bold">{{ t('docs.siteName') }}</span>
    </template>

    <UNavigationMenu
      :items="sections"
      variant="link"
    />

    <template #right>
      <UContentSearchButton :collapsed="false" class="hidden sm:flex" />
      <UContentSearchButton class="sm:hidden" />
      <UColorModeButton />
      <UButton
        :to="'https://pukalani.app'"
        color="neutral"
        variant="ghost"
        icon="i-ph-arrow-square-out"
        :aria-label="t('docs.toWebsite')"
      />
    </template>

    <template #body>
      <UNavigationMenu
        :items="sections"
        orientation="vertical"
        class="-mx-2.5 mb-4"
      />
      <UContentNavigation
        highlight
        :navigation="sidebarItems"
      />
    </template>
  </UHeader>
</template>
